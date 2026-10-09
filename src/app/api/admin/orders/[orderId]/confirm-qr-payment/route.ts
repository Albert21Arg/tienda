import { OrderStatus, PaymentStatus, Permission, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { readJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";
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
    const order = await prisma.$transaction(async (transaction) => {
      const current = await transaction.order.findUnique({
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
      const cartId = payment.providerRef;

      for (const item of current.items) {
        if (!item.variantId) throw new Error("VARIANTE_PEDIDO_INVALIDA");
        const reservations = await transaction.inventoryReservation.findMany({
          where: { cartId, variantId: item.variantId, status: "ACTIVE", expiresAt: { gt: new Date() } },
          select: { id: true, quantity: true },
        });
        const reservedQuantity = reservations.reduce((sum, reservation) => sum + reservation.quantity, 0);
        if (reservedQuantity !== item.quantity) throw new Error("RESERVA_PEDIDO_NO_DISPONIBLE");
        const converted = await transaction.inventoryReservation.updateMany({
          where: {
            id: { in: reservations.map((reservation) => reservation.id) },
            status: "ACTIVE",
            expiresAt: { gt: new Date() },
          },
          data: { status: "CONVERTED" },
        });
        if (converted.count !== reservations.length) throw new Error("RESERVA_PEDIDO_NO_DISPONIBLE");
        const changed = await transaction.$executeRaw(Prisma.sql`
          UPDATE "ProductVariant"
          SET "stockOnHand" = "stockOnHand" - ${item.quantity},
              "stockReserved" = "stockReserved" - ${item.quantity},
              "updatedAt" = NOW()
          WHERE "id" = ${item.variantId}
            AND "stockOnHand" >= ${item.quantity}
            AND "stockReserved" >= ${item.quantity}
        `);
        if (changed !== 1) throw new Error("INVENTARIO_NO_DISPONIBLE");
        const variant = await transaction.productVariant.findUniqueOrThrow({
          where: { id: item.variantId },
          select: { stockOnHand: true },
        });
        await transaction.inventoryMovement.create({
          data: {
            variantId: item.variantId,
            type: "SALE",
            quantity: item.quantity,
            previousStock: variant.stockOnHand + item.quantity,
            newStock: variant.stockOnHand,
            actorId: access.session.userId,
            reason: `Pedido ${current.orderNumber} · Pago QR verificado`,
          },
        });
      }

      const paymentUpdate = await transaction.payment.updateMany({
        where: { id: payment.id, status: PaymentStatus.PENDING },
        data: { status: PaymentStatus.APPROVED, reason: input.data.reason },
      });
      const orderUpdate = await transaction.order.updateMany({
        where: { id: current.id, status: OrderStatus.PENDING_PAYMENT },
        data: { status: OrderStatus.PAID },
      });
      if (paymentUpdate.count !== 1 || orderUpdate.count !== 1) throw new Error("CONFLICTO_PAGO");
      await transaction.auditLog.create({
        data: {
          actorId: access.session.userId,
          action: "PAYMENT_QR_CONFIRM",
          entity: "Order",
          entityId: current.id,
          previousValue: { orderStatus: current.status, paymentStatus: payment.status } satisfies Prisma.InputJsonObject,
          newValue: { orderStatus: OrderStatus.PAID, paymentStatus: PaymentStatus.APPROVED } satisfies Prisma.InputJsonObject,
          reason: input.data.reason,
        },
      });
      return { id: current.id, orderNumber: current.orderNumber, status: OrderStatus.PAID };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
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
