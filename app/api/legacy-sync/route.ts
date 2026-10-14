import { prisma } from "@/lib/prisma";
import { ensureLegacySyncDirectories, readLatestLegacyRequest, readLegacySyncConfig, readWorkerState, readLegacyProgress, writeLegacySyncConfig } from "@/lib/legacy-sync-control";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    ensureLegacySyncDirectories();
    const [lastRun, config] = await Promise.all([
      prisma.legacyImportRun.findFirst({ orderBy: { id: "desc" } }),
      Promise.resolve(readLegacySyncConfig()),
    ]);
    const latestRequest = readLatestLegacyRequest();
    const progress = readLegacyProgress();
    const manualActive = latestRequest?.status === "queued" || latestRequest?.status === "processing";
    const relevantProgress = progress && (progress.sourcePath === latestRequest?.databasePath || config.autoEnabled && !manualActive);
    return Response.json({
      config,
      worker: readWorkerState(),
      latestRequest,
      progress: relevantProgress ? progress : null,
      lastRun: lastRun ? { ...lastRun, sourceSize: lastRun.sourceSize.toString() } : null,
    });
  } catch (error) {
    console.error("Legacy sync status failed", error);
    return Response.json({ message: "โหลดสถานะนำเข้าฐานข้อมูลเดิมไม่สำเร็จ" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { action?: string; enabled?: boolean };
    if (body.action !== "toggle-auto" || typeof body.enabled !== "boolean") return Response.json({ message: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
    const current = readLegacySyncConfig();
    const config = { ...current, autoEnabled: body.enabled, updatedAt: new Date().toISOString() };
    writeLegacySyncConfig(config);
    return Response.json({ config });
  } catch (error) {
    console.error("Legacy sync setting failed", error);
    return Response.json({ message: "บันทึกการตั้งค่า Auto Sync ไม่สำเร็จ" }, { status: 500 });
  }
}
