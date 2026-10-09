export const INVENTORY_PAGE_SIZE = 10;

export type InventorySegment = "MEN" | "WOMEN";
export type InventorySegmentFilter = "ALL" | InventorySegment;
export type InventoryStatusFilter = "ALL" | "LOW" | "OUT" | "AVAILABLE";

export type InventoryVariantRow = {
  id: string;
  sku: string;
  color: string | null;
  size: string | null;
  stockOnHand: number;
  stockReserved: number;
  stockMin: number;
  product: { name: string; segment: InventorySegment };
};

export type InventoryPage = {
  variants: InventoryVariantRow[];
  total: number;
  page: number;
  pageCount: number;
};
