import { Permission, Prisma, Segment } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { readJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";

const updateProductSchema = z.object({
  name: z.string().trim().min(2).max(160),
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(180),
  description: z.string().trim().min(1).max(10000),
  segment: z.nativeEnum(Segment),
  categoryId: z.string().min(1),
  basePrice: z.number().int().positive(),
  imageUrl: z.string().url(),
  isActive: z.boolean(),
  reason: z.string().trim().min(3).max(500),
});

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
    const result = await prisma.$transaction(async (transaction) => {
      const existing = await transaction.product.findUnique({ where: { id: productId } });
      if (!existing) return null;

      const updated = await transaction.product.update({
        where: { id: productId },
        data: {
          name: input.data.name,
          slug: input.data.slug,
          description: input.data.description,
          segment: input.data.segment,
          categoryId: input.data.categoryId,
          basePrice: input.data.basePrice,
          previousPrice: input.data.basePrice === existing.basePrice ? existing.previousPrice : null,
          images: [input.data.imageUrl, ...existing.images.slice(1)],
          isActive: input.data.isActive,
        },
      });
      await transaction.auditLog.create({
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
            images: existing.images,
            isActive: existing.isActive,
          } satisfies Prisma.InputJsonObject,
          newValue: {
            name: updated.name,
            slug: updated.slug,
            description: updated.description,
            segment: updated.segment,
            categoryId: updated.categoryId,
            basePrice: updated.basePrice,
            images: updated.images,
            isActive: updated.isActive,
          } satisfies Prisma.InputJsonObject,
          reason: input.data.reason,
        },
      });
      return updated;
    });
    if (!result) return NextResponse.json({ error: "Producto no encontrado." }, { status: 404 });
    return NextResponse.json({ product: result });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Ese slug ya está en uso." }, { status: 409 });
    }
    throw error;
  }
}
