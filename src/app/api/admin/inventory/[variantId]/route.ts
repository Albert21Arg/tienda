import { Permission, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { readJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";

const adjustmentSchema = z.object({
  stockOnHand: z.number().int().min(0),
  stockMin: z.number().int().min(0).optional(),
  reason: z.string().trim().min(3).max(500),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ variantId: string }> },
) {
  const access = await requirePermission(Permission.INVENTORY_UPDATE);
  if (!access.session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!access.allowed) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  const { variantId } = await params;
  const input = adjustmentSchema.safeParse(await readJson(request));
  if (!input.success) return NextResponse.json({ error: "Ajuste de inventario inválido." }, { status: 400 });

  const result = await prisma.$transaction(async (transaction) => {
    const variant = await transaction.productVariant.findUnique({
      where: { id: variantId },
      include: { product: { select: { name: true } } },
    });
    if (!variant) return null;
    const stockMin = input.data.stockMin ?? variant.stockMin;
    const updated = await transaction.$executeRaw(Prisma.sql`
      UPDATE "ProductVariant"
      SET "stockOnHand" = ${input.data.stockOnHand},
          "stockMin" = ${stockMin},
          "updatedAt" = NOW()
      WHERE "id" = ${variantId} AND "stockReserved" <= ${input.data.stockOnHand}
    `);
    if (updated !== 1) return { conflict: true as const };
    const updatedVariant = await transaction.productVariant.findUniqueOrThrow({ where: { id: variantId } });
    const difference = input.data.stockOnHand - variant.stockOnHand;
    const changed = difference !== 0 || stockMin !== variant.stockMin;
    if (difference !== 0) {
      await transaction.inventoryMovement.create({
        data: {
          variantId,
          type: "ADJUSTMENT",
          quantity: difference,
          previousStock: variant.stockOnHand,
          newStock: input.data.stockOnHand,
          actorId: access.session.userId,
          reason: input.data.reason,
        },
      });
    }
    if (changed) {
      await transaction.auditLog.create({
        data: {
          actorId: access.session.userId,
          action: "INVENTORY_ADJUST",
          entity: "ProductVariant",
          entityId: variantId,
          previousValue: {
            stockOnHand: variant.stockOnHand,
            stockMin: variant.stockMin,
          } satisfies Prisma.InputJsonObject,
          newValue: {
            stockOnHand: updatedVariant.stockOnHand,
            stockMin: updatedVariant.stockMin,
          } satisfies Prisma.InputJsonObject,
          reason: input.data.reason,
        },
      });
    }
    return {
      conflict: false as const,
      product: variant.product.name,
      sku: updatedVariant.sku,
      stockOnHand: updatedVariant.stockOnHand,
      stockReserved: updatedVariant.stockReserved,
      stockMin: updatedVariant.stockMin,
    };
  });
  if (!result) return NextResponse.json({ error: "Variante no encontrada." }, { status: 404 });
  if (result.conflict) return NextResponse.json({ error: "El stock no puede quedar por debajo de las unidades reservadas." }, { status: 409 });
  return NextResponse.json({ variant: result });
}
