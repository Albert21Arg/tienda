import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { Permission, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { HOME_IMAGES_SETTING_KEY, getHomeImages } from "@/lib/home-images.server";
import { DEFAULT_HOME_IMAGES, type HomeImages } from "@/lib/home-images.types";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function isSafeImage(data: Buffer, mimeType: string) {
  if (data.length < 24 || data.length > MAX_IMAGE_BYTES) return false;
  if (mimeType === "image/png") {
    if (
      !data.subarray(0, 8).equals(PNG_SIGNATURE) ||
      data.toString("ascii", 12, 16) !== "IHDR"
    ) return false;
    const width = data.readUInt32BE(16);
    const height = data.readUInt32BE(20);
    return width > 0 && height > 0 && width <= 12000 && height <= 12000 && width * height <= 32_000_000;
  }
  return mimeType === "image/jpeg" && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
}

function formBoolean(value: FormDataEntryValue | null) {
  return value === "true";
}

export async function GET() {
  return NextResponse.json({ images: await getHomeImages() });
}

export async function PUT(request: Request) {
  const access = await requirePermission(Permission.HOME_CONTENT_MANAGE);
  if (!access.session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!access.allowed) return NextResponse.json({ error: "No autorizado." }, { status: 403 });

  const formData = await request.formData();
  const resetWomen = formBoolean(formData.get("resetWomen"));
  const resetMen = formBoolean(formData.get("resetMen"));
  const womenFile = formData.get("womenImage");
  const menFile = formData.get("menImage");
  if (
    (womenFile !== null && !(womenFile instanceof File)) ||
    (menFile !== null && !(menFile instanceof File))
  ) {
    return NextResponse.json({ error: "Archivo de imagen inválido." }, { status: 400 });
  }
  if (
    (resetWomen && womenFile instanceof File && womenFile.size > 0) ||
    (resetMen && menFile instanceof File && menFile.size > 0)
  ) {
    return NextResponse.json({ error: "No puedes reemplazar y restaurar la misma imagen a la vez." }, { status: 400 });
  }
  if (
    !resetWomen &&
    !resetMen &&
    (!(womenFile instanceof File) || womenFile.size === 0) &&
    (!(menFile instanceof File) || menFile.size === 0)
  ) {
    return NextResponse.json({ error: "Selecciona una imagen para cambiar o restaurar." }, { status: 400 });
  }

  const current = await getHomeImages();
  const savedFiles: string[] = [];
  const getFileUrl = async (file: FormDataEntryValue | null, field: "women" | "men") => {
    if (!(file instanceof File) || file.size === 0) return undefined;
    if (!["image/png", "image/jpeg"].includes(file.type)) {
      throw new Error("Usa imágenes PNG o JPG/JPEG.");
    }
    const data = Buffer.from(await file.arrayBuffer());
    if (!isSafeImage(data, file.type)) {
      throw new Error("Una imagen está dañada o supera los límites permitidos.");
    }
    const extension = file.type === "image/png" ? "png" : "jpg";
    const filename = `${field}-${randomUUID()}.${extension}`;
    const directory = path.join(process.cwd(), "public", "uploads", "home");
    await mkdir(directory, { recursive: true });
    const absolutePath = path.join(directory, filename);
    await writeFile(absolutePath, data, { flag: "wx" });
    savedFiles.push(absolutePath);
    return `/uploads/home/${filename}`;
  };

  let womenUrl: string | undefined;
  let menUrl: string | undefined;
  try {
    womenUrl = await getFileUrl(womenFile, "women");
    menUrl = await getFileUrl(menFile, "men");
  } catch (error) {
    await Promise.all(savedFiles.map((filename) => unlink(filename)));
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  const images: HomeImages = {
    women: resetWomen ? DEFAULT_HOME_IMAGES.women : womenUrl ?? current.women,
    men: resetMen ? DEFAULT_HOME_IMAGES.men : menUrl ?? current.men,
  };
  try {
    await prisma.$transaction(async (transaction) => {
      await transaction.platformSetting.upsert({
        where: { key: HOME_IMAGES_SETTING_KEY },
        update: { value: images satisfies Prisma.InputJsonObject },
        create: { key: HOME_IMAGES_SETTING_KEY, value: images satisfies Prisma.InputJsonObject },
      });
      await transaction.auditLog.create({
        data: {
          actorId: access.session.userId,
          action: "HOME_IMAGES_UPDATE",
          entity: "PlatformSetting",
          entityId: HOME_IMAGES_SETTING_KEY,
          previousValue: current satisfies Prisma.InputJsonObject,
          newValue: images satisfies Prisma.InputJsonObject,
          reason: "Cambio de imágenes de la portada desde administración.",
        },
      });
    });
  } catch (error) {
    await Promise.all(savedFiles.map((filename) => unlink(filename)));
    throw error;
  }
  return NextResponse.json({ images });
}
