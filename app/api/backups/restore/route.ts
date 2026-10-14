import { auditBackup, backupActor, deployMigrations, workerFetch } from "@/lib/backup-worker";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: { name?: string; confirmation?: string };
  try { body = await request.json(); } catch { return Response.json({ message: "ข้อมูลไม่ถูกต้อง" }, { status: 400 }); }
  if (body.confirmation !== "RESTORE" || !body.name) return Response.json({ message: "กรุณาพิมพ์ RESTORE เพื่อยืนยัน" }, { status: 400 });
  let restoreStarted = false;
  try {
    const actor = backupActor(request);
    const response = await workerFetch("/restore", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: body.name, actor: actor.actorName }) });
    const payload = await response.json();
    restoreStarted = true;
    await deployMigrations();
    await auditBackup(request, "BACKUP_RESTORE", body.name, true, `Safety backup: ${payload.safety?.name ?? "-"}`);
    await workerFetch("/finish-restore", { method: "POST" });
    return Response.json({ restored: true, safety: payload.safety });
  } catch (error) {
    if (restoreStarted) await workerFetch("/finish-restore", { method: "POST" }).catch(() => undefined);
    await auditBackup(request, "BACKUP_RESTORE", body.name, false, error instanceof Error ? error.message : undefined);
    return Response.json({ message: error instanceof Error ? error.message : "Restore ไม่สำเร็จ" }, { status: 500 });
  }
}
