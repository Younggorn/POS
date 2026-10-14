import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [shop, devices, db, counts] = await Promise.all([
      prisma.shopSetting.findUnique({ where: { id: 1 } }),
      prisma.$queryRaw<Array<{ id: number; name: string; type: string; connection: string | null; enabled: boolean; note: string | null; updatedAt: Date }>>`SELECT * FROM "devices" ORDER BY "type", "name"`,
      prisma.$queryRaw<Array<{ version: string; size: string; database: string }>>`SELECT version(), pg_size_pretty(pg_database_size(current_database())) size, current_database() database`,
      Promise.all([prisma.product.count(), prisma.sale.count(), prisma.customer.count(), prisma.purchaseReceipt.count()]),
    ]);
    return Response.json({ shop: shop ? { ...shop, vatRate: Number(shop.vatRate) } : null, devices, database: db[0], counts: { products: counts[0], sales: counts[1], customers: counts[2], purchases: counts[3] }, serverTime: new Date().toISOString() });
  } catch (error) { console.error("System query failed", error); return Response.json({ message: "โหลดข้อมูลงานระบบไม่สำเร็จ" }, { status: 500 }); }
}

export async function POST(request: Request) {
  let body: Record<string, unknown>; try { body = await request.json(); } catch { return Response.json({ message: "ข้อมูลไม่ถูกต้อง" }, { status: 400 }); }
  try {
    if (body.action === "shop") {
      const name = String(body.name ?? "").trim(); if (!name) return Response.json({ message: "กรุณาระบุชื่อร้าน" }, { status: 400 });
      const shop = await prisma.shopSetting.upsert({ where: { id: 1 }, create: { id: 1, name }, update: { name, owner: String(body.owner ?? "").trim() || null, taxId: String(body.taxId ?? "").trim() || null, address1: String(body.address1 ?? "").trim() || null, address2: String(body.address2 ?? "").trim() || null, phone: String(body.phone ?? "").trim() || null, email: String(body.email ?? "").trim() || null, vatRate: Number(body.vatRate ?? 7), promptPay: String(body.promptPay ?? "").trim() || null } });
      return Response.json({ shop: { ...shop, vatRate: Number(shop.vatRate) } });
    }
    if (body.action === "device") {
      const name = String(body.name ?? "").trim(); const type = String(body.type ?? "").trim(); if (!name || !type) return Response.json({ message: "กรุณาระบุชื่อและชนิดอุปกรณ์" }, { status: 400 });
      const connection = String(body.connection ?? "").trim() || null; const note = String(body.note ?? "").trim() || null;
      const rows = await prisma.$queryRaw<Array<{ id: number; name: string; type: string; connection: string | null; enabled: boolean }>>`INSERT INTO "devices" ("name","type","connection","note","updatedAt") VALUES (${name},${type},${connection},${note},NOW()) RETURNING "id","name","type","connection","enabled"`; return Response.json({ device: rows[0] }, { status: 201 });
    }
    if (body.action === "toggleDevice") { const id = Number(body.id); const enabled = Boolean(body.enabled); await prisma.$executeRaw`UPDATE "devices" SET "enabled"=${enabled}, "updatedAt"=NOW() WHERE "id"=${id}`; return Response.json({ device: { id, enabled } }); }
    return Response.json({ message: "ไม่รองรับคำสั่งนี้" }, { status: 400 });
  } catch (error) { console.error("System update failed", error); return Response.json({ message: "บันทึกงานระบบไม่สำเร็จ" }, { status: 500 }); }
}
