import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
class ReturnError extends Error { constructor(message: string, readonly status = 400) { super(message); } }

export async function GET(request: Request) {
  const saleId = new URL(request.url).searchParams.get("saleId")?.trim();
  try {
    const rows = saleId ? await prisma.$queryRaw<Array<{ id: string; saleId: string; invoiceNo: string | null; total: Prisma.Decimal; reason: string; refundMethod: string | null; returnedBy: string | null; returnedAt: Date; itemCount: bigint }>>`SELECT r.*,s."invoiceNo",COUNT(i.id) "itemCount" FROM "sale_returns" r JOIN "sales" s ON s.id=r."saleId" LEFT JOIN "sale_return_items" i ON i."returnId"=r.id WHERE r."saleId"=${saleId} GROUP BY r.id,s."invoiceNo" ORDER BY r."returnedAt" DESC LIMIT 100` : await prisma.$queryRaw<Array<{ id: string; saleId: string; invoiceNo: string | null; total: Prisma.Decimal; reason: string; refundMethod: string | null; returnedBy: string | null; returnedAt: Date; itemCount: bigint }>>`SELECT r.*,s."invoiceNo",COUNT(i.id) "itemCount" FROM "sale_returns" r JOIN "sales" s ON s.id=r."saleId" LEFT JOIN "sale_return_items" i ON i."returnId"=r.id GROUP BY r.id,s."invoiceNo" ORDER BY r."returnedAt" DESC LIMIT 100`;
    return Response.json({ items: rows.map((r) => ({ ...r, total: Number(r.total), returnedAt: r.returnedAt.toISOString(), itemCount: Number(r.itemCount) })) });
  } catch (error) { console.error("Return query failed", error); return Response.json({ message: "โหลดประวัติคืนสินค้าไม่สำเร็จ" }, { status: 500 }); }
}

export async function POST(request: Request) {
  let body: { saleId?: string; reason?: string; refundMethod?: string; items?: Array<{ saleItemId?: string; quantity?: number }> };
  try { body = await request.json(); } catch { return Response.json({ message: "ข้อมูลไม่ถูกต้อง" }, { status: 400 }); }
  const saleId = body.saleId?.trim(); const reason = body.reason?.trim();
  if (!saleId || !reason || reason.length < 3) return Response.json({ message: "กรุณาระบุบิลและเหตุผลอย่างน้อย 3 ตัวอักษร" }, { status: 400 });
  const requested = new Map<bigint, Prisma.Decimal>();
  for (const row of body.items ?? []) { const id = BigInt(row.saleItemId ?? "0"); const quantity = new Prisma.Decimal(Number(row.quantity ?? 0)); if (id <= 0 || quantity.lte(0)) return Response.json({ message: "จำนวนคืนไม่ถูกต้อง" }, { status: 400 }); requested.set(id, (requested.get(id) ?? new Prisma.Decimal(0)).plus(quantity)); }
  if (!requested.size) return Response.json({ message: "กรุณาเลือกรายการที่จะคืน" }, { status: 400 });
  try {
    const result = await prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findUnique({ where: { id: saleId }, include: { items: { where: { id: { in: [...requested.keys()] } } } } });
      if (!sale) throw new ReturnError("ไม่พบบิลขาย", 404); if (sale.cancelled) throw new ReturnError("บิลถูกยกเลิกแล้ว ไม่สามารถคืนบางรายการได้", 409);
      if (sale.items.length !== requested.size) throw new ReturnError("มีรายการที่ไม่อยู่ในบิลนี้", 409);
      const previous = await tx.$queryRaw<Array<{ saleItemId: bigint; quantity: Prisma.Decimal }>>(Prisma.sql`SELECT "saleItemId",SUM("quantity") quantity FROM "sale_return_items" WHERE "saleItemId" IN (${Prisma.join([...requested.keys()])}) GROUP BY "saleItemId"`);
      const returned = new Map(previous.map((p) => [p.saleItemId, p.quantity]));
      const unitRows=await tx.$queryRaw<Array<{id:bigint;conversionRate:Prisma.Decimal}>>(Prisma.sql`SELECT "id","conversionRate" FROM "sale_items" WHERE "id" IN (${Prisma.join([...requested.keys()])})`);const conversionByItem=new Map(unitRows.map(row=>[row.id,row.conversionRate]));
      let total = new Prisma.Decimal(0);
      for (const item of sale.items) { const quantity = requested.get(item.id)!; if (quantity.plus(returned.get(item.id) ?? 0).gt(item.quantity)) throw new ReturnError(`จำนวนคืนของ ${item.productCode ?? "สินค้า"} เกินจำนวนที่ขาย`, 409); total = total.plus(item.unitPrice.minus(item.unitDiscount).mul(quantity)); }
      const seq = await tx.$queryRaw<Array<{ value: bigint }>>`SELECT nextval('return_number_seq') AS value`; const now = new Date();
      const id = `R${now.toISOString().slice(2, 10).replaceAll("-", "")}${seq[0].value.toString().padStart(8, "0")}`;
      const refundMethod = body.refundMethod ?? "cash"; await tx.$executeRaw`INSERT INTO "sale_returns" ("id","saleId","total","reason","refundMethod","returnedBy","returnedAt") VALUES (${id},${saleId},${total},${reason},${refundMethod},'Administrator',${now})`;
      for (const item of sale.items) {
        const quantity = requested.get(item.id)!; const unitPrice = item.unitPrice.minus(item.unitDiscount); const amount = unitPrice.mul(quantity);
        const returnRows = await tx.$queryRaw<Array<{ id: bigint }>>`INSERT INTO "sale_return_items" ("returnId","saleItemId","productCode","quantity","unitPrice","amount") VALUES (${id},${item.id},${item.productCode},${quantity},${unitPrice},${amount}) RETURNING "id"`;
        const allocations = await tx.$queryRaw<Array<{ lotId: bigint; sold: Prisma.Decimal; restored: Prisma.Decimal }>>`
          SELECT a."lotId",a."quantity" sold,COALESCE((SELECT SUM(r."quantity") FROM "sale_return_lot_allocations" r JOIN "sale_return_items" ri ON ri."id"=r."returnItemId" WHERE ri."saleItemId"=${item.id} AND r."lotId"=a."lotId"),0) restored
          FROM "sale_lot_allocations" a WHERE a."saleItemId"=${item.id} ORDER BY a."id" ASC FOR UPDATE OF a
        `;
        let remaining = quantity.mul(conversionByItem.get(item.id)??1);
        for (const allocation of allocations) {
          if (remaining.lte(0)) break;
          const available = allocation.sold.minus(allocation.restored); const restore = Prisma.Decimal.min(remaining, available);
          if (restore.lte(0)) continue;
          await tx.$executeRaw`UPDATE "inventory_lots" SET "quantity"="quantity"+${restore},"status"='ACTIVE',"updatedAt"=NOW() WHERE "id"=${allocation.lotId}`;
          await tx.$executeRaw`INSERT INTO "sale_return_lot_allocations" ("returnItemId","lotId","quantity") VALUES (${returnRows[0].id},${allocation.lotId},${restore})`;
          remaining = remaining.minus(restore);
        }
      }
      for (const item of sale.items) {
        if (!item.productCode) continue; const quantity = requested.get(item.id)!;const baseQuantity=quantity.mul(conversionByItem.get(item.id)??1);
        const product = await tx.product.update({ where: { code: item.productCode }, data: { quantity: { increment: baseQuantity } }, include: { category: true } });
        const movement = await tx.stockMovement.create({ data: { productCode: product.code, lotId: product.lotId, productName: product.name, categoryName: product.category?.name, quantityIn: baseQuantity, unitCost: product.cost, balance: product.quantity, actor: "Administrator", occurredAt: now, status: "R" } });
        await tx.$executeRaw`UPDATE "stock_movements" SET "note"=${`คืนบางรายการ ${id} จากบิล ${saleId}`} WHERE "id"=${movement.id}`;
      }
      if (refundMethod === "cash") { const shifts = await tx.$queryRaw<Array<{ id: number }>>`SELECT "id" FROM "cash_shifts" WHERE "status"='OPEN' ORDER BY "openedAt" DESC LIMIT 1`; if (shifts[0]) { const cashReason = `คืนสินค้า ${id}`; await tx.$executeRaw`INSERT INTO "cash_movements" ("shiftId","type","amount","reason","actor","occurredAt") VALUES (${shifts[0].id},'OUT',${total},${cashReason},'Administrator',${now})`; } }
      return { id, total: Number(total), saleId };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15000 });
    return Response.json({ return: result }, { status: 201 });
  } catch (error) { if (error instanceof ReturnError) return Response.json({ message: error.message }, { status: error.status }); console.error("Create return failed", error); return Response.json({ message: "คืนสินค้าไม่สำเร็จ" }, { status: 500 }); }
}
