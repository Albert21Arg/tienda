import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { readJson } from "@/lib/http";
import { d1ExpectChanges, d1Statement, prisma, runD1Batch } from "@/lib/prisma";
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
    const existingPayment = await prisma.payment.findUnique({
      where: { idempotencyKey },
      include: { order: true },
    });
    const order = existingPayment?.order ?? await createQrOrder({
      cartToken,
      idempotencyKey,
      input: payload.data,
      configuredShippingFee,
    });

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
    throw error;
  }
}

async function createQrOrder({
  cartToken,
  idempotencyKey,
  input,
  configuredShippingFee,
}: {
  cartToken: string;
  idempotencyKey: string;
  input: z.infer<typeof checkoutSchema>;
  configuredShippingFee: number | null;
}) {
  const now = new Date();
  const cart = await prisma.cart.findUnique({
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
        where: { status: "ACTIVE", expiresAt: { gt: now } },
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

  const expectedReservations = cart.reservations.reduce((sum, item) => sum + item.quantity, 0);
  const expectedItems = cart.items.reduce((sum, item) => sum + item.quantity, 0);
  if (expectedReservations !== expectedItems) {
    throw new CheckoutError("No pudimos conservar tus reservas. Recarga la bolsa e inténtalo de nuevo.", 409);
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
  const orderId = randomUUID();
  const orderNumber = `ATG-${now.toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().slice(0, 6).toUpperCase()}`;
  const paymentMethod = await prisma.paymentMethod.upsert({
    where: { code: "QR_MANUAL" },
    update: { name: "Pago manual por QR", isActive: true },
    create: { code: "QR_MANUAL", name: "Pago manual por QR", isActive: true },
    select: { id: true },
  });
  const address = {
    name: input.name,
    email: input.email.toLowerCase(),
    phone: input.phone,
    address: input.address,
    city: input.city,
    notes: input.notes,
  } satisfies Prisma.InputJsonObject;
  const statements = [d1Statement(
    `INSERT INTO "Order"
      ("id", "orderNumber", "guestEmail", "status", "subtotal", "discount", "shippingCost", "total", "currency", "createdAt", "updatedAt")
     VALUES (?, ?, ?, 'PENDING_PAYMENT', ?, 0, ?, ?, 'COP', ?, ?)`,
    orderId,
    orderNumber,
    input.email.toLowerCase(),
    subtotal,
    shippingCost,
    total,
    now.toISOString(),
    now.toISOString(),
  )];
  d1ExpectChanges(statements);
  statements.push(d1Statement(
    `INSERT INTO "Shipping" ("id", "orderId", "cost", "status", "address", "createdAt", "updatedAt")
     VALUES (?, ?, ?, 'PENDING', ?, ?, ?)`,
    randomUUID(),
    orderId,
    shippingCost,
    JSON.stringify(address),
    now.toISOString(),
    now.toISOString(),
  ));
  d1ExpectChanges(statements);
  statements.push(d1Statement(
    `INSERT INTO "Payment"
      ("id", "orderId", "methodId", "status", "amount", "providerRef", "idempotencyKey", "reason", "createdAt", "updatedAt")
     VALUES (?, ?, ?, 'PENDING', ?, ?, ?, 'Pago manual pendiente de verificar mediante QR.', ?, ?)`,
    randomUUID(),
    orderId,
    paymentMethod.id,
    total,
    cart.id,
    idempotencyKey,
    now.toISOString(),
    now.toISOString(),
  ));
  d1ExpectChanges(statements);
  for (const item of cart.items) {
    statements.push(d1Statement(
      `INSERT INTO "OrderItem"
        ("id", "orderId", "productId", "variantId", "nameSnapshot", "skuSnapshot", "unitPrice", "quantity", "createdAt")
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      randomUUID(),
      orderId,
      item.variant.product.id,
      item.variantId,
      item.variant.product.name,
      item.variant.sku,
      item.variant.priceOverride ?? item.variant.product.basePrice,
      item.quantity,
      now.toISOString(),
    ));
    d1ExpectChanges(statements);
  }
  const holdExpiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  for (const reservation of cart.reservations) {
    statements.push(d1Statement(
      `UPDATE "InventoryReservation" SET "expiresAt" = ?
       WHERE "id" = ? AND "cartId" = ? AND "status" = 'ACTIVE' AND "expiresAt" > ?`,
      holdExpiresAt.toISOString(),
      reservation.id,
      cart.id,
      now.toISOString(),
    ));
    d1ExpectChanges(statements);
  }
  statements.push(d1Statement(
    `DELETE FROM "CartItem" WHERE "cartId" = ?`,
    cart.id,
  ));
  d1ExpectChanges(statements, cart.items.length);
  statements.push(d1Statement(
    `UPDATE "Cart" SET "expiresAt" = ?, "updatedAt" = ? WHERE "id" = ?`,
    now.toISOString(),
    now.toISOString(),
    cart.id,
  ));
  d1ExpectChanges(statements);
  await runD1Batch(statements);

  return { id: orderId, orderNumber, subtotal, shippingCost, total };
}
