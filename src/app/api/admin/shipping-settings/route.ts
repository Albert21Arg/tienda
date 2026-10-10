import { Permission, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { readJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { getShippingFee, SHIPPING_SETTINGS_KEY } from "@/lib/shipping-settings.server";

const inputSchema = z.object({
  fee: z.number().int().min(0).max(1_000_000),
});

export async function PUT(request: Request) {
  const access = await requirePermission(Permission.HOME_CONTENT_MANAGE);
  if (!access.session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!access.allowed) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  const input = inputSchema.safeParse(await readJson(request));
  if (!input.success) return NextResponse.json({ error: "La tarifa debe ser un valor entero entre $0 y $1.000.000." }, { status: 400 });

  const previousFee = await getShippingFee();
  const setting = { fee: input.data.fee };
  await prisma.$transaction([
    prisma.platformSetting.upsert({
      where: { key: SHIPPING_SETTINGS_KEY },
      update: { value: setting satisfies Prisma.InputJsonObject },
      create: { key: SHIPPING_SETTINGS_KEY, value: setting satisfies Prisma.InputJsonObject },
    }),
    prisma.auditLog.create({
      data: {
        actorId: access.session.userId,
        action: "SHIPPING_FEE_UPDATE",
        entity: "PlatformSetting",
        entityId: SHIPPING_SETTINGS_KEY,
        previousValue: { fee: previousFee } satisfies Prisma.InputJsonObject,
        newValue: setting satisfies Prisma.InputJsonObject,
        reason: "Actualización de la tarifa de envío desde Configuración.",
      },
    }),
  ]);
  return NextResponse.json({ fee: input.data.fee });
}
