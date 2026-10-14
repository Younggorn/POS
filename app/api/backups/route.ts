import { auditBackup, backupActor, workerFetch } from "@/lib/backup-worker";

export const dynamic = "force-dynamic";

export async function GET() {
  const response = await workerFetch("/status", { cache: "no-store" });
  return Response.json(await response.json());
}

export async function POST(request: Request) {
  try {
    const actor = backupActor(request);
    const response = await workerFetch("/create", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ actor: actor.actorName }) });
    const payload = await response.json();
    await auditBackup(request, "BACKUP_CREATE", payload.file?.name ?? null, true);
    return Response.json(payload, { status: 201 });
  } catch (error) {
    await auditBackup(request, "BACKUP_CREATE", null, false, error instanceof Error ? error.message : undefined);
    return Response.json({ message: error instanceof Error ? error.message : "สร้าง Backup ไม่สำเร็จ" }, { status: 500 });
  }
}
