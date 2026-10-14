CREATE SEQUENCE "product_sku_seq" START WITH 1 INCREMENT BY 1;

CREATE TABLE "product_sku_mappings" (
  "oldCode" VARCHAR(25) PRIMARY KEY,
  "newCode" VARCHAR(25) NOT NULL UNIQUE,
  "tempCode" VARCHAR(25) NOT NULL UNIQUE,
  "migratedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO "product_sku_mappings" ("oldCode","newCode","tempCode")
SELECT "code",
  'P' || LPAD(ROW_NUMBER() OVER (ORDER BY "createdAt","code")::text,6,'0'),
  '~' || SUBSTRING(MD5("code" || ROW_NUMBER() OVER (ORDER BY "createdAt","code")::text),1,20)
FROM "products";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "product_sku_mappings" m
    JOIN "products" p ON p."code"=m."tempCode"
  ) THEN
    RAISE EXCEPTION 'Temporary SKU collision detected';
  END IF;
END $$;

ALTER TABLE "product_units" DROP CONSTRAINT "product_units_productCode_fkey";
ALTER TABLE "product_units" ADD CONSTRAINT "product_units_productCode_fkey"
  FOREIGN KEY ("productCode") REFERENCES "products"("code") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory_lots" DROP CONSTRAINT "inventory_lots_productCode_fkey";
ALTER TABLE "inventory_lots" ADD CONSTRAINT "inventory_lots_productCode_fkey"
  FOREIGN KEY ("productCode") REFERENCES "products"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

UPDATE "products" p SET "code"=m."tempCode"
FROM "product_sku_mappings" m WHERE p."code"=m."oldCode";

UPDATE "products" p SET "code"=m."newCode"
FROM "product_sku_mappings" m WHERE p."code"=m."tempCode";

UPDATE "sale_items" x SET "productCode"=m."newCode"
FROM "product_sku_mappings" m WHERE x."productCode"=m."oldCode";
UPDATE "purchase_receipt_items" x SET "productCode"=m."newCode"
FROM "product_sku_mappings" m WHERE x."productCode"=m."oldCode";
UPDATE "sale_return_items" x SET "productCode"=m."newCode"
FROM "product_sku_mappings" m WHERE x."productCode"=m."oldCode";
UPDATE "stock_movements" x SET "productCode"=m."newCode"
FROM "product_sku_mappings" m WHERE x."productCode"=m."oldCode";

SELECT SETVAL('product_sku_seq', GREATEST((SELECT COUNT(*) FROM "products"),1), true);

ALTER TABLE "product_sku_mappings" DROP COLUMN "tempCode";
