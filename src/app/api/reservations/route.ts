import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { readJson } from "@/lib/http";
import { d1ExpectChanges, d1Statement, prisma, runD1Batch } from "@/lib/prisma";
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
    const cart = await prisma.cart.upsert({
      where: { sessionToken: cartToken },
      update: { expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
      create: {
        sessionToken: cartToken,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
      select: { id: true },
    });
    const stock = await prisma.productVariant.findFirst({
      where: {
        id: payload.data.variantId,
        isActive: true,
        stockOnHand: { gte: payload.data.quantity },
      },
      select: { id: true, stockOnHand: true, stockReserved: true },
    });
    if (!stock || stock.stockOnHand - stock.stockReserved < payload.data.quantity) {
      throw new InsufficientStockError();
    }

    const reservationId = randomBytes(18).toString("hex");
    const movementId = randomBytes(18).toString("hex");
    const statements = [d1Statement(
      `UPDATE "ProductVariant"
       SET "stockReserved" = "stockReserved" + ?, "updatedAt" = ?
       WHERE "id" = ? AND "isActive" = TRUE
         AND "stockOnHand" - "stockReserved" >= ?`,
      payload.data.quantity,
      now.toISOString(),
      payload.data.variantId,
      payload.data.quantity,
    )];
    d1ExpectChanges(statements);
    statements.push(d1Statement(
      `INSERT INTO "InventoryReservation"
        ("id", "variantId", "cartId", "quantity", "status", "createdAt", "expiresAt")
       VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?)`,
      reservationId,
      payload.data.variantId,
      cart.id,
      payload.data.quantity,
      now.toISOString(),
      expiresAt.toISOString(),
    ));
    d1ExpectChanges(statements);
    statements.push(d1Statement(
      `INSERT INTO "CartItem"
        ("id", "cartId", "variantId", "quantity", "createdAt", "updatedAt")
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT ("cartId", "variantId")
       DO UPDATE SET "quantity" = "quantity" + excluded."quantity", "updatedAt" = excluded."updatedAt"`,
      randomBytes(18).toString("hex"),
      cart.id,
      payload.data.variantId,
      payload.data.quantity,
      now.toISOString(),
      now.toISOString(),
    ));
    statements.push(d1Statement(
      `INSERT INTO "InventoryMovement"
        ("id", "variantId", "type", "quantity", "previousStock", "newStock", "reason", "createdAt")
       VALUES (?, ?, 'RESERVATION', ?, ?, ?, ?, ?)`,
      movementId,
      payload.data.variantId,
      payload.data.quantity,
      stock.stockOnHand,
      stock.stockOnHand,
      `Reserva ${reservationId}`,
      now.toISOString(),
    ));
    await runD1Batch(statements);
    const reservation = {
      id: reservationId,
      quantity: payload.data.quantity,
      expiresAt,
    };

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
  const reservations = await prisma.inventoryReservation.findMany({
    where: { id: { in: payload.data.reservationIds }, cartId: cart.id, status: "ACTIVE" },
    select: { id: true, variantId: true, quantity: true, expiresAt: true },
  });
  let releasedCount = 0;
  const now = new Date();
  for (const reservation of reservations) {
    const status = reservation.expiresAt <= now ? "EXPIRED" : "CANCELLED";
    const statements = [d1Statement(
      `UPDATE "InventoryReservation" SET "status" = ?
       WHERE "id" = ? AND "cartId" = ? AND "status" = 'ACTIVE'`,
      status,
      reservation.id,
      cart.id,
    )];
    d1ExpectChanges(statements);
    statements.push(d1Statement(
      `UPDATE "ProductVariant"
       SET "stockReserved" = "stockReserved" - ?, "updatedAt" = ?
       WHERE "id" = ? AND "stockReserved" >= ?`,
      reservation.quantity,
      now.toISOString(),
      reservation.variantId,
      reservation.quantity,
    ));
    d1ExpectChanges(statements);
    statements.push(d1Statement(
      `UPDATE "CartItem" SET "quantity" = "quantity" - ?, "updatedAt" = ?
       WHERE "cartId" = ? AND "variantId" = ? AND "quantity" >= ?`,
      reservation.quantity,
      now.toISOString(),
      cart.id,
      reservation.variantId,
      reservation.quantity,
    ));
    d1ExpectChanges(statements);
    statements.push(d1Statement(
      `DELETE FROM "CartItem" WHERE "cartId" = ? AND "variantId" = ? AND "quantity" <= 0`,
      cart.id,
      reservation.variantId,
    ));
    statements.push(d1Statement(
      `INSERT INTO "InventoryMovement"
        ("id", "variantId", "type", "quantity", "previousStock", "newStock", "reason", "createdAt")
       SELECT ?, "id", 'RESERVATION_RELEASE', ?, "stockOnHand", "stockOnHand", ?, ?
       FROM "ProductVariant" WHERE "id" = ?`,
      randomBytes(18).toString("hex"),
      reservation.quantity,
      status === "EXPIRED" ? "Reserva expirada al retirar del carrito" : "Retirada del carrito",
      now.toISOString(),
      reservation.variantId,
    ));
    d1ExpectChanges(statements);
    await runD1Batch(statements);
    releasedCount += 1;
  }
  return NextResponse.json({ releasedCount });
}
