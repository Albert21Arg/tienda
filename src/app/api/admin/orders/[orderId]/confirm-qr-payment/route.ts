import { randomUUID } from "node:crypto";
import { OrderStatus, PaymentStatus, Permission } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { readJson } from "@/lib/http";
import { d1ExpectChanges, d1Statement, prisma, runD1Batch } from "@/lib/prisma";
import { releaseExpiredReservations } from "@/lib/inventory.server";

const confirmationSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const access = await requirePermission(Permission.PAYMENT_CONFIRM);
  if (!access.session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!access.allowed) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  const { orderId } = await params;
  const input = confirmationSchema.safeParse(await readJson(request));
  if (!input.success) return NextResponse.json({ error: "Escribe el motivo de la confirmación." }, { status: 400 });

  try {
    await releaseExpiredReservations();
    const current = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: true,
        payments: { include: { method: { select: { code: true } } } },
      },
    });
    if (!current) throw new Error("PEDIDO_NO_ENCONTRADO");
    if (current.status !== OrderStatus.PENDING_PAYMENT) throw new Error("PEDIDO_NO_PENDIENTE");
    const payment = current.payments.find(
      (item) => item.method?.code === "QR_MANUAL" && item.status === PaymentStatus.PENDING,
    );
    if (!payment?.providerRef) throw new Error("PAGO_QR_NO_ENCONTRADO");
    const now = new Date();
    const variantIds = current.items.flatMap((item) => item.variantId ? [item.variantId] : []);
    if (variantIds.length !== current.items.length) throw new Error("VARIANTE_PEDIDO_INVALIDA");
    const reservations = await prisma.inventoryReservation.findMany({
      where: {
        cartId: payment.providerRef,
        variantId: { in: variantIds },
        status: "ACTIVE",
        expiresAt: { gt: now },
      },
      select: { id: true, variantId: true, quantity: true },
    });
    const statements = [];
    for (const item of current.items) {
      const itemReservations = reservations.filter((reservation) => reservation.variantId === item.variantId);
      const reservedQuantity = itemReservations.reduce((sum, reservation) => sum + reservation.quantity, 0);
      if (reservedQuantity !== item.quantity) throw new Error("RESERVA_PEDIDO_NO_DISPONIBLE");
      for (const reservation of itemReservations) {
        statements.push(d1Statement(
          `UPDATE "InventoryReservation" SET "status" = 'CONVERTED'
           WHERE "id" = ? AND "status" = 'ACTIVE' AND "expiresAt" > ?`,
          reservation.id,
          now.toISOString(),
        ));
        d1ExpectChanges(statements);
      }
      statements.push(d1Statement(
        `UPDATE "ProductVariant"
         SET "stockOnHand" = "stockOnHand" - ?, "stockReserved" = "stockReserved" - ?, "updatedAt" = ?
         WHERE "id" = ? AND "stockOnHand" >= ? AND "stockReserved" >= ?`,
        item.quantity,
        item.quantity,
        now.toISOString(),
        item.variantId,
        item.quantity,
        item.quantity,
      ));
      d1ExpectChanges(statements);
      statements.push(d1Statement(
        `INSERT INTO "InventoryMovement"
          ("id", "variantId", "type", "quantity", "previousStock", "newStock", "actorId", "reason", "createdAt")
         SELECT ?, "id", 'SALE', ?, "stockOnHand" + ?, "stockOnHand", ?, ?, ?
         FROM "ProductVariant" WHERE "id" = ?`,
        randomUUID(),
        item.quantity,
        item.quantity,
        access.session.userId,
        `Pedido ${current.orderNumber} · Pago QR verificado`,
        now.toISOString(),
        item.variantId,
      ));
      d1ExpectChanges(statements);
    }
    statements.push(d1Statement(
      `UPDATE "Payment" SET "status" = 'APPROVED', "reason" = ?, "updatedAt" = ?
       WHERE "id" = ? AND "status" = 'PENDING'`,
      input.data.reason,
      now.toISOString(),
      payment.id,
    ));
    d1ExpectChanges(statements);
    statements.push(d1Statement(
      `UPDATE "Order" SET "status" = 'PAID', "updatedAt" = ?
       WHERE "id" = ? AND "status" = 'PENDING_PAYMENT'`,
      now.toISOString(),
      current.id,
    ));
    d1ExpectChanges(statements);
    statements.push(d1Statement(
      `INSERT INTO "AuditLog"
        ("id", "actorId", "action", "entity", "entityId", "previousValue", "newValue", "reason", "createdAt")
       VALUES (?, ?, 'PAYMENT_QR_CONFIRM', 'Order', ?, ?, ?, ?, ?)`,
      randomUUID(),
      access.session.userId,
      current.id,
      JSON.stringify({ orderStatus: current.status, paymentStatus: payment.status }),
      JSON.stringify({ orderStatus: OrderStatus.PAID, paymentStatus: PaymentStatus.APPROVED }),
      input.data.reason,
      now.toISOString(),
    ));
    d1ExpectChanges(statements);
    await runD1Batch(statements);
    const order = { id: current.id, orderNumber: current.orderNumber, status: OrderStatus.PAID };
    return NextResponse.json({ order });
  } catch (error) {
    if (error instanceof Error) {
      const messages: Record<string, { status: number; message: string }> = {
        PEDIDO_NO_ENCONTRADO: { status: 404, message: "Pedido no encontrado." },
        PEDIDO_NO_PENDIENTE: { status: 409, message: "El pedido ya no está pendiente de pago." },
        PAGO_QR_NO_ENCONTRADO: { status: 409, message: "No hay un pago QR pendiente para este pedido." },
        VARIANTE_PEDIDO_INVALIDA: { status: 409, message: "Este pedido no contiene una variante válida de inventario." },
        RESERVA_PEDIDO_NO_DISPONIBLE: { status: 409, message: "La reserva de inventario no coincide con las unidades del pedido." },
        INVENTARIO_NO_DISPONIBLE: { status: 409, message: "No hay inventario reservado suficiente para confirmar este pedido." },
        CONFLICTO_PAGO: { status: 409, message: "El pago cambió; actualiza la página e inténtalo de nuevo." },
      };
      const known = messages[error.message];
      if (known) return NextResponse.json({ error: known.message }, { status: known.status });
    }
    throw error;
  }
}
