import { prisma } from "@/lib/prisma";
import { FREE_SHIPPING_THRESHOLD } from "@/lib/shipping-settings.types";

export const SHIPPING_SETTINGS_KEY = "shipping.configuration";
export { FREE_SHIPPING_THRESHOLD };

export async function getShippingFee(): Promise<number | null> {
  if (!process.env.DATABASE_URL) return null;
  const setting = await prisma.platformSetting.findUnique({
    where: { key: SHIPPING_SETTINGS_KEY },
    select: { value: true },
  });
  if (!setting || !setting.value || typeof setting.value !== "object" || Array.isArray(setting.value)) {
    return null;
  }
  const fee = (setting.value as Record<string, unknown>).fee;
  return typeof fee === "number" && Number.isSafeInteger(fee) && fee >= 0 && fee <= 1_000_000
    ? fee
    : null;
}
