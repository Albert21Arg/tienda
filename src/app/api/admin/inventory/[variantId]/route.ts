import { randomUUID } from "node:crypto";
import { Permission } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { readJson } from "@/lib/http";
import { D1AtomicAssertionError, d1ExpectChanges, d1Statement, prisma, runD1Batch } from "@/lib/prisma";

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

  const variant = await prisma.productVariant.findUnique({
    where: { id: variantId },
    include: { product: { select: { name: true } } },
  });
  if (!variant) return NextResponse.json({ error: "Variante no encontrada." }, { status: 404 });
  const stockMin = input.data.stockMin ?? variant.stockMin;
  const difference = input.data.stockOnHand - variant.stockOnHand;
  const changed = difference !== 0 || stockMin !== variant.stockMin;
  const now = new Date();
  const statements = [d1Statement(
    `UPDATE "ProductVariant"
     SET "stockOnHand" = ?, "stockMin" = ?, "updatedAt" = ?
     WHERE "id" = ? AND "stockReserved" <= ?`,
    input.data.stockOnHand,
    stockMin,
    now.toISOString(),
    variantId,
    input.data.stockOnHand,
  )];
  d1ExpectChanges(statements);
  if (difference !== 0) {
    statements.push(d1Statement(
      `INSERT INTO "InventoryMovement"
        ("id", "variantId", "type", "quantity", "previousStock", "newStock", "actorId", "reason", "createdAt")
       VALUES (?, ?, 'ADJUSTMENT', ?, ?, ?, ?, ?, ?)`,
      randomUUID(),
      variantId,
      difference,
      variant.stockOnHand,
      input.data.stockOnHand,
      access.session.userId,
      input.data.reason,
      now.toISOString(),
    ));
    d1ExpectChanges(statements);
  }
  if (changed) {
    statements.push(d1Statement(
      `INSERT INTO "AuditLog"
        ("id", "actorId", "action", "entity", "entityId", "previousValue", "newValue", "reason", "createdAt")
       VALUES (?, ?, 'INVENTORY_ADJUST', 'ProductVariant', ?, ?, ?, ?, ?)`,
      randomUUID(),
      access.session.userId,
      variantId,
      JSON.stringify({ stockOnHand: variant.stockOnHand, stockMin: variant.stockMin }),
      JSON.stringify({ stockOnHand: input.data.stockOnHand, stockMin }),
      input.data.reason,
      now.toISOString(),
    ));
    d1ExpectChanges(statements);
  }
  try {
    await runD1Batch(statements);
  } catch (error) {
    if (error instanceof D1AtomicAssertionError) {
      const latest = await prisma.productVariant.findUnique({
        where: { id: variantId },
        select: { id: true, stockReserved: true },
      });
      if (!latest) return NextResponse.json({ error: "Variante no encontrada." }, { status: 404 });
      if (latest.stockReserved > input.data.stockOnHand) {
        return NextResponse.json({ error: "El stock no puede quedar por debajo de las unidades reservadas." }, { status: 409 });
      }
    }
    throw error;
  }
  return NextResponse.json({
    variant: {
      product: variant.product.name,
      sku: variant.sku,
      stockOnHand: input.data.stockOnHand,
      stockReserved: variant.stockReserved,
      stockMin,
    },
  });
}
