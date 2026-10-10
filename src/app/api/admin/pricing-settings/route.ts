import { Permission, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { readJson } from "@/lib/http";
import { MAX_MARKUP_PERCENT, PRICING_SETTINGS_KEY, getDefaultMarkupPercent } from "@/lib/pricing-settings.server";
import { prisma } from "@/lib/prisma";

const inputSchema = z.object({
  markupPercent: z.number().int().min(0).max(MAX_MARKUP_PERCENT),
});

export async function PUT(request: Request) {
  const access = await requirePermission(Permission.PLATFORM_CONFIGURE);
  if (!access.session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (access.session.role !== "SUPER_ADMIN" || !access.allowed) {
    return NextResponse.json({ error: "Solo SuperAdmin puede configurar el margen predeterminado." }, { status: 403 });
  }
  const input = inputSchema.safeParse(await readJson(request));
  if (!input.success) {
    return NextResponse.json({ error: `El porcentaje debe ser un entero entre 0 y ${MAX_MARKUP_PERCENT}.` }, { status: 400 });
  }

  const previousMarkupPercent = await getDefaultMarkupPercent();
  const setting = { markupPercent: input.data.markupPercent };
  await prisma.$transaction([
    prisma.platformSetting.upsert({
      where: { key: PRICING_SETTINGS_KEY },
      update: { value: setting satisfies Prisma.InputJsonObject },
      create: { key: PRICING_SETTINGS_KEY, value: setting satisfies Prisma.InputJsonObject },
    }),
    prisma.auditLog.create({
      data: {
        actorId: access.session.userId,
        action: "PRODUCT_MARKUP_DEFAULT_UPDATE",
        entity: "PlatformSetting",
        entityId: PRICING_SETTINGS_KEY,
        previousValue: { markupPercent: previousMarkupPercent } satisfies Prisma.InputJsonObject,
        newValue: setting satisfies Prisma.InputJsonObject,
        reason: "Actualización del margen predeterminado para nuevos productos.",
      },
    }),
  ]);
  return NextResponse.json(setting);
}
