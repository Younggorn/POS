CREATE TABLE "sale_payments" (
  "id" BIGSERIAL NOT NULL,
  "saleId" VARCHAR(13) NOT NULL,
  "method" VARCHAR(12) NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "receivedAmount" DECIMAL(18,2),
  "changeAmount" DECIMAL(18,2),
  "reference" VARCHAR(50),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sale_payments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sale_payments_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "sale_payments_saleId_method_key" ON "sale_payments"("saleId", "method");
CREATE INDEX "sale_payments_method_createdAt_idx" ON "sale_payments"("method", "createdAt");

INSERT INTO "sale_payments" ("saleId", "method", "amount", "receivedAmount", "changeAmount", "createdAt")
SELECT "id",
  CASE WHEN "paymentType" IN ('C','0') THEN 'cash'
       WHEN "paymentType" IN ('T','2') THEN 'transfer'
       WHEN "paymentType" = 'D' THEN 'card'
       ELSE 'unknown' END,
  "total",
  CASE WHEN "paymentType" IN ('C','0') THEN "total" ELSE NULL END,
  CASE WHEN "paymentType" IN ('C','0') THEN 0 ELSE NULL END,
  COALESCE("soldAt", CURRENT_TIMESTAMP)
FROM "sales";

ALTER TABLE "debt_payments"
  ADD COLUMN "batchId" VARCHAR(36),
  ADD COLUMN "receivedAmount" DECIMAL(18,2),
  ADD COLUMN "changeAmount" DECIMAL(18,2);

UPDATE "debt_payments"
SET "batchId" = 'legacy-' || "id"::text,
    "receivedAmount" = CASE WHEN "method" = 'cash' THEN "amount" ELSE NULL END,
    "changeAmount" = CASE WHEN "method" = 'cash' THEN 0 ELSE NULL END;

ALTER TABLE "debt_payments" ALTER COLUMN "batchId" SET NOT NULL;
CREATE INDEX "debt_payments_batchId_idx" ON "debt_payments"("batchId");
