import { randomUUID } from "node:crypto";
import { prisma, d1ExpectChanges, d1Statement, runD1Batch } from "@/lib/prisma";

export async function releaseExpiredReservations() {
  const now = new Date();
  const expired = await prisma.inventoryReservation.findMany({
    where: { status: "ACTIVE", expiresAt: { lte: now } },
    select: { id: true, variantId: true, cartId: true, quantity: true },
    take: 500,
  });
  if (!expired.length) return 0;

  let releasedCount = 0;
  for (let offset = 0; offset < expired.length; offset += 100) {
    const batch = [];
    for (const reservation of expired.slice(offset, offset + 100)) {
      batch.push(d1Statement(
        `UPDATE "InventoryReservation"
         SET "status" = 'EXPIRED'
         WHERE "id" = ? AND "status" = 'ACTIVE' AND "expiresAt" <= ?`,
        reservation.id,
        now.toISOString(),
      ));
      d1ExpectChanges(batch);
      batch.push(d1Statement(
        `UPDATE "ProductVariant"
         SET "stockReserved" = "stockReserved" - ?, "updatedAt" = ?
         WHERE "id" = ? AND "stockReserved" >= ?`,
        reservation.quantity,
        now.toISOString(),
        reservation.variantId,
        reservation.quantity,
      ));
      d1ExpectChanges(batch);
      batch.push(d1Statement(
        `UPDATE "CartItem"
         SET "quantity" = "quantity" - ?, "updatedAt" = ?
         WHERE "cartId" = ? AND "variantId" = ? AND "quantity" >= ?`,
        reservation.quantity,
        now.toISOString(),
        reservation.cartId,
        reservation.variantId,
        reservation.quantity,
      ));
      d1ExpectChanges(batch);
      batch.push(d1Statement(
        `DELETE FROM "CartItem" WHERE "cartId" = ? AND "variantId" = ? AND "quantity" <= 0`,
        reservation.cartId,
        reservation.variantId,
      ));
      batch.push(d1Statement(
        `INSERT INTO "InventoryMovement"
          ("id", "variantId", "type", "quantity", "previousStock", "newStock", "reason", "createdAt")
         SELECT ?, "id", 'RESERVATION_RELEASE', ?, "stockOnHand", "stockOnHand", 'Reserva expirada', ?
         FROM "ProductVariant" WHERE "id" = ?`,
        randomUUID(),
        reservation.quantity,
        now.toISOString(),
        reservation.variantId,
      ));
      d1ExpectChanges(batch);
    }
    await runD1Batch(batch);
    releasedCount += Math.min(100, expired.length - offset);
  }
  return releasedCount;
}
