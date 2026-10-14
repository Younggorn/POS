import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { LegacyProgress } from "./legacy-sync-progress";

export const legacySyncRoot = process.env.LEGACY_SYNC_ROOT || "/legacy-sync";
export const legacyInbox = join(legacySyncRoot, "inbox");
export const legacyRequests = join(legacySyncRoot, "requests");
const configPath = join(legacySyncRoot, "config.json");
const workerStatePath = join(legacySyncRoot, "worker-state.json");

export type LegacySyncConfig = {
  autoEnabled: boolean;
  autoSourcePath: string;
  intervalSeconds: number;
  updatedAt: string;
};

export type LegacySyncRequest = {
  id: string;
  originalName: string;
  databasePath: string;
  size: number;
  status: "queued" | "processing" | "completed" | "failed";
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  message?: string;
};

export function ensureLegacySyncDirectories() {
  mkdirSync(legacySyncRoot, { recursive: true });
  mkdirSync(legacyInbox, { recursive: true });
  mkdirSync(legacyRequests, { recursive: true });
}

function readJson<T>(path: string): T | null {
  try { return JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, "")) as T; } catch { return null; }
}

export function readLegacySyncConfig(): LegacySyncConfig {
  const value = readJson<Partial<LegacySyncConfig>>(configPath);
  return {
    autoEnabled: value?.autoEnabled === true,
    autoSourcePath: typeof value?.autoSourcePath === "string" ? value.autoSourcePath : "",
    intervalSeconds: Math.max(30, Number(value?.intervalSeconds) || 300),
    updatedAt: typeof value?.updatedAt === "string" ? value.updatedAt : new Date(0).toISOString(),
  };
}

export function writeJsonAtomic(path: string, value: unknown) {
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(temporary, JSON.stringify(value, null, 2), "utf8");
  renameSync(temporary, path);
}

export function writeLegacySyncConfig(config: LegacySyncConfig) {
  ensureLegacySyncDirectories();
  writeJsonAtomic(configPath, config);
}

export function readLatestLegacyRequest(): LegacySyncRequest | null {
  ensureLegacySyncDirectories();
  const files = readdirSync(legacyRequests).filter((name) => name.endsWith(".json")).sort().reverse();
  for (const file of files) {
    const request = readJson<LegacySyncRequest>(join(legacyRequests, file));
    if (request) return request;
  }
  return null;
}

export function readWorkerState() {
  return existsSync(workerStatePath) ? readJson<Record<string, unknown>>(workerStatePath) : null;
}

export function readLegacyProgress() {
  const value = readJson<LegacyProgress>(join(legacySyncRoot, "progress.json"));
  return value && typeof value.sourcePath === "string" && Number.isFinite(value.percent) ? value : null;
}
