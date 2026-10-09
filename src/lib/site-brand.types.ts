export type SiteBrand = {
  name: string;
  tagline: string;
  announcement: string;
  contactEmail: string;
  contactWhatsApp: string;
  contactSchedule: string;
  shippingReturns: string;
  logoUrl: string | null;
};

export const DEFAULT_SITE_BRAND: SiteBrand = {
  name: "Atelier",
  tagline: "ESTUDIO DE ESTILO",
  announcement: "Envío gratis en compras superiores a $250.000 · Colombia",
  contactEmail: "",
  contactWhatsApp: "",
  contactSchedule: "",
  shippingReturns: "",
  logoUrl: null,
};
