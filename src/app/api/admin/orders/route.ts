import { randomUUID } from "node:crypto";
import { OrderStatus, Permission } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { readJson } from "@/lib/http";
import { D1AtomicAssertionError, d1ExpectChanges, d1Statement, prisma, runD1Batch } from "@/lib/prisma";

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
    const order = await prisma.order.findUnique({
      where: { id: input.data.orderId },
      include: {
        items: true,
        payments: { include: { method: { select: { code: true } } } },
      },
    });
    if (!order) return NextResponse.json({ error: "Pedido no encontrado." }, { status: 404 });
    if (
      input.data.status === OrderStatus.PAID &&
      !order.payments.some((payment) => payment.status === "APPROVED")
    ) {
      throw new Error("PAGO_NO_APROBADO");
    }
    if (!transitions[order.status].includes(input.data.status)) {
      throw new Error("TRANSICION_INVALIDA");
    }

    const now = new Date();
    const statements = [];
    if (input.data.status === OrderStatus.CANCELLED && order.status === OrderStatus.PENDING_PAYMENT) {
      for (const payment of order.payments) {
        if (payment.method?.code !== "QR_MANUAL" || payment.status !== "PENDING" || !payment.providerRef) continue;
        const reservations = await prisma.inventoryReservation.findMany({
          where: { cartId: payment.providerRef, status: "ACTIVE" },
          select: { id: true, variantId: true, quantity: true, cartId: true },
        });
        for (const reservation of reservations) {
          statements.push(d1Statement(
            `UPDATE "InventoryReservation" SET "status" = 'CANCELLED'
             WHERE "id" = ? AND "status" = 'ACTIVE'`,
            reservation.id,
          ));
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
            `UPDATE "CartItem" SET "quantity" = MAX("quantity" - ?, 0), "updatedAt" = ?
             WHERE "cartId" = ? AND "variantId" = ?`,
            reservation.quantity,
            now.toISOString(),
            reservation.cartId,
            reservation.variantId,
          ));
          statements.push(d1Statement(
            `DELETE FROM "CartItem" WHERE "cartId" = ? AND "variantId" = ? AND "quantity" <= 0`,
            reservation.cartId,
            reservation.variantId,
          ));
          statements.push(d1Statement(
            `INSERT INTO "InventoryMovement"
              ("id", "variantId", "type", "quantity", "previousStock", "newStock", "actorId", "reason", "createdAt")
             SELECT ?, "id", 'RESERVATION_RELEASE', ?, "stockOnHand", "stockOnHand", ?, ?, ?
             FROM "ProductVariant" WHERE "id" = ?`,
            randomUUID(),
            reservation.quantity,
            access.session.userId,
            `Pedido ${order.orderNumber} cancelado`,
            now.toISOString(),
            reservation.variantId,
          ));
          d1ExpectChanges(statements);
        }
        statements.push(d1Statement(
          `UPDATE "Payment" SET "status" = 'CANCELLED', "reason" = ?, "updatedAt" = ?
           WHERE "id" = ? AND "status" = 'PENDING'`,
          input.data.reason,
          now.toISOString(),
          payment.id,
        ));
        d1ExpectChanges(statements);
      }
    }
    statements.push(d1Statement(
      `UPDATE "Order" SET "status" = ?, "updatedAt" = ? WHERE "id" = ? AND "status" = ?`,
      input.data.status,
      now.toISOString(),
      order.id,
      order.status,
    ));
    d1ExpectChanges(statements);
    statements.push(d1Statement(
      `INSERT INTO "AuditLog"
        ("id", "actorId", "action", "entity", "entityId", "previousValue", "newValue", "reason", "createdAt")
       VALUES (?, ?, 'ORDER_STATUS_UPDATE', 'Order', ?, ?, ?, ?, ?)`,
      randomUUID(),
      access.session.userId,
      order.id,
      JSON.stringify({ status: order.status }),
      JSON.stringify({ status: input.data.status }),
      input.data.reason,
      now.toISOString(),
    ));
    d1ExpectChanges(statements);
    await runD1Batch(statements);
    const updated = { id: order.id, orderNumber: order.orderNumber, status: input.data.status };
    return NextResponse.json({ order: updated });
  } catch (error) {
    if (error instanceof D1AtomicAssertionError) {
      return NextResponse.json({
        error: "El pedido o su inventario reservado cambió. Actualiza la página y revisa el estado antes de reintentar.",
      }, { status: 409 });
    }
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
    console.error("[admin/orders] Failed to update order status.", {
      orderId: input.data.orderId,
      status: input.data.status,
      error,
    });
    return NextResponse.json({
      error: "El servidor no pudo actualizar el pedido. Inténtalo nuevamente; si persiste, revisa la trazabilidad.",
    }, { status: 500 });
  }
}
