import { prisma } from "@/lib/prisma";
import {
  DEFAULT_EDITORIAL_BANNERS,
  type EditorialBanner,
  type EditorialBanners,
} from "@/lib/editorial-banners.types";

export const EDITORIAL_BANNERS_SETTING_KEY = "site.editorial-banners";

function parseBanner(value: unknown, fallback: EditorialBanner): EditorialBanner {
  if (!value || typeof value !== "object") return fallback;
  const candidate = value as Record<string, unknown>;
  return {
    eyebrow: typeof candidate.eyebrow === "string" ? candidate.eyebrow : fallback.eyebrow,
    title: typeof candidate.title === "string" ? candidate.title : fallback.title,
    accent: typeof candidate.accent === "string" ? candidate.accent : fallback.accent,
    description: typeof candidate.description === "string" ? candidate.description : fallback.description,
    image: typeof candidate.image === "string" ? candidate.image : fallback.image,
  };
}

export async function getEditorialBanners(): Promise<EditorialBanners> {
  if (!process.env.DATABASE_URL) return DEFAULT_EDITORIAL_BANNERS;
  const setting = await prisma.platformSetting.findUnique({
    where: { key: EDITORIAL_BANNERS_SETTING_KEY },
    select: { value: true },
  });
  const value = setting?.value;
  if (!value || typeof value !== "object") return DEFAULT_EDITORIAL_BANNERS;
  const candidate = value as Record<string, unknown>;
  return {
    hombre: parseBanner(candidate.hombre, DEFAULT_EDITORIAL_BANNERS.hombre),
    mujer: parseBanner(candidate.mujer, DEFAULT_EDITORIAL_BANNERS.mujer),
  };
}
