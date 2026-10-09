import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function releaseExpiredReservations() {
  const now = new Date();
  const expired = await prisma.inventoryReservation.findMany({
    where: { status: "ACTIVE", expiresAt: { lte: now } },
    select: { id: true, variantId: true, cartId: true, quantity: true },
    take: 500,
  });
  if (!expired.length) return 0;

  return prisma.$transaction(async (transaction) => {
    let releasedCount = 0;
    for (const reservation of expired) {
      const changed = await transaction.inventoryReservation.updateMany({
        where: { id: reservation.id, status: "ACTIVE", expiresAt: { lte: now } },
        data: { status: "EXPIRED" },
      });
      if (changed.count !== 1) continue;
      const released = await transaction.$executeRaw(Prisma.sql`
        UPDATE "ProductVariant"
        SET "stockReserved" = "stockReserved" - ${reservation.quantity},
            "updatedAt" = ${now}
        WHERE "id" = ${reservation.variantId}
          AND "stockReserved" >= ${reservation.quantity}
      `);
      if (released !== 1) throw new Error("Inventario reservado inconsistente.");
      await transaction.cartItem.updateMany({
        where: {
          cartId: reservation.cartId,
          variantId: reservation.variantId,
          quantity: { gte: reservation.quantity },
        },
        data: { quantity: { decrement: reservation.quantity } },
      });
      await transaction.cartItem.deleteMany({
        where: { cartId: reservation.cartId, variantId: reservation.variantId, quantity: { lte: 0 } },
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
          reason: "Reserva expirada",
        },
      });
      releasedCount += 1;
    }
    return releasedCount;
  });
}
