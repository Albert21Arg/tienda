import { Permission, Prisma, Segment } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { readJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { generateProductSku } from "@/lib/product-sku";
import { parseProductImages } from "@/lib/product-images";

const createVariantSchema = z.object({
  size: z.string().trim().min(1).max(30).nullable().optional(),
  stockOnHand: z.number().int().min(0),
  stockMin: z.number().int().min(0).default(2),
});

const createProductSchema = z.object({
  name: z.string().trim().min(2).max(160),
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(180),
  description: z.string().trim().min(1).max(10000),
  segment: z.nativeEnum(Segment),
  categoryId: z.string().min(1),
  basePrice: z.number().int().positive(),
  previousPrice: z.number().int().positive().optional(),
  images: z.array(z.string().url()).min(1).max(3),
  reason: z.string().trim().min(3).max(500),
  color: z.string().trim().max(60).optional(),
  variants: z.array(createVariantSchema).min(1).max(100),
}).superRefine((product, context) => {
  const sizes = product.variants.map((variant) => variant.size ?? null);
  if (new Set(sizes).size !== sizes.length) {
    context.addIssue({
      code: "custom",
      path: ["variants"],
      message: "Cada talla debe ser única.",
    });
  }
});

export async function GET() {
  const access = await requirePermission(Permission.PRODUCT_READ);
  if (!access.session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!access.allowed) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  const products = await prisma.product.findMany({
    include: { category: true, variants: true },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json({
    products: products.map((product) => ({ ...product, images: parseProductImages(product.images) })),
  });
}

export async function POST(request: Request) {
  const access = await requirePermission(Permission.PRODUCT_CREATE);
  if (!access.session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!access.allowed) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  const input = createProductSchema.safeParse(await readJson(request));
  if (!input.success) {
    return NextResponse.json({ error: "Datos de producto inválidos.", details: input.error.flatten() }, { status: 400 });
  }

  const category = await prisma.category.findFirst({
    where: {
      id: input.data.categoryId,
      isActive: true,
      OR: [{ segment: input.data.segment }, { segment: null }],
    },
    select: { id: true },
  });
  if (!category) {
    return NextResponse.json({ error: "Selecciona una categoría activa del segmento del producto." }, { status: 400 });
  }

  try {
    const product = await prisma.$transaction(async (transaction) => {
      const skuBases = input.data.variants.map((variant) =>
        generateProductSku(input.data.segment, input.data.slug, variant.size),
      );
      const existingSkus = await transaction.productVariant.findMany({
        where: { sku: { in: skuBases } },
        select: { sku: true },
      });
      const reservedSkus = new Set(existingSkus.map(({ sku }) => sku));
      const variants = [];
      for (const variant of input.data.variants) {
        const skuBase = generateProductSku(input.data.segment, input.data.slug, variant.size);
        let sku = skuBase;
        let suffix = 2;
        while (reservedSkus.has(sku) || await transaction.productVariant.findUnique({
          where: { sku },
          select: { id: true },
        })) {
          sku = `${skuBase}-${suffix}`;
          suffix += 1;
        }
        reservedSkus.add(sku);
        variants.push({ ...variant, sku, color: input.data.color || undefined });
      }

      const created = await transaction.product.create({
        data: {
          name: input.data.name,
          slug: input.data.slug,
          description: input.data.description,
          segment: input.data.segment,
          categoryId: input.data.categoryId,
          basePrice: input.data.basePrice,
          previousPrice: input.data.previousPrice,
          images: JSON.stringify(input.data.images),
          variants: { create: variants },
        },
      });
      await transaction.auditLog.create({
        data: {
          actorId: access.session.userId,
          action: "PRODUCT_CREATE",
          entity: "Product",
          entityId: created.id,
          newValue: { name: created.name, slug: created.slug } satisfies Prisma.InputJsonObject,
          reason: input.data.reason,
        },
      });
      return created;
    });
    return NextResponse.json({
      product: { ...product, images: parseProductImages(product.images) },
    }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "El slug ya existe. Ajusta el slug e inténtalo de nuevo." }, { status: 409 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      return NextResponse.json({ error: "La categoría indicada no existe." }, { status: 400 });
    }
    throw error;
  }
}
