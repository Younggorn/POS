import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { basename, join } from "node:path";
import { spawn } from "node:child_process";

const port = Number(process.env.PORT || 8080);
const token = process.env.BACKUP_WORKER_TOKEN || "upminimart-internal-backup";
const backupDir = process.env.BACKUP_DIR || "/backups";
const database = process.env.POSTGRES_DB || "upminimart";
const databaseHost = process.env.POSTGRES_HOST || "postgres";
const databasePort = process.env.POSTGRES_PORT || "5432";
const databaseUser = process.env.POSTGRES_USER || "upminimart";
const password = process.env.POSTGRES_PASSWORD || "";
const retentionDays = Number(process.env.BACKUP_RETENTION_DAYS || 30);
const loginLogRetentionDays = Number(process.env.LOGIN_LOG_RETENTION_DAYS || 180);
const maxUploadBytes = Number(process.env.BACKUP_MAX_UPLOAD_BYTES || 2147483648);
const lockPath = join(backupDir, "restore.lock");
let busy = false;
let nextBackupAt = null;
let restoreUnlockTimer = null;

await mkdir(backupDir, { recursive: true });
await rm(lockPath, { force: true });

function command(name, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(name, args, { env: { ...process.env, PGPASSWORD: password }, stdio: ["ignore", "ignore", "pipe"] });
    let errorText = "";
    child.stderr.on("data", (chunk) => { if (errorText.length < 12000) errorText += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(errorText.trim() || `${name} exited with ${code}`)));
  });
}

const connectionArgs = ["-h", databaseHost, "-p", databasePort, "-U", databaseUser, "-d", database];
const safeName = (name) => typeof name === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,180}\.dump$/.test(name) ? name : null;
const dumpPath = (name) => join(backupDir, basename(name));
const metaPath = (name) => `${dumpPath(name)}.json`;

function bangkokStamp(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value || "00";
  return `${get("year")}${get("month")}${get("day")}_${get("hour")}${get("minute")}${get("second")}`;
}

async function checksum(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

async function writeMetadata(name, type, actor, sourceName = null) {
  const file = dumpPath(name);
  const info = await stat(file);
  const metadata = { name, type, actor: actor || "system", sourceName, createdAt: new Date().toISOString(), size: info.size, checksum: await checksum(file) };
  await writeFile(metaPath(name), JSON.stringify(metadata, null, 2));
  return metadata;
}

async function createBackup(type = "manual", actor = "system") {
  const name = `upminimart_${type}_${bangkokStamp()}.dump`;
  const finalPath = dumpPath(name);
  const temporaryPath = `${finalPath}.partial`;
  try {
    await command("pg_dump", [...connectionArgs, "-Fc", "--no-owner", "--no-privileges", "-f", temporaryPath]);
    await command("pg_restore", ["--list", temporaryPath]);
    await rename(temporaryPath, finalPath);
    return await writeMetadata(name, type, actor);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

async function listBackups() {
  const entries = await readdir(backupDir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (!entry.isFile() || !safeName(entry.name)) continue;
    try {
      const info = await stat(dumpPath(entry.name));
      let metadata = {};
      try { metadata = JSON.parse(await readFile(metaPath(entry.name), "utf8")); } catch {}
      files.push({ name: entry.name, type: metadata.type || "unknown", actor: metadata.actor || null, sourceName: metadata.sourceName || null, createdAt: metadata.createdAt || info.mtime.toISOString(), size: info.size, checksum: metadata.checksum || null });
    } catch {}
  }
  return files.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function cleanup() {
  const cutoff = Date.now() - retentionDays * 86400000;
  for (const file of await listBackups()) {
    if (new Date(file.createdAt).getTime() < cutoff) {
      await rm(dumpPath(file.name), { force: true });
      await rm(metaPath(file.name), { force: true });
    }
  }
  await command("psql", [...connectionArgs, "-v", "ON_ERROR_STOP=1", "-c", `DELETE FROM \"login_logs\" WHERE \"occurredAt\" < NOW() - INTERVAL '${Math.max(1, loginLogRetentionDays)} days'`]).catch((error) => console.error("Login log cleanup failed", error.message));
}

function calculateNextBackup() {
  const next = new Date();
  next.setHours(2, 0, 0, 0);
  if (next <= new Date()) next.setDate(next.getDate() + 1);
  return next;
}

function scheduleDailyBackup() {
  const next = calculateNextBackup();
  nextBackupAt = next.toISOString();
  setTimeout(async () => {
    if (!busy) {
      busy = true;
      try { await createBackup("scheduled", "system"); await cleanup(); }
      catch (error) { console.error("Scheduled backup failed", error); }
      finally { busy = false; }
    }
    scheduleDailyBackup();
  }, Math.max(1000, next.getTime() - Date.now()));
}

function sendJson(response, status, value) {
  const body = JSON.stringify(value);
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(body) });
  response.end(body);
}

async function jsonBody(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk.toString();
    if (body.length > 1048576) throw new Error("Request too large");
  }
  return body ? JSON.parse(body) : {};
}

async function upload(request, requestedName, actor) {
  if (Number(request.headers["content-length"] || 0) > maxUploadBytes) throw new Error("ไฟล์มีขนาดเกินกำหนด");
  const original = decodeURIComponent(requestedName || "backup.dump");
  const stem = basename(original).replace(/\.dump$/i, "").replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 80) || "uploaded";
  const name = `upminimart_uploaded_${bangkokStamp()}_${stem}.dump`;
  const temporaryPath = `${dumpPath(name)}.uploading`;
  const writer = createWriteStream(temporaryPath, { flags: "wx" });
  let size = 0;
  try {
    for await (const chunk of request) {
      size += chunk.length;
      if (size > maxUploadBytes) throw new Error("ไฟล์มีขนาดเกินกำหนด");
      if (!writer.write(chunk)) await new Promise((resolve) => writer.once("drain", resolve));
    }
    await new Promise((resolve, reject) => { writer.end(resolve); writer.on("error", reject); });
    await command("pg_restore", ["--list", temporaryPath]);
    await rename(temporaryPath, dumpPath(name));
    return await writeMetadata(name, "uploaded", actor, original.slice(0, 180));
  } catch (error) {
    writer.destroy();
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

async function finishRestore() {
  if (restoreUnlockTimer) clearTimeout(restoreUnlockTimer);
  await command("psql", [...connectionArgs, "-v", "ON_ERROR_STOP=1", "-c", "DELETE FROM auth_sessions"]).catch((error) => console.error("Session cleanup failed", error.message));
  await rm(lockPath, { force: true });
  busy = false;
}

const server = createServer(async (request, response) => {
  if (request.headers.authorization !== `Bearer ${token}`) return sendJson(response, 401, { message: "Unauthorized" });
  const url = new URL(request.url || "/", `http://127.0.0.1:${port}`);
  try {
    if (request.method === "GET" && url.pathname === "/health") return sendJson(response, 200, { status: "ok" });
    if (request.method === "GET" && url.pathname === "/status") {
      const files = await listBackups();
      return sendJson(response, 200, { files, busy, maintenance: await stat(lockPath).then(() => true).catch(() => false), nextBackupAt, retentionDays, maxUploadBytes });
    }
    if (request.method === "POST" && url.pathname === "/create") {
      if (busy) return sendJson(response, 409, { message: "ระบบ Backup กำลังทำงาน" });
      busy = true;
      try { const body = await jsonBody(request); const file = await createBackup("manual", String(body.actor || "unknown").slice(0, 100)); await cleanup(); return sendJson(response, 201, { file }); }
      finally { busy = false; }
    }
    if (request.method === "POST" && url.pathname === "/upload") {
      if (busy) return sendJson(response, 409, { message: "ระบบ Backup กำลังทำงาน" });
      busy = true;
      try { const file = await upload(request, request.headers["x-file-name"], String(request.headers["x-actor"] || "unknown").slice(0, 100)); return sendJson(response, 201, { file }); }
      finally { busy = false; }
    }
    if (request.method === "GET" && url.pathname === "/download") {
      const name = safeName(url.searchParams.get("name"));
      if (!name) return sendJson(response, 400, { message: "ชื่อไฟล์ไม่ถูกต้อง" });
      const info = await stat(dumpPath(name));
      response.writeHead(200, { "content-type": "application/octet-stream", "content-length": info.size, "content-disposition": `attachment; filename=\"${name}\"` });
      return createReadStream(dumpPath(name)).pipe(response);
    }
    if (request.method === "DELETE" && url.pathname === "/file") {
      if (busy) return sendJson(response, 409, { message: "ระบบ Backup กำลังทำงาน" });
      const name = safeName(url.searchParams.get("name"));
      if (!name) return sendJson(response, 400, { message: "ชื่อไฟล์ไม่ถูกต้อง" });
      await rm(dumpPath(name)); await rm(metaPath(name), { force: true });
      return sendJson(response, 200, { success: true });
    }
    if (request.method === "POST" && url.pathname === "/restore") {
      if (busy) return sendJson(response, 409, { message: "ระบบ Backup กำลังทำงาน" });
      const body = await jsonBody(request); const name = safeName(body.name);
      if (!name) return sendJson(response, 400, { message: "ชื่อไฟล์ไม่ถูกต้อง" });
      busy = true;
      await writeFile(lockPath, JSON.stringify({ startedAt: new Date().toISOString(), name }));
      try {
        await command("pg_restore", ["--list", dumpPath(name)]);
        const safety = await createBackup("pre-restore", String(body.actor || "unknown").slice(0, 100));
        await command("psql", [...connectionArgs, "-v", "ON_ERROR_STOP=1", "-c", `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()`]);
        await command("pg_restore", [...connectionArgs, "--clean", "--if-exists", "--single-transaction", "--no-owner", "--no-privileges", dumpPath(name)]);
        restoreUnlockTimer = setTimeout(() => void finishRestore(), 30 * 60 * 1000);
        return sendJson(response, 200, { restored: true, safety });
      } catch (error) {
        await rm(lockPath, { force: true }); busy = false; throw error;
      }
    }
    if (request.method === "POST" && url.pathname === "/finish-restore") {
      await finishRestore();
      return sendJson(response, 200, { success: true });
    }
    return sendJson(response, 404, { message: "Not found" });
  } catch (error) {
    console.error(error);
    return sendJson(response, 500, { message: error instanceof Error && /ขนาดเกิน/.test(error.message) ? error.message : "ดำเนินการ Backup ไม่สำเร็จ" });
  }
});

scheduleDailyBackup();
void cleanup();
setTimeout(() => void cleanup(), 60000);
server.listen(port, "0.0.0.0", () => console.log(`Backup worker listening on ${port}`));
