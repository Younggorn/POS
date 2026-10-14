-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "product_categories" (
    "id" VARCHAR(4) NOT NULL,
    "name" VARCHAR(60) NOT NULL,

    CONSTRAINT "product_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "code" VARCHAR(25) NOT NULL,
    "categoryId" VARCHAR(4),
    "lotId" VARCHAR(5),
    "name" VARCHAR(80) NOT NULL,
    "alternateName" VARCHAR(100),
    "quantity" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "unit" VARCHAR(12),
    "cost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "price" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "price1" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "price2" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "price3" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "price4" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "minStock" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "maxStock" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "trackSerial" BOOLEAN NOT NULL DEFAULT false,
    "promotionEnabled" BOOLEAN NOT NULL DEFAULT false,
    "inactive" BOOLEAN NOT NULL DEFAULT false,
    "addedBy" VARCHAR(30),
    "legacyDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "code" VARCHAR(5) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "contact" VARCHAR(50),
    "address1" VARCHAR(70),
    "address2" VARCHAR(70),
    "phone" VARCHAR(40),
    "fax" VARCHAR(40),
    "website" VARCHAR(50),
    "email" VARCHAR(50),
    "creditDays" INTEGER NOT NULL DEFAULT 0,
    "taxId" VARCHAR(25),
    "detail" VARCHAR(200),

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "customers" (
    "code" VARCHAR(6) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "address1" VARCHAR(70),
    "address2" VARCHAR(70),
    "phone" VARCHAR(40),
    "fax" VARCHAR(40),
    "email" VARCHAR(50),
    "contact" VARCHAR(40),
    "priceLevel" INTEGER NOT NULL DEFAULT 0,
    "creditDays" INTEGER NOT NULL DEFAULT 0,
    "taxId" VARCHAR(25),
    "detail" VARCHAR(200),

    CONSTRAINT "customers_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "sales" (
    "id" VARCHAR(13) NOT NULL,
    "invoiceNo" VARCHAR(13),
    "taxInvoiceNo" VARCHAR(13),
    "customerCode" VARCHAR(6),
    "paymentType" VARCHAR(1),
    "dueDate" TIMESTAMP(3),
    "discountRate" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "discountType" VARCHAR(8),
    "discountAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "vatType" VARCHAR(1),
    "vatAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "soldBy" VARCHAR(30),
    "soldAt" TIMESTAMP(3),
    "status" VARCHAR(1),
    "cancelled" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_items" (
    "id" BIGSERIAL NOT NULL,
    "saleId" VARCHAR(13) NOT NULL,
    "productCode" VARCHAR(25),
    "serialNumber" VARCHAR(50),
    "lotId" VARCHAR(5),
    "quantity" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "unit" VARCHAR(12),
    "unitPrice" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "unitDiscount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "unitCost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "promotionStatus" VARCHAR(1),

    CONSTRAINT "sale_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_receipts" (
    "id" VARCHAR(13) NOT NULL,
    "supplierCode" VARCHAR(5),
    "stockDate" TIMESTAMP(3),
    "deliveryNo" VARCHAR(20),
    "taxInvoiceNo" VARCHAR(20),
    "deliveryDate" TIMESTAMP(3),
    "vatType" VARCHAR(1),
    "vatAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "receivedBy" VARCHAR(30),
    "receivedAt" TIMESTAMP(3),
    "status" VARCHAR(1),

    CONSTRAINT "purchase_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_receipt_items" (
    "id" BIGSERIAL NOT NULL,
    "receiptId" VARCHAR(13) NOT NULL,
    "productCode" VARCHAR(25),
    "lotId" VARCHAR(5),
    "quantity" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "unit" VARCHAR(12),
    "unitCost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(18,2) NOT NULL DEFAULT 0,

    CONSTRAINT "purchase_receipt_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" BIGSERIAL NOT NULL,
    "productCode" VARCHAR(25),
    "lotId" VARCHAR(5),
    "productName" VARCHAR(80),
    "categoryName" VARCHAR(60),
    "quantityIn" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "unitCost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "balance" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "actor" VARCHAR(30),
    "occurredAt" TIMESTAMP(3),
    "status" VARCHAR(1),

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "name" VARCHAR(80) NOT NULL,
    "owner" VARCHAR(50),
    "headOrBranch" VARCHAR(1),
    "branchNo" VARCHAR(3),
    "taxId" VARCHAR(30),
    "address1" VARCHAR(70),
    "address2" VARCHAR(70),
    "phone" VARCHAR(40),
    "email" VARCHAR(50),
    "vatRate" DECIMAL(5,2) NOT NULL DEFAULT 7,
    "promptPay" VARCHAR(20),

    CONSTRAINT "shop_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legacy_import_runs" (
    "id" SERIAL NOT NULL,
    "sourcePath" TEXT NOT NULL,
    "sourceSize" BIGINT NOT NULL,
    "sourceMtime" TIMESTAMP(3) NOT NULL,
    "tableCounts" JSONB NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "status" VARCHAR(20) NOT NULL DEFAULT 'running',
    "error" TEXT,

    CONSTRAINT "legacy_import_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "products_categoryId_idx" ON "products"("categoryId");

-- CreateIndex
CREATE INDEX "products_name_idx" ON "products"("name");

-- CreateIndex
CREATE INDEX "suppliers_name_idx" ON "suppliers"("name");

-- CreateIndex
CREATE INDEX "customers_name_idx" ON "customers"("name");

-- CreateIndex
CREATE INDEX "sales_soldAt_idx" ON "sales"("soldAt");

-- CreateIndex
CREATE INDEX "sales_customerCode_idx" ON "sales"("customerCode");

-- CreateIndex
CREATE INDEX "sale_items_saleId_idx" ON "sale_items"("saleId");

-- CreateIndex
CREATE INDEX "sale_items_productCode_idx" ON "sale_items"("productCode");

-- CreateIndex
CREATE INDEX "purchase_receipts_supplierCode_idx" ON "purchase_receipts"("supplierCode");

-- CreateIndex
CREATE INDEX "purchase_receipts_stockDate_idx" ON "purchase_receipts"("stockDate");

-- CreateIndex
CREATE INDEX "purchase_receipt_items_receiptId_idx" ON "purchase_receipt_items"("receiptId");

-- CreateIndex
CREATE INDEX "purchase_receipt_items_productCode_idx" ON "purchase_receipt_items"("productCode");

-- CreateIndex
CREATE INDEX "stock_movements_productCode_occurredAt_idx" ON "stock_movements"("productCode", "occurredAt");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "product_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_customerCode_fkey" FOREIGN KEY ("customerCode") REFERENCES "customers"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_supplierCode_fkey" FOREIGN KEY ("supplierCode") REFERENCES "suppliers"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipt_items" ADD CONSTRAINT "purchase_receipt_items_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "purchase_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
