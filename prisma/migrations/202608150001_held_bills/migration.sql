CREATE TABLE "held_bills" (
    "id" SERIAL NOT NULL,
    "label" VARCHAR(80) NOT NULL,
    "itemCount" INTEGER NOT NULL,
    "total" DECIMAL(18,2) NOT NULL,
    "items" JSONB NOT NULL,
    "heldBy" VARCHAR(100),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "held_bills_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "held_bills_createdAt_idx" ON "held_bills"("createdAt");
