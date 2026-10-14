"use client";

import { Check, Combine, PackageOpen, Plus, Search, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type Product = { code: string; name: string; unit: string; stock: number; inactive?: boolean };
type Barcode = { id: string; productUnitId: string; barcode: string; isPrimary: boolean; active: boolean; note: string | null };
type Unit = {
  id: string; productCode: string; productName: string; baseUnit: string; stock: number;
  name: string; barcode: string; conversionRate: number; salePrice: number;
  purchaseCost: number | null; isBase: boolean; canSell: boolean; canPurchase: boolean;
  active: boolean; wholeUnits: number; barcodes: Barcode[];
};

async function jsonRequest(url: string, method: string, body: unknown) {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message ?? "ดำเนินการไม่สำเร็จ");
  return data;
}

export function ProductUnitsManagement() {
  const [search, setSearch] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [selected, setSelected] = useState<Product | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [editing, setEditing] = useState<Unit | null | undefined>(undefined);
  const [form, setForm] = useState<Record<string, string | boolean>>({});
  const [mergeOpen, setMergeOpen] = useState(false);
  const [sourceSearch, setSourceSearch] = useState("");
  const [sourceProducts, setSourceProducts] = useState<Product[]>([]);
  const [source, setSource] = useState<Product | null>(null);
  const [mergeName, setMergeName] = useState("แพ็ค");
  const [mergeRate, setMergeRate] = useState("10");
  const [barcodeUnitId, setBarcodeUnitId] = useState<string | null>(null);
  const [newBarcode, setNewBarcode] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);

  const loadProducts = useCallback(async (term = search) => {
    const response = await fetch(`/api/products?search=${encodeURIComponent(term)}&limit=30`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.message ?? "โหลดสินค้าไม่สำเร็จ");
    setProducts(data.items ?? []);
  }, [search]);

  useEffect(() => {
    const timer = setTimeout(() => { void loadProducts().catch(() => undefined); }, 250);
    return () => clearTimeout(timer);
  }, [loadProducts]);

  useEffect(() => {
    if (!mergeOpen) return;
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/products?search=${encodeURIComponent(sourceSearch)}&status=active&limit=30`);
        const data = await response.json();
        setSourceProducts((data.items ?? []).filter((item: Product) => item.code !== selected?.code));
      } catch { setSourceProducts([]); }
    }, 250);
    return () => clearTimeout(timer);
  }, [mergeOpen, sourceSearch, selected?.code]);

  const loadUnits = useCallback(async () => {
    if (!selected) return;
    try {
      const response = await fetch(`/api/product-units?productCode=${encodeURIComponent(selected.code)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.message);
      setUnits(data.items ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "โหลดหน่วยสินค้าไม่สำเร็จ");
    }
  }, [selected]);

  useEffect(() => { void loadUnits(); }, [loadUnits]);

  function showSuccess(message: string) {
    setError("");
    setSuccess(message);
    window.setTimeout(() => setSuccess(""), 5000);
  }

  function openUnit(unit?: Unit) {
    setEditing(unit ?? null);
    setForm(unit ? {
      name: unit.name, barcode: unit.barcode, conversionRate: String(unit.conversionRate),
      salePrice: String(unit.salePrice), purchaseCost: String(unit.purchaseCost ?? ""),
      canSell: unit.canSell, canPurchase: unit.canPurchase,
    } : { conversionRate: "1", salePrice: "0", purchaseCost: "", canSell: true, canPurchase: true });
  }

  async function saveUnit() {
    if (!selected) return;
    setSaving(true); setError("");
    try {
      await jsonRequest("/api/product-units", "POST", {
        action: "save", id: editing?.id, productCode: selected.code, name: form.name,
        barcode: form.barcode, conversionRate: Number(form.conversionRate),
        salePrice: Number(form.salePrice), purchaseCost: form.purchaseCost,
        canSell: form.canSell, canPurchase: form.canPurchase,
      });
      showSuccess("บันทึกหน่วยสินค้าเรียบร้อย");
      setEditing(undefined);
      await loadUnits();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  }

  async function toggleUnit(unit: Unit) {
    try {
      await jsonRequest("/api/product-units", "POST", {
        action: "toggle", id: unit.id, productCode: unit.productCode, active: !unit.active,
      });
      await loadUnits();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "บันทึกไม่สำเร็จ"); }
  }

  async function addBarcode(unit: Unit) {
    if (!selected || !newBarcode.trim()) return;
    setSaving(true); setError("");
    try {
      await jsonRequest("/api/product-units", "POST", { action: "addBarcode", productCode: selected.code, unitId: unit.id, barcode: newBarcode.trim() });
      setNewBarcode(""); setBarcodeUnitId(null);
      showSuccess(`เพิ่ม Barcode สำหรับหน่วย ${unit.name} แล้ว`);
      await loadUnits();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "เพิ่ม Barcode ไม่สำเร็จ"); }
    finally { setSaving(false); }
  }

  async function toggleBarcode(barcode: Barcode) {
    if (!selected || barcode.isPrimary) return;
    try {
      await jsonRequest("/api/product-units", "POST", { action: "toggleBarcode", productCode: selected.code, barcodeId: barcode.id, active: !barcode.active });
      await loadUnits();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "เปลี่ยนสถานะ Barcode ไม่สำเร็จ"); }
  }

  async function mergeProduct() {
    if (!selected || !source) return;
    const rate = Number(mergeRate);
    if (!Number.isFinite(rate) || rate <= 0) { setError("กรุณาระบุตัวคูณที่ถูกต้อง"); return; }
    if (!window.confirm(`ย้าย ${source.name} มาเป็นหน่วย ${mergeName} ของ ${selected.name}\nสต็อก ${source.stock} ${source.unit} จะกลายเป็น ${(source.stock * rate).toLocaleString("th-TH")} ${selected.unit}`)) return;
    setSaving(true); setError("");
    try {
      const result = await jsonRequest("/api/product-units", "POST", {
        action: "mergeExisting", productCode: selected.code, sourceProductCode: source.code,
        name: mergeName, conversionRate: rate,
      });
      const response = await fetch(`/api/products?code=${encodeURIComponent(selected.code)}`);
      const data = await response.json();
      const refreshed = data.items?.[0] as Product | undefined;
      if (refreshed) setSelected(refreshed);
      setMergeOpen(false); setSource(null); setSourceSearch("");
      showSuccess(`รวมสินค้าแพ็คเรียบร้อย โอนสต็อก ${Number(result.transferredBaseQuantity).toLocaleString("th-TH")} ${selected.unit}`);
      await loadProducts();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "รวมสินค้าไม่สำเร็จ"); }
    finally { setSaving(false); }
  }

  async function removeProduct() {
    if (!selected) return;
    const warning = selected.stock > 0
      ? `สินค้านี้มีสต็อก ${selected.stock} ${selected.unit} ระบบจะเก็บถาวรและซ่อนจากหน้าขาย แต่ไม่ลบประวัติ ยืนยันหรือไม่?`
      : "ลบสินค้านี้หรือไม่? หากมีประวัติบิล ระบบจะเก็บถาวรแทนการลบถาวร";
    if (!window.confirm(warning)) return;
    setSaving(true); setError("");
    try {
      const result = await jsonRequest("/api/products", "DELETE", { code: selected.code });
      setSelected(null); setUnits([]);
      showSuccess(result.message);
      await loadProducts();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "ลบสินค้าไม่สำเร็จ"); }
    finally { setSaving(false); }
  }

  return <>
    <div className="page-title">
      <div>
        <h2>หน่วยสินค้าและ Barcode</h2>
        <p>ขายเป็นชิ้น แพ็ค หรือลังได้ในสินค้าเดียว สต็อกจริงจะเก็บเป็นหน่วยย่อยเสมอ</p>
      </div>
      {selected && <div className="unit-page-actions">
        <button className="outline-button" onClick={() => setMergeOpen(true)}><Combine size={17}/>รวมสินค้าแพ็คเดิม</button>
        <button className="primary" onClick={() => openUnit()}><Plus size={17}/>เพิ่มหน่วยใหม่</button>
      </div>}
    </div>
    {error && <div className="data-message warning-message">{error}</div>}
    {success && <div className="data-message success-message">{success}</div>}

    <div className="units-layout">
      <section className="panel unit-product-panel">
        <div className="unit-search"><Search size={17}/><input placeholder="ค้นหาสินค้าหรือ Barcode" value={search} onChange={(event) => setSearch(event.target.value)}/></div>
        <div className="unit-products">{products.map((product) =>
          <button className={selected?.code === product.code ? "active" : ""} key={product.code} onClick={() => setSelected(product)}>
            <strong>{product.name}</strong><span>{product.code} · {product.stock.toLocaleString("th-TH")} {product.unit}</span>
          </button>)}</div>
      </section>

      <section className="panel unit-detail">{selected ? <>
        <div className="unit-product-summary">
          <PackageOpen size={25}/><div><h3>{selected.name}</h3><p>คงเหลือทั้งหมด <strong>{selected.stock.toLocaleString("th-TH")} {selected.unit}</strong></p></div>
          <button className="unit-delete" disabled={saving} onClick={() => void removeProduct()}><Trash2 size={15}/>ลบสินค้า</button>
        </div>
        <div className="unit-cards">{units.map((unit) => <article key={unit.id} className={!unit.active ? "disabled" : ""}>
          <div><strong>{unit.name}{unit.isBase && <em>หน่วยหลัก</em>}</strong><span>SKU: {selected.code}</span></div>
          <div className="unit-barcode-list">{unit.barcodes?.map((barcode) => <div key={barcode.id} className={!barcode.active ? "inactive" : ""}><code>{barcode.barcode}</code>{barcode.isPrimary ? <em>หลัก</em> : <button onClick={() => void toggleBarcode(barcode)}>{barcode.active ? "ปิด" : "เปิด"}</button>}</div>)}</div>
          {barcodeUnitId === unit.id && <div className="unit-barcode-add"><input autoFocus placeholder="สแกน Barcode เพิ่ม" value={newBarcode} onChange={(event) => setNewBarcode(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void addBarcode(unit); }}/><button disabled={saving || !newBarcode.trim()} onClick={() => void addBarcode(unit)}>เพิ่ม</button></div>}
          <dl><div><dt>ตัวคูณ</dt><dd>{unit.conversionRate} {selected.unit}</dd></div><div><dt>ราคาขาย</dt><dd>฿{unit.salePrice.toLocaleString("th-TH")}</dd></div><div><dt>ขายได้สูงสุด</dt><dd>{unit.wholeUnits.toLocaleString("th-TH")} {unit.name}</dd></div></dl>
          <small>สต็อก {selected.stock} {selected.unit} ≈ {unit.wholeUnits} {unit.name}{unit.conversionRate > 1 ? ` + ${selected.stock - unit.wholeUnits * unit.conversionRate} ${selected.unit}` : ""}</small>
          <footer><button onClick={() => openUnit(unit)}>แก้ไข</button><button onClick={() => { setBarcodeUnitId(barcodeUnitId === unit.id ? null : unit.id); setNewBarcode(""); }}>+ Barcode</button>{!unit.isBase && <button onClick={() => void toggleUnit(unit)}>{unit.active ? "ปิดใช้งาน" : "เปิดใช้งาน"}</button>}</footer>
        </article>)}</div>
      </> : <div className="unit-empty"><PackageOpen size={42}/><h3>เลือกสินค้าที่ต้องการจัดการหน่วย</h3></div>}</section>
    </div>

    {editing !== undefined && selected && <div className="modal-backdrop"><div className="small-management-modal">
      <div className="management-head"><h2>{editing ? `แก้ไขหน่วย ${editing.name}` : "เพิ่มหน่วยสินค้า"}</h2><button onClick={() => setEditing(undefined)}><X size={18}/></button></div>
      <div className="management-body"><div className="form-grid">
        <label><span>ชื่อหน่วย</span><input placeholder="แพ็ค / ลัง" value={String(form.name ?? "")} onChange={(event) => setForm({ ...form, name: event.target.value })}/></label>
        <label className="span-two"><span>Barcode / QR ของหน่วยนี้</span><input value={String(form.barcode ?? "")} onChange={(event) => setForm({ ...form, barcode: event.target.value })}/></label>
        <label><span>1 หน่วย เท่ากับกี่ {selected.unit}</span><input disabled={editing?.isBase} type="number" min="0.001" step="0.001" value={String(form.conversionRate ?? "1")} onChange={(event) => setForm({ ...form, conversionRate: event.target.value })}/></label>
        <label><span>ราคาขายต่อหน่วย</span><input type="number" min="0" step="0.01" value={String(form.salePrice ?? "0")} onChange={(event) => setForm({ ...form, salePrice: event.target.value })}/></label>
        <label><span>ต้นทุนต่อหน่วย</span><input type="number" min="0" step="0.01" value={String(form.purchaseCost ?? "")} onChange={(event) => setForm({ ...form, purchaseCost: event.target.value })}/></label>
        <label><span><input type="checkbox" checked={Boolean(form.canSell)} onChange={(event) => setForm({ ...form, canSell: event.target.checked })}/> ใช้ขายได้</span></label>
        <label><span><input type="checkbox" checked={Boolean(form.canPurchase)} onChange={(event) => setForm({ ...form, canPurchase: event.target.checked })}/> ใช้รับเข้าได้</span></label>
      </div><div className="unit-impact">รับหรือขาย 1 {String(form.name || "หน่วย")} จะกระทบสต็อก {Number(form.conversionRate || 0).toLocaleString("th-TH")} {selected.unit}</div></div>
      <div className="management-footer"><button className="cancel" onClick={() => setEditing(undefined)}>ยกเลิก</button><button className="confirm" disabled={saving} onClick={() => void saveUnit()}><Check size={17}/>{saving ? "กำลังบันทึก..." : "บันทึกหน่วย"}</button></div>
    </div></div>}

    {mergeOpen && selected && <div className="modal-backdrop"><div className="management-modal merge-product-modal">
      <div className="management-head"><div><span>รวมข้อมูลเดิมโดยไม่ลบประวัติบิล</span><h2>นำสินค้าแพ็คเดิมมาเป็นหน่วย</h2></div><button onClick={() => setMergeOpen(false)}><X size={18}/></button></div>
      <div className="management-body">
        <div className="merge-target"><span>สินค้าหลัก (หน่วยย่อย)</span><strong>{selected.name}</strong><small>{selected.code} · สต็อก {selected.stock} {selected.unit}</small></div>
        <label className="management-field"><span>ค้นหาสินค้าแพ็คเดิม</span><input placeholder="ชื่อหรือ Barcode ของแพ็ค" value={sourceSearch} onChange={(event) => { setSourceSearch(event.target.value); setSource(null); }}/></label>
        <div className="merge-source-list">{sourceProducts.map((product) => <button key={product.code} className={source?.code === product.code ? "active" : ""} onClick={() => setSource(product)}><strong>{product.name}</strong><span>{product.code} · คงเหลือ {product.stock} {product.unit}</span></button>)}</div>
        {source && <div className="form-grid merge-fields">
          <label><span>ชื่อหน่วยใหม่</span><input value={mergeName} onChange={(event) => setMergeName(event.target.value)}/></label>
          <label><span>1 {mergeName || "แพ็ค"} เท่ากับกี่ {selected.unit}</span><input type="number" min="0.001" step="0.001" value={mergeRate} onChange={(event) => setMergeRate(event.target.value)}/></label>
          <div className="unit-impact span-two">สต็อก {source.stock} {source.unit} จะถูกโอนเป็น {(source.stock * Number(mergeRate || 0)).toLocaleString("th-TH")} {selected.unit}<br/>Barcode {source.code} จะใช้ยิงขายเป็นหน่วย {mergeName || "แพ็ค"} และสินค้าเดิมจะถูกเก็บถาวร</div>
        </div>}
      </div>
      <div className="management-footer"><button className="cancel" onClick={() => setMergeOpen(false)}>ยกเลิก</button><button className="confirm" disabled={saving || !source} onClick={() => void mergeProduct()}><Combine size={17}/>{saving ? "กำลังรวมข้อมูล..." : "รวมเป็นหน่วยแพ็ค"}</button></div>
    </div></div>}
  </>;
}
