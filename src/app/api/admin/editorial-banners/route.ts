import { Permission, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { readJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { EDITORIAL_BANNERS_SETTING_KEY, getEditorialBanners } from "@/lib/editorial-banners.server";
import type { EditorialBanners } from "@/lib/editorial-banners.types";

const bannerSchema = z.object({
  eyebrow: z.string().trim().min(1).max(60),
  title: z.string().trim().min(1).max(80),
  accent: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(240),
  image: z.string().trim().max(2048).refine(
    (value) => value === "" || z.string().url().safeParse(value).success,
    "Usa una URL válida para la imagen.",
  ).refine(
    (value) => value === "" || /^https?:\/\//i.test(value),
    "La imagen debe usar una URL HTTP o HTTPS.",
  ),
});

const bannersSchema = z.object({
  hombre: bannerSchema,
  mujer: bannerSchema,
});

export async function PUT(request: Request) {
  const access = await requirePermission(Permission.HOME_CONTENT_MANAGE);
  if (!access.session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!access.allowed) return NextResponse.json({ error: "No autorizado." }, { status: 403 });

  const input = bannersSchema.safeParse(await readJson(request));
  if (!input.success) {
    return NextResponse.json({ error: "Revisa los textos y las imágenes de ambos banners." }, { status: 400 });
  }
  const previous = await getEditorialBanners();
  const banners: EditorialBanners = input.data;
  await prisma.$transaction(async (transaction) => {
    await transaction.platformSetting.upsert({
      where: { key: EDITORIAL_BANNERS_SETTING_KEY },
      update: { value: banners satisfies Prisma.InputJsonObject },
      create: { key: EDITORIAL_BANNERS_SETTING_KEY, value: banners satisfies Prisma.InputJsonObject },
    });
    await transaction.auditLog.create({
      data: {
        actorId: access.session.userId,
        action: "EDITORIAL_BANNERS_UPDATE",
        entity: "PlatformSetting",
        entityId: EDITORIAL_BANNERS_SETTING_KEY,
        previousValue: previous satisfies Prisma.InputJsonObject,
        newValue: banners satisfies Prisma.InputJsonObject,
        reason: "Actualización de banners editoriales para Mujer y Hombre desde administración.",
      },
    });
  });
  return NextResponse.json({ banners });
}
