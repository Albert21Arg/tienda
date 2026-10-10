import { prisma } from "@/lib/prisma";
import { DEFAULT_SITE_BRAND, type SiteBrand } from "@/lib/site-brand.types";
export { DEFAULT_SITE_BRAND } from "@/lib/site-brand.types";
export type { SiteBrand } from "@/lib/site-brand.types";

const BRAND_SETTING_KEY = "site.brand";

function parseSiteBrand(value: unknown): SiteBrand | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.name !== "string" ||
    (candidate.logoUrl !== null && typeof candidate.logoUrl !== "string")
  ) return null;
  return {
    name: candidate.name,
    tagline: typeof candidate.tagline === "string" ? candidate.tagline : DEFAULT_SITE_BRAND.tagline,
    announcement: typeof candidate.announcement === "string" ? candidate.announcement : DEFAULT_SITE_BRAND.announcement,
    contactEmail: typeof candidate.contactEmail === "string" ? candidate.contactEmail : "",
    contactWhatsApp: typeof candidate.contactWhatsApp === "string" ? candidate.contactWhatsApp : "",
    contactSchedule: typeof candidate.contactSchedule === "string" ? candidate.contactSchedule : "",
    shippingReturns: typeof candidate.shippingReturns === "string" ? candidate.shippingReturns : "",
    logoUrl: candidate.logoUrl,
  };
}

export async function getSiteBrand(): Promise<SiteBrand> {
  const setting = await prisma.platformSetting.findUnique({
    where: { key: BRAND_SETTING_KEY },
    select: { value: true },
  });
  return parseSiteBrand(setting?.value) ?? DEFAULT_SITE_BRAND;
}

export { BRAND_SETTING_KEY };
