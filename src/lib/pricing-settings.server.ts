import { prisma } from "@/lib/prisma";
import { MAX_MARKUP_PERCENT } from "@/lib/pricing";

export const PRICING_SETTINGS_KEY = "pricing.default-markup";
export const DEFAULT_MARKUP_PERCENT = 0;
export { MAX_MARKUP_PERCENT };

export async function getDefaultMarkupPercent(): Promise<number> {
  const setting = await prisma.platformSetting.findUnique({
    where: { key: PRICING_SETTINGS_KEY },
    select: { value: true },
  });
  if (!setting || !setting.value || typeof setting.value !== "object" || Array.isArray(setting.value)) {
    return DEFAULT_MARKUP_PERCENT;
  }
  const markupPercent = (setting.value as Record<string, unknown>).markupPercent;
  return typeof markupPercent === "number" &&
    Number.isSafeInteger(markupPercent) &&
    markupPercent >= 0 &&
    markupPercent <= MAX_MARKUP_PERCENT
    ? markupPercent
    : DEFAULT_MARKUP_PERCENT;
}
