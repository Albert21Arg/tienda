import { Permission, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { readJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";

const bulkDiscountSchema = z.object({
  productIds: z.array(z.string().min(1)).min(1).max(200).refine(
    (ids) => new Set(ids).size === ids.length,
    "La selección contiene productos repetidos.",
  ),
  type: z.enum(["PERCENTAGE", "FIXED_AMOUNT"]),
  value: z.number().int().positive(),
  reason: z.string().trim().min(3).max(500),
}).refine(
  (input) => input.type !== "PERCENTAGE" || input.value < 100,
  { path: ["value"], message: "El porcentaje debe ser menor a 100." },
);

export async function POST(request: Request) {
  const access = await requirePermission(Permission.PRODUCT_UPDATE);
  if (!access.session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!access.allowed) return NextResponse.json({ error: "No autorizado." }, { status: 403 });

  const input = bulkDiscountSchema.safeParse(await readJson(request));
  if (!input.success) {
    return NextResponse.json({ error: "Datos de descuento inválidos." }, { status: 400 });
  }

  const products = await prisma.product.findMany({
    where: { id: { in: input.data.productIds } },
    select: { id: true, name: true, basePrice: true, previousPrice: true },
  });
  if (products.length !== input.data.productIds.length) {
    return NextResponse.json({ error: "Uno o más productos ya no están disponibles." }, { status: 404 });
  }

  const changes = products.map((product) => {
    const referencePrice = product.previousPrice ?? product.basePrice;
    const reduction = input.data.type === "PERCENTAGE"
      ? Math.round(referencePrice * input.data.value / 100)
      : input.data.value;
    return { product, referencePrice, discountedPrice: referencePrice - reduction };
  });
  if (changes.some(({ referencePrice, discountedPrice }) => discountedPrice < 1 || discountedPrice >= referencePrice)) {
    return NextResponse.json({
      error: input.data.type === "PERCENTAGE"
        ? "El porcentaje elegido no genera un descuento válido para todos los productos."
        : "El descuento debe ser menor que el precio original de todos los productos.",
    }, { status: 400 });
  }

  await prisma.$transaction(changes.flatMap(({ product, referencePrice, discountedPrice }) => [
    prisma.product.update({
        where: { id: product.id },
        data: { basePrice: discountedPrice, previousPrice: referencePrice },
    }),
    prisma.auditLog.create({
        data: {
          actorId: access.session.userId,
          action: "PRODUCT_DISCOUNT",
          entity: "Product",
          entityId: product.id,
          previousValue: {
            basePrice: product.basePrice,
            previousPrice: product.previousPrice,
          } satisfies Prisma.InputJsonObject,
          newValue: {
            basePrice: discountedPrice,
            previousPrice: referencePrice,
            discountType: input.data.type,
            discountValue: input.data.value,
          } satisfies Prisma.InputJsonObject,
          reason: input.data.reason,
        },
    }),
  ]));
  return NextResponse.json({ updatedCount: changes.length });
}
