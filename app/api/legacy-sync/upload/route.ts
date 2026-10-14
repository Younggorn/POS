import { createReadStream, createWriteStream, promises as fs } from "node:fs";
import { join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { randomUUID } from "node:crypto";
import { ensureLegacySyncDirectories, legacyInbox, legacyRequests, type LegacySyncRequest, writeJsonAtomic } from "@/lib/legacy-sync-control";
import { getSessionUser, hasAnyPermission } from "@/lib/auth";

export const runtime = "nodejs";
const maxBytes = 512 * 1024 * 1024;

function decodeName(value: string | null) {
  try { return decodeURIComponent(value || "database.mdb"); } catch { return value || "database.mdb"; }
}

export async function POST(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return Response.json({ message: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
  if (user.mustChangePassword) return Response.json({ message: "กรุณาเปลี่ยนรหัสผ่านก่อนใช้งาน" }, { status: 428 });
  if (!hasAnyPermission(user, ["backup"])) return Response.json({ message: "ไม่มีสิทธิ์ใช้งานส่วนนี้" }, { status: 403 });
  ensureLegacySyncDirectories();
  const originalName = decodeName(request.headers.get("x-file-name")).split(/[\\/]/).pop() || "database.mdb";
  if (!originalName.toLowerCase().endsWith(".mdb")) return Response.json({ message: "รองรับเฉพาะไฟล์ .mdb" }, { status: 400 });
  if (!request.body) return Response.json({ message: "ไม่พบไฟล์ MDB" }, { status: 400 });
  const declaredSize = Number(request.headers.get("content-length") || 0);
  if (declaredSize > maxBytes) return Response.json({ message: "ไฟล์ MDB ต้องมีขนาดไม่เกิน 512 MB" }, { status: 413 });

  const id = `${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}_${randomUUID()}`;
  const fileName = `${id}.mdb`;
  const containerPath = join(legacyInbox, fileName);
  let bytes = 0;
  const limiter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      bytes += chunk.length;
      callback(bytes > maxBytes ? new Error("FILE_TOO_LARGE") : null, chunk);
    },
  });
  try {
    await pipeline(Readable.fromWeb(request.body as never), limiter, createWriteStream(containerPath, { flags: "wx" }));
    if (bytes === 0) throw new Error("EMPTY_FILE");
    if (declaredSize > 0 && bytes !== declaredSize) throw new Error("INCOMPLETE_UPLOAD");
    const signature = Buffer.alloc(16);
    const stream = createReadStream(containerPath, { start: 4, end: 19 });
    let offset = 0;
    for await (const chunk of stream) { (chunk as Buffer).copy(signature, offset); offset += (chunk as Buffer).length; }
    if (!signature.toString("ascii").startsWith("Standard Jet DB")) throw new Error("INVALID_MDB");
    const item: LegacySyncRequest = {
      id,
      originalName,
      databasePath: `C:\\UPminimart\\legacy-sync\\inbox\\${fileName}`,
      size: bytes,
      status: "queued",
      createdAt: new Date().toISOString(),
      message: "รอนำเข้า",
    };
    writeJsonAtomic(join(legacyRequests, `${id}.json`), item);
    return Response.json({ request: item }, { status: 202 });
  } catch (error) {
    await fs.rm(containerPath, { force: true }).catch(() => undefined);
    const message = error instanceof Error && error.message === "FILE_TOO_LARGE" ? "ไฟล์ MDB ต้องมีขนาดไม่เกิน 512 MB" : error instanceof Error && error.message === "INVALID_MDB" ? "ไฟล์นี้ไม่ใช่ฐานข้อมูล Microsoft Access MDB" : error instanceof Error && error.message === "INCOMPLETE_UPLOAD" ? "รับไฟล์ MDB ไม่ครบ กรุณาเลือกไฟล์แล้วลองใหม่" : "อัปโหลดไฟล์ MDB ไม่สำเร็จ";
    return Response.json({ message }, { status: error instanceof Error && error.message === "FILE_TOO_LARGE" ? 413 : 400 });
  }
}
