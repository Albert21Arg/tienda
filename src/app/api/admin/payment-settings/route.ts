import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { Permission, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPaymentSettings, PAYMENT_SETTINGS_KEY } from "@/lib/payment-settings.server";
import type { PaymentSettings } from "@/lib/payment-settings.types";

const MAX_QR_BYTES = 5 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const instructionsSchema = z.string().trim().max(500);

function isSafeImage(data: Buffer, mimeType: string) {
  if (data.length < 24 || data.length > MAX_QR_BYTES) return false;
  if (mimeType === "image/png") {
    if (
      !data.subarray(0, 8).equals(PNG_SIGNATURE) ||
      data.toString("ascii", 12, 16) !== "IHDR"
    ) return false;
    const width = data.readUInt32BE(16);
    const height = data.readUInt32BE(20);
    return width > 0 && height > 0 && width <= 6000 && height <= 6000 && width * height <= 16_000_000;
  }
  return mimeType === "image/jpeg" && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
}

export async function PUT(request: Request) {
  const access = await requirePermission(Permission.PLATFORM_CONFIGURE);
  if (!access.session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (access.session.role !== "SUPER_ADMIN" || !access.allowed) {
    return NextResponse.json({ error: "Solo SuperAdmin puede configurar los medios de pago." }, { status: 403 });
  }

  const formData = await request.formData();
  const parsedInstructions = instructionsSchema.safeParse(formData.get("qrInstructions"));
  const selectedFile = formData.get("qrImage");
  const removeQrImage = formData.get("removeQrImage") === "true";
  if (!parsedInstructions.success) {
    return NextResponse.json({ error: "Las instrucciones de pago no pueden superar 500 caracteres." }, { status: 400 });
  }
  if (selectedFile !== null && !(selectedFile instanceof File)) {
    return NextResponse.json({ error: "Archivo QR inválido." }, { status: 400 });
  }
  if (selectedFile instanceof File && (selectedFile.size === 0 || removeQrImage)) {
    return NextResponse.json({ error: "Selecciona un archivo QR o elimina el actual, no ambas acciones." }, { status: 400 });
  }
  if (selectedFile instanceof File && (!["image/png", "image/jpeg"].includes(selectedFile.type) || selectedFile.size > MAX_QR_BYTES)) {
    return NextResponse.json({ error: "El QR debe ser PNG o JPG/JPEG y pesar máximo 5 MB." }, { status: 400 });
  }

  const previous = await getPaymentSettings();
  let savedFile: string | null = null;
  let qrImageUrl = removeQrImage ? null : previous.qrImageUrl;
  if (selectedFile instanceof File) {
    const bytes = Buffer.from(await selectedFile.arrayBuffer());
    if (!isSafeImage(bytes, selectedFile.type)) {
      return NextResponse.json({ error: "La imagen QR está dañada o supera las dimensiones permitidas." }, { status: 400 });
    }
    const extension = selectedFile.type === "image/png" ? "png" : "jpg";
    const filename = `${randomUUID()}.${extension}`;
    const directory = path.join(process.cwd(), "public", "uploads", "payments");
    await mkdir(directory, { recursive: true });
    savedFile = path.join(directory, filename);
    await writeFile(savedFile, bytes, { flag: "wx" });
    qrImageUrl = `/uploads/payments/${filename}`;
  }

  const settings: PaymentSettings = {
    qrImageUrl,
    qrInstructions: parsedInstructions.data,
  };
  try {
    await prisma.$transaction(async (transaction) => {
      await transaction.platformSetting.upsert({
        where: { key: PAYMENT_SETTINGS_KEY },
        update: { value: settings satisfies Prisma.InputJsonObject },
        create: { key: PAYMENT_SETTINGS_KEY, value: settings satisfies Prisma.InputJsonObject },
      });
      await transaction.auditLog.create({
        data: {
          actorId: access.session.userId,
          action: "PAYMENT_SETTINGS_UPDATE",
          entity: "PlatformSetting",
          entityId: PAYMENT_SETTINGS_KEY,
          previousValue: previous satisfies Prisma.InputJsonObject,
          newValue: settings satisfies Prisma.InputJsonObject,
          reason: "Actualización de configuración QR de pagos.",
        },
      });
    });
  } catch (error) {
    if (savedFile) await unlink(savedFile);
    throw error;
  }

  if (previous.qrImageUrl && previous.qrImageUrl !== settings.qrImageUrl) {
    const oldFilename = /^\/uploads\/payments\/([a-f0-9-]+\.(?:png|jpg))$/i.exec(previous.qrImageUrl)?.[1];
    if (oldFilename) {
      await unlink(path.join(process.cwd(), "public", "uploads", "payments", oldFilename)).catch((error: unknown) => {
        if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
      });
    }
  }
  return NextResponse.json({ settings });
}
