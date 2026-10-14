ALTER TABLE "sales" ADD COLUMN "shiftId" INTEGER;
ALTER TABLE "purchase_receipts" ADD COLUMN "cancelled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "cancelReason" VARCHAR(200);

CREATE TABLE "receivables" (
  "id" BIGSERIAL PRIMARY KEY,
  "customerCode" VARCHAR(6) NOT NULL,
  "saleId" VARCHAR(13),
  "documentNo" VARCHAR(20) NOT NULL UNIQUE,
  "originalAmount" DECIMAL(18,2) NOT NULL,
  "paidAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "dueDate" TIMESTAMP(3) NOT NULL,
  "status" VARCHAR(10) NOT NULL DEFAULT 'OPEN',
  "note" VARCHAR(200),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "receivables_customerCode_fkey" FOREIGN KEY ("customerCode") REFERENCES "customers"("code") ON DELETE RESTRICT,
  CONSTRAINT "receivables_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE SET NULL
);
CREATE INDEX "receivables_customerCode_status_idx" ON "receivables"("customerCode", "status");
CREATE INDEX "receivables_dueDate_idx" ON "receivables"("dueDate");

CREATE TABLE "debt_payments" (
  "id" BIGSERIAL PRIMARY KEY,
  "receivableId" BIGINT NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "method" VARCHAR(12) NOT NULL,
  "reference" VARCHAR(50),
  "receivedBy" VARCHAR(30),
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "note" VARCHAR(200),
  CONSTRAINT "debt_payments_receivableId_fkey" FOREIGN KEY ("receivableId") REFERENCES "receivables"("id") ON DELETE CASCADE
);
CREATE INDEX "debt_payments_receivableId_receivedAt_idx" ON "debt_payments"("receivableId", "receivedAt");

CREATE TABLE "sale_returns" (
  "id" VARCHAR(15) PRIMARY KEY,
  "saleId" VARCHAR(13) NOT NULL,
  "total" DECIMAL(18,2) NOT NULL,
  "reason" VARCHAR(200) NOT NULL,
  "refundMethod" VARCHAR(12),
  "returnedBy" VARCHAR(30),
  "returnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sale_returns_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE RESTRICT
);
CREATE INDEX "sale_returns_saleId_returnedAt_idx" ON "sale_returns"("saleId", "returnedAt");

CREATE TABLE "sale_return_items" (
  "id" BIGSERIAL PRIMARY KEY,
  "returnId" VARCHAR(15) NOT NULL,
  "saleItemId" BIGINT NOT NULL,
  "productCode" VARCHAR(25),
  "quantity" DECIMAL(18,3) NOT NULL,
  "unitPrice" DECIMAL(18,2) NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  CONSTRAINT "sale_return_items_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "sale_returns"("id") ON DELETE CASCADE,
  CONSTRAINT "sale_return_items_saleItemId_fkey" FOREIGN KEY ("saleItemId") REFERENCES "sale_items"("id") ON DELETE RESTRICT
);
CREATE INDEX "sale_return_items_saleItemId_idx" ON "sale_return_items"("saleItemId");

CREATE TABLE "cash_shifts" (
  "id" SERIAL PRIMARY KEY,
  "openedBy" VARCHAR(30) NOT NULL,
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "openingCash" DECIMAL(18,2) NOT NULL,
  "closedBy" VARCHAR(30),
  "closedAt" TIMESTAMP(3),
  "countedCash" DECIMAL(18,2),
  "expectedCash" DECIMAL(18,2),
  "difference" DECIMAL(18,2),
  "status" VARCHAR(10) NOT NULL DEFAULT 'OPEN',
  "note" VARCHAR(200)
);
CREATE INDEX "cash_shifts_status_openedAt_idx" ON "cash_shifts"("status", "openedAt");

CREATE TABLE "cash_movements" (
  "id" BIGSERIAL PRIMARY KEY,
  "shiftId" INTEGER NOT NULL,
  "type" VARCHAR(12) NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "reason" VARCHAR(200) NOT NULL,
  "actor" VARCHAR(30),
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cash_movements_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "cash_shifts"("id") ON DELETE CASCADE
);
CREATE INDEX "cash_movements_shiftId_occurredAt_idx" ON "cash_movements"("shiftId", "occurredAt");

CREATE TABLE "devices" (
  "id" SERIAL PRIMARY KEY,
  "name" VARCHAR(60) NOT NULL,
  "type" VARCHAR(20) NOT NULL,
  "connection" VARCHAR(100),
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "note" VARCHAR(200),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "sales" ADD CONSTRAINT "sales_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "cash_shifts"("id") ON DELETE SET NULL;
CREATE INDEX "sales_shiftId_idx" ON "sales"("shiftId");

CREATE SEQUENCE IF NOT EXISTS purchase_number_seq START 1;
CREATE SEQUENCE IF NOT EXISTS return_number_seq START 1;
