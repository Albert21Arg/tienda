import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { Permission, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { BRAND_SETTING_KEY, getSiteBrand } from "@/lib/site-brand";
import { prisma } from "@/lib/prisma";

const MAX_LOGO_BYTES = 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const nameSchema = z.string().trim().min(2).max(48).refine((value) => /\S/.test(value));
const taglineSchema = z.string().trim().min(2).max(60).refine((value) => /\S/.test(value));
const announcementSchema = z.string().trim().min(2).max(120).refine((value) => /\S/.test(value));
const optionalText = (max: number) => z.string().trim().max(max);
const contactEmailSchema = z.string().trim().max(160).refine(
  (value) => value === "" || z.string().email().safeParse(value).success,
  "Ingresa un correo válido.",
);

function isPng(data: Buffer) {
  if (
    data.length < 24 ||
    !data.subarray(0, 8).equals(PNG_SIGNATURE) ||
    data.toString("ascii", 12, 16) !== "IHDR"
  ) return false;
  const width = data.readUInt32BE(16);
  const height = data.readUInt32BE(20);
  return width > 0 && height > 0 && width <= 4096 && height <= 4096 && width * height <= 8_000_000;
}

export async function GET() {
  return NextResponse.json({ brand: await getSiteBrand() });
}

export async function PUT(request: Request) {
  const access = await requirePermission(Permission.PLATFORM_CONFIGURE);
  if (!access.session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (access.session.role !== "SUPER_ADMIN" || !access.allowed) {
    return NextResponse.json({ error: "Solo SuperAdmin puede cambiar la identidad del sitio." }, { status: 403 });
  }

  const formData = await request.formData();
  const parsedName = nameSchema.safeParse(formData.get("name"));
  const parsedTagline = taglineSchema.safeParse(formData.get("tagline"));
  const parsedAnnouncement = announcementSchema.safeParse(formData.get("announcement"));
  const contactEmail = contactEmailSchema.safeParse(formData.get("contactEmail"));
  const contactWhatsApp = optionalText(30).safeParse(formData.get("contactWhatsApp"));
  const contactSchedule = optionalText(300).safeParse(formData.get("contactSchedule"));
  const shippingReturns = optionalText(4000).safeParse(formData.get("shippingReturns"));
  if (
    !parsedName.success || !parsedTagline.success || !parsedAnnouncement.success ||
    !contactEmail.success || !contactWhatsApp.success || !contactSchedule.success || !shippingReturns.success
  ) {
    return NextResponse.json({ error: "Revisa los datos de identidad, contacto y envíos." }, { status: 400 });
  }
  const removeLogo = formData.get("removeLogo") === "true";
  const selectedFile = formData.get("logo");
  if (selectedFile !== null && !(selectedFile instanceof File)) {
    return NextResponse.json({ error: "Archivo de logo inválido." }, { status: 400 });
  }
  if (selectedFile instanceof File && (removeLogo || selectedFile.size === 0)) {
    return NextResponse.json({ error: "Selecciona un solo logo o quita el logo actual." }, { status: 400 });
  }
  if (selectedFile instanceof File && (selectedFile.type !== "image/png" || selectedFile.size > MAX_LOGO_BYTES)) {
    return NextResponse.json({ error: "El logo debe ser PNG y pesar como máximo 1 MB." }, { status: 400 });
  }

  const previous = await getSiteBrand();
  let logoUrl = removeLogo ? null : previous.logoUrl;
  let savedFile: string | null = null;
  if (selectedFile instanceof File) {
    const bytes = Buffer.from(await selectedFile.arrayBuffer());
    if (bytes.length > MAX_LOGO_BYTES || !isPng(bytes)) {
      return NextResponse.json({ error: "El archivo no es un PNG válido o excede el tamaño permitido." }, { status: 400 });
    }
    const filename = `${randomUUID()}.png`;
    const uploadDirectory = path.join(process.cwd(), "public", "uploads", "site-brand");
    await mkdir(uploadDirectory, { recursive: true });
    savedFile = path.join(uploadDirectory, filename);
    await writeFile(savedFile, bytes, { flag: "wx" });
    logoUrl = `/uploads/site-brand/${filename}`;
  }

  const brand = {
    name: parsedName.data,
    tagline: parsedTagline.data,
    announcement: parsedAnnouncement.data,
    contactEmail: contactEmail.data,
    contactWhatsApp: contactWhatsApp.data,
    contactSchedule: contactSchedule.data,
    shippingReturns: shippingReturns.data,
    logoUrl,
  };
  try {
    await prisma.$transaction(async (transaction) => {
      await transaction.platformSetting.upsert({
        where: { key: BRAND_SETTING_KEY },
        update: { value: brand satisfies Prisma.InputJsonObject },
        create: { key: BRAND_SETTING_KEY, value: brand satisfies Prisma.InputJsonObject },
      });
      await transaction.auditLog.create({
        data: {
          actorId: access.session.userId,
          action: "SITE_BRAND_UPDATE",
          entity: "PlatformSetting",
          entityId: BRAND_SETTING_KEY,
          previousValue: previous satisfies Prisma.InputJsonObject,
          newValue: brand satisfies Prisma.InputJsonObject,
          reason: "Actualización de identidad del sitio desde configuración SuperAdmin.",
        },
      });
    });
  } catch (error) {
    if (savedFile) await unlink(savedFile);
    throw error;
  }

  return NextResponse.json({ brand });
}
