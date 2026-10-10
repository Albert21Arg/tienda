import { prisma } from "@/lib/prisma";
import {
  DEFAULT_PAYMENT_SETTINGS,
  type PaymentSettings,
} from "@/lib/payment-settings.types";

export const PAYMENT_SETTINGS_KEY = "payments.configuration";

function isPaymentSettings(value: unknown): value is PaymentSettings {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    (candidate.qrImageUrl === null || typeof candidate.qrImageUrl === "string") &&
    typeof candidate.qrInstructions === "string"
  );
}

export async function getPaymentSettings(): Promise<PaymentSettings> {
  const setting = await prisma.platformSetting.findUnique({
    where: { key: PAYMENT_SETTINGS_KEY },
    select: { value: true },
  });
  return isPaymentSettings(setting?.value)
    ? setting.value
    : DEFAULT_PAYMENT_SETTINGS;
}

export function getWompiSetupStatus() {
  const environment = process.env.WOMPI_ENVIRONMENT;
  if (environment && environment !== "test" && environment !== "production") {
    throw new Error("WOMPI_ENVIRONMENT debe ser 'test' o 'production'.");
  }
  const resolvedEnvironment: "test" | "production" =
    environment === "production" ? "production" : "test";
  return {
    environment: resolvedEnvironment,
    publicKeyConfigured: Boolean(process.env.WOMPI_PUBLIC_KEY),
    privateKeyConfigured: Boolean(process.env.WOMPI_PRIVATE_KEY),
    eventsSecretConfigured: Boolean(process.env.WOMPI_EVENTS_SECRET),
  };
}
