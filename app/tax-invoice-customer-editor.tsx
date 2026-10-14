"use client";

import { useState, type FormEvent } from "react";

export type TaxInvoiceBuyer = { name: string; taxId: string; address: string };

export function TaxInvoiceCustomerEditor({ buyer, onApply, onCancel }: {
  buyer: TaxInvoiceBuyer;
  onApply: (buyer: TaxInvoiceBuyer) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(buyer);
  const [error, setError] = useState("");
  function apply(event: FormEvent) {
    event.preventDefault();
    if (!draft.name.trim()) { setError("กรุณากรอกชื่อลูกค้า"); return; }
    onApply({ name: draft.name.trim(), taxId: draft.taxId.trim(), address: draft.address.trim() });
  }
  return <form className="tax-buyer-editor" onSubmit={apply} aria-label="แก้ไขข้อมูลลูกค้าบนใบกำกับภาษี">
    <h3>แก้ไขข้อมูลลูกค้า</h3>
    <p>ใช้สำหรับใบกำกับภาษีที่เปิดอยู่นี้เท่านั้น ไม่เปลี่ยนข้อมูลในทะเบียนลูกค้า</p>
    <div className="tax-buyer-fields">
      <label><span>ชื่อลูกค้า / บริษัท</span><input autoFocus required maxLength={200} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })}/></label>
      <label><span>เลขประจำตัวผู้เสียภาษี</span><input maxLength={25} value={draft.taxId} onChange={event => setDraft({ ...draft, taxId: event.target.value })}/></label>
      <label className="tax-buyer-address"><span>ที่อยู่</span><textarea rows={3} maxLength={500} value={draft.address} onChange={event => setDraft({ ...draft, address: event.target.value })}/></label>
    </div>
    {error && <p role="alert" className="tax-buyer-error">{error}</p>}
    <div className="tax-buyer-actions"><button type="button" className="cancel" onClick={onCancel}>ยกเลิกการแก้ไข</button><button type="submit" className="primary">ใช้ข้อมูลนี้</button></div>
  </form>;
}
