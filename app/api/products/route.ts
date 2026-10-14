import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const productSelect = {
  code: true, name: true, alternateName: true, unit: true, price: true, price1: true, price2: true,
  price3: true, price4: true, cost: true, quantity: true, minStock: true, maxStock: true, inactive: true,
  trackExpiry: true,
  category: { select: { id: true, name: true } },
} as const;

type ProductInput = {
  code?: string; name?: string; alternateName?: string | null; categoryId?: string | null; unit?: string | null;
  barcode?: string | null;
  cost?: number; price?: number; price1?: number; price2?: number; price3?: number; price4?: number;
  quantity?: number; minStock?: number; maxStock?: number;
};

type ProductPatch = ProductInput & {
  action?: "update" | "adjustStock" | "setActive";
  adjustment?: number;
  reason?: string;
  active?: boolean;
};

class ProductError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

function positiveInteger(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function finiteNumber(value: unknown, label: string, minimum = 0) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed) || parsed < minimum) throw new ProductError(`${label}ไม่ถูกต้อง`);
  return parsed;
}

function cleanOptional(value: unknown, maxLength: number) {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? text.slice(0, maxLength) : null;
}

function validatedProduct(body: ProductInput, creating = false) {
  const code = body.code?.trim();
  const name = body.name?.trim();
  if (!code || code.length > 25) throw new ProductError("กรุณาระบุรหัสสินค้าไม่เกิน 25 ตัวอักษร");
  if (!name || name.length > 80) throw new ProductError("กรุณาระบุชื่อสินค้าไม่เกิน 80 ตัวอักษร");
  return {
    code,
    name,
    alternateName: cleanOptional(body.alternateName, 100),
    categoryId: cleanOptional(body.categoryId, 4),
    unit: cleanOptional(body.unit, 12) ?? "ชิ้น",
    cost: finiteNumber(body.cost, "ราคาทุน"),
    price: finiteNumber(body.price, "ราคาขาย"),
    price1: finiteNumber(body.price1, "ราคาขายระดับ 1"),
    price2: finiteNumber(body.price2, "ราคาขายระดับ 2"),
    price3: finiteNumber(body.price3, "ราคาขายระดับ 3"),
    price4: finiteNumber(body.price4, "ราคาขายระดับ 4"),
    minStock: finiteNumber(body.minStock, "จุดสั่งซื้อ"),
    maxStock: finiteNumber(body.maxStock, "สต็อกสูงสุด"),
    ...(creating ? { quantity: finiteNumber(body.quantity, "ยอดเริ่มต้น") } : {}),
  };
}

function serializeProduct(row: {
  code: string; name: string; alternateName: string | null; unit: string | null; inactive: boolean;
  price: Prisma.Decimal; price1: Prisma.Decimal; price2: Prisma.Decimal; price3: Prisma.Decimal; price4: Prisma.Decimal;
  cost: Prisma.Decimal; quantity: Prisma.Decimal; minStock: Prisma.Decimal; maxStock: Prisma.Decimal;
  trackExpiry: boolean;
  category: { id: string; name: string } | null;
}) {
  return {
    id: row.code, code: row.code, name: row.name, alternateName: row.alternateName,
    categoryId: row.category?.id ?? null, category: row.category?.name ?? "ไม่ระบุ", unit: row.unit ?? "ชิ้น",
    price: Number(row.price), price1: Number(row.price1), price2: Number(row.price2), price3: Number(row.price3), price4: Number(row.price4),
    cost: Number(row.cost), stock: Number(row.quantity), min: Number(row.minStock), max: Number(row.maxStock), inactive: row.inactive, trackExpiry: row.trackExpiry,
  };
}

type BarcodeSummary = { id: bigint; productUnitId: bigint; barcode: string; isPrimary: boolean; active: boolean; note: string | null };
type UnitSummary = { id: bigint; productCode: string; name: string; barcode: string; conversionRate: Prisma.Decimal; salePrice: Prisma.Decimal; purchaseCost: Prisma.Decimal | null; isBase: boolean; canSell: boolean; canPurchase: boolean; active: boolean };
async function withUnits(items: ReturnType<typeof serializeProduct>[], selectedBarcode?: string) {
  if (!items.length) return items;
  const rows = await prisma.$queryRaw<UnitSummary[]>(Prisma.sql`SELECT "id","productCode","name","barcode","conversionRate","salePrice","purchaseCost","isBase","canSell","canPurchase","active" FROM "product_units" WHERE "productCode" IN (${Prisma.join(items.map((item) => item.code))}) ORDER BY "isBase" DESC,"conversionRate" ASC`);
  const barcodeRows = rows.length ? await prisma.$queryRaw<BarcodeSummary[]>(Prisma.sql`SELECT "id","productUnitId","barcode","isPrimary","active","note" FROM "product_barcodes" WHERE "productUnitId" IN (${Prisma.join(rows.map((row) => row.id))}) ORDER BY "isPrimary" DESC,"id" ASC`) : [];
  const barcodesByUnit = new Map<string, Array<Record<string, unknown>>>();
  for (const barcode of barcodeRows) { const key = barcode.productUnitId.toString(); barcodesByUnit.set(key, [...(barcodesByUnit.get(key) ?? []), { ...barcode, id: barcode.id.toString(), productUnitId: key }]); }
  const byProduct = new Map<string, Array<Record<string, unknown>>>();
  for (const row of rows) { const unit = { ...row, id: row.id.toString(), conversionRate: Number(row.conversionRate), salePrice: Number(row.salePrice), purchaseCost: row.purchaseCost === null ? null : Number(row.purchaseCost), barcodes: barcodesByUnit.get(row.id.toString()) ?? [] }; byProduct.set(row.productCode, [...(byProduct.get(row.productCode) ?? []), unit]); }
  const matchedUnitId = selectedBarcode ? barcodeRows.find((row) => row.barcode === selectedBarcode && row.active)?.productUnitId : null;
  return items.map((item) => ({ ...item, units: byProduct.get(item.code) ?? [], selectedUnitId: matchedUnitId && rows.some((row) => row.productCode === item.code && row.id === matchedUnitId) ? matchedUnitId.toString() : null, matchedBarcode: matchedUnitId ? selectedBarcode : null }));
}

async function withLots<T extends { code: string }>(items: T[]) {
  if (!items.length) return items;
  const rows = await prisma.$queryRaw<Array<{ id: bigint; productCode: string; lotNo: string; expireDate: Date; quantity: Prisma.Decimal; promotionType: string|null; promotionValue: Prisma.Decimal|null; promotionEndsAt: Date|null }>>`
    SELECT l."id",l."productCode",l."lotNo",l."expireDate",l."quantity",
      promo."discountType" "promotionType",promo."discountValue" "promotionValue",promo."endsAt" "promotionEndsAt"
    FROM "inventory_lots" l LEFT JOIN LATERAL (
      SELECT "discountType","discountValue","endsAt" FROM "inventory_lot_promotions"
      WHERE "lotId"=l."id" AND "active"=true AND "startsAt"<=NOW() AND ("endsAt" IS NULL OR "endsAt">=NOW())
      ORDER BY "createdAt" DESC,"id" DESC LIMIT 1
    ) promo ON true
    WHERE l."productCode" IN (${Prisma.join(items.map((item) => item.code))})
      AND l."status"='ACTIVE' AND l."quantity">0 AND l."expireDate">=CURRENT_DATE
    ORDER BY l."expireDate" ASC,l."receivedDate" ASC,l."id" ASC
  `;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const grouped = new Map<string, ProductLotSummary[]>();
  for (const row of rows) {
    const expireDate = row.expireDate.toISOString();
    const daysRemaining = Math.ceil((row.expireDate.getTime() - today.getTime()) / 86400000);
    grouped.set(row.productCode, [...(grouped.get(row.productCode) ?? []), { id: row.id.toString(), lotNo: row.lotNo, expireDate, quantity: Number(row.quantity), daysRemaining, promotion: row.promotionType ? { type: row.promotionType, value: Number(row.promotionValue ?? 0), endsAt: row.promotionEndsAt?.toISOString() ?? null } : null }]);
  }
  return items.map((item) => ({ ...item, lots: grouped.get(item.code) ?? [] }));
}

type ProductLotSummary = { id: string; lotNo: string; expireDate: string; quantity: number; daysRemaining: number; promotion: { type: string; value: number; endsAt: string|null } | null };

async function addMovementNote(id: bigint, note: string | null, tx: Prisma.TransactionClient) {
  if (note) await tx.$executeRaw`UPDATE "stock_movements" SET "note" = ${note} WHERE "id" = ${id}`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const historyCode = url.searchParams.get("history")?.trim();
  const exactCode = url.searchParams.get("code")?.trim();
  const barcode = url.searchParams.get("barcode")?.trim();
  const includeLots = url.searchParams.get("lots") === "true";
  const search = url.searchParams.get("search")?.trim();
  const categoryId = url.searchParams.get("categoryId")?.trim();
  const status = url.searchParams.get("status") ?? "active";
  const page = positiveInteger(url.searchParams.get("page"), 1);
  const limit = Math.min(positiveInteger(url.searchParams.get("limit"), 50), 100);

  try {
    if (historyCode) {
      const rows = await prisma.$queryRaw<Array<{
        id: bigint; quantityIn: Prisma.Decimal; unitCost: Prisma.Decimal; balance: Prisma.Decimal;
        actor: string | null; occurredAt: Date | null; status: string | null; note: string | null;
      }>>`
        SELECT "id", "quantityIn", "unitCost", "balance", "actor", "occurredAt", "status", "note"
        FROM "stock_movements" WHERE "productCode" = ${historyCode}
        ORDER BY "occurredAt" DESC NULLS LAST, "id" DESC LIMIT 100
      `;
      return Response.json({ items: rows.map((row) => ({ ...row, id: row.id.toString(), quantity: Number(row.quantityIn), unitCost: Number(row.unitCost), balance: Number(row.balance), occurredAt: row.occurredAt?.toISOString() ?? null })) });
    }

    if (exactCode || barcode) {
      const unitMatch = barcode ? await prisma.$queryRaw<Array<{ productCode: string }>>`
        SELECT u."productCode" FROM "product_barcodes" b
        JOIN "product_units" u ON u."id"=b."productUnitId"
        WHERE b."barcode"=${barcode} AND b."active"=true AND u."active"=true LIMIT 1` : [];
      const row = await prisma.product.findFirst({
        where: { code: exactCode ?? unitMatch[0]?.productCode ?? "__BARCODE_NOT_FOUND__", ...(barcode ? { inactive: false } : {}) }, select: productSelect,
      });
      const unitItems = row ? await withUnits([serializeProduct(row)], barcode ?? undefined) : [];
      const items = includeLots ? await withLots(unitItems) : unitItems;
      return Response.json({ source: "postgresql", items, page: 1, limit: 1, total: items.length, totalPages: items.length, hasNext: false });
    }

    const barcodeCodes = search ? await prisma.$queryRaw<Array<{ productCode: string }>>`
      SELECT DISTINCT u."productCode" FROM "product_barcodes" b JOIN "product_units" u ON u."id"=b."productUnitId"
      WHERE b."barcode" ILIKE ${`%${search}%`} LIMIT 200` : [];
    const where: Prisma.ProductWhereInput = {
      ...(status === "inactive" ? { inactive: true } : status === "all" ? {} : { inactive: false }),
      ...(categoryId ? { categoryId } : {}),
      ...(search ? { OR: [{ code: { contains: search, mode: "insensitive" } }, { name: { contains: search, mode: "insensitive" } }, { alternateName: { contains: search, mode: "insensitive" } }, { code: { in: barcodeCodes.map((row) => row.productCode) } }] } : {}),
    };
    const [rows, total] = await prisma.$transaction([
      prisma.product.findMany({ where, select: productSelect, orderBy: [{ name: "asc" }], skip: (page - 1) * limit, take: limit }),
      prisma.product.count({ where }),
    ]);
    const totalPages = Math.ceil(total / limit);
    return Response.json({ source: "postgresql", items: await withUnits(rows.map(serializeProduct)), page, limit, total, totalPages, hasNext: page < totalPages });
  } catch (error) {
    console.error("Product query failed", error);
    return Response.json({ source: "unavailable", items: [], message: "Database is not available" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as ProductInput;
    const generatedCodes = await prisma.$queryRaw<Array<{ code: string }>>`
      WITH n AS (SELECT NEXTVAL('product_sku_seq')::text value)
      SELECT 'P' || CASE WHEN LENGTH(value)<6 THEN LPAD(value,6,'0') ELSE value END code FROM n`;
    const data = validatedProduct({ ...body, code: generatedCodes[0].code }, true);
    const primaryBarcode = body.barcode?.trim() || data.code;
    if (primaryBarcode.length > 50) throw new ProductError("Barcode ต้องมีความยาวไม่เกิน 50 ตัวอักษร");
    const initialQuantity = data.quantity ?? 0;
    const product = await prisma.$transaction(async (tx) => {
      const created = await tx.product.create({ data: { ...data, quantity: initialQuantity, addedBy: "Administrator" }, select: productSelect });
      const units = await tx.$queryRaw<Array<{ id: bigint }>>`INSERT INTO "product_units" ("productCode","name","barcode","conversionRate","salePrice","purchaseCost","isBase","canSell","canPurchase","active","updatedAt") VALUES (${data.code},${data.unit},${primaryBarcode},1,${data.price},${data.cost},true,true,true,true,NOW()) RETURNING "id"`;
      await tx.$executeRaw`INSERT INTO "product_barcodes" ("productUnitId","barcode","isPrimary","active","updatedAt") VALUES (${units[0].id},${primaryBarcode},true,true,NOW())`;
      if (initialQuantity > 0) {
        const movement = await tx.stockMovement.create({ data: { productCode: data.code, productName: data.name, quantityIn: initialQuantity, unitCost: data.cost, balance: initialQuantity, actor: "Administrator", occurredAt: new Date(), status: "A" } });
        await addMovementNote(movement.id, "ยอดสต็อกเริ่มต้น", tx);
      }
      return created;
    });
    return Response.json({ product: (await withUnits([serializeProduct(product)]))[0] }, { status: 201 });
  } catch (error) {
    if (error instanceof ProductError) return Response.json({ message: error.message }, { status: error.status });
    const rawCode = error instanceof Prisma.PrismaClientKnownRequestError ? String(error.meta?.code ?? "") : "";
    if ((error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") || rawCode === "23505") return Response.json({ message: "รหัสสินค้า หรือ Barcode นี้มีอยู่แล้ว" }, { status: 409 });
    console.error("Create product failed", error);
    return Response.json({ message: "เพิ่มสินค้าไม่สำเร็จ" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json() as ProductPatch;
    const code = body.code?.trim();
    if (!code) throw new ProductError("กรุณาระบุรหัสสินค้า");

    if (body.action === "setActive") {
      if (typeof body.active !== "boolean") throw new ProductError("สถานะสินค้าไม่ถูกต้อง");
      const product = await prisma.product.update({ where: { code }, data: { inactive: !body.active }, select: productSelect });
      return Response.json({ product: serializeProduct(product) });
    }

    if (body.action === "adjustStock") {
      const adjustment = Number(body.adjustment);
      const reason = body.reason?.trim();
      if (!Number.isFinite(adjustment) || adjustment === 0) throw new ProductError("กรุณาระบุจำนวนปรับสต็อกที่ไม่เท่ากับ 0");
      if (!reason || reason.length < 3 || reason.length > 200) throw new ProductError("กรุณาระบุเหตุผล 3–200 ตัวอักษร");
      const product = await prisma.$transaction(async (tx) => {
        const current = await tx.product.findUnique({ where: { code }, select: { code: true, name: true, lotId: true, cost: true, quantity: true, category: { select: { name: true } } } });
        if (!current) throw new ProductError("ไม่พบสินค้า", 404);
        if (current.quantity.plus(adjustment).isNegative()) throw new ProductError(`สต็อกไม่เพียงพอ คงเหลือ ${current.quantity}`, 409);
        const updated = await tx.product.update({ where: { code }, data: { quantity: { increment: adjustment } }, select: productSelect });
        const movement = await tx.stockMovement.create({ data: { productCode: code, lotId: current.lotId, productName: current.name, categoryName: current.category?.name, quantityIn: adjustment, unitCost: current.cost, balance: updated.quantity, actor: "Administrator", occurredAt: new Date(), status: "A" } });
        await addMovementNote(movement.id, reason, tx);
        return updated;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return Response.json({ product: serializeProduct(product) });
    }

    const data = validatedProduct(body);
    const primaryBarcode = body.barcode?.trim();
    if (primaryBarcode !== undefined && (!primaryBarcode || primaryBarcode.length > 50)) throw new ProductError("กรุณาระบุ Barcode ไม่เกิน 50 ตัวอักษร");
    const { code: ignoredCode, ...updates } = data;
    void ignoredCode;
    const product = await prisma.$transaction(async (tx) => {
      const updated = await tx.product.update({ where: { code }, data: updates, select: productSelect });
      const baseUnits = await tx.$queryRaw<Array<{ id: bigint; barcode: string }>>`
        SELECT "id","barcode" FROM "product_units" WHERE "productCode"=${code} AND "isBase"=true FOR UPDATE`;
      if (!baseUnits.length) throw new ProductError("ไม่พบหน่วยหลักของสินค้า", 409);
      const base = baseUnits[0];
      if (primaryBarcode && primaryBarcode !== base.barcode) {
        const collisions = await tx.$queryRaw<Array<{ id: bigint }>>`
          SELECT b."id" FROM "product_barcodes" b WHERE b."barcode"=${primaryBarcode} AND b."productUnitId"<>${base.id}
          UNION ALL SELECT u."id" FROM "product_units" u WHERE u."barcode"=${primaryBarcode} AND u."id"<>${base.id} LIMIT 1`;
        if (collisions.length) throw new ProductError("Barcode นี้ถูกใช้กับสินค้าอื่นแล้ว", 409);
        await tx.$executeRaw`UPDATE "product_barcodes" SET "isPrimary"=false,"updatedAt"=NOW() WHERE "productUnitId"=${base.id} AND "isPrimary"=true`;
        const existing = await tx.$queryRaw<Array<{ id: bigint }>>`SELECT "id" FROM "product_barcodes" WHERE "barcode"=${primaryBarcode} AND "productUnitId"=${base.id}`;
        if (existing.length) await tx.$executeRaw`UPDATE "product_barcodes" SET "isPrimary"=true,"active"=true,"updatedAt"=NOW() WHERE "id"=${existing[0].id}`;
        else await tx.$executeRaw`INSERT INTO "product_barcodes" ("productUnitId","barcode","isPrimary","active","updatedAt") VALUES (${base.id},${primaryBarcode},true,true,NOW())`;
      }
      await tx.$executeRaw`UPDATE "product_units" SET "name"=${updates.unit},"barcode"=${primaryBarcode ?? base.barcode},"salePrice"=${updates.price},"purchaseCost"=${updates.cost},"updatedAt"=NOW() WHERE "id"=${base.id}`;
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return Response.json({ product: (await withUnits([serializeProduct(product)]))[0] });
  } catch (error) {
    if (error instanceof ProductError) return Response.json({ message: error.message }, { status: error.status });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") return Response.json({ message: "ไม่พบสินค้า" }, { status: 404 });
    const rawCode = error instanceof Prisma.PrismaClientKnownRequestError ? String(error.meta?.code ?? "") : "";
    if ((error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") || rawCode === "23505") return Response.json({ message: "Barcode นี้ถูกใช้แล้ว" }, { status: 409 });
    console.error("Update product failed", error);
    return Response.json({ message: "บันทึกสินค้าไม่สำเร็จ" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json() as { code?: string };
    const code = body.code?.trim();
    if (!code) throw new ProductError("กรุณาระบุรหัสสินค้า");

    const result = await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ code: string; name: string; quantity: Prisma.Decimal }>>`
        SELECT "code","name","quantity" FROM "products" WHERE "code"=${code} FOR UPDATE`;
      if (!rows.length) throw new ProductError("ไม่พบสินค้า", 404);

      const [counts] = await tx.$queryRaw<Array<{
        saleCount: bigint; purchaseCount: bigint; movementCount: bigint; lotCount: bigint;
      }>>`
        SELECT
          (SELECT COUNT(*) FROM "sale_items" WHERE "productCode"=${code}) "saleCount",
          (SELECT COUNT(*) FROM "purchase_receipt_items" WHERE "productCode"=${code}) "purchaseCount",
          (SELECT COUNT(*) FROM "stock_movements" WHERE "productCode"=${code}) "movementCount",
          (SELECT COUNT(*) FROM "inventory_lots" WHERE "productCode"=${code}) "lotCount"`;
      const hasHistory = Number(counts.saleCount) > 0 || Number(counts.purchaseCount) > 0 ||
        Number(counts.movementCount) > 0 || Number(counts.lotCount) > 0;

      if (!hasHistory && rows[0].quantity.eq(0)) {
        await tx.product.delete({ where: { code } });
        return { mode: "deleted", message: "ลบสินค้าออกจากระบบแล้ว" };
      }

      await tx.$executeRaw`UPDATE "products" SET "inactive"=true,"updatedAt"=NOW() WHERE "code"=${code}`;
      return {
        mode: "archived",
        message: "เก็บสินค้าเป็นรายการเก่าแล้ว เพื่อรักษาสต็อกและประวัติบิล",
        stock: Number(rows[0].quantity),
        history: {
          sales: Number(counts.saleCount), purchases: Number(counts.purchaseCount),
          movements: Number(counts.movementCount), lots: Number(counts.lotCount),
        },
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return Response.json(result);
  } catch (error) {
    if (error instanceof ProductError) return Response.json({ message: error.message }, { status: error.status });
    console.error("Delete product failed", error);
    return Response.json({ message: "ลบสินค้าไม่สำเร็จ" }, { status: 500 });
  }
}
