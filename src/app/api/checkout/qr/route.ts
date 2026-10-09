import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { readJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { getPaymentSettings } from "@/lib/payment-settings.server";
import { releaseExpiredReservations } from "@/lib/inventory.server";
import { FREE_SHIPPING_THRESHOLD, getShippingFee } from "@/lib/shipping-settings.server";

const checkoutSchema = z.object({
  idempotencyKey: z.uuid(),
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(160),
  phone: z.string().trim().min(7).max(30),
  address: z.string().trim().min(5).max(240),
  city: z.string().trim().min(2).max(100),
  notes: z.string().trim().max(500),
});

class CheckoutError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function POST(request: Request) {
  const payload = checkoutSchema.safeParse(await readJson(request));
  if (!payload.success) {
    return NextResponse.json({ error: "Completa correctamente tus datos de contacto y entrega." }, { status: 400 });
  }
  const settings = await getPaymentSettings();
  const configuredShippingFee = await getShippingFee();
  if (!settings.qrImageUrl) {
    return NextResponse.json({ error: "El pago por QR no está configurado todavía. Contáctanos para continuar." }, { status: 409 });
  }
  const cartToken = (await cookies()).get("atelier_cart")?.value;
  if (!cartToken) return NextResponse.json({ error: "Tu bolsa está vacía o la reserva expiró." }, { status: 409 });

  await releaseExpiredReservations();
  const idempotencyKey = `QR-${cartToken}-${payload.data.idempotencyKey}`;
  try {
    const order = await prisma.$transaction(async (transaction) => {
      const existingPayment = await transaction.payment.findUnique({
        where: { idempotencyKey },
        include: { order: true },
      });
      if (existingPayment) return existingPayment.order;

      const cart = await transaction.cart.findUnique({
        where: { sessionToken: cartToken },
        include: {
          items: {
            include: {
              variant: {
                include: {
                  product: { select: { id: true, name: true, basePrice: true, isActive: true } },
                },
              },
            },
          },
          reservations: {
            where: { status: "ACTIVE", expiresAt: { gt: new Date() } },
            select: { id: true, variantId: true, quantity: true },
          },
        },
      });
      if (!cart || !cart.items.length) throw new CheckoutError("Tu bolsa está vacía o la reserva expiró.", 409);

      for (const item of cart.items) {
        const reserved = cart.reservations
          .filter((reservation) => reservation.variantId === item.variantId)
          .reduce((sum, reservation) => sum + reservation.quantity, 0);
        if (!item.variant.isActive || !item.variant.product.isActive || reserved < item.quantity) {
          throw new CheckoutError("Una reserva expiró. Regresa a la tienda y agrega nuevamente los productos.", 409);
        }
      }

      const subtotal = cart.items.reduce(
        (sum, item) => sum + (item.variant.priceOverride ?? item.variant.product.basePrice) * item.quantity,
        0,
      );
      const shippingCost = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : configuredShippingFee;
      if (shippingCost === null) {
        throw new CheckoutError("La tarifa de envío todavía no está configurada. Contacta a la tienda para continuar.", 409);
      }
      const total = subtotal + shippingCost;
      const paymentMethod = await transaction.paymentMethod.upsert({
        where: { code: "QR_MANUAL" },
        update: { name: "Pago manual por QR", isActive: true },
        create: { code: "QR_MANUAL", name: "Pago manual por QR", isActive: true },
        select: { id: true },
      });
      const order = await transaction.order.create({
        data: {
          orderNumber: `ATG-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().slice(0, 6).toUpperCase()}`,
          guestEmail: payload.data.email.toLowerCase(),
          status: "PENDING_PAYMENT",
          subtotal,
          discount: 0,
          shippingCost,
          total,
          currency: "COP",
          items: {
            create: cart.items.map((item) => ({
              productId: item.variant.product.id,
              variantId: item.variantId,
              nameSnapshot: item.variant.product.name,
              skuSnapshot: item.variant.sku,
              unitPrice: item.variant.priceOverride ?? item.variant.product.basePrice,
              quantity: item.quantity,
            })),
          },
          shipping: {
            create: {
              cost: shippingCost,
              address: {
                name: payload.data.name,
                email: payload.data.email.toLowerCase(),
                phone: payload.data.phone,
                address: payload.data.address,
                city: payload.data.city,
                notes: payload.data.notes,
              } satisfies Prisma.InputJsonObject,
            },
          },
          payments: {
            create: {
              methodId: paymentMethod.id,
              status: "PENDING",
              amount: total,
              providerRef: cart.id,
              idempotencyKey,
              reason: "Pago manual pendiente de verificar mediante QR.",
            },
          },
        },
        select: { id: true, orderNumber: true, subtotal: true, shippingCost: true, total: true },
      });

      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const heldReservations = await transaction.inventoryReservation.updateMany({
        where: {
          cartId: cart.id,
          status: "ACTIVE",
          expiresAt: { gt: new Date() },
        },
        data: { expiresAt },
      });
      const expectedReservations = cart.reservations.reduce((sum, item) => sum + item.quantity, 0);
      const expectedItems = cart.items.reduce((sum, item) => sum + item.quantity, 0);
      if (heldReservations.count !== cart.reservations.length || expectedReservations !== expectedItems) {
        throw new CheckoutError("No pudimos conservar tus reservas. Recarga la bolsa e inténtalo de nuevo.", 409);
      }
      await transaction.cartItem.deleteMany({ where: { cartId: cart.id } });
      await transaction.cart.update({
        where: { id: cart.id },
        data: { expiresAt: new Date() },
      });
      return order;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    const response = NextResponse.json({
      order: {
        orderNumber: order.orderNumber,
        subtotal: order.subtotal,
        shippingCost: order.shippingCost,
        total: order.total,
      },
      payment: { qrImageUrl: settings.qrImageUrl, instructions: settings.qrInstructions },
    }, { status: 201 });
    response.cookies.set("atelier_cart", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 0,
    });
    return response;
  } catch (error) {
    if (error instanceof CheckoutError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existingPayment = await prisma.payment.findUnique({
        where: { idempotencyKey },
        include: { order: { select: { orderNumber: true, subtotal: true, shippingCost: true, total: true } } },
      });
      if (existingPayment) {
        return NextResponse.json({
          order: existingPayment.order,
          payment: { qrImageUrl: settings.qrImageUrl, instructions: settings.qrInstructions },
        }, { status: 201 });
      }
    }
    throw error;
  }
}
