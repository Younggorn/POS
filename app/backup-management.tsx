"use client";

import { Check, CloudDownload, DatabaseBackup, FileArchive, FileUp, HardDrive, RefreshCw, RotateCcw, ShieldCheck, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { LegacyProgress } from "@/lib/legacy-sync-progress";

type BackupFile = { name: string; type: string; actor: string | null; sourceName: string | null; createdAt: string; size: number; checksum: string | null };
type BackupData = { files: BackupFile[]; busy: boolean; maintenance: boolean; nextBackupAt: string | null; retentionDays: number; maxUploadBytes: number };
type LegacyRequest = { id: string; originalName: string; databasePath: string; size: number; status: "queued" | "processing" | "completed" | "failed"; createdAt: string; completedAt?: string; message?: string };
type LegacyStatus = {
  config: { autoEnabled: boolean; autoSourcePath: string; intervalSeconds: number };
  worker: { status?: string; message?: string; checkedAt?: string } | null;
  latestRequest: LegacyRequest | null;
  progress: LegacyProgress | null;
  lastRun: { status: string; sourcePath: string; startedAt: string; completedAt: string | null; error: string | null; tableCounts: Record<string, number> } | null;
};

const typeLabel: Record<string, string> = { scheduled: "อัตโนมัติ", manual: "สั่งสำรอง", uploaded: "อัปโหลด", "pre-restore": "ก่อน Restore", unknown: "ไม่ระบุ" };
const requestLabel: Record<LegacyRequest["status"], string> = { queued: "รอดำเนินการ", processing: "กำลังนำเข้า", completed: "สำเร็จ", failed: "ไม่สำเร็จ" };
function when(value: string | null | undefined) { return value ? new Date(value).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" }) : "-"; }
function size(value: number) { if (value < 1024) return `${value} B`; if (value < 1048576) return `${(value / 1024).toFixed(1)} KB`; if (value < 1073741824) return `${(value / 1048576).toFixed(1)} MB`; return `${(value / 1073741824).toFixed(2)} GB`; }

export function BackupManagement() {
  const [data, setData] = useState<BackupData | null>(null);
  const [legacy, setLegacy] = useState<LegacyStatus | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [working, setWorking] = useState(false);
  const [legacyWorking, setLegacyWorking] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);
  const [selectedMdb, setSelectedMdb] = useState<File | null>(null);
  const [restoreFile, setRestoreFile] = useState<BackupFile | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const mdbInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const [backupResponse, legacyResponse] = await Promise.all([
        fetch("/api/backups", { cache: "no-store" }),
        fetch("/api/legacy-sync", { cache: "no-store" }),
      ]);
      const [backupPayload, legacyPayload] = await Promise.all([backupResponse.json(), legacyResponse.json()]);
      if (!backupResponse.ok) throw new Error(backupPayload.message);
      if (!legacyResponse.ok) throw new Error(legacyPayload.message);
      setData(backupPayload);
      setLegacy(legacyPayload);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "โหลดข้อมูล Backup ไม่สำเร็จ"); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!legacyWorking && !legacy?.config.autoEnabled && legacy?.progress?.status !== "processing" && legacy?.latestRequest?.status !== "queued" && legacy?.latestRequest?.status !== "processing") return;
    const timer = window.setInterval(() => void load(), 3000);
    return () => window.clearInterval(timer);
  }, [legacyWorking, legacy?.config.autoEnabled, legacy?.progress?.status, legacy?.latestRequest?.status, load]);
  useEffect(() => {
    if (legacy?.latestRequest?.status === "completed" || legacy?.latestRequest?.status === "failed") setLegacyWorking(false);
  }, [legacy?.latestRequest?.status]);

  async function action(task: () => Promise<Response>, message: string) {
    setWorking(true); setError(""); setSuccess("");
    try {
      const response = await task(); const payload = await response.json();
      if (!response.ok) throw new Error(payload.message);
      setSuccess(message); await load(); return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "ดำเนินการไม่สำเร็จ"); return false; }
    finally { setWorking(false); }
  }

  async function uploadBackup(file: File) {
    if (!file.name.toLowerCase().endsWith(".dump")) { setError("รองรับเฉพาะไฟล์ .dump"); return; }
    await action(() => fetch("/api/backups/upload", { method: "POST", headers: { "content-type": "application/octet-stream", "x-file-name": encodeURIComponent(file.name) }, body: file }), "อัปโหลดและตรวจสอบไฟล์ Backup เรียบร้อย");
  }

  async function importMdb() {
    if (!selectedMdb) return;
    setLegacyWorking(true); setError(""); setSuccess("");
    setUploading(true); setUploadPercent(0);
    try {
      const file = selectedMdb;
      const payload = await new Promise<{ request: LegacyRequest }>((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open("POST", "/api/legacy-sync/upload");
        request.responseType = "json";
        request.setRequestHeader("content-type", "application/octet-stream");
        request.setRequestHeader("x-file-name", encodeURIComponent(file.name));
        request.upload.onprogress = event => setUploadPercent(event.lengthComputable ? Math.min(100, event.loaded * 100 / event.total) : null);
        request.onload = () => request.status >= 200 && request.status < 300 && request.response?.request ? resolve(request.response) : reject(new Error(request.response?.message || "อัปโหลดไฟล์ MDB ไม่สำเร็จ"));
        request.onerror = () => reject(new Error("เชื่อมต่อไม่ได้ กรุณาลองอัปโหลดไฟล์อีกครั้ง"));
        request.onabort = () => reject(new Error("การอัปโหลดถูกยกเลิก"));
        request.send(file);
      });
      setLegacy(current => current ? { ...current, latestRequest: payload.request, progress: null } : current);
      setSelectedMdb(null); if (mdbInputRef.current) mdbInputRef.current.value = "";
      setSuccess("รับไฟล์ MDB แล้ว ระบบกำลังนำเข้าข้อมูลเบื้องหลัง");
      await load();
    } catch (cause) { setLegacyWorking(false); setError(cause instanceof Error ? cause.message : "นำเข้าไฟล์ MDB ไม่สำเร็จ"); }
    finally { setUploading(false); setUploadPercent(null); }
  }

  async function toggleAuto(enabled: boolean) {
    setLegacyWorking(true); setError(""); setSuccess("");
    try {
      const response = await fetch("/api/legacy-sync", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "toggle-auto", enabled }) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.message);
      setLegacy((current) => current ? { ...current, config: payload.config } : current);
      setSuccess(enabled ? "เปิด Auto Sync แล้ว" : "ปิด Auto Sync แล้ว");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "เปลี่ยนการตั้งค่าไม่สำเร็จ"); }
    finally { setLegacyWorking(false); }
  }

  async function remove(file: BackupFile) { if (!window.confirm(`ลบไฟล์ ${file.name} ใช่หรือไม่?`)) return; await action(() => fetch(`/api/backups/${encodeURIComponent(file.name)}`, { method: "DELETE" }), "ลบไฟล์ Backup แล้ว"); }
  async function restore() { if (!restoreFile) return; const ok = await action(() => fetch("/api/backups/restore", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: restoreFile.name, confirmation }) }), "Restore สำเร็จ ระบบจะให้เข้าสู่ระบบใหม่"); if (ok) { setRestoreFile(null); window.setTimeout(() => window.location.reload(), 1200); } }

  const totalSize = data?.files.reduce((sum, file) => sum + file.size, 0) ?? 0;
  const last = data?.files[0] ?? null;
  const latestRequest = legacy?.latestRequest;
  const importing = latestRequest?.status === "queued" || latestRequest?.status === "processing";
  const progress = legacy?.progress;
  const manualProgress = !progress || progress.sourcePath === latestRequest?.databasePath;
  const progressCompleted = !uploading && (progress?.status === "completed" || manualProgress && latestRequest?.status === "completed");
  const progressFailed = !uploading && (progress?.status === "failed" || manualProgress && latestRequest?.status === "failed");
  const progressPercent = uploading ? uploadPercent : progressCompleted ? 100 : progress?.percent ?? null;
  const progressLabel = uploading ? uploadPercent === 100 ? "ตรวจสอบไฟล์ที่อัปโหลด" : "อัปโหลดไฟล์ MDB" : progressCompleted ? "นำเข้าข้อมูลเรียบร้อย" : progressFailed ? "นำเข้าไม่สำเร็จ" : progress?.label ?? (latestRequest?.status === "queued" ? "รอเริ่มนำเข้าข้อมูล" : "กำลังนำเข้าข้อมูล");
  const showProgress = uploading || Boolean(progress) || Boolean(latestRequest);
  return <>
    <div className="page-title"><div><h2>Backup</h2><p>สำรอง กู้คืน และนำเข้าฐานข้อมูลเดิมจาก iSoft SaleStore</p></div><div className="backup-title-actions"><input ref={inputRef} type="file" accept=".dump,application/octet-stream" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadBackup(file); event.target.value = ""; }} /><button className="outline-button" disabled={working} onClick={() => inputRef.current?.click()}><FileUp size={16} />อัปโหลด Backup</button><button className="primary" disabled={working || data?.busy} onClick={() => void action(() => fetch("/api/backups", { method: "POST" }), "สร้าง Backup เรียบร้อย")}><DatabaseBackup size={17} />{working ? "กำลังทำงาน..." : "สำรองตอนนี้"}</button></div></div>
    {error && <div className="data-message warning-message">{error}</div>}{success && <div className="data-message success-message">{success}</div>}

    <section className="panel legacy-import-panel">
      <div className="panel-head pad"><div><h3>นำเข้าฐานข้อมูล iSoft (.mdb)</h3><p>เลือกไฟล์ใหม่ได้ตลอดเวลา ระบบจะนำเข้าเฉพาะข้อมูลที่เพิ่มหรือเปลี่ยน และไม่ล้างรายการบนเว็บ</p></div><label className="legacy-auto-toggle"><span><strong>Auto Sync</strong><small>ค่าเริ่มต้นปิด</small></span><input type="checkbox" checked={legacy?.config.autoEnabled ?? false} disabled={!legacy || legacyWorking} onChange={(event) => void toggleAuto(event.target.checked)} /><i /></label></div>
      <div className="legacy-import-body">
        <input ref={mdbInputRef} type="file" accept=".mdb,application/x-msaccess" hidden onChange={(event) => { const file = event.target.files?.[0] ?? null; if (file && !file.name.toLowerCase().endsWith(".mdb")) { setError("รองรับเฉพาะไฟล์ .mdb"); event.target.value = ""; return; } setSelectedMdb(file); setError(""); }} />
        <div className="legacy-file-picker"><span><FileArchive size={24} /></span><div>{selectedMdb ? <><strong>{selectedMdb.name}</strong><small>{size(selectedMdb.size)}</small></> : <><strong>ยังไม่ได้เลือกไฟล์ MDB</strong><small>ขนาดไฟล์สูงสุด 512 MB</small></>}</div><button className="outline-button" disabled={importing || legacyWorking} onClick={() => mdbInputRef.current?.click()}>เลือกไฟล์</button><button className="primary" disabled={!selectedMdb || importing || legacyWorking} onClick={() => void importMdb()}>{importing || legacyWorking ? "กำลังดำเนินการ..." : "นำเข้าข้อมูล"}</button></div>
        {showProgress && <div className={`legacy-progress ${progressCompleted ? "completed" : progressFailed ? "failed" : "active"}`}>
          <div className="legacy-progress-heading"><span>{progressCompleted ? <Check size={18}/> : <RefreshCw size={18} className={progressFailed ? "" : "legacy-progress-spinner"}/>}<strong aria-live="polite">{progressLabel}</strong></span><b>{progressPercent === null ? "กำลังดำเนินการ" : `${Math.round(progressPercent)}%`}</b></div>
          <div className="legacy-progress-track" role="progressbar" aria-label={uploading ? "ความคืบหน้าการอัปโหลด" : "ความคืบหน้าการนำเข้า"} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressPercent === null ? undefined : Math.round(progressPercent)} aria-valuetext={progressLabel}><div className={progressPercent === null ? "indeterminate" : ""} style={progressPercent === null ? undefined : { width: `${Math.max(0, Math.min(100, progressPercent))}%` }}/></div>
          <div className="legacy-progress-detail"><span>{uploading ? selectedMdb ? `ไฟล์ ${selectedMdb.name} · ${size(selectedMdb.size)}` : "กำลังส่งไฟล์" : !progressCompleted && !progressFailed && progress && progress.total > 0 ? `${progress.processed.toLocaleString("th-TH")} / ${progress.total.toLocaleString("th-TH")} ${progress.unit}` : progressCompleted ? "ข้อมูลพร้อมใช้งานแล้ว" : progressFailed ? progress?.label || latestRequest?.message : "ระบบกำลังประมวลผลเบื้องหลัง"}</span>{!uploading && !progressCompleted && !progressFailed && progress && <small>ความคืบหน้าตามขั้นตอนการทำงาน</small>}</div>
        </div>}
        <div className="legacy-status-grid"><div><span>สถานะล่าสุด</span><strong className={`legacy-state ${latestRequest?.status ?? "idle"}`}>{latestRequest ? requestLabel[latestRequest.status] : "พร้อมใช้งาน"}</strong></div><div><span>ไฟล์ล่าสุด</span><strong>{latestRequest?.originalName ?? "-"}</strong><small>{latestRequest ? `${size(latestRequest.size)} · ${when(latestRequest.createdAt)}` : "ยังไม่เคยเลือกไฟล์"}</small></div><div><span>Auto source</span><strong title={legacy?.config.autoSourcePath}>{legacy?.config.autoSourcePath || "ยังไม่ได้กำหนด"}</strong><small>{legacy?.config.autoEnabled ? `ตรวจทุก ${Math.round((legacy.config.intervalSeconds || 300) / 60)} นาที` : "ปิดอยู่ — จะไม่ดึงข้อมูลเอง"}</small></div><div><span>Worker</span><strong>{legacy?.worker?.status === "idle" ? "รอรับไฟล์" : legacy?.worker?.status ?? "กำลังเริ่มต้น"}</strong><small>{legacy?.worker?.message ?? "-"}</small></div></div>
        {latestRequest?.status === "failed" && <div className="legacy-import-error">{latestRequest.message || "นำเข้าไม่สำเร็จ"}</div>}
      </div>
    </section>

    <div className="mini-metrics"><div className="mini-card"><span className="green"><ShieldCheck /></span><div><p>Backup ล่าสุด</p><strong className="backup-metric-date">{when(last?.createdAt ?? null)}</strong></div></div><div className="mini-card"><span className="blue"><HardDrive /></span><div><p>ไฟล์ / พื้นที่</p><strong>{data?.files.length ?? 0} / {size(totalSize)}</strong></div></div><div className="mini-card"><span className="orange"><RefreshCw /></span><div><p>สำรองครั้งถัดไป</p><strong className="backup-metric-date">{when(data?.nextBackupAt ?? null)}</strong></div></div></div>
    {(data?.busy || data?.maintenance) && <div className="data-message backup-busy">ระบบ Backup/Restore กำลังทำงาน กรุณาอย่าปิดเครื่อง</div>}
    <section className="panel table-panel backup-table"><div className="panel-head pad"><div><h3>ไฟล์ Backup</h3><p>ระบบเก็บไฟล์บนเซิร์ฟเวอร์ {data?.retentionDays ?? 30} วัน</p></div><button className="outline-button compact-button" onClick={() => void load()}><RefreshCw size={15} />รีเฟรช</button></div><table><thead><tr><th>ชื่อไฟล์</th><th>ประเภท</th><th>วันที่สร้าง</th><th>ผู้ดำเนินการ</th><th>ขนาด</th><th>Checksum</th><th /></tr></thead><tbody>{data?.files.length ? data.files.map((file) => <tr key={file.name}><td><strong>{file.name}</strong>{file.sourceName && <small>ต้นฉบับ: {file.sourceName}</small>}</td><td><span className="status ok">{typeLabel[file.type] ?? file.type}</span></td><td>{when(file.createdAt)}</td><td>{file.actor ?? "-"}</td><td>{size(file.size)}</td><td><code title={file.checksum ?? ""}>{file.checksum?.slice(0, 12) ?? "-"}</code></td><td><div className="row-actions backup-row-actions"><a title="ดาวน์โหลด" href={`/api/backups/${encodeURIComponent(file.name)}`}><CloudDownload size={16} /></a><button title="Restore" disabled={working} onClick={() => { setRestoreFile(file); setConfirmation(""); }}><RotateCcw size={16} /></button><button className="deactivate" title="ลบ" disabled={working} onClick={() => void remove(file)}><Trash2 size={16} /></button></div></td></tr>) : <tr><td colSpan={7}><div className="table-loading">ยังไม่มีไฟล์ Backup</div></td></tr>}</tbody></table></section>
    {restoreFile && <div className="modal-backdrop"><div className="small-management-modal"><div className="management-head"><div><span>DATABASE RESTORE</span><h2>ยืนยันการกู้คืนข้อมูล</h2></div><button onClick={() => setRestoreFile(null)}><X size={18} /></button></div><div className="management-body"><div className="restore-warning"><RotateCcw size={24} /><div><strong>ข้อมูลปัจจุบันจะถูกแทนที่</strong><p>ระบบจะสร้าง Safety Backup ก่อน Restore และให้ผู้ใช้ทุกคน Login ใหม่</p></div></div><label className="management-field"><span>ไฟล์ที่ใช้</span><input disabled value={restoreFile.name} /></label><label className="management-field"><span>พิมพ์ RESTORE เพื่อยืนยัน</span><input autoFocus value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label></div><div className="management-footer"><button className="cancel" onClick={() => setRestoreFile(null)}>ยกเลิก</button><button className="confirm restore-confirm" disabled={working || confirmation !== "RESTORE"} onClick={() => void restore()}><Check size={17} />{working ? "กำลังกู้คืน..." : "เริ่ม Restore"}</button></div></div></div>}
  </>;
}
