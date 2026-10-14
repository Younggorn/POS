import { createHash } from "node:crypto";
import { createReadStream, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "csv-parse";
import { Prisma, PrismaClient } from "@prisma/client";
import { LegacyProgressReporter } from "../lib/legacy-sync-progress";

const prisma = new PrismaClient();
const exportDir = process.env.LEGACY_EXPORT_DIR ?? join(process.cwd(), "legacy-sync", "current");
const baselineDir = process.env.LEGACY_BASELINE_DIR ?? join(process.cwd(), "legacy-export");
type Row = Record<string, string>;
let progress: LegacyProgressReporter | undefined;

const text = (value?: string) => value?.trim() || null;
const num = (value?: string) => Number.isFinite(Number(value)) ? Number(value) : 0;
const int = (value?: string) => Math.trunc(num(value));
const flag = (value?: string) => ["1", "true", "y", "yes"].includes((value ?? "").trim().toLowerCase());
const paymentType = (value?: string) => value?.trim() === "0" ? "C" : value?.trim() === "2" ? "T" : value?.trim() || null;
const paymentMethod = (value?: string) => value?.trim() === "2" ? "transfer" : value?.trim() === "1" ? "card" : "cash";

function date(value?: string, time?: string) {
  if (!value?.trim()) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  if (time?.trim() && /^\d{1,2}:\d{2}/.test(time)) {
    const [hour, minute, second = 0] = time.split(":").map(Number);
    if ([hour, minute, second].every(Number.isFinite)) parsed.setHours(hour, minute, second, 0);
  }
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function collect(directory: string, name: string): Promise<Row[]> {
  const path = join(directory, `${name}.csv`);
  if (!existsSync(path)) return [];
  const rows: Row[] = [];
  const parser = createReadStream(path).pipe(parse({ columns: true, bom: true, skip_empty_lines: true, relax_column_count: true }));
  for await (const row of parser) rows.push(row as Row);
  return rows;
}

function group(rows: Row[], key: string) {
  const result = new Map<string, Row[]>();
  for (const row of rows) {
    const value = row[key]?.trim();
    if (!value) continue;
    const current = result.get(value);
    if (current) current.push(row); else result.set(value, [row]);
  }
  return result;
}

function hash(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
async function chunks<T>(rows: T[], callback: (part: T[]) => Promise<unknown>, size = 500) {
  for (let index = 0; index < rows.length; index += size) await callback(rows.slice(index, index + size));
}

// Bill IDs are independent. Bound database work so the POS can keep serving sales.
async function eachConcurrent<T>(rows: Iterable<T>, callback: (row: T) => Promise<void>) {
  const iterator = rows[Symbol.iterator]();
  let failed = false;
  const results = await Promise.allSettled(Array.from({ length: 4 }, async () => {
    while (!failed) {
      const next = iterator.next();
      if (next.done) return;
      try { await callback(next.value); }
      catch (error) { failed = true; throw error; }
    }
  }));
  const failure = results.find(result => result.status === "rejected");
  if (failure?.status === "rejected") throw failure.reason;
}

async function seedBaseline(sourcePath: string, baselineManifest: any) {
  const existing = await prisma.legacySyncEntity.count();
  const stockLogRows = Number(baselineManifest.tables?.find((table: any) => table.table.toLowerCase() === "stocklog")?.rows ?? 0);
  if (existing > 0) {
    await prisma.legacySyncCursor.upsert({
      where: { sourcePath },
      create: { sourcePath, sourceSize: BigInt(baselineManifest.source?.bytes ?? 0), sourceMtime: new Date(baselineManifest.source?.lastWriteTimeUtc ?? 0), stockLogRows, lastStatus: "baseline" },
      update: {},
    });
    return;
  }
  console.log("Creating incremental baseline from the original legacy export...");
  const [categories, products, suppliers, customers, sales, saleCancellations, receipts] = await Promise.all([
    collect(baselineDir, "producttype"), collect(baselineDir, "product"), collect(baselineDir, "company"),
    collect(baselineDir, "customer"), collect(baselineDir, "salelist"), collect(baselineDir, "salecancel"), collect(baselineDir, "orderrec"),
  ]);
  const cancelledSales = new Set(saleCancellations.map((row) => row.Sid?.trim()).filter(Boolean));
  const entities = [
    ...categories.filter((row) => row.type_id?.trim()).map((row) => ({ entityType: "category", sourceKey: row.type_id.trim(), sourceHash: hash(row) })),
    ...products.filter((row) => row.Pcode?.trim()).map((row) => ({ entityType: "product", sourceKey: row.Pcode.trim(), sourceHash: hash(row) })),
    ...suppliers.filter((row) => row.cid?.trim()).map((row) => ({ entityType: "supplier", sourceKey: row.cid.trim(), sourceHash: hash(row) })),
    ...customers.filter((row) => row.cus_id?.trim()).map((row) => ({ entityType: "customer", sourceKey: row.cus_id.trim(), sourceHash: hash(row) })),
    ...[...group(sales, "Sid")].map(([key, rows]) => ({ entityType: "sale", sourceKey: key, sourceHash: hash({ rows, cancelled: cancelledSales.has(key) }) })),
    ...[...group(receipts, "Rid")].map(([key, rows]) => ({ entityType: "receipt", sourceKey: key, sourceHash: hash(rows) })),
  ];
  await chunks(entities, (part) => prisma.legacySyncEntity.createMany({ data: part, skipDuplicates: true }), 1000);

  const mappings = await prisma.$queryRaw<Array<{ oldCode: string; newCode: string }>>`SELECT "oldCode","newCode" FROM "product_sku_mappings"`;
  const mapping = new Map(mappings.map((item) => [item.oldCode, item.newCode]));
  const states = products.flatMap((row) => {
    const oldCode = row.Pcode?.trim(); const productCode = mapping.get(oldCode);
    return oldCode && productCode ? [{ oldCode, productCode, sourceQuantity: new Prisma.Decimal(num(row.Pqty)), sourceUpdatedAt: date(row.Plastdate ?? row.Pdate, row.Ptime) }] : [];
  });
  await chunks(states, (part) => prisma.legacySyncProductState.createMany({ data: part, skipDuplicates: true }), 1000);
  await prisma.legacySyncCursor.upsert({
    where: { sourcePath },
    create: { sourcePath, sourceSize: BigInt(baselineManifest.source?.bytes ?? 0), sourceMtime: new Date(baselineManifest.source?.lastWriteTimeUtc ?? 0), stockLogRows, lastStatus: "baseline" },
    update: { stockLogRows },
  });
  console.log(`Baseline: ${states.length} products, ${entities.length} entity fingerprints, ${stockLogRows} stock rows`);
}

async function main() {
  const manifestPath = join(exportDir, "manifest.json");
  if (!existsSync(manifestPath)) throw new Error(`Sync manifest not found: ${manifestPath}`);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8").replace(/^\uFEFF/, ""));
  const baselineManifest = JSON.parse(readFileSync(join(baselineDir, "manifest.json"), "utf8").replace(/^\uFEFF/, ""));
  const sourcePath = String(manifest.source.path);
  progress = new LegacyProgressReporter(process.env.LEGACY_PROGRESS_PATH, sourcePath);
  progress.stage("prepare", "ตรวจสอบข้อมูลก่อนนำเข้า", 30, 32);
  await seedBaseline(sourcePath, baselineManifest);

  const lock = await prisma.$queryRaw<Array<{ locked: boolean }>>`SELECT pg_try_advisory_lock(7046029254386353131) locked`;
  if (!lock[0]?.locked) throw new Error("Another legacy sync is already running");
  const run = await prisma.legacyImportRun.create({ data: { sourcePath, sourceSize: BigInt(manifest.source.bytes), sourceMtime: new Date(manifest.source.lastWriteTimeUtc), tableCounts: {}, status: "running" } });
  const stats = { categories: 0, products: 0, stockDelta: 0, suppliers: 0, customers: 0, sales: 0, receipts: 0, stockMovements: 0 };
  try {
    const entityRows = await prisma.legacySyncEntity.findMany();
    const fingerprints = new Map(entityRows.map((item) => [`${item.entityType}:${item.sourceKey}`, item.sourceHash]));
    const saveFingerprint = async (entityType: string, sourceKey: string, sourceHash: string) => {
      await prisma.legacySyncEntity.upsert({ where: { entityType_sourceKey: { entityType, sourceKey } }, create: { entityType, sourceKey, sourceHash }, update: { sourceHash, syncedAt: new Date() } });
      fingerprints.set(`${entityType}:${sourceKey}`, sourceHash);
    };

    const categories = await collect(exportDir, "producttype");
    const categoryDone = progress.stage("categories", "ตรวจสอบและนำเข้าหมวดสินค้า", 32, 34, categories.length);
    for (const row of categories) {
      const id = row.type_id?.trim(); if (!id) { categoryDone(); continue; } const sourceHash = hash(row);
      if (fingerprints.get(`category:${id}`) === sourceHash) { categoryDone(); continue; }
      await prisma.productCategory.upsert({ where: { id }, create: { id, name: text(row.type_name) ?? "ไม่ระบุ" }, update: { name: text(row.type_name) ?? "ไม่ระบุ" } });
      await saveFingerprint("category", id, sourceHash); stats.categories++;
      categoryDone();
    }

    const suppliers = await collect(exportDir, "company");
    const supplierDone = progress.stage("suppliers", "ตรวจสอบและนำเข้าผู้จำหน่าย", 34, 36, suppliers.length);
    for (const row of suppliers) {
      const code = row.cid?.trim(); if (!code) { supplierDone(); continue; } const sourceHash = hash(row);
      if (fingerprints.get(`supplier:${code}`) === sourceHash) { supplierDone(); continue; }
      const data = { name: text(row.cname) ?? code, contact: text(row.ccontact), address1: text(row.caddress1), address2: text(row.caddress2), phone: text(row.ctel), fax: text(row.cfax), website: text(row.cweb), email: text(row.cemail), creditDays: int(row.ccredit_day), taxId: text(row.ctax_id), detail: text(row.cdetail) };
      await prisma.supplier.upsert({ where: { code }, create: { code, ...data }, update: data });
      await saveFingerprint("supplier", code, sourceHash); stats.suppliers++;
      supplierDone();
    }

    const customers = await collect(exportDir, "customer");
    const customerDone = progress.stage("customers", "ตรวจสอบและนำเข้าลูกค้า", 36, 38, customers.length);
    for (const row of customers) {
      const code = row.cus_id?.trim(); if (!code) { customerDone(); continue; } const sourceHash = hash(row);
      if (fingerprints.get(`customer:${code}`) === sourceHash) { customerDone(); continue; }
      const data = { name: text(row.cus_name) ?? code, address1: text(row.cus_address1), address2: text(row.cus_address2), phone: text(row.cus_tel), fax: text(row.cus_fax), email: text(row.cus_email), contact: text(row.cus_contact), priceLevel: int(row.cus_price), creditDays: int(row.cus_credit_day), taxId: text(row.cus_tax_id), detail: text(row.cus_detail) };
      await prisma.customer.upsert({ where: { code }, create: { code, ...data }, update: data });
      await saveFingerprint("customer", code, sourceHash); stats.customers++;
      customerDone();
    }

    const rawMappings = await prisma.$queryRaw<Array<{ oldCode: string; newCode: string }>>`SELECT "oldCode","newCode" FROM "product_sku_mappings"`;
    const mapping = new Map(rawMappings.map((item) => [item.oldCode, item.newCode]));
    const productStates = new Map((await prisma.legacySyncProductState.findMany()).map((item) => [item.oldCode, item]));
    const products = await collect(exportDir, "product");
    const productDone = progress.stage("products", "ตรวจสอบและนำเข้าสินค้า", 38, 58, products.length);
    for (const row of products) {
      const oldCode = row.Pcode?.trim(); if (!oldCode) { productDone(); continue; } const sourceHash = hash(row);
      if (fingerprints.get(`product:${oldCode}`) === sourceHash) { productDone(); continue; }
      let productCode = mapping.get(oldCode);
      const state = productStates.get(oldCode);
      const sourceQuantity = new Prisma.Decimal(num(row.Pqty));
      if (!productCode) {
        const barcodeMatch = await prisma.$queryRaw<Array<{ productCode: string }>>`
          SELECT u."productCode" FROM "product_barcodes" b JOIN "product_units" u ON u.id=b."productUnitId" WHERE b.barcode=${oldCode} LIMIT 1
        `;
        productCode = barcodeMatch[0]?.productCode;
        if (!productCode) {
          const sequence = await prisma.$queryRaw<Array<{ value: bigint }>>`SELECT nextval('product_sku_seq') value`;
          productCode = `P${sequence[0].value.toString().padStart(6, "0")}`;
          await prisma.$transaction(async (tx) => {
            await tx.product.create({ data: { code: productCode!, categoryId: text(row.type_id), lotId: text(row.Plot_id), name: text(row.Pname1) ?? oldCode, alternateName: text(row.Pname2), quantity: sourceQuantity, unit: text(row.Punit), cost: num(row.Pcost), price: num(row.Pprice), price1: num(row.Pprice1), price2: num(row.Pprice2), price3: num(row.Pprice3), price4: num(row.Pprice4), minStock: num(row.Pwarn1), maxStock: num(row.Pwarn2), trackSerial: flag(row.Psn), promotionEnabled: flag(row.Ppromotion), inactive: flag(row.Pnosale), addedBy: text(row.Paddby), legacyDate: date(row.Plastdate ?? row.Pdate, row.Ptime) } });
            const unit = await tx.productUnit.create({ data: { productCode: productCode!, name: text(row.Punit) ?? "ชิ้น", barcode: oldCode, conversionRate: 1, salePrice: num(row.Pprice), purchaseCost: num(row.Pcost), isBase: true } });
            await tx.productBarcode.create({ data: { productUnitId: unit.id, barcode: oldCode, isPrimary: true } });
          });
        } else {
          await prisma.product.update({ where: { code: productCode }, data: { quantity: { increment: sourceQuantity } } });
          stats.stockDelta += Number(sourceQuantity);
        }
        await prisma.$executeRaw`INSERT INTO "product_sku_mappings" ("oldCode","newCode") VALUES (${oldCode},${productCode}) ON CONFLICT ("oldCode") DO UPDATE SET "newCode"=EXCLUDED."newCode"`;
        mapping.set(oldCode, productCode);
      } else {
        const delta = state ? sourceQuantity.minus(state.sourceQuantity) : sourceQuantity;
        const update = { categoryId: text(row.type_id), lotId: text(row.Plot_id), name: text(row.Pname1) ?? oldCode, alternateName: text(row.Pname2), unit: text(row.Punit), cost: num(row.Pcost), price: num(row.Pprice), price1: num(row.Pprice1), price2: num(row.Pprice2), price3: num(row.Pprice3), price4: num(row.Pprice4), minStock: num(row.Pwarn1), maxStock: num(row.Pwarn2), trackSerial: flag(row.Psn), promotionEnabled: flag(row.Ppromotion), inactive: flag(row.Pnosale), legacyDate: date(row.Plastdate ?? row.Pdate, row.Ptime), ...(delta.isZero() ? {} : { quantity: { increment: delta } }) };
        await prisma.product.update({ where: { code: productCode }, data: update });
        stats.stockDelta += Number(delta);
      }
      await prisma.legacySyncProductState.upsert({ where: { oldCode }, create: { oldCode, productCode, sourceQuantity, sourceUpdatedAt: date(row.Plastdate ?? row.Pdate, row.Ptime) }, update: { productCode, sourceQuantity, sourceUpdatedAt: date(row.Plastdate ?? row.Pdate, row.Ptime), syncedAt: new Date() } });
      await saveFingerprint("product", oldCode, sourceHash); stats.products++;
      productDone();
    }

    const customerCodes = new Set((await prisma.customer.findMany({ select: { code: true } })).map((item) => item.code));
    const cancelled = new Set((await collect(exportDir, "salecancel")).map((row) => row.Sid?.trim()).filter(Boolean));
    const saleGroups = group(await collect(exportDir, "salelist"), "Sid");
    const saleDone = progress.stage("sales", "ตรวจสอบและนำเข้าบิลขาย", 58, 83, saleGroups.size, "บิล");
    await eachConcurrent(saleGroups, async ([id, rows]) => {
      const sourceHash = hash({ rows, cancelled: cancelled.has(id) }); if (fingerprints.get(`sale:${id}`) === sourceHash) { saleDone(); return; }
      const first = rows[0]; const subtotal = rows.reduce((sum, row) => sum + num(row.Sqty) * Math.max(0, num(row.Sprice) - num(row.Sdiscount)), 0);
      const header = { invoiceNo: text(first.SIV), taxInvoiceNo: text(first.STI), customerCode: first.cus_id?.trim() !== "000000" && customerCodes.has(first.cus_id?.trim()) ? text(first.cus_id) : null, paymentType: paymentType(first.Scash_credit), dueDate: date(first.Sdue_date), discountRate: num(first.Sdis_rate), discountType: text(first.Sdis_type), discountAmount: num(first.Sdis), vatType: text(first.Svattype), vatAmount: num(first.Svat), subtotal, total: subtotal, soldBy: text(first.Suser), soldAt: date(first.Sdate, first.Stime), status: text(first.Sstatus), cancelled: cancelled.has(id) };
      await prisma.$transaction(async (tx) => {
        const existing = await tx.sale.findUnique({ where: { id }, select: { id: true } });
        if (existing) {
          await tx.sale.update({ where: { id }, data: header });
          const returns = await tx.saleReturnItem.count({ where: { saleItem: { saleId: id } } });
          if (returns === 0) await tx.saleItem.deleteMany({ where: { saleId: id } }); else return;
        } else await tx.sale.create({ data: { id, ...header } });
        await tx.saleItem.createMany({ data: rows.map((row) => ({ saleId: id, productCode: mapping.get(row.Pcode?.trim()) ?? null, serialNumber: text(row.Ssn), lotId: text(row.Plot_id), quantity: num(row.Sqty), unit: text(row.Sunit), unitPrice: num(row.Sprice), unitDiscount: num(row.Sdiscount), unitCost: num(row.Scost), promotionStatus: text(row.Spromo_stat) })) });
        await tx.salePayment.upsert({ where: { saleId_method: { saleId: id, method: paymentMethod(first.Scash_credit) } }, create: { saleId: id, method: paymentMethod(first.Scash_credit), amount: subtotal }, update: { amount: subtotal } });
      });
      await saveFingerprint("sale", id, sourceHash); stats.sales++;
      saleDone();
    });
    await chunks([...cancelled], ids => prisma.sale.updateMany({ where: { id: { in: ids } }, data: { cancelled: true, status: "X" } }));

    const supplierCodes = new Set((await prisma.supplier.findMany({ select: { code: true } })).map((item) => item.code));
    const receiptGroups = group(await collect(exportDir, "orderrec"), "Rid");
    const receiptDone = progress.stage("receipts", "ตรวจสอบและนำเข้าบิลรับเข้า", 83, 92, receiptGroups.size, "บิล");
    await eachConcurrent(receiptGroups, async ([id, rows]) => {
      const sourceHash = hash(rows); if (fingerprints.get(`receipt:${id}`) === sourceHash) { receiptDone(); return; }
      const first = rows[0]; const total = rows.reduce((sum, row) => sum + num(row.Rqty) * Math.max(0, num(row.Rcost) - num(row.Rdiscount)), 0);
      const header = { supplierCode: supplierCodes.has(first.cid?.trim()) ? text(first.cid) : null, stockDate: date(first.Rstock_date), deliveryNo: text(first.Rsend_id), taxInvoiceNo: text(first.RTTI), deliveryDate: date(first.Rsend_date), vatType: text(first.Rvattype), vatAmount: num(first.Rvat), total, receivedBy: text(first.Ruser), receivedAt: date(first.Rdate, first.Rtime), status: text(first.Rstatus) };
      await prisma.$transaction(async (tx) => {
        await tx.purchaseReceipt.upsert({ where: { id }, create: { id, ...header }, update: header });
        await tx.purchaseReceiptItem.deleteMany({ where: { receiptId: id, inventoryLot: null } });
        await tx.purchaseReceiptItem.createMany({ data: rows.map((row) => ({ receiptId: id, productCode: mapping.get(row.Pcode?.trim()) ?? null, lotId: text(row.Plot_id), quantity: num(row.Rqty), unit: text(row.Runit), unitCost: num(row.Rcost), discount: num(row.Rdiscount) })) });
      });
      await saveFingerprint("receipt", id, sourceHash); stats.receipts++;
      receiptDone();
    });

    const cursor = await prisma.legacySyncCursor.findUnique({ where: { sourcePath } });
    const stockRows = await collect(exportDir, "stocklog");
    const offset = Math.min(cursor?.stockLogRows ?? 0, stockRows.length);
    const newMovements = stockRows.slice(offset).map((row) => ({ productCode: mapping.get(row.Pcode?.trim()) ?? null, lotId: text(row.Plot_id), categoryName: text(row.type_name_0), productName: text(row.Pname_0), quantityIn: num(row.Pqty_in), unitCost: num(row.Pcost), balance: num(row.Pqty_balance), actor: text(row.Paddby), occurredAt: date(row.Pdate, row.Ptime), status: text(row.Pstatus), note: "นำเข้าจาก iSoft (ยอดคงเหลือเป็นค่าจากระบบเดิม)" }));
    const stockDone = progress.stage("stock", "นำเข้าประวัติสต็อกที่เพิ่มใหม่", 92, 98, newMovements.length, "แถว");
    await chunks(newMovements, async (part) => { await prisma.stockMovement.createMany({ data: part }); stockDone(part.length); }, 1000); stats.stockMovements = newMovements.length;

    progress.stage("finalize", "บันทึกผลและตรวจสอบความเรียบร้อย", 98, 100);
    const shop = (await collect(exportDir, "datashop"))[0];
    if (shop) await prisma.shopSetting.upsert({ where: { id: 1 }, create: { id: 1, name: text(shop.sh_name) ?? "UP Minimart", owner: text(shop.sh_owner), branchNo: text(shop.sh_branch_no), taxId: text(shop.sh_vat_no), address1: text(shop.sh_address1), address2: text(shop.sh_address2), phone: text(shop.sh_tel), email: text(shop.sh_email), vatRate: num(shop.sh_vat_rate) || 7, promptPay: text(shop.sh_promptpay) }, update: { name: text(shop.sh_name) ?? "UP Minimart", owner: text(shop.sh_owner), branchNo: text(shop.sh_branch_no), taxId: text(shop.sh_vat_no), address1: text(shop.sh_address1), address2: text(shop.sh_address2), phone: text(shop.sh_tel), email: text(shop.sh_email), vatRate: num(shop.sh_vat_rate) || 7, promptPay: text(shop.sh_promptpay) } });

    const summary = `Sync สำเร็จ: สินค้า ${stats.products}, ผลต่างสต็อก ${stats.stockDelta}, บิลขาย ${stats.sales}, รับเข้า ${stats.receipts}`;
    await prisma.legacySyncCursor.upsert({ where: { sourcePath }, create: { sourcePath, sourceSize: BigInt(manifest.source.bytes), sourceMtime: new Date(manifest.source.lastWriteTimeUtc), stockLogRows: stockRows.length, lastSuccessAt: new Date(), lastStatus: "completed", lastMessage: summary }, update: { sourceSize: BigInt(manifest.source.bytes), sourceMtime: new Date(manifest.source.lastWriteTimeUtc), stockLogRows: stockRows.length, lastSuccessAt: new Date(), lastStatus: "completed", lastMessage: summary } });
    await prisma.legacyImportRun.update({ where: { id: run.id }, data: { tableCounts: stats, completedAt: new Date(), status: "completed" } });
    progress.complete();
    console.log(summary, stats);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.legacyImportRun.update({ where: { id: run.id }, data: { completedAt: new Date(), status: "failed", error: message } }).catch(() => undefined);
    await prisma.legacySyncCursor.updateMany({ where: { sourcePath }, data: { lastStatus: "failed", lastMessage: message } }).catch(() => undefined);
    throw error;
  } finally {
    await prisma.$executeRaw`SELECT pg_advisory_unlock(7046029254386353131)`;
  }
}

main().catch((error) => { progress?.fail(error instanceof Error ? error.message : String(error)); console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
