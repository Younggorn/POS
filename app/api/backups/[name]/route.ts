import { auditBackup, workerFetch } from "@/lib/backup-worker";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ name: string }> };

export async function GET(_request: Request, context: Context) {
  const { name } = await context.params;
  try {
    const response = await workerFetch(`/download?name=${encodeURIComponent(name)}`);
    const headers = new Headers({ "content-type": "application/octet-stream", "content-disposition": response.headers.get("content-disposition") || `attachment; filename="${name}"` });
    const length = response.headers.get("content-length"); if (length) headers.set("content-length", length);
    return new Response(response.body, { status: 200, headers });
  } catch (error) {
    return Response.json({ message: error instanceof Error ? error.message : "ดาวน์โหลดไม่สำเร็จ" }, { status: 404 });
  }
}

export async function DELETE(request: Request, context: Context) {
  const { name } = await context.params;
  try {
    await workerFetch(`/file?name=${encodeURIComponent(name)}`, { method: "DELETE" });
    await auditBackup(request, "BACKUP_DELETE", name, true);
    return Response.json({ success: true });
  } catch (error) {
    await auditBackup(request, "BACKUP_DELETE", name, false, error instanceof Error ? error.message : undefined);
    return Response.json({ message: error instanceof Error ? error.message : "ลบ Backup ไม่สำเร็จ" }, { status: 500 });
  }
}
