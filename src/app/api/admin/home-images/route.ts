import { Permission, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { readJson } from "@/lib/http";
import { HOME_IMAGES_SETTING_KEY, getHomeImages } from "@/lib/home-images.server";
import { prisma } from "@/lib/prisma";
import type { HomeImages } from "@/lib/home-images.types";

const imageUrlSchema = z.string().trim().max(2048).url().refine(
  (value) => /^https?:\/\//i.test(value),
  "La imagen debe usar una URL HTTP o HTTPS.",
);

const homeImagesSchema = z.object({
  women: imageUrlSchema,
  men: imageUrlSchema,
});

export async function GET() {
  return NextResponse.json({ images: await getHomeImages() });
}

export async function PUT(request: Request) {
  const access = await requirePermission(Permission.HOME_CONTENT_MANAGE);
  if (!access.session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!access.allowed) return NextResponse.json({ error: "No autorizado." }, { status: 403 });

  const input = homeImagesSchema.safeParse(await readJson(request));
  if (!input.success) {
    return NextResponse.json({ error: "Ingresa URLs HTTP o HTTPS válidas para las dos imágenes." }, { status: 400 });
  }

  const current = await getHomeImages();
  const images: HomeImages = input.data;
  await prisma.$transaction([
    prisma.platformSetting.upsert({
      where: { key: HOME_IMAGES_SETTING_KEY },
      update: { value: images satisfies Prisma.InputJsonObject },
      create: { key: HOME_IMAGES_SETTING_KEY, value: images satisfies Prisma.InputJsonObject },
    }),
    prisma.auditLog.create({
      data: {
        actorId: access.session.userId,
        action: "HOME_IMAGES_UPDATE",
        entity: "PlatformSetting",
        entityId: HOME_IMAGES_SETTING_KEY,
        previousValue: current satisfies Prisma.InputJsonObject,
        newValue: images satisfies Prisma.InputJsonObject,
        reason: "Actualización de las URLs de imágenes de la portada desde administración.",
      },
    }),
  ]);
  return NextResponse.json({ images });
}
