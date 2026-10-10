import { Permission, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { readJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { getPaymentSettings, PAYMENT_SETTINGS_KEY } from "@/lib/payment-settings.server";
import type { PaymentSettings } from "@/lib/payment-settings.types";

const imageUrlSchema = z.string().trim().max(2048).refine(
  (value) => value === "" || z.string().url().safeParse(value).success,
  "Usa una URL válida para la imagen QR.",
).refine(
  (value) => value === "" || /^https?:\/\//i.test(value),
  "La imagen QR debe usar una URL HTTP o HTTPS.",
);

const inputSchema = z.object({
  qrImageUrl: imageUrlSchema,
  qrInstructions: z.string().trim().max(500),
});

export async function PUT(request: Request) {
  const access = await requirePermission(Permission.PLATFORM_CONFIGURE);
  if (!access.session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (access.session.role !== "SUPER_ADMIN" || !access.allowed) {
    return NextResponse.json({ error: "Solo SuperAdmin puede configurar los medios de pago." }, { status: 403 });
  }

  const input = inputSchema.safeParse(await readJson(request));
  if (!input.success) {
    return NextResponse.json({ error: "Revisa la URL del QR y las instrucciones de pago." }, { status: 400 });
  }

  const previous = await getPaymentSettings();
  const settings: PaymentSettings = {
    qrImageUrl: input.data.qrImageUrl || null,
    qrInstructions: input.data.qrInstructions,
  };

  await prisma.$transaction([
    prisma.platformSetting.upsert({
      where: { key: PAYMENT_SETTINGS_KEY },
      update: { value: settings satisfies Prisma.InputJsonObject },
      create: { key: PAYMENT_SETTINGS_KEY, value: settings satisfies Prisma.InputJsonObject },
    }),
    prisma.auditLog.create({
      data: {
        actorId: access.session.userId,
        action: "PAYMENT_SETTINGS_UPDATE",
        entity: "PlatformSetting",
        entityId: PAYMENT_SETTINGS_KEY,
        previousValue: previous satisfies Prisma.InputJsonObject,
        newValue: settings satisfies Prisma.InputJsonObject,
        reason: "Actualización de configuración QR de pagos.",
      },
    }),
  ]);

  return NextResponse.json({ settings });
}
