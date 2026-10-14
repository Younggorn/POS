import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TaxInvoiceCustomerEditor } from "../app/tax-invoice-customer-editor";

const buyer = { name: "ลูกค้า & บริษัท", taxId: "0123456789012", address: "123 ถนนทดสอบ\nกรุงเทพฯ" };
const html = renderToStaticMarkup(createElement(TaxInvoiceCustomerEditor, {
  buyer, onApply() {}, onCancel() {},
}));
assert.ok(html.includes('value="ลูกค้า &amp; บริษัท"'));
assert.ok(html.includes('value="0123456789012"'));
assert.ok(html.includes(buyer.address));
assert.ok(html.includes('type="submit"'));
assert.ok(html.includes('type="button"'));
assert.ok(html.includes("ใช้ข้อมูลนี้"));
assert.ok(html.includes("ยกเลิกการแก้ไข"));
assert.equal(buyer.name, "ลูกค้า & บริษัท");
console.log("PASS: prefilled buyer fields, leading-zero tax ID, multiline address, escaped text, and apply/cancel controls.");
