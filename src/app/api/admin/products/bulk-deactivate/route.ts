import { Permission, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { readJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";

const bulkDeactivateSchema = z.object({
  productIds: z.array(z.string().min(1)).min(1).max(200).refine(
    (ids) => new Set(ids).size === ids.length,
    "La selección contiene productos repetidos.",
  ),
  reason: z.string().trim().min(3).max(500),
});

export async function POST(request: Request) {
  const access = await requirePermission(Permission.PRODUCT_UPDATE);
  if (!access.session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!access.allowed) return NextResponse.json({ error: "No autorizado." }, { status: 403 });

  const input = bulkDeactivateSchema.safeParse(await readJson(request));
  if (!input.success) {
    return NextResponse.json({ error: "Selecciona productos y escribe un motivo válido." }, { status: 400 });
  }

  const result = await prisma.$transaction(async (transaction) => {
    const selected = await transaction.product.findMany({
      where: { id: { in: input.data.productIds } },
      select: { id: true, name: true, isActive: true },
    });
    if (selected.length !== input.data.productIds.length) {
      return { error: "Uno o más productos ya no existen.", status: 404 as const };
    }
    const active = selected.filter((product) => product.isActive);
    if (!active.length) return { error: "Los productos seleccionados ya están inactivos.", status: 409 as const };

    let updatedCount = 0;
    for (const product of active) {
      const updated = await transaction.product.updateMany({
        where: { id: product.id, isActive: true },
        data: { isActive: false },
      });
      if (updated.count !== 1) continue;
      updatedCount += 1;
      await transaction.auditLog.create({
        data: {
          actorId: access.session.userId,
          action: "PRODUCT_DEACTIVATE",
          entity: "Product",
          entityId: product.id,
          previousValue: {
            name: product.name,
            isActive: true,
          } satisfies Prisma.InputJsonObject,
          newValue: {
            name: product.name,
            isActive: false,
          } satisfies Prisma.InputJsonObject,
          reason: input.data.reason,
        },
      });
    }
    return { updatedCount };
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ updatedCount: result.updatedCount });
}
