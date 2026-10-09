import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { readJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { releaseExpiredReservations } from "@/lib/inventory.server";

const reservationSchema = z.object({
  variantId: z.string().min(1).max(64),
  quantity: z.number().int().min(1).max(10),
});

class InsufficientStockError extends Error {}

export async function POST(request: Request) {
  const payload = reservationSchema.safeParse(await readJson(request));
  if (!payload.success) {
    return NextResponse.json({ error: "Variante o cantidad inválida." }, { status: 400 });
  }

  await releaseExpiredReservations();

  const cookieStore = await cookies();
  let cartToken = cookieStore.get("atelier_cart")?.value;
  const shouldSetCartCookie = !cartToken;
  cartToken ??= randomBytes(32).toString("hex");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 15 * 60 * 1000);

  try {
    const reservation = await prisma.$transaction(async (transaction) => {
      const cart = await transaction.cart.upsert({
        where: { sessionToken: cartToken },
        update: { expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
        create: {
          sessionToken: cartToken,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });

      const reserved = await transaction.$executeRaw(Prisma.sql`
        UPDATE "ProductVariant"
        SET "stockReserved" = "stockReserved" + ${payload.data.quantity},
            "updatedAt" = ${now}
        WHERE "id" = ${payload.data.variantId}
          AND "isActive" = TRUE
          AND "stockOnHand" - "stockReserved" >= ${payload.data.quantity}
      `);
      if (reserved !== 1) throw new InsufficientStockError();

      const created = await transaction.inventoryReservation.create({
        data: {
          variantId: payload.data.variantId,
          cartId: cart.id,
          quantity: payload.data.quantity,
          expiresAt,
        },
        select: { id: true, quantity: true, expiresAt: true },
      });
      await transaction.cartItem.upsert({
        where: { cartId_variantId: { cartId: cart.id, variantId: payload.data.variantId } },
        update: { quantity: { increment: payload.data.quantity } },
        create: {
          cartId: cart.id,
          variantId: payload.data.variantId,
          quantity: payload.data.quantity,
        },
      });
      const variant = await transaction.productVariant.findUniqueOrThrow({
        where: { id: payload.data.variantId },
        select: { stockOnHand: true },
      });
      await transaction.inventoryMovement.create({
        data: {
          variantId: payload.data.variantId,
          type: "RESERVATION",
          quantity: payload.data.quantity,
          previousStock: variant.stockOnHand,
          newStock: variant.stockOnHand,
          reason: `Reserva ${created.id}`,
        },
      });
      return created;
    });

    const response = NextResponse.json({ reservation }, { status: 201 });
    if (shouldSetCartCookie) {
      response.cookies.set("atelier_cart", cartToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      });
    }
    return response;
  } catch (error) {
    if (error instanceof InsufficientStockError) {
      return NextResponse.json(
        { error: "La variante ya no tiene unidades disponibles." },
        { status: 409 },
      );
    }
    throw error;
  }
}

const cancelSchema = z.object({
  reservationIds: z.array(z.string().min(1).max(64)).min(1).max(10),
});

export async function DELETE(request: Request) {
  const payload = cancelSchema.safeParse(await readJson(request));
  if (!payload.success) {
    return NextResponse.json({ error: "Reservas inválidas." }, { status: 400 });
  }
  const cartToken = (await cookies()).get("atelier_cart")?.value;
  if (!cartToken) return NextResponse.json({ error: "Carrito no encontrado." }, { status: 404 });

  const cart = await prisma.cart.findUnique({ where: { sessionToken: cartToken }, select: { id: true } });
  if (!cart) return NextResponse.json({ error: "Carrito no encontrado." }, { status: 404 });
  const releasedCount = await prisma.$transaction(async (transaction) => {
    let count = 0;
    for (const id of payload.data.reservationIds) {
      const reservation = await transaction.inventoryReservation.findFirst({
        where: { id, cartId: cart.id, status: "ACTIVE" },
      });
      if (!reservation) continue;
      const status = reservation.expiresAt <= new Date() ? "EXPIRED" : "CANCELLED";
      const updated = await transaction.inventoryReservation.updateMany({
        where: { id, cartId: cart.id, status: "ACTIVE" },
        data: { status },
      });
      if (updated.count !== 1) continue;
      const released = await transaction.$executeRaw(Prisma.sql`
        UPDATE "ProductVariant"
        SET "stockReserved" = "stockReserved" - ${reservation.quantity},
            "updatedAt" = NOW()
        WHERE "id" = ${reservation.variantId}
          AND "stockReserved" >= ${reservation.quantity}
      `);
      if (released !== 1) throw new Error("Inventario reservado inconsistente.");
      await transaction.cartItem.updateMany({
        where: {
          cartId: cart.id,
          variantId: reservation.variantId,
          quantity: { gte: reservation.quantity },
        },
        data: { quantity: { decrement: reservation.quantity } },
      });
      await transaction.cartItem.deleteMany({
        where: { cartId: cart.id, variantId: reservation.variantId, quantity: { lte: 0 } },
      });
      const variant = await transaction.productVariant.findUniqueOrThrow({
        where: { id: reservation.variantId },
        select: { stockOnHand: true },
      });
      await transaction.inventoryMovement.create({
        data: {
          variantId: reservation.variantId,
          type: "RESERVATION_RELEASE",
          quantity: reservation.quantity,
          previousStock: variant.stockOnHand,
          newStock: variant.stockOnHand,
          reason: status === "EXPIRED" ? "Reserva expirada al retirar del carrito" : "Retirada del carrito",
        },
      });
      count += 1;
    }
    return count;
  });
  return NextResponse.json({ releasedCount });
}
