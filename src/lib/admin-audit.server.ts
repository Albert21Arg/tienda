import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  AUDIT_PAGE_SIZE,
  type AuditCategory,
  type AuditEvent,
  type AuditPage,
} from "@/lib/admin-audit.types";

function categoryCondition(category: AuditCategory, alias: "al" | "im") {
  if (alias === "im") {
    return category === "ALL" || category === "INVENTORY"
      ? Prisma.sql`TRUE`
      : Prisma.sql`FALSE`;
  }
  switch (category) {
    case "INVENTORY": return Prisma.sql`al."entity" = 'ProductVariant'`;
    case "PRODUCT": return Prisma.sql`al."entity" IN ('Product', 'Category')`;
    case "SALES": return Prisma.sql`al."entity" = 'Order'`;
    case "USERS": return Prisma.sql`al."entity" = 'User'`;
    case "SETTINGS": return Prisma.sql`al."entity" = 'PlatformSetting'`;
    default: return Prisma.sql`TRUE`;
  }
}

export async function getAdminAuditPage({
  page,
  query,
  category,
}: {
  page: number;
  query: string;
  category: AuditCategory;
}): Promise<AuditPage> {
  const trimmedQuery = query.trim();
  const pattern = trimmedQuery ? `%${trimmedQuery}%` : null;
  const auditSearch = pattern
    ? Prisma.sql`AND LOWER(COALESCE(al."action", '') || ' ' || COALESCE(al."entity", '') || ' ' || COALESCE(al."entityId", '') || ' ' || COALESCE(actor."name", '') || ' ' || COALESCE(actor."email", '') || ' ' || COALESCE(al."reason", '') || ' ' || COALESCE(CAST(al."previousValue" AS TEXT), '') || ' ' || COALESCE(CAST(al."newValue" AS TEXT), '')) LIKE LOWER(${pattern})`
    : Prisma.empty;
  const movementSearch = pattern
    ? Prisma.sql`AND LOWER(COALESCE(movement."type", '') || ' ' || COALESCE(variant."sku", '') || ' ' || COALESCE(product."name", '') || ' ' || COALESCE(actor."name", '') || ' ' || COALESCE(actor."email", '') || ' ' || COALESCE(movement."reason", '')) LIKE LOWER(${pattern})`
    : Prisma.empty;
  const auditBranch = Prisma.sql`
    SELECT
      al."id" AS "id",
      al."createdAt" AS "createdAt",
      COALESCE(actor."name", 'Sistema') AS "actorName",
      actor."email" AS "actorEmail",
      al."action" AS "action",
      al."entity" AS "entity",
      al."entityId" AS "entityId",
      CASE
        WHEN al."entity" = 'Product' THEN COALESCE(
          audit_product."name",
          json_extract(al."previousValue", '$.name'),
          'Producto eliminado'
        )
        WHEN al."entity" = 'ProductVariant' THEN variant_product."name"
        WHEN al."entity" = 'Order' THEN 'Pedido'
        WHEN al."entity" = 'User' THEN COALESCE(audit_user."name", 'Usuario')
        WHEN al."entity" = 'Category' THEN audit_category."name"
        WHEN al."entity" = 'PlatformSetting' THEN 'Configuración de la tienda'
        ELSE al."entity"
      END AS "subjectName",
      CASE
        WHEN al."entity" = 'Product' THEN audit_product."slug"
        WHEN al."entity" = 'ProductVariant' THEN audit_variant."sku"
        WHEN al."entity" = 'Order' THEN audit_order."orderNumber"
        WHEN al."entity" = 'User' THEN audit_user."email"
        WHEN al."entity" = 'Category' THEN audit_category."name"
        ELSE NULL
      END AS "reference",
      CAST(al."previousValue" AS TEXT) AS "previousValue",
      CAST(al."newValue" AS TEXT) AS "newValue",
      al."reason" AS "reason"
    FROM "AuditLog" al
    LEFT JOIN "User" actor ON actor."id" = al."actorId"
    LEFT JOIN "Product" audit_product ON al."entity" = 'Product' AND audit_product."id" = al."entityId"
    LEFT JOIN "ProductVariant" audit_variant ON al."entity" = 'ProductVariant' AND audit_variant."id" = al."entityId"
    LEFT JOIN "Product" variant_product ON variant_product."id" = audit_variant."productId"
    LEFT JOIN "Order" audit_order ON al."entity" = 'Order' AND audit_order."id" = al."entityId"
    LEFT JOIN "User" audit_user ON al."entity" = 'User' AND audit_user."id" = al."entityId"
    LEFT JOIN "Category" audit_category ON al."entity" = 'Category' AND audit_category."id" = al."entityId"
    WHERE ${categoryCondition(category, "al")} ${auditSearch}
  `;
  const movementBranch = Prisma.sql`
    SELECT
      ('movement-' || movement."id") AS "id",
      movement."createdAt" AS "createdAt",
      COALESCE(actor."name", 'Sistema') AS "actorName",
      actor."email" AS "actorEmail",
      movement."type" AS "action",
      'Inventario' AS "entity",
      variant."sku" AS "entityId",
      product."name" AS "subjectName",
      variant."sku" AS "reference",
      json_object('stock', movement."previousStock") AS "previousValue",
      json_object(
        'stock', movement."newStock",
        'quantity', movement."quantity",
        'product', product."name",
        'sku', variant."sku"
      ) AS "newValue",
      movement."reason" AS "reason"
    FROM "InventoryMovement" movement
    INNER JOIN "ProductVariant" variant ON variant."id" = movement."variantId"
    INNER JOIN "Product" product ON product."id" = variant."productId"
    LEFT JOIN "User" actor ON actor."id" = movement."actorId"
    WHERE ${categoryCondition(category, "im")} ${movementSearch}
  `;
  const combined = Prisma.sql`(${auditBranch} UNION ALL ${movementBranch})`;
  const counts = await prisma.$queryRaw<{ total: bigint }[]>(Prisma.sql`
    SELECT COUNT(*) AS "total" FROM ${combined} AS events
  `);
  const total = Number(counts[0]?.total ?? 0);
  const pageCount = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const events = await prisma.$queryRaw<AuditEvent[]>(Prisma.sql`
    SELECT * FROM ${combined} AS events
    ORDER BY "createdAt" DESC, "id" DESC
    LIMIT ${AUDIT_PAGE_SIZE}
    OFFSET ${(currentPage - 1) * AUDIT_PAGE_SIZE}
  `);
  return { events, total, page: currentPage, pageCount };
}
