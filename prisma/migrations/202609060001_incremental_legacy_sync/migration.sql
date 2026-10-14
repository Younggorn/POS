CREATE TABLE "legacy_sync_product_states" (
  "oldCode" VARCHAR(25) PRIMARY KEY,
  "productCode" VARCHAR(25) NOT NULL,
  "sourceQuantity" DECIMAL(18,3) NOT NULL,
  "sourceUpdatedAt" TIMESTAMP(3),
  "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "legacy_sync_product_states_productCode_idx" ON "legacy_sync_product_states"("productCode");

CREATE TABLE "legacy_sync_entities" (
  "entityType" VARCHAR(24) NOT NULL,
  "sourceKey" VARCHAR(80) NOT NULL,
  "sourceHash" CHAR(64) NOT NULL,
  "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("entityType", "sourceKey")
);

CREATE TABLE "legacy_sync_cursors" (
  "sourcePath" TEXT PRIMARY KEY,
  "sourceSize" BIGINT NOT NULL,
  "sourceMtime" TIMESTAMP(3) NOT NULL,
  "stockLogRows" INTEGER NOT NULL DEFAULT 0,
  "lastSuccessAt" TIMESTAMP(3),
  "lastStatus" VARCHAR(20) NOT NULL DEFAULT 'pending',
  "lastMessage" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
