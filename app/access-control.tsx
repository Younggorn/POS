"use client";

import { Check, KeyRound, Pencil, Plus, ShieldCheck, UserRound, Users, X } from "lucide-react";
import { useEffect, useState } from "react";

type Menu = { id: string; label: string };
type Position = { id: number; name: string; description: string | null; active: boolean; permissions: string[]; employeeCount: number };
type Employee = { id: number; username: string; name: string; positionId: number; position: string; active: boolean; mustChangePassword: boolean; lastLoginAt: string | null };
type Data = { menus: Menu[]; positions: Position[]; employees: Employee[] };

async function request(body?: Record<string, unknown>) {
  const response = await fetch("/api/access-control", body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message ?? "ดำเนินการไม่สำเร็จ");
  return payload;
}

export function AccessControlManagement() {
  const [data, setData] = useState<Data | null>(null);
  const [mode, setMode] = useState<"position" | "employee" | null>(null);
  const [editingPosition, setEditingPosition] = useState<Position | null>(null);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [permissions, setPermissions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function load() { try { setData(await request()); } catch (cause) { setError(cause instanceof Error ? cause.message : "โหลดข้อมูลไม่สำเร็จ"); } }
  useEffect(() => { void load(); }, []);
  useEffect(() => { if (!success) return; const timer = window.setTimeout(() => setSuccess(""), 5000); return () => window.clearTimeout(timer); }, [success]);

  function openPosition(position?: Position) {
    setEditingPosition(position ?? null); setForm({ name: position?.name ?? "", description: position?.description ?? "", active: String(position?.active ?? true) }); setPermissions(position?.permissions ?? []); setError(""); setMode("position");
  }
  function openEmployee(employee?: Employee) {
    setEditingEmployee(employee ?? null); setForm({ name: employee?.name ?? "", username: employee?.username ?? "", positionId: String(employee?.positionId ?? data?.positions.find((item) => item.active)?.id ?? ""), active: String(employee?.active ?? true), password: "" }); setError(""); setMode("employee");
  }
  async function save() {
    if (!mode) return; setSaving(true); setError("");
    try {
      if (mode === "position") await request({ action: editingPosition ? "updatePosition" : "createPosition", id: editingPosition?.id, name: form.name, description: form.description, active: form.active !== "false", permissions });
      else await request({ action: editingEmployee ? "updateEmployee" : "createEmployee", id: editingEmployee?.id, name: form.name, username: form.username, positionId: Number(form.positionId), active: form.active !== "false", password: form.password });
      setSuccess(mode === "position" ? "บันทึกตำแหน่งและสิทธิ์แล้ว" : "บันทึกข้อมูลพนักงานแล้ว"); setMode(null); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "บันทึกไม่สำเร็จ"); } finally { setSaving(false); }
  }
  const activePositions = data?.positions.filter((position) => position.active) ?? [];
  return <>
    <div className="page-title"><div><h2>พนักงาน ตำแหน่ง และสิทธิ์</h2><p>สร้างตำแหน่ง กำหนดหลายเมนูต่อหนึ่งตำแหน่ง และจัดการบัญชีเข้าสู่ระบบ</p></div><div className="access-title-actions"><button className="outline-button" onClick={() => openPosition()}><ShieldCheck size={17}/>เพิ่มตำแหน่ง</button><button className="primary" onClick={() => openEmployee()}><Plus size={17}/>เพิ่มพนักงาน</button></div></div>
    {error && !mode && <div className="data-message warning-message">{error}</div>}{success && <div className="data-message success-message">{success}</div>}
    <div className="mini-metrics"><div className="mini-card"><span className="blue"><ShieldCheck size={21}/></span><div><p>ตำแหน่งที่ใช้งาน</p><strong>{activePositions.length} ตำแหน่ง</strong></div></div><div className="mini-card"><span className="green"><Users size={21}/></span><div><p>พนักงานที่ใช้งาน</p><strong>{data?.employees.filter((item) => item.active).length ?? 0} คน</strong></div></div></div>
    <section className="panel access-section"><div className="panel-head pad"><div><h3>ตำแหน่งและเมนูที่เข้าถึงได้</h3><p>หนึ่งตำแหน่งเลือกใช้งานได้หลายเมนู</p></div></div><div className="position-grid">{data?.positions.map((position) => <article key={position.id} className={!position.active ? "inactive" : ""}><div><span className="position-icon"><ShieldCheck size={20}/></span><div><h3>{position.name}</h3><p>{position.description || "ไม่ระบุรายละเอียด"}</p></div><button aria-label={`แก้ไขตำแหน่ง ${position.name}`} onClick={() => openPosition(position)}><Pencil size={16}/></button></div><div className="permission-chips">{position.permissions.map((id) => <span key={id}>{data.menus.find((menu) => menu.id === id)?.label ?? id}</span>)}</div><footer>{position.employeeCount} พนักงาน · {position.active ? "เปิดใช้งาน" : "ปิดใช้งาน"}</footer></article>)}</div></section>
    <section className="panel table-panel"><div className="panel-head pad"><div><h3>บัญชีพนักงาน</h3><p>ชื่อผู้ใช้ ตำแหน่ง และสถานะการเข้าใช้งาน</p></div></div><table><thead><tr><th>พนักงาน</th><th>ชื่อผู้ใช้</th><th>ตำแหน่ง</th><th>เข้าสู่ระบบล่าสุด</th><th>สถานะ</th><th></th></tr></thead><tbody>{data?.employees.map((employee) => <tr key={employee.id}><td><strong>{employee.name}</strong></td><td>{employee.username}</td><td>{employee.position}</td><td>{employee.lastLoginAt ? new Date(employee.lastLoginAt).toLocaleString("th-TH") : "ยังไม่เคย"}</td><td><span className={`status ${employee.active ? "ok" : "low"}`}>{employee.active ? employee.mustChangePassword ? "รอเปลี่ยนรหัส" : "ใช้งาน" : "ปิดใช้งาน"}</span></td><td><button className="outline-button compact-button" onClick={() => openEmployee(employee)}><Pencil size={15}/>แก้ไข</button></td></tr>)}</tbody></table></section>
    {mode && <div className="modal-backdrop"><div className="management-modal access-modal"><div className="management-head"><div><span>{mode === "position" ? "POSITION & PERMISSIONS" : "EMPLOYEE ACCOUNT"}</span><h2>{mode === "position" ? editingPosition ? "แก้ไขตำแหน่ง" : "เพิ่มตำแหน่ง" : editingEmployee ? "แก้ไขพนักงาน" : "เพิ่มพนักงาน"}</h2></div><button onClick={() => setMode(null)}><X size={19}/></button></div><div className="management-body">
      {mode === "position" ? <><div className="form-grid"><label><span>ชื่อตำแหน่ง *</span><input value={form.name ?? ""} onChange={(event) => setForm({ ...form, name: event.target.value })}/></label><label><span>สถานะ</span><select value={form.active ?? "true"} onChange={(event) => setForm({ ...form, active: event.target.value })}><option value="true">เปิดใช้งาน</option><option value="false">ปิดใช้งาน</option></select></label><label className="span-two"><span>รายละเอียด</span><input value={form.description ?? ""} onChange={(event) => setForm({ ...form, description: event.target.value })}/></label></div><div className="permission-picker"><strong>เมนูที่ตำแหน่งนี้เข้าใช้งานได้</strong><div>{data?.menus.map((menu) => <label key={menu.id} className={permissions.includes(menu.id) ? "selected" : ""}><input type="checkbox" checked={permissions.includes(menu.id)} onChange={() => setPermissions((old) => old.includes(menu.id) ? old.filter((id) => id !== menu.id) : [...old, menu.id])}/><Check size={15}/><span>{menu.label}</span></label>)}</div></div></> : <div className="form-grid"><label><span>ชื่อพนักงาน *</span><input value={form.name ?? ""} onChange={(event) => setForm({ ...form, name: event.target.value })}/></label><label><span>ชื่อผู้ใช้ *</span><input disabled={Boolean(editingEmployee)} autoComplete="off" value={form.username ?? ""} onChange={(event) => setForm({ ...form, username: event.target.value.toLowerCase() })}/></label><label><span>ตำแหน่ง *</span><select value={form.positionId ?? ""} onChange={(event) => setForm({ ...form, positionId: event.target.value })}>{activePositions.map((position) => <option value={position.id} key={position.id}>{position.name}</option>)}</select></label><label><span>สถานะ</span><select value={form.active ?? "true"} onChange={(event) => setForm({ ...form, active: event.target.value })}><option value="true">เปิดใช้งาน</option><option value="false">ปิดใช้งาน</option></select></label><label className="span-two"><span><KeyRound size={15}/>{editingEmployee ? "ตั้งรหัสผ่านใหม่ (เว้นว่างถ้าไม่เปลี่ยน)" : "รหัสผ่านเริ่มต้น *"}</span><input type="password" autoComplete="new-password" placeholder="อย่างน้อย 8 ตัวอักษร" value={form.password ?? ""} onChange={(event) => setForm({ ...form, password: event.target.value })}/></label></div>}
      {error && <div className="data-message warning-message">{error}</div>}
    </div><div className="management-footer"><button className="cancel" onClick={() => setMode(null)}>ยกเลิก</button><button className="confirm" disabled={saving || !form.name?.trim() || (mode === "position" ? !permissions.length : !form.positionId || (!editingEmployee && (form.password?.length ?? 0) < 8))} onClick={() => void save()}><Check size={17}/>{saving ? "กำลังบันทึก..." : "บันทึก"}</button></div></div></div>}
  </>;
}
