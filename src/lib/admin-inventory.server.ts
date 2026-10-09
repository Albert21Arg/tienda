import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  INVENTORY_PAGE_SIZE,
  type InventoryPage,
  type InventorySegmentFilter,
  type InventoryStatusFilter,
  type InventoryVariantRow,
} from "@/lib/admin-inventory.types";

type InventoryQueryRow = Omit<InventoryVariantRow, "product"> & {
  productName: string;
  productSegment: "MEN" | "WOMEN";
};

export async function getAdminInventoryPage({
  page,
  query,
  segment,
  status,
}: {
  page: number;
  query: string;
  segment: InventorySegmentFilter;
  status: InventoryStatusFilter;
}): Promise<InventoryPage> {
  const conditions: Prisma.Sql[] = [Prisma.sql`pv."isActive" = TRUE`];
  const trimmedQuery = query.trim();
  if (trimmedQuery) {
    const search = `%${trimmedQuery}%`;
    conditions.push(Prisma.sql`(p."name" ILIKE ${search} OR pv."sku" ILIKE ${search})`);
  }
  if (segment !== "ALL") {
    conditions.push(Prisma.sql`p."segment" = CAST(${segment} AS "Segment")`);
  }
  if (status === "OUT") {
    conditions.push(Prisma.sql`pv."stockOnHand" <= pv."stockReserved"`);
  } else if (status === "LOW") {
    conditions.push(Prisma.sql`
      pv."stockOnHand" > pv."stockReserved"
      AND pv."stockOnHand" <= pv."stockReserved" + pv."stockMin"
    `);
  } else if (status === "AVAILABLE") {
    conditions.push(Prisma.sql`pv."stockOnHand" > pv."stockReserved" + pv."stockMin"`);
  }
  const where = Prisma.join(conditions, " AND ");
  const counts = await prisma.$queryRaw<{ total: bigint }[]>(Prisma.sql`
    SELECT COUNT(*) AS total
    FROM "ProductVariant" pv
    INNER JOIN "Product" p ON p."id" = pv."productId"
    WHERE ${where}
  `);
  const totalCount = Number(counts[0]?.total ?? 0);
  const pageCount = Math.max(1, Math.ceil(totalCount / INVENTORY_PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const variants = await prisma.$queryRaw<InventoryQueryRow[]>(Prisma.sql`
    SELECT
      pv."id",
      pv."sku",
      pv."color",
      pv."size",
      pv."stockOnHand",
      pv."stockReserved",
      pv."stockMin",
      p."name" AS "productName",
      p."segment" AS "productSegment"
    FROM "ProductVariant" pv
    INNER JOIN "Product" p ON p."id" = pv."productId"
    WHERE ${where}
    ORDER BY p."name" ASC, pv."sku" ASC
    LIMIT ${INVENTORY_PAGE_SIZE}
    OFFSET ${(currentPage - 1) * INVENTORY_PAGE_SIZE}
  `);

  return {
    variants: variants.map(({ productName, productSegment, ...variant }) => ({
      ...variant,
      product: { name: productName, segment: productSegment },
    })),
    total: totalCount,
    page: currentPage,
    pageCount,
  };
}
