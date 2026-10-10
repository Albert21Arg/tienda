import { randomUUID } from "node:crypto";
import { Permission, Prisma, Segment } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { readJson } from "@/lib/http";
import { D1AtomicAssertionError, d1ExpectChanges, d1Statement, prisma, runD1Batch } from "@/lib/prisma";
import { parseProductImages } from "@/lib/product-images";
import { calculateSalePrice, MAX_MARKUP_PERCENT, MAX_PRODUCT_PRICE } from "@/lib/pricing";

const updateProductSchema = z.object({
  name: z.string().trim().min(2).max(160),
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(180),
  description: z.string().trim().min(1).max(10000),
  segment: z.nativeEnum(Segment),
  categoryId: z.string().min(1),
  costPrice: z.number().int().positive().optional(),
  markupPercent: z.number().int().min(0).max(MAX_MARKUP_PERCENT).optional(),
  basePrice: z.number().int().positive().optional(),
  imageUrl: z.string().url(),
  isActive: z.boolean(),
  reason: z.string().trim().min(3).max(500),
});

const deleteProductSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ productId: string }> },
) {
  const access = await requirePermission(Permission.PRODUCT_DELETE);
  if (!access.session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (access.session.role !== "SUPER_ADMIN" || !access.allowed) {
    return NextResponse.json({ error: "Solo SuperAdmin puede eliminar productos." }, { status: 403 });
  }

  const input = deleteProductSchema.safeParse(await readJson(request));
  if (!input.success) {
    return NextResponse.json({ error: "Escribe un motivo válido para eliminar el producto." }, { status: 400 });
  }

  const { productId } = await params;
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      variants: {
        select: {
          id: true,
          sku: true,
          isActive: true,
          stockOnHand: true,
          stockReserved: true,
        },
      },
      _count: { select: { orderItems: true } },
    },
  });
  if (!product) return NextResponse.json({ error: "Producto no encontrado." }, { status: 404 });

  const hasAvailableStock = product.variants.some(
    (variant) => variant.isActive && variant.stockOnHand > variant.stockReserved,
  );
  if (product.isActive && hasAvailableStock) {
    return NextResponse.json({
      error: "Solo puedes eliminar productos inactivos o sin existencias disponibles.",
    }, { status: 409 });
  }
  if (product._count.orderItems > 0) {
    return NextResponse.json({
      error: "No se puede eliminar: el producto forma parte del historial de pedidos.",
    }, { status: 409 });
  }

  const now = new Date().toISOString();
  const statements = [
    d1Statement(
      `INSERT INTO "AuditLog"
        ("id", "actorId", "action", "entity", "entityId", "previousValue", "newValue", "reason", "createdAt")
       VALUES (?, ?, 'PRODUCT_DELETE', 'Product', ?, ?, ?, ?, ?)`,
      randomUUID(),
      access.session.userId,
      product.id,
      JSON.stringify({
        name: product.name,
        slug: product.slug,
        segment: product.segment,
        basePrice: product.basePrice,
        isActive: product.isActive,
        variants: product.variants.map(({ sku, isActive, stockOnHand, stockReserved }) => ({
          sku,
          isActive,
          stockOnHand,
          stockReserved,
        })),
      }),
      JSON.stringify({ isDeleted: true }),
      input.data.reason,
      now,
    ),
    d1Statement(
      `DELETE FROM "CartItem"
       WHERE "variantId" IN (SELECT "id" FROM "ProductVariant" WHERE "productId" = ?)`,
      product.id,
    ),
    d1Statement(
      `DELETE FROM "InventoryReservation"
       WHERE "variantId" IN (SELECT "id" FROM "ProductVariant" WHERE "productId" = ?)`,
      product.id,
    ),
    d1Statement(
      `DELETE FROM "InventoryMovement"
       WHERE "variantId" IN (SELECT "id" FROM "ProductVariant" WHERE "productId" = ?)`,
      product.id,
    ),
    d1Statement(
      `DELETE FROM "Product"
       WHERE "id" = ?
         AND ("isActive" = 0 OR NOT EXISTS (
           SELECT 1
           FROM "ProductVariant"
           WHERE "productId" = "Product"."id"
             AND "isActive" = 1
             AND "stockOnHand" > "stockReserved"
         ))
         AND NOT EXISTS (
           SELECT 1 FROM "OrderItem" WHERE "productId" = "Product"."id"
         )`,
      product.id,
    ),
  ];
  d1ExpectChanges(statements);

  try {
    await runD1Batch(statements);
  } catch (error) {
    if (error instanceof D1AtomicAssertionError) {
      const latest = await prisma.product.findUnique({
        where: { id: productId },
        include: { _count: { select: { orderItems: true } } },
      });
      if (!latest) return NextResponse.json({ error: "El producto ya no existe." }, { status: 404 });
      if (latest._count.orderItems > 0) {
        return NextResponse.json({
          error: "No se puede eliminar: el producto forma parte del historial de pedidos.",
        }, { status: 409 });
      }
      return NextResponse.json({
        error: "El producto cambió o ya no cumple las condiciones para eliminarlo. Actualiza la página e inténtalo de nuevo.",
      }, { status: 409 });
    }
    throw error;
  }

  return NextResponse.json({ deleted: true, productId });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ productId: string }> },
) {
  const access = await requirePermission(Permission.PRODUCT_UPDATE);
  if (!access.session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!access.allowed) return NextResponse.json({ error: "No autorizado." }, { status: 403 });

  const input = updateProductSchema.safeParse(await readJson(request));
  if (!input.success) {
    return NextResponse.json({ error: "Datos de producto inválidos." }, { status: 400 });
  }
  const { productId } = await params;
  const category = await prisma.category.findUnique({
    where: { id: input.data.categoryId },
    select: { id: true, segment: true, isActive: true },
  });
  if (!category?.isActive || (category.segment && category.segment !== input.data.segment)) {
    return NextResponse.json({ error: "La categoría no corresponde al segmento seleccionado." }, { status: 400 });
  }

  try {
    const existing = await prisma.product.findUnique({ where: { id: productId } });
    if (!existing) return NextResponse.json({ error: "Producto no encontrado." }, { status: 404 });

    const costPrice = input.data.costPrice ??
      (input.data.basePrice !== undefined ? input.data.basePrice : existing.costPrice);
    const markupPercent = input.data.markupPercent ??
      (input.data.costPrice === undefined && input.data.basePrice !== undefined ? 0 : existing.markupPercent);
    const regularPrice = calculateSalePrice(costPrice, markupPercent);
    if (regularPrice > MAX_PRODUCT_PRICE) {
      return NextResponse.json({ error: "El precio de venta calculado supera el máximo permitido." }, { status: 400 });
    }
    const discountAmount = existing.previousPrice === null
      ? 0
      : Math.max(0, existing.previousPrice - existing.basePrice);
    const discountedPrice = Math.max(1, regularPrice - discountAmount);
    const hasDiscount = discountAmount > 0 && regularPrice > discountedPrice;
    const basePrice = hasDiscount ? discountedPrice : regularPrice;
    const previousPrice = hasDiscount ? regularPrice : null;
    const existingImages = parseProductImages(existing.images);
    const updatedImages = [input.data.imageUrl, ...existingImages.slice(1)];
    const newValue = {
      name: input.data.name,
      slug: input.data.slug,
      description: input.data.description,
      segment: input.data.segment,
      categoryId: input.data.categoryId,
      basePrice,
      costPrice,
      markupPercent,
      previousPrice,
      images: updatedImages,
      isActive: input.data.isActive,
    } satisfies Prisma.InputJsonObject;
    const [updated] = await prisma.$transaction([
      prisma.product.update({
        where: { id: productId },
        data: {
          name: input.data.name,
          slug: input.data.slug,
          description: input.data.description,
          segment: input.data.segment,
          categoryId: input.data.categoryId,
          basePrice,
          costPrice,
          markupPercent,
          previousPrice,
          images: JSON.stringify(updatedImages),
          isActive: input.data.isActive,
        },
      }),
      prisma.auditLog.create({
        data: {
          actorId: access.session.userId,
          action: "PRODUCT_UPDATE",
          entity: "Product",
          entityId: productId,
          previousValue: {
            name: existing.name,
            slug: existing.slug,
            description: existing.description,
            segment: existing.segment,
            categoryId: existing.categoryId,
            basePrice: existing.basePrice,
            costPrice: existing.costPrice,
            markupPercent: existing.markupPercent,
            previousPrice: existing.previousPrice,
            images: existingImages,
            isActive: existing.isActive,
          } satisfies Prisma.InputJsonObject,
          newValue,
          reason: input.data.reason,
        },
      }),
    ]);
    return NextResponse.json({
      product: { ...updated, images: parseProductImages(updated.images) },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Ese slug ya está en uso." }, { status: 409 });
    }
    throw error;
  }
}
