import assert from "node:assert/strict";
import { isPositivePurchaseNumber } from "../lib/purchase-validation";
import { POST } from "../app/api/purchases/route";

async function main() {
  for (const value of [0.01, 10, "20.50", " 5 "]) assert.equal(isPositivePurchaseNumber(value), true);
  const invalid = [0, -1, "", " ", "abc", "NaN", "Infinity", null, undefined, true, {}, [], NaN, Infinity];
  for (const value of invalid) assert.equal(isPositivePurchaseNumber(value), false);
  let checked = 0;
  for (const field of ["unitCost", "salePrice"] as const) {
    for (const value of invalid) {
      const response = await POST(new Request("http://localhost/api/purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supplierCode: "TEST", items: [{ code: "TEST", quantity: 1, unitCost: 10, salePrice: 20, [field]: value }] }),
      }));
      assert.equal(response.status, 400, `${field}: ${String(value)}`);
      checked++;
    }
  }
  console.log(`PASS: positive-price validation and ${checked} invalid API requests; no database writes.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
