export function parseProductImages(value: string): string[] {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed) || parsed.some((image) => typeof image !== "string")) {
    throw new Error("La lista de imágenes del producto no es válida.");
  }
  return parsed;
}
