ALTER TABLE "products"
  ADD COLUMN "trackExpiry" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "shelfLifeDays" INTEGER;

CREATE TABLE "inventory_lots" (
  "id" BIGSERIAL PRIMARY KEY,
  "productCode" VARCHAR(25) NOT NULL REFERENCES "products"("code") ON DELETE RESTRICT,
  "purchaseItemId" BIGINT UNIQUE REFERENCES "purchase_receipt_items"("id") ON DELETE SET NULL,
  "lotNo" VARCHAR(50) NOT NULL,
  "receivedDate" TIMESTAMP(3) NOT NULL,
  "manufacturedDate" TIMESTAMP(3),
  "expireDate" TIMESTAMP(3) NOT NULL,
  "initialQuantity" DECIMAL(18,3) NOT NULL CHECK ("initialQuantity" >= 0),
  "quantity" DECIMAL(18,3) NOT NULL CHECK ("quantity" >= 0),
  "status" VARCHAR(12) NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inventory_lots_dates_check" CHECK ("manufacturedDate" IS NULL OR "expireDate" >= "manufacturedDate")
);

CREATE INDEX "inventory_lots_productCode_expireDate_quantity_idx" ON "inventory_lots"("productCode", "expireDate", "quantity");
CREATE INDEX "inventory_lots_expireDate_status_idx" ON "inventory_lots"("expireDate", "status");

CREATE TABLE "sale_lot_allocations" (
  "id" BIGSERIAL PRIMARY KEY,
  "saleItemId" BIGINT NOT NULL REFERENCES "sale_items"("id") ON DELETE CASCADE,
  "lotId" BIGINT NOT NULL REFERENCES "inventory_lots"("id") ON DELETE RESTRICT,
  "quantity" DECIMAL(18,3) NOT NULL CHECK ("quantity" > 0)
);
CREATE INDEX "sale_lot_allocations_saleItemId_idx" ON "sale_lot_allocations"("saleItemId");
CREATE INDEX "sale_lot_allocations_lotId_idx" ON "sale_lot_allocations"("lotId");

CREATE TABLE "sale_return_lot_allocations" (
  "id" BIGSERIAL PRIMARY KEY,
  "returnItemId" BIGINT NOT NULL REFERENCES "sale_return_items"("id") ON DELETE CASCADE,
  "lotId" BIGINT NOT NULL REFERENCES "inventory_lots"("id") ON DELETE RESTRICT,
  "quantity" DECIMAL(18,3) NOT NULL CHECK ("quantity" > 0)
);
CREATE INDEX "sale_return_lot_allocations_returnItemId_idx" ON "sale_return_lot_allocations"("returnItemId");
CREATE INDEX "sale_return_lot_allocations_lotId_idx" ON "sale_return_lot_allocations"("lotId");

CREATE TABLE "inventory_lot_actions" (
  "id" BIGSERIAL PRIMARY KEY,
  "lotId" BIGINT NOT NULL REFERENCES "inventory_lots"("id") ON DELETE CASCADE,
  "type" VARCHAR(16) NOT NULL,
  "quantity" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "reason" VARCHAR(200),
  "actor" VARCHAR(30),
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "inventory_lot_actions_lotId_occurredAt_idx" ON "inventory_lot_actions"("lotId", "occurredAt");
