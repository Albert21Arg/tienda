import { Segment as DbSegment } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  type Product,
  type Segment,
} from "@/lib/catalog";
import { parseProductImages } from "@/lib/product-images";

function mapProduct(record: {
  id: string;
  slug: string;
  name: string;
  description: string;
  segment: DbSegment;
  basePrice: number;
  previousPrice: number | null;
  images: string;
  category: { name: string };
  variants: {
    id: string;
    color: string | null;
    size: string | null;
    priceOverride: number | null;
    stockOnHand: number;
    stockReserved: number;
  }[];
}): Product {
  const images = parseProductImages(record.images);
  const variant =
    record.variants.find((item) => item.stockOnHand - item.stockReserved > 0) ??
    record.variants[0];
  const price = variant?.priceOverride ?? record.basePrice;
  const previousPrice = record.previousPrice ?? undefined;
  return {
    id: record.id,
    slug: record.slug,
    name: record.name,
    category: record.category.name,
    segment: record.segment === "MEN" ? "hombre" : "mujer",
    price,
    previousPrice,
    label: previousPrice && previousPrice > price
      ? `-${Math.round((previousPrice - price) / previousPrice * 100)}% descuento`
      : undefined,
    color: variant?.color ?? "Selección",
    image: images[0] ?? "",
    images,
    description: record.description,
    sizes: [...new Set(record.variants.flatMap((item) => item.size ? [item.size] : []))],
    variantId: variant?.id,
    inventoryConfigured: true,
    variants: record.variants.map((item) => ({
      id: item.id,
      color: item.color ?? undefined,
      size: item.size ?? undefined,
      stockAvailable: item.stockOnHand - item.stockReserved,
    })),
  };
}

export async function getStoreProducts(segment?: Segment): Promise<Product[]> {
  const records = await prisma.product.findMany({
    where: {
      isActive: true,
      ...(segment ? { segment: segment === "hombre" ? DbSegment.MEN : DbSegment.WOMEN } : {}),
    },
    include: {
      category: { select: { name: true } },
      variants: {
        where: { isActive: true },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: [{ isFeatured: "desc" }, { createdAt: "desc" }],
  });
  return records.map(mapProduct);
}

export async function getStoreCategories(segment: Segment): Promise<string[]> {
  const categories = await prisma.category.findMany({
    where: {
      isActive: true,
      segment: segment === "hombre" ? DbSegment.MEN : DbSegment.WOMEN,
      parentId: null,
    },
    select: { name: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return categories.map((category) => category.name);
}

export async function getStoreProduct(slug: string): Promise<Product | undefined> {
  const record = await prisma.product.findUnique({
    where: { slug, isActive: true },
    include: {
      category: { select: { name: true } },
      variants: {
        where: { isActive: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  return record ? mapProduct(record) : undefined;
}
