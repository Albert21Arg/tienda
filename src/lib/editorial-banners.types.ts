import type { Segment } from "@/lib/catalog";

export type EditorialBanner = {
  eyebrow: string;
  title: string;
  accent: string;
  description: string;
  image: string;
};

export type EditorialBanners = Record<Segment, EditorialBanner>;

export const DEFAULT_EDITORIAL_BANNERS: EditorialBanners = {
  hombre: {
    eyebrow: "MENOS, PERO MEJOR",
    title: "El estilo está en",
    accent: "los detalles.",
    description: "Una selección que acompaña tu forma de vivir.",
    image: "",
  },
  mujer: {
    eyebrow: "MENOS, PERO MEJOR",
    title: "El estilo está en",
    accent: "los detalles.",
    description: "Una selección que acompaña tu forma de vivir.",
    image: "",
  },
};
