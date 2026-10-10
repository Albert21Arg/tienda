ALTER TABLE "Product" ADD COLUMN "costPrice" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Product" ADD COLUMN "markupPercent" INTEGER NOT NULL DEFAULT 0;

UPDATE "Product" SET "costPrice" = "basePrice";
