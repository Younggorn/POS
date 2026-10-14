import { Prisma } from "@prisma/client";
import { prisma } from "../../../lib/prisma";

type HeldItem = {
  code?: unknown;
  name?: unknown;
  qty?: unknown;
  price?: unknown;
  cartKey?: unknown;
  unitId?: unknown;
  unitName?: unknown;
  conversionRate?: unknown;
  stock?: unknown;
};

function serialize(row: { id: number; label: string; itemCount: number; total: Prisma.Decimal; items: Prisma.JsonValue; customer: Prisma.JsonValue | null; heldBy: string | null; createdAt: Date; updatedAt: Date }) {
  return {
    ...row,
    total: Number(row.total),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function GET() {
  try {
    const rows = await prisma.heldBill.findMany({ orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    return Response.json({ items: rows.map(serialize) });
  } catch (error) {
    console.error("Load held bills failed", error);
    return Response.json({ message: "โหลดบิลที่พักไว้ไม่สำเร็จ" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const heldBy = request.headers.get("x-auth-user-name")?.slice(0, 100) || null;
  let body: { label?: unknown; items?: unknown; customer?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ message: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  const label = typeof body.label === "string" ? body.label.trim() : "";
  const items = Array.isArray(body.items) ? body.items as HeldItem[] : [];
  const customer = body.customer && typeof body.customer === "object" && !Array.isArray(body.customer) ? body.customer as Record<string, unknown> : null;
  if (!label || label.length > 80) return Response.json({ message: "กรุณาระบุชื่อลูกค้าหรือชื่อบิลไม่เกิน 80 ตัวอักษร" }, { status: 400 });
  if (items.length === 0 || items.length > 200) return Response.json({ message: "บิลพักต้องมีสินค้า 1–200 รายการ" }, { status: 400 });
  if(customer && (typeof customer.code!=="string"||typeof customer.name!=="string"||!Number.isInteger(Number(customer.priceLevel))||Number(customer.priceLevel)<0||Number(customer.priceLevel)>4)) return Response.json({message:"ข้อมูลลูกค้าในบิลพักไม่ถูกต้อง"},{status:400});

  let itemCount = 0;
  let total = 0;
  for (const item of items) {
    const qty = Number(item.qty);
    const price = Number(item.price);
    const conversionRate = Number(item.conversionRate);
    const stock = Number(item.stock);
    if (
      typeof item.code !== "string" || !item.code.trim() ||
      typeof item.name !== "string" || !item.name.trim() ||
      typeof item.cartKey !== "string" || !item.cartKey ||
      typeof item.unitName !== "string" || !item.unitName.trim() ||
      !Number.isInteger(qty) || qty <= 0 || qty > 9999 ||
      !Number.isFinite(price) || price < 0 || price > 99_999_999 ||
      !Number.isFinite(conversionRate) || conversionRate <= 0 ||
      !Number.isFinite(stock)
    ) return Response.json({ message: "ข้อมูลสินค้าในบิลพักไม่ถูกต้อง" }, { status: 400 });
    itemCount += qty;
    total += qty * price;
  }
  if (!Number.isFinite(total) || total > 999_999_999_999) return Response.json({ message: "ยอดรวมบิลพักไม่ถูกต้อง" }, { status: 400 });

  try {
    const row = await prisma.heldBill.create({
      data: {
        label,
        itemCount,
        total: new Prisma.Decimal(total.toFixed(2)),
        items: items as Prisma.InputJsonValue,
        ...(customer ? { customer: customer as Prisma.InputJsonValue } : {}),
        heldBy,
      },
    });
    return Response.json({ heldBill: serialize(row) }, { status: 201 });
  } catch (error) {
    console.error("Create held bill failed", error);
    return Response.json({ message: "พักบิลไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return Response.json({ message: "เลขที่บิลพักไม่ถูกต้อง" }, { status: 400 });
  try {
    const deleted = await prisma.heldBill.deleteMany({ where: { id } });
    if (deleted.count === 0) return Response.json({ message: "ไม่พบบิลที่พักไว้" }, { status: 404 });
    return Response.json({ success: true });
  } catch (error) {
    console.error("Delete held bill failed", error);
    return Response.json({ message: "ลบบิลพักไม่สำเร็จ" }, { status: 500 });
  }
}
