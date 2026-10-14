ALTER TABLE "sales"
  ADD COLUMN "cancelReason" VARCHAR(200),
  ADD COLUMN "cancelledAt" TIMESTAMP(3),
  ADD COLUMN "cancelledBy" VARCHAR(30);

CREATE INDEX "sales_cancelled_soldAt_idx" ON "sales"("cancelled", "soldAt");
