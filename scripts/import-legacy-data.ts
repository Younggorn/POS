import { createReadStream, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "csv-parse";
import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const exportDir = process.env.LEGACY_EXPORT_DIR ?? join(process.cwd(), "legacy-export");
const manifest = JSON.parse(readFileSync(join(exportDir, "manifest.json"), "utf8").replace(/^\uFEFF/, ""));

type Row = Record<string, string>;

async function* csv(name: string): AsyncGenerator<Row> {
  const parser = createReadStream(join(exportDir, `${name}.csv`)).pipe(parse({ columns: true, bom: true, skip_empty_lines: true, relax_column_count: true }));
  for await (const row of parser) yield row as Row;
}

const text = (value?: string) => value?.trim() || null;
const num = (value?: string) => Number.isFinite(Number(value)) ? Number(value) : 0;
const int = (value?: string) => Math.trunc(num(value));
const flag = (value?: string) => ["1", "true", "y", "yes"].includes((value ?? "").trim().toLowerCase());
const legacyPaymentType = (value?: string) => {
  const code = value?.trim();
  if (code === "0") return "C";
  if (code === "2") return "T";
  return code || null;
};
function date(value?: string, time?: string) {
  if (!value?.trim()) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  const originalTime = parsed.getTime();
  if (time?.trim() && /^\d{1,2}:\d{2}/.test(time)) {
    const [h, m, s = "0"] = time.split(":");
    const parts = [Number(h), Number(m), Number(s)];
    if (parts.every(Number.isFinite)) parsed.setHours(parts[0], parts[1], parts[2], 0);
  }
  return Number.isNaN(parsed.getTime()) ? new Date(originalTime) : parsed;
}

async function insertChunks<T>(rows: T[], insert: (chunk: T[]) => Promise<unknown>, size = 1000) {
  for (let i = 0; i < rows.length; i += size) await insert(rows.slice(i, i + size));
}

async function collect(name: string) { const rows: Row[] = []; for await (const row of csv(name)) rows.push(row); return rows; }

async function main() {
  console.log("Preparing clean import target...");
  await prisma.$transaction([
    prisma.saleItem.deleteMany(), prisma.sale.deleteMany(),
    prisma.purchaseReceiptItem.deleteMany(), prisma.purchaseReceipt.deleteMany(),
    prisma.stockMovement.deleteMany(), prisma.product.deleteMany(),
    prisma.productCategory.deleteMany(), prisma.supplier.deleteMany(),
    prisma.customer.deleteMany(), prisma.shopSetting.deleteMany(),
  ]);

  const categories = (await collect("producttype")).map(r => ({ id: r.type_id.trim(), name: text(r.type_name) ?? "ไม่ระบุ" })).filter(r => r.id);
  await prisma.productCategory.createMany({ data: categories, skipDuplicates: true });

  const products = (await collect("product")).map(r => ({
    code: r.Pcode.trim(), categoryId: text(r.type_id), lotId: text(r.Plot_id), name: text(r.Pname1) ?? r.Pcode,
    alternateName: text(r.Pname2), quantity: num(r.Pqty), unit: text(r.Punit), cost: num(r.Pcost), price: num(r.Pprice),
    price1: num(r.Pprice1), price2: num(r.Pprice2), price3: num(r.Pprice3), price4: num(r.Pprice4),
    minStock: num(r.Pwarn1), maxStock: num(r.Pwarn2), trackSerial: flag(r.Psn), promotionEnabled: flag(r.Ppromotion),
    inactive: flag(r.Pnosale), addedBy: text(r.Paddby), legacyDate: date(r.Plastdate ?? r.Pdate),
  })).filter(r => r.code);
  await insertChunks(products, chunk => prisma.product.createMany({ data: chunk, skipDuplicates: true }));
  console.log(`Products: ${products.length.toLocaleString()}`);

  const suppliers = (await collect("company")).map(r => ({
    code: r.cid.trim(), name: text(r.cname) ?? r.cid, contact: text(r.ccontact), address1: text(r.caddress1), address2: text(r.caddress2),
    phone: text(r.ctel), fax: text(r.cfax), website: text(r.cweb), email: text(r.cemail), creditDays: int(r.ccredit_day), taxId: text(r.ctax_id), detail: text(r.cdetail),
  })).filter(r => r.code);
  await prisma.supplier.createMany({ data: suppliers, skipDuplicates: true });

  const customers = (await collect("customer")).map(r => ({
    code: r.cus_id.trim(), name: text(r.cus_name) ?? r.cus_id, address1: text(r.cus_address1), address2: text(r.cus_address2),
    phone: text(r.cus_tel), fax: text(r.cus_fax), email: text(r.cus_email), contact: text(r.cus_contact), priceLevel: int(r.cus_price),
    creditDays: int(r.cus_credit_day), taxId: text(r.cus_tax_id), detail: text(r.cus_detail),
  })).filter(r => r.code);
  await prisma.customer.createMany({ data: customers, skipDuplicates: true });

  const cancelled = new Set((await collect("salecancel")).map(r => r.Sid.trim()));
  const saleHeaders = new Map<string, Prisma.SaleCreateManyInput>();
  for await (const r of csv("salelist")) {
    const id = r.Sid.trim(); if (!id) continue;
    const line = num(r.Sqty) * Math.max(0, num(r.Sprice) - num(r.Sdiscount));
    const existing = saleHeaders.get(id);
    if (existing) { existing.subtotal = num(String(existing.subtotal)) + line; existing.total = num(String(existing.subtotal)); }
    else saleHeaders.set(id, {
      id, invoiceNo: text(r.SIV), taxInvoiceNo: text(r.STI), customerCode: r.cus_id.trim() !== "000000" && customers.some(c => c.code === r.cus_id.trim()) ? text(r.cus_id) : null,
      paymentType: legacyPaymentType(r.Scash_credit), dueDate: date(r.Sdue_date), discountRate: num(r.Sdis_rate), discountType: text(r.Sdis_type),
      discountAmount: num(r.Sdis), vatType: text(r.Svattype), vatAmount: num(r.Svat), subtotal: line, total: line,
      soldBy: text(r.Suser), soldAt: date(r.Sdate, r.Stime), status: text(r.Sstatus), cancelled: cancelled.has(id),
    });
  }
  const sales = [...saleHeaders.values()];
  await insertChunks(sales, chunk => prisma.sale.createMany({ data: chunk, skipDuplicates: true }));
  console.log(`Sales: ${sales.length.toLocaleString()}`);

  let saleItems: Prisma.SaleItemCreateManyInput[] = [];
  for await (const r of csv("salelist")) {
    if (!r.Sid.trim()) continue;
    saleItems.push({ saleId: r.Sid.trim(), productCode: text(r.Pcode), serialNumber: text(r.Ssn), lotId: text(r.Plot_id), quantity: num(r.Sqty), unit: text(r.Sunit), unitPrice: num(r.Sprice), unitDiscount: num(r.Sdiscount), unitCost: num(r.Scost), promotionStatus: text(r.Spromo_stat) });
    if (saleItems.length >= 2000) { await prisma.saleItem.createMany({ data: saleItems }); saleItems = []; }
  }
  if (saleItems.length) await prisma.saleItem.createMany({ data: saleItems });

  const receiptHeaders = new Map<string, Prisma.PurchaseReceiptCreateManyInput>();
  const receiptItems: Prisma.PurchaseReceiptItemCreateManyInput[] = [];
  for await (const r of csv("orderrec")) {
    const id = r.Rid.trim(); if (!id) continue;
    const line = num(r.Rqty) * Math.max(0, num(r.Rcost) - num(r.Rdiscount));
    const existing = receiptHeaders.get(id);
    if (existing) existing.total = num(String(existing.total)) + line;
    else receiptHeaders.set(id, { id, supplierCode: suppliers.some(s => s.code === r.cid.trim()) ? text(r.cid) : null, stockDate: date(r.Rstock_date), deliveryNo: text(r.Rsend_id), taxInvoiceNo: text(r.RTTI), deliveryDate: date(r.Rsend_date), vatType: text(r.Rvattype), vatAmount: num(r.Rvat), total: line, receivedBy: text(r.Ruser), receivedAt: date(r.Rdate, r.Rtime), status: text(r.Rstatus) });
    receiptItems.push({ receiptId: id, productCode: text(r.Pcode), lotId: text(r.Plot_id), quantity: num(r.Rqty), unit: text(r.Runit), unitCost: num(r.Rcost), discount: num(r.Rdiscount) });
  }
  await insertChunks([...receiptHeaders.values()], chunk => prisma.purchaseReceipt.createMany({ data: chunk, skipDuplicates: true }));
  await insertChunks(receiptItems, chunk => prisma.purchaseReceiptItem.createMany({ data: chunk }));

  let movements: Prisma.StockMovementCreateManyInput[] = [];
  for await (const r of csv("stocklog")) {
    movements.push({ productCode: text(r.Pcode), lotId: text(r.Plot_id), categoryName: text(r.type_name_0), productName: text(r.Pname_0), quantityIn: num(r.Pqty_in), unitCost: num(r.Pcost), balance: num(r.Pqty_balance), actor: text(r.Paddby), occurredAt: date(r.Pdate, r.Ptime), status: text(r.Pstatus) });
    if (movements.length >= 2000) { await prisma.stockMovement.createMany({ data: movements }); movements = []; }
  }
  if (movements.length) await prisma.stockMovement.createMany({ data: movements });

  const shop = (await collect("datashop"))[0];
  if (shop) await prisma.shopSetting.create({ data: { id: 1, name: text(shop.sh_name) ?? "UP Minimart", owner: text(shop.sh_owner), headOrBranch: text(shop.sh_address), branchNo: text(shop.sh_branch_no), taxId: text(shop.sh_vat_no), address1: text(shop.sh_address1), address2: text(shop.sh_address2), phone: text(shop.sh_tel), email: text(shop.sh_email), vatRate: num(shop.sh_vat_rate) || 7, promptPay: text(shop.sh_promptpay) } });

  const counts = { categories: categories.length, products: products.length, suppliers: suppliers.length, customers: customers.length, sales: sales.length, saleItems: manifest.tables.find((t: {table:string}) => t.table === "salelist")?.rows ?? 0, receipts: receiptHeaders.size, receiptItems: receiptItems.length, stockMovements: manifest.tables.find((t: {table:string}) => t.table === "stocklog")?.rows ?? 0 };
  await prisma.legacyImportRun.create({ data: { sourcePath: manifest.source.path, sourceSize: BigInt(manifest.source.bytes), sourceMtime: new Date(manifest.source.lastWriteTimeUtc), tableCounts: counts, completedAt: new Date(), status: "completed" } });
  console.log("Import complete", counts);
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
