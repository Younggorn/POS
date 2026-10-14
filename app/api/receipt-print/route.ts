export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const agentUrl = process.env.RECEIPT_PRINTER_AGENT_URL ?? "http://host.docker.internal:18181";
const printerToken = process.env.RECEIPT_PRINTER_TOKEN ?? "";

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 262_144) return Response.json({ message: "ข้อมูลใบเสร็จมีขนาดใหญ่เกินไป" }, { status: 413 });

  let body: unknown;
  try { body = await request.json(); }
  catch { return Response.json({ message: "ข้อมูลใบเสร็จไม่ถูกต้อง" }, { status: 400 }); }

  if (!body || typeof body !== "object" || !("sale" in body) || !body.sale || typeof body.sale !== "object") {
    return Response.json({ message: "ไม่พบข้อมูลใบเสร็จ" }, { status: 400 });
  }
  if (!printerToken) {
    console.error("RECEIPT_PRINTER_TOKEN is not configured");
    return Response.json({ message: "เซิร์ฟเวอร์เครื่องพิมพ์ยังไม่ได้ตั้งค่า" }, { status: 503 });
  }

  try {
    const response = await fetch(`${agentUrl.replace(/\/$/, "")}/print`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${printerToken}`, "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({ message: "ตัวเชื่อมเครื่องพิมพ์ตอบกลับไม่ถูกต้อง" }));
    if (!response.ok) {
      console.error("Receipt printer agent rejected request", response.status);
      return Response.json({ message: payload.message ?? "ส่งงานพิมพ์ไม่สำเร็จ" }, { status: 502 });
    }
    return Response.json({ ok: true, printer: payload.printer, job: payload.job });
  } catch (error) {
    console.error("Receipt printer agent unavailable", error);
    return Response.json({ message: "เชื่อมต่อเครื่องพิมพ์กลางไม่สำเร็จ" }, { status: 503 });
  }
}
