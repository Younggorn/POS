import { auditBackup, backupActor, workerFetch } from "@/lib/backup-worker";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const encodedName = request.headers.get("x-file-name") || "backup.dump";
  try {
    if (!request.body) return Response.json({ message: "ไม่พบไฟล์ Backup" }, { status: 400 });
    const actor = backupActor(request);
    const response = await workerFetch("/upload", {
      method: "POST", body: request.body, duplex: "half",
      headers: { "content-type": "application/octet-stream", "x-file-name": encodedName, "x-actor": actor.actorName },
    });
    const payload = await response.json();
    await auditBackup(request, "BACKUP_UPLOAD", payload.file?.name ?? null, true);
    return Response.json(payload, { status: 201 });
  } catch (error) {
    await auditBackup(request, "BACKUP_UPLOAD", encodedName, false, error instanceof Error ? error.message : undefined);
    return Response.json({ message: error instanceof Error ? error.message : "อัปโหลด Backup ไม่สำเร็จ" }, { status: 500 });
  }
}
