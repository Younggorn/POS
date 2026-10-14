import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

async function main() {
  const database = process.env.LEGACY_VERIFY_DATABASE;
  if (!database?.startsWith("upminimart_sync_verify_")) throw new Error("A separate verification database is required");
  const url = new URL(process.env.DATABASE_URL!);
  if (url.pathname === `/${database}`) throw new Error("Verification must target a separate database");
  url.pathname = `/${database}`;
  const prisma = new PrismaClient({ datasourceUrl: url.toString() });
  const root = mkdtempSync(join(tmpdir(), "legacy-sync-verify-"));
  const baseline = join(root, "baseline"), exported = join(root, "export");
  mkdirSync(baseline); mkdirSync(exported);
  const manifest = { source: { path: "verification.mdb", bytes: 1, lastWriteTimeUtc: "2026-10-13T00:00:00Z" }, tables: [] };
  writeFileSync(join(baseline, "manifest.json"), JSON.stringify(manifest));
  writeFileSync(join(exported, "manifest.json"), JSON.stringify(manifest));
  const csv = (name: string, value: string) => writeFileSync(join(exported, `${name}.csv`), value);
  csv("producttype", "type_id,type_name\nV,Verification\n");
  csv("company", "cid,cname\nV,Verification supplier\n");
  csv("customer", "cus_id,cus_name,cus_price\nV,Verification customer,0\n");
  csv("datashop", "sh_name,sh_vat_rate\nVerification shop,7\n");
  csv("salecancel", "Sid\nVERIFY-S-1\n");
  const writeProducts = (quantity: number) => csv("product", `Pcode,type_id,Pname1,Pqty,Punit,Pcost,Pprice\n900001,V,First product,${quantity},ชิ้น,2,5\n900002,V,Second product,20,ชิ้น,3,8\n`);
  const writeSales = (quantity: number) => csv("salelist", "Sid,SIV,cus_id,Scash_credit,Pcode,Sqty,Sunit,Sprice,Scost\n" + Array.from({ length: 40 }, (_, index) => `VERIFY-S-${index},VERIFY-IV-${index},V,0,900001,${index === 0 ? quantity : 2},ชิ้น,5,2\nVERIFY-S-${index},VERIFY-IV-${index},V,0,900002,3,ชิ้น,8,3\n`).join(""));
  const writeReceipts = (quantity: number) => csv("orderrec", "Rid,cid,Pcode,Rqty,Runit,Rcost\n" + Array.from({ length: 30 }, (_, index) => `VERIFY-R-${index},V,900001,${index === 0 ? quantity : 5},ชิ้น,2\n`).join(""));
  writeProducts(10); writeSales(2); writeReceipts(5);
  csv("stocklog", "Pcode,Pqty_in,Pqty_balance,Pcost\n900001,2,10,2\n");
  const run = () => execFileSync(process.execPath, [require.resolve("tsx/cli"), process.env.LEGACY_VERIFY_SCRIPT ?? join(process.cwd(), "scripts/sync-legacy-data.ts")], {
    env: { ...process.env, DATABASE_URL: url.toString(), LEGACY_EXPORT_DIR: exported, LEGACY_BASELINE_DIR: baseline, LEGACY_PROGRESS_PATH: join(root, "progress.json") },
    stdio: "pipe", timeout: 60000,
  });
  try {
    run();
    const completedProgress = JSON.parse(readFileSync(join(root, "progress.json"), "utf8"));
    assert.equal(completedProgress.status, "completed");
    assert.equal(completedProgress.percent, 100);
    assert.equal(completedProgress.sourcePath, "verification.mdb");
    assert.equal(await prisma.sale.count(), 40);
    assert.equal(await prisma.saleItem.count(), 80);
    assert.equal(await prisma.salePayment.count(), 40);
    assert.equal(await prisma.purchaseReceipt.count(), 30);
    assert.equal(await prisma.purchaseReceiptItem.count(), 30);
    assert.equal(await prisma.stockMovement.count(), 1);
    assert.equal((await prisma.sale.findUniqueOrThrow({ where: { id: "VERIFY-S-0" } })).total.toNumber(), 34);
    assert.equal((await prisma.sale.findUniqueOrThrow({ where: { id: "VERIFY-S-1" } })).cancelled, true);
    run();
    assert.equal(await prisma.saleItem.count(), 80);
    assert.equal(await prisma.purchaseReceiptItem.count(), 30);
    assert.equal(await prisma.stockMovement.count(), 1);
    const unchanged = await prisma.legacyImportRun.findFirstOrThrow({ orderBy: { id: "desc" } });
    assert.deepEqual(unchanged.tableCounts, { categories: 0, products: 0, stockDelta: 0, suppliers: 0, customers: 0, sales: 0, receipts: 0, stockMovements: 0 });
    writeProducts(13); writeSales(3); writeReceipts(6);
    csv("stocklog", "Pcode,Pqty_in,Pqty_balance,Pcost\n900001,2,10,2\n900001,3,13,2\n");
    run();
    assert.equal(await prisma.saleItem.count(), 80);
    assert.equal(await prisma.purchaseReceiptItem.count(), 30);
    assert.equal(await prisma.stockMovement.count(), 2);
    assert.equal((await prisma.sale.findUniqueOrThrow({ where: { id: "VERIFY-S-0" } })).total.toNumber(), 39);
    assert.equal((await prisma.purchaseReceipt.findUniqueOrThrow({ where: { id: "VERIFY-R-0" } })).total.toNumber(), 12);
    const mapping = await prisma.$queryRaw<Array<{ newCode: string }>>`SELECT "newCode" FROM "product_sku_mappings" WHERE "oldCode"='900001'`;
    assert.equal((await prisma.product.findUniqueOrThrow({ where: { code: mapping[0].newCode } })).quantity.toNumber(), 13);
    console.log("PASS: concurrent sales and receipts, cancellation, unchanged re-import, stock delta and changed bills (isolated database)");
  } finally { await prisma.$disconnect(); rmSync(root, { recursive: true, force: true }); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
