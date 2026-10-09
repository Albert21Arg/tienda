import { prisma } from "@/lib/prisma";
import { DEFAULT_HOME_IMAGES, type HomeImages } from "@/lib/home-images.types";

export const HOME_IMAGES_SETTING_KEY = "site.home-images";

function isHomeImages(value: unknown): value is HomeImages {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.women === "string" && typeof candidate.men === "string";
}

export async function getHomeImages(): Promise<HomeImages> {
  if (!process.env.DATABASE_URL) return DEFAULT_HOME_IMAGES;
  const setting = await prisma.platformSetting.findUnique({
    where: { key: HOME_IMAGES_SETTING_KEY },
    select: { value: true },
  });
  return isHomeImages(setting?.value)
    ? { ...DEFAULT_HOME_IMAGES, ...setting.value }
    : DEFAULT_HOME_IMAGES;
}
