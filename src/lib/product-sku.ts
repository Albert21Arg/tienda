type ProductSegment = "MEN" | "WOMEN";

export function generateProductSku(
  segment: ProductSegment,
  slug: string,
  size?: string | null,
  color?: string | null,
) {
  const productCode =
    slug
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 32) || "PRODUCTO";
  const sizeCode = size
    ? size.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "")
    : "UNICA";
  const colorCode = color
    ? color
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 16)
    : "";

  return `ATL-${segment === "MEN" ? "M" : "W"}-${productCode}-${sizeCode}${colorCode ? `-${colorCode}` : ""}`;
}
