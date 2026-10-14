CREATE TABLE "inventory_lot_promotions" (
    "id" BIGSERIAL NOT NULL,
    "lotId" BIGINT NOT NULL,
    "discountType" VARCHAR(8) NOT NULL,
    "discountValue" DECIMAL(18,2) NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "reason" VARCHAR(200),
    "createdBy" VARCHAR(30),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "inventory_lot_promotions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "inventory_lot_promotions_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "inventory_lots"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "inventory_lot_promotions_type_check" CHECK ("discountType" IN ('percent','price')),
    CONSTRAINT "inventory_lot_promotions_value_check" CHECK ("discountValue" >= 0)
);
CREATE INDEX "inventory_lot_promotions_lotId_active_idx" ON "inventory_lot_promotions"("lotId", "active");
CREATE INDEX "inventory_lot_promotions_window_idx" ON "inventory_lot_promotions"("startsAt", "endsAt");
