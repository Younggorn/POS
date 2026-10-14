import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

class SupplierError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

const limits = { code: 5, name: 80, contact: 50, address1: 70, address2: 70, phone: 40, fax: 40, website: 50, email: 50, taxId: 25, detail: 200 } as const;

function text(value: unknown, max: number, required = false) {
  const result = String(value ?? "").trim();
  if (required && !result) throw new SupplierError("กรุณากรอกข้อมูลที่จำเป็นให้ครบ");
  if (result.length > max) throw new SupplierError(`ข้อมูลยาวเกิน ${max} ตัวอักษร`);
  return result || null;
}

function supplierData(body: Record<string, unknown>) {
  const creditDays = Number(body.creditDays ?? 0);
  if (!Number.isInteger(creditDays) || creditDays < 0 || creditDays > 3650) throw new SupplierError("เครดิตต้องเป็นจำนวนวันระหว่าง 0–3,650");
  return {
    name: text(body.name, limits.name, true)!,
    contact: text(body.contact, limits.contact),
    address1: text(body.address1, limits.address1),
    address2: text(body.address2, limits.address2),
    phone: text(body.phone, limits.phone),
    fax: text(body.fax, limits.fax),
    website: text(body.website, limits.website),
    email: text(body.email, limits.email),
    creditDays,
    taxId: text(body.taxId, limits.taxId),
    detail: text(body.detail, limits.detail),
  };
}

export async function GET(request: Request) {
  const search = new URL(request.url).searchParams.get("search")?.trim();
  try {
    const suppliers = await prisma.supplier.findMany({
      where: search ? { OR: [
        { code: { contains: search, mode: "insensitive" } },
        { name: { contains: search, mode: "insensitive" } },
        { contact: { contains: search, mode: "insensitive" } },
        { phone: { contains: search } },
        { taxId: { contains: search } },
      ] } : {},
      orderBy: [{ name: "asc" }, { code: "asc" }],
      take: 500,
      include: { _count: { select: { receipts: true } } },
    });
    return Response.json({
      items: suppliers.map(({ _count, ...supplier }) => ({ ...supplier, receiptCount: _count.receipts })),
      total: suppliers.length,
    });
  } catch (error) {
    console.error("Load suppliers failed", error);
    return Response.json({ message: "โหลดข้อมูลผู้จำหน่ายไม่สำเร็จ" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return Response.json({ message: "ข้อมูลไม่ถูกต้อง" }, { status: 400 }); }
  try {
    const supplier = await prisma.$transaction(async (tx) => {
      const sequenceRows = await tx.$queryRaw<Array<{ value: bigint }>>`SELECT nextval('supplier_number_seq') AS value`;
      const value = Number(sequenceRows[0]?.value ?? 0);
      if (!Number.isInteger(value) || value < 1 || value > 9999) throw new SupplierError("รหัสผู้จำหน่ายอัตโนมัติครบจำนวน S9999 แล้ว กรุณาติดต่อผู้ดูแลระบบ", 409);
      const code = `S${String(value).padStart(4, "0")}`;
      return tx.supplier.create({ data: { code, ...supplierData(body) } });
    });
    return Response.json({ supplier: { ...supplier, receiptCount: 0 } }, { status: 201 });
  } catch (error) { return supplierResponseError(error, "เพิ่มผู้จำหน่ายไม่สำเร็จ"); }
}

export async function PATCH(request: Request) {
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return Response.json({ message: "ข้อมูลไม่ถูกต้อง" }, { status: 400 }); }
  try {
    const code = text(body.code, limits.code, true)!.toUpperCase();
    const result = await prisma.supplier.updateMany({ where: { code }, data: supplierData(body) });
    if (!result.count) throw new SupplierError("ไม่พบผู้จำหน่าย", 404);
    return Response.json({ success: true });
  } catch (error) { return supplierResponseError(error, "แก้ไขผู้จำหน่ายไม่สำเร็จ"); }
}

export async function DELETE(request: Request) {
  const code = new URL(request.url).searchParams.get("code")?.trim().toUpperCase();
  if (!code) return Response.json({ message: "กรุณาระบุผู้จำหน่าย" }, { status: 400 });
  try {
    const supplier = await prisma.supplier.findUnique({ where: { code }, select: { _count: { select: { receipts: true } } } });
    if (!supplier) throw new SupplierError("ไม่พบผู้จำหน่าย", 404);
    if (supplier._count.receipts > 0) throw new SupplierError("ผู้จำหน่ายนี้มีประวัติรับสินค้าแล้ว จึงไม่สามารถลบได้", 409);
    await prisma.supplier.delete({ where: { code } });
    return Response.json({ success: true });
  } catch (error) { return supplierResponseError(error, "ลบผู้จำหน่ายไม่สำเร็จ"); }
}

function supplierResponseError(error: unknown, fallback: string) {
  if (error instanceof SupplierError) return Response.json({ message: error.message }, { status: error.status });
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return Response.json({ message: "รหัสผู้จำหน่ายนี้มีอยู่แล้ว" }, { status: 409 });
  console.error(fallback, error);
  return Response.json({ message: fallback }, { status: 500 });
}
