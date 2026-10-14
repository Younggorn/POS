import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

class ShelfLifeError extends Error { constructor(message: string, readonly status = 400) { super(message); } }
const number = (value: unknown) => Number(value ?? 0);
const validDate = (value: unknown) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00+07:00`) : null;

type LotRow = {
  id: bigint; productCode: string; productName: string; unit: string | null; lotNo: string;
  receivedDate: Date; manufacturedDate: Date | null; expireDate: Date; initialQuantity: Prisma.Decimal;
  quantity: Prisma.Decimal; status: string; trackExpiry: boolean; shelfLifeDays: number | null;
  promotionId: bigint | null; promotionType: string | null; promotionValue: Prisma.Decimal | null;
  promotionStartsAt: Date | null; promotionEndsAt: Date | null;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const search = url.searchParams.get("search")?.trim() ?? "";
  const days = Math.min(Math.max(Number(url.searchParams.get("days") ?? 14), 0), 365);
  try {
    const [lots, summary, products] = await Promise.all([
      prisma.$queryRaw<LotRow[]>`
        SELECT l."id", l."productCode", p."name" "productName", p."unit", l."lotNo",
               l."receivedDate", l."manufacturedDate", l."expireDate", l."initialQuantity",
               l."quantity", l."status", p."trackExpiry", p."shelfLifeDays",
               promo."id" "promotionId", promo."discountType" "promotionType", promo."discountValue" "promotionValue",
               promo."startsAt" "promotionStartsAt", promo."endsAt" "promotionEndsAt"
        FROM "inventory_lots" l JOIN "products" p ON p."code"=l."productCode"
        LEFT JOIN LATERAL (
          SELECT "id","discountType","discountValue","startsAt","endsAt"
          FROM "inventory_lot_promotions"
          WHERE "lotId"=l."id" AND "active"=true AND "startsAt"<=NOW() AND ("endsAt" IS NULL OR "endsAt">=NOW())
          ORDER BY "createdAt" DESC,"id" DESC LIMIT 1
        ) promo ON true
        WHERE l."quantity">0
          AND (${search}='' OR p."code" ILIKE ${`%${search}%`} OR p."name" ILIKE ${`%${search}%`} OR l."lotNo" ILIKE ${`%${search}%`})
          AND l."expireDate" < (CURRENT_DATE + (${days}::int + 1) * INTERVAL '1 day')
        ORDER BY l."expireDate" ASC, p."name" ASC, l."lotNo" ASC LIMIT 1000
      `,
      prisma.$queryRaw<Array<{ expired: bigint; today: bigint; in3: bigint; in7: bigint; in14: bigint }>>`
        SELECT
          COUNT(*) FILTER (WHERE "quantity">0 AND "expireDate"<CURRENT_DATE) "expired",
          COUNT(*) FILTER (WHERE "quantity">0 AND "expireDate">=CURRENT_DATE AND "expireDate"<CURRENT_DATE+INTERVAL '1 day') "today",
          COUNT(*) FILTER (WHERE "quantity">0 AND "expireDate">=CURRENT_DATE AND "expireDate"<CURRENT_DATE+INTERVAL '4 day') "in3",
          COUNT(*) FILTER (WHERE "quantity">0 AND "expireDate">=CURRENT_DATE AND "expireDate"<CURRENT_DATE+INTERVAL '8 day') "in7",
          COUNT(*) FILTER (WHERE "quantity">0 AND "expireDate">=CURRENT_DATE AND "expireDate"<CURRENT_DATE+INTERVAL '15 day') "in14"
        FROM "inventory_lots"
      `,
      prisma.$queryRaw<Array<{ code: string; name: string; unit: string | null; quantity: Prisma.Decimal; trackExpiry: boolean; shelfLifeDays: number | null; lotQuantity: Prisma.Decimal }>>`
        SELECT p."code",p."name",p."unit",p."quantity",p."trackExpiry",p."shelfLifeDays",
               COALESCE(SUM(l."quantity"),0) "lotQuantity"
        FROM "products" p LEFT JOIN "inventory_lots" l ON l."productCode"=p."code"
        WHERE p."inactive"=false AND (${search}='' OR p."code" ILIKE ${`%${search}%`} OR p."name" ILIKE ${`%${search}%`})
        GROUP BY p."code" ORDER BY p."name" LIMIT 500
      `,
    ]);
    const nowBangkok = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
    nowBangkok.setHours(0, 0, 0, 0);
    return Response.json({
      summary: Object.fromEntries(Object.entries(summary[0] ?? {}).map(([key, value]) => [key, Number(value)])),
      lots: lots.map((lot) => ({ ...lot, id: lot.id.toString(), initialQuantity: number(lot.initialQuantity), quantity: number(lot.quantity), receivedDate: lot.receivedDate.toISOString(), manufacturedDate: lot.manufacturedDate?.toISOString() ?? null, expireDate: lot.expireDate.toISOString(), daysRemaining: Math.ceil((lot.expireDate.getTime() - nowBangkok.getTime()) / 86400000), promotion: lot.promotionId ? { id: lot.promotionId.toString(), type: lot.promotionType, value: number(lot.promotionValue), startsAt: lot.promotionStartsAt?.toISOString() ?? null, endsAt: lot.promotionEndsAt?.toISOString() ?? null } : null })),
      products: products.map((product) => ({ ...product, quantity: number(product.quantity), lotQuantity: number(product.lotQuantity), unassignedQuantity: Math.max(0, number(product.quantity) - number(product.lotQuantity)) })),
    });
  } catch (error) {
    console.error("Shelf-life query failed", error);
    return Response.json({ message: "โหลดข้อมูล Shelf Life ไม่สำเร็จ" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return Response.json({ message: "ข้อมูลไม่ถูกต้อง" }, { status: 400 }); }
  try {
    const result = await prisma.$transaction(async (tx) => {
      const action = String(body.action ?? "");
      if (action === "configure") {
        const productCode = String(body.productCode ?? "").trim();
        const shelfLifeDays = body.shelfLifeDays === "" || body.shelfLifeDays == null ? null : Math.floor(number(body.shelfLifeDays));
        if (!productCode || (shelfLifeDays !== null && (shelfLifeDays < 1 || shelfLifeDays > 3650))) throw new ShelfLifeError("อายุสินค้าต้องอยู่ระหว่าง 1–3,650 วัน");
        const rows = await tx.$queryRaw<Array<{ code: string }>>`UPDATE "products" SET "trackExpiry"=${Boolean(body.trackExpiry)},"shelfLifeDays"=${shelfLifeDays},"updatedAt"=NOW() WHERE "code"=${productCode} RETURNING "code"`;
        if (!rows.length) throw new ShelfLifeError("ไม่พบสินค้า", 404);
        return { configured: true };
      }
      if (action === "addLot") {
        const productCode = String(body.productCode ?? "").trim();
        const lotNo = String(body.lotNo ?? "").trim();
        const quantity = new Prisma.Decimal(number(body.quantity));
        const receivedDate = validDate(body.receivedDate) ?? new Date();
        const manufacturedDate = validDate(body.manufacturedDate);
        let expireDate = validDate(body.expireDate);
        const productRows = await tx.$queryRaw<Array<{ code: string; quantity: Prisma.Decimal; shelfLifeDays: number | null }>>`SELECT "code","quantity","shelfLifeDays" FROM "products" WHERE "code"=${productCode} FOR UPDATE`;
        const product = productRows[0]; if (!product) throw new ShelfLifeError("ไม่พบสินค้า", 404);
        if (!expireDate && product.shelfLifeDays) { const base = manufacturedDate ?? receivedDate; expireDate = new Date(base); expireDate.setUTCDate(expireDate.getUTCDate() + product.shelfLifeDays); }
        if (!lotNo || quantity.lte(0) || !expireDate) throw new ShelfLifeError("กรุณาระบุ Lot จำนวน และวันหมดอายุ");
        if (manufacturedDate && expireDate < manufacturedDate) throw new ShelfLifeError("วันหมดอายุต้องไม่ก่อนวันผลิต");
        const assigned = await tx.$queryRaw<Array<{ total: Prisma.Decimal }>>`SELECT COALESCE(SUM("quantity"),0) total FROM "inventory_lots" WHERE "productCode"=${productCode}`;
        if (quantity.plus(assigned[0]?.total ?? 0).gt(product.quantity)) throw new ShelfLifeError(`สต็อกที่ยังไม่ผูก Lot มีเพียง ${product.quantity.minus(assigned[0]?.total ?? 0)} หน่วย`, 409);
        const rows = await tx.$queryRaw<Array<{ id: bigint }>>`INSERT INTO "inventory_lots" ("productCode","lotNo","receivedDate","manufacturedDate","expireDate","initialQuantity","quantity","status","updatedAt") VALUES (${productCode},${lotNo},${receivedDate},${manufacturedDate},${expireDate},${quantity},${quantity},'ACTIVE',NOW()) RETURNING "id"`;
        await tx.$executeRaw`UPDATE "products" SET "trackExpiry"=true,"updatedAt"=NOW() WHERE "code"=${productCode}`;
        return { lotId: rows[0].id.toString() };
      }
      const lotId = BigInt(String(body.lotId ?? "0"));
      const quantity = new Prisma.Decimal(number(body.quantity));
      const reason = String(body.reason ?? "").trim();
      const lots = await tx.$queryRaw<Array<{ id: bigint; productCode: string; quantity: Prisma.Decimal; productName: string; cost: Prisma.Decimal; expireDate: Date }>>`SELECT l."id",l."productCode",l."quantity",l."expireDate",p."name" "productName",p."price" "cost" FROM "inventory_lots" l JOIN "products" p ON p."code"=l."productCode" WHERE l."id"=${lotId} FOR UPDATE`;
      const lot = lots[0]; if (!lot) throw new ShelfLifeError("ไม่พบ Lot", 404);
      if (action === "inspect") {
        await tx.$executeRaw`INSERT INTO "inventory_lot_actions" ("lotId","type","quantity","reason","actor") VALUES (${lotId},${action.toUpperCase()},0,${reason || null},'Administrator')`;
        return { logged: true };
      }
      if (action === "discount") {
        if (lot.quantity.lte(0) || new Date(lot.expireDate ?? 0) < new Date()) throw new ShelfLifeError("Lot นี้หมดอายุหรือไม่มีสินค้าเหลือแล้ว", 409);
        const discountType = String(body.discountType ?? "percent");
        const discountValue = new Prisma.Decimal(number(body.discountValue));
        const startsAt = validDate(body.startsAt) ?? new Date();
        const endsAt = body.endsAt ? validDate(body.endsAt) : null;
        if (!(discountType === "percent" || discountType === "price") || discountValue.lte(0)) throw new ShelfLifeError("กรุณาระบุส่วนลดให้ถูกต้อง");
        if (discountType === "percent" && discountValue.gt(100)) throw new ShelfLifeError("ส่วนลดเปอร์เซ็นต์ต้องไม่เกิน 100%");
        if (discountType === "price" && discountValue.gte(lot.cost)) throw new ShelfLifeError("ราคาพิเศษต้องต่ำกว่าราคาขายปกติ");
        if (endsAt && endsAt < startsAt) throw new ShelfLifeError("วันสิ้นสุดต้องไม่ก่อนวันเริ่มต้น");
        await tx.$executeRaw`UPDATE "inventory_lot_promotions" SET "active"=false,"updatedAt"=NOW() WHERE "lotId"=${lotId} AND "active"=true`;
        await tx.$executeRaw`INSERT INTO "inventory_lot_promotions" ("lotId","discountType","discountValue","startsAt","endsAt","reason","createdBy","updatedAt") VALUES (${lotId},${discountType},${discountValue},${startsAt},${endsAt},${reason || null},'Administrator',NOW())`;
        await tx.$executeRaw`INSERT INTO "inventory_lot_actions" ("lotId","type","quantity","reason","actor") VALUES (${lotId},'DISCOUNT',0,${reason || `โปรโมชั่น ${discountType === "percent" ? `${discountValue}%` : `฿${discountValue}`}`},'Administrator')`;
        return { promotion: true };
      }
      if (!(["supplierReturn", "writeOff"].includes(action)) || quantity.lte(0) || quantity.gt(lot.quantity)) throw new ShelfLifeError("จำนวนที่นำออกไม่ถูกต้อง");
      const type = action === "supplierReturn" ? "SUPPLIER_RETURN" : "WRITE_OFF";
      await tx.$executeRaw`UPDATE "inventory_lots" SET "quantity"="quantity"-${quantity},"status"=CASE WHEN "quantity"-${quantity}=0 THEN 'CLOSED' ELSE "status" END,"updatedAt"=NOW() WHERE "id"=${lotId}`;
      const updated = await tx.product.update({ where: { code: lot.productCode }, data: { quantity: { decrement: quantity } }, select: { quantity: true } });
      await tx.$executeRaw`INSERT INTO "inventory_lot_actions" ("lotId","type","quantity","reason","actor") VALUES (${lotId},${type},${quantity},${reason || null},'Administrator')`;
      const movement = await tx.stockMovement.create({ data: { productCode: lot.productCode, productName: lot.productName, quantityIn: quantity.negated(), unitCost: lot.cost, balance: updated.quantity, actor: "Administrator", occurredAt: new Date(), status: action === "writeOff" ? "W" : "R" } });
      await tx.$executeRaw`UPDATE "stock_movements" SET "note"=${`${type} Lot ${lotId}${reason ? `: ${reason}` : ""}`} WHERE "id"=${movement.id}`;
      return { removed: number(quantity) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15000 });
    return Response.json(result);
  } catch (error) {
    if (error instanceof ShelfLifeError) return Response.json({ message: error.message }, { status: error.status });
    console.error("Shelf-life mutation failed", error);
    return Response.json({ message: "บันทึก Shelf Life ไม่สำเร็จ" }, { status: 500 });
  }
}
