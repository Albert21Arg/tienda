export const MAX_MARKUP_PERCENT = 1000;
export const MAX_PRODUCT_PRICE = 2_147_483_647;

export function calculateSalePrice(costPrice: number, markupPercent: number) {
  return Math.round(costPrice * (100 + markupPercent) / 100);
}
