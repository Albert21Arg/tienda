import { OrderStatus, Permission, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { readJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { releaseExpiredReservations } from "@/lib/inventory.server";

export async function GET() {
  const access = await requirePermission(Permission.ORDER_READ);
  if (!access.session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!access.allowed) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  const orders = await prisma.order.findMany({
    take: 100,
    orderBy: { createdAt: "desc" },
    include: { customer: { select: { name: true, email: true } }, payments: true, items: true },
  });
  return NextResponse.json({ orders });
}

const updateSchema = z.object({
  orderId: z.string().min(1),
  status: z.nativeEnum(OrderStatus),
  reason: z.string().trim().min(3).max(500),
});

const transitions: Record<OrderStatus, OrderStatus[]> = {
  PENDING_PAYMENT: [OrderStatus.CANCELLED],
  PAID: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  CONFIRMED: [OrderStatus.PREPARING, OrderStatus.CANCELLED],
  PREPARING: [OrderStatus.SHIPPED, OrderStatus.CANCELLED],
  SHIPPED: [OrderStatus.IN_TRANSIT, OrderStatus.DELIVERED],
  IN_TRANSIT: [OrderStatus.DELIVERED],
  DELIVERED: [],
  CANCELLED: [],
};

export async function PATCH(request: Request) {
  const access = await requirePermission(Permission.ORDER_UPDATE);
  if (!access.session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!access.allowed) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  const input = updateSchema.safeParse(await readJson(request));
  if (!input.success) return NextResponse.json({ error: "Datos de pedido inválidos." }, { status: 400 });

  try {
    if (input.data.status === OrderStatus.CANCELLED) await releaseExpiredReservations();
    const updated = await prisma.$transaction(async (transaction) => {
      const order = await transaction.order.findUnique({
        where: { id: input.data.orderId },
        include: {
          items: true,
          payments: { include: { method: { select: { code: true } } } },
        },
      });
      if (!order) return null;
      if (
        input.data.status === OrderStatus.PAID &&
        !(await transaction.payment.findFirst({
          where: { orderId: order.id, status: "APPROVED" },
          select: { id: true },
        }))
      ) {
        throw new Error("PAGO_NO_APROBADO");
      }
      if (!transitions[order.status].includes(input.data.status)) {
        throw new Error("TRANSICION_INVALIDA");
      }
      if (input.data.status === OrderStatus.CANCELLED && order.status === OrderStatus.PENDING_PAYMENT) {
        for (const payment of order.payments) {
          if (payment.method?.code !== "QR_MANUAL" || payment.status !== "PENDING" || !payment.providerRef) continue;
          const reservations = await transaction.inventoryReservation.findMany({
            where: { cartId: payment.providerRef, status: "ACTIVE" },
            select: { id: true, variantId: true, quantity: true },
          });
          for (const reservation of reservations) {
            const released = await transaction.inventoryReservation.updateMany({
              where: { id: reservation.id, status: "CONVERTED" },
              data: { status: "CANCELLED" },
            });
            if (released.count !== 1) continue;
            const stockReleased = await transaction.$executeRaw(Prisma.sql`
              UPDATE "ProductVariant"
              SET "stockReserved" = "stockReserved" - ${reservation.quantity},
                  "updatedAt" = NOW()
              WHERE "id" = ${reservation.variantId}
                AND "stockReserved" >= ${reservation.quantity}
            `);
            if (stockReleased !== 1) throw new Error("INVENTARIO_RESERVADO_INCONSISTENTE");
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
                actorId: access.session.userId,
                reason: `Pedido ${order.orderNumber} cancelado`,
              },
            });
          }
          await transaction.payment.updateMany({
            where: { id: payment.id, status: "PENDING" },
            data: { status: "CANCELLED", reason: input.data.reason },
          });
        }
      }
      const result = await transaction.order.updateMany({
        where: { id: order.id, status: order.status },
        data: { status: input.data.status },
      });
      if (result.count !== 1) throw new Error("CONFLICTO_PEDIDO");
      await transaction.auditLog.create({
        data: {
          actorId: access.session.userId,
          action: "ORDER_STATUS_UPDATE",
          entity: "Order",
          entityId: order.id,
          previousValue: { status: order.status } satisfies Prisma.InputJsonObject,
          newValue: { status: input.data.status } satisfies Prisma.InputJsonObject,
          reason: input.data.reason,
        },
      });
      return { id: order.id, orderNumber: order.orderNumber, status: input.data.status };
    });
    if (!updated) return NextResponse.json({ error: "Pedido no encontrado." }, { status: 404 });
    return NextResponse.json({ order: updated });
  } catch (error) {
    if (error instanceof Error && error.message === "TRANSICION_INVALIDA") {
      return NextResponse.json({ error: "Ese cambio de estado no está permitido." }, { status: 409 });
    }
    if (error instanceof Error && error.message === "PAGO_NO_APROBADO") {
      return NextResponse.json({ error: "El pedido requiere un pago aprobado antes de marcarse como pagado." }, { status: 409 });
    }
    if (error instanceof Error && error.message === "CONFLICTO_PEDIDO") {
      return NextResponse.json({ error: "El pedido cambió; actualiza e inténtalo de nuevo." }, { status: 409 });
    }
    if (error instanceof Error && error.message === "INVENTARIO_RESERVADO_INCONSISTENTE") {
      return NextResponse.json({ error: "No se pudo liberar el inventario reservado. Solicita soporte antes de reintentar." }, { status: 409 });
    }
    throw error;
  }
}
