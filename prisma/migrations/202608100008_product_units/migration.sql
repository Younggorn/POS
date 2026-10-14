CREATE TABLE "product_units" (
  "id" BIGSERIAL PRIMARY KEY,
  "productCode" VARCHAR(25) NOT NULL REFERENCES "products"("code") ON DELETE CASCADE,
  "name" VARCHAR(20) NOT NULL,
  "barcode" VARCHAR(50) NOT NULL UNIQUE,
  "conversionRate" DECIMAL(18,3) NOT NULL CHECK ("conversionRate">0),
  "salePrice" DECIMAL(18,2) NOT NULL CHECK ("salePrice">=0),
  "purchaseCost" DECIMAL(18,2) CHECK ("purchaseCost">=0),
  "isBase" BOOLEAN NOT NULL DEFAULT false,
  "canSell" BOOLEAN NOT NULL DEFAULT true,
  "canPurchase" BOOLEAN NOT NULL DEFAULT true,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "product_units_productCode_name_key" UNIQUE ("productCode","name")
);
CREATE INDEX "product_units_productCode_active_idx" ON "product_units"("productCode","active");
CREATE UNIQUE INDEX "product_units_one_base_per_product" ON "product_units"("productCode") WHERE "isBase"=true;

INSERT INTO "product_units" ("productCode","name","barcode","conversionRate","salePrice","purchaseCost","isBase","canSell","canPurchase","active","updatedAt")
SELECT "code",COALESCE(NULLIF("unit",''),'ชิ้น'),"code",1,"price","cost",true,true,true,true,NOW() FROM "products";

ALTER TABLE "sale_items"
  ADD COLUMN "productUnitId" BIGINT REFERENCES "product_units"("id") ON DELETE SET NULL,
  ADD COLUMN "conversionRate" DECIMAL(18,3) NOT NULL DEFAULT 1,
  ADD COLUMN "baseQuantity" DECIMAL(18,3) NOT NULL DEFAULT 0,
  ADD COLUMN "scannedBarcode" VARCHAR(50);
UPDATE "sale_items" SET "baseQuantity"="quantity";
CREATE INDEX "sale_items_productUnitId_idx" ON "sale_items"("productUnitId");

ALTER TABLE "purchase_receipt_items"
  ADD COLUMN "productUnitId" BIGINT REFERENCES "product_units"("id") ON DELETE SET NULL,
  ADD COLUMN "conversionRate" DECIMAL(18,3) NOT NULL DEFAULT 1,
  ADD COLUMN "baseQuantity" DECIMAL(18,3) NOT NULL DEFAULT 0;
UPDATE "purchase_receipt_items" SET "baseQuantity"="quantity";
CREATE INDEX "purchase_receipt_items_productUnitId_idx" ON "purchase_receipt_items"("productUnitId");
