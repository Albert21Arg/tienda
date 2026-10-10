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

  const selected = await prisma.product.findMany({
    where: { id: { in: input.data.productIds } },
    select: { id: true, name: true, isActive: true },
  });
  if (selected.length !== input.data.productIds.length) {
    return NextResponse.json({ error: "Uno o más productos ya no existen." }, { status: 404 });
  }
  const active = selected.filter((product) => product.isActive);
  if (!active.length) {
    return NextResponse.json({ error: "Los productos seleccionados ya están inactivos." }, { status: 409 });
  }

  await prisma.$transaction(active.flatMap((product) => [
    prisma.product.updateMany({
      where: { id: product.id, isActive: true },
      data: { isActive: false },
    }),
    prisma.auditLog.create({
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
    }),
  ]));
  return NextResponse.json({ updatedCount: active.length });
}
