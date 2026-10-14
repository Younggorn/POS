import "server-only";

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { prisma } from "@/lib/prisma";

const execFileAsync = promisify(execFile);
const workerUrl = process.env.BACKUP_WORKER_URL || "http://backup-worker:8080";
const workerToken = process.env.BACKUP_WORKER_TOKEN || "upminimart-internal-backup";

export async function workerFetch(path: string, init: RequestInit & { duplex?: "half" } = {}) {
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${workerToken}`);
  const response = await fetch(`${workerUrl}${path}`, { ...init, headers });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { message?: string };
    throw new Error(payload.message || "บริการ Backup ไม่พร้อมใช้งาน");
  }
  return response;
}

export function backupActor(request: Request) {
  return {
    actorId: Number(request.headers.get("x-auth-user-id")) || null,
    actorName: request.headers.get("x-auth-user-name")?.slice(0, 100) || "unknown",
  };
}

export async function auditBackup(request: Request, action: string, target: string | null, success: boolean, detail?: string) {
  const actor = backupActor(request);
  await prisma.systemAuditLog.create({ data: { action, target, success, detail: detail?.slice(0, 500) || null, ...actor } }).catch((error) => console.error("Backup audit failed", error));
}

export async function deployMigrations() {
  await execFileAsync("pnpm", ["prisma", "migrate", "deploy"], { cwd: process.cwd(), timeout: 10 * 60 * 1000, maxBuffer: 2 * 1024 * 1024 });
}
