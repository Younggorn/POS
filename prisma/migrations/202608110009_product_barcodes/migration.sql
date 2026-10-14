CREATE TABLE "product_barcodes" (
  "id" BIGSERIAL PRIMARY KEY,
  "productUnitId" BIGINT NOT NULL REFERENCES "product_units"("id") ON DELETE CASCADE,
  "barcode" VARCHAR(50) NOT NULL UNIQUE,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "note" VARCHAR(100),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "product_barcodes_productUnitId_active_idx"
  ON "product_barcodes"("productUnitId", "active");
CREATE UNIQUE INDEX "product_barcodes_one_primary_per_unit"
  ON "product_barcodes"("productUnitId") WHERE "isPrimary"=true;

INSERT INTO "product_barcodes" ("productUnitId","barcode","isPrimary","active","updatedAt")
SELECT "id","barcode",true,"active",NOW() FROM "product_units";
