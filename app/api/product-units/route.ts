import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

class UnitError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

type UnitRow = {
  id: bigint; productCode: string; productName: string; baseUnit: string | null;
  stock: Prisma.Decimal; name: string; barcode: string; conversionRate: Prisma.Decimal;
  salePrice: Prisma.Decimal; purchaseCost: Prisma.Decimal | null; isBase: boolean;
  canSell: boolean; canPurchase: boolean; active: boolean;
};

type BarcodeRow = { id: bigint; productUnitId: bigint; barcode: string; isPrimary: boolean; active: boolean; note: string | null };

type MergeProduct = {
  code: string; name: string; unit: string | null; quantity: Prisma.Decimal;
  cost: Prisma.Decimal; price: Prisma.Decimal; trackExpiry: boolean; inactive: boolean;
};

type MergeLot = {
  id: bigint; lotNo: string; receivedDate: Date; manufacturedDate: Date | null;
  expireDate: Date; quantity: Prisma.Decimal;
};

const serialize = (unit: UnitRow, barcodes: BarcodeRow[]) => ({
  ...unit,
  id: unit.id.toString(),
  stock: Number(unit.stock),
  conversionRate: Number(unit.conversionRate),
  salePrice: Number(unit.salePrice),
  purchaseCost: unit.purchaseCost === null ? null : Number(unit.purchaseCost),
  wholeUnits: Math.floor(Number(unit.stock) / Number(unit.conversionRate)),
  barcodes: barcodes.map((row) => ({ ...row, id: row.id.toString(), productUnitId: row.productUnitId.toString() })),
});

function decimal(value: unknown, label: string, allowZero = false) {
  const number = Number(value);
  if (!Number.isFinite(number) || (allowZero ? number < 0 : number <= 0)) {
    throw new UnitError(`${label}ไม่ถูกต้อง`);
  }
  return new Prisma.Decimal(number);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const productCode = url.searchParams.get("productCode")?.trim();
  const search = url.searchParams.get("search")?.trim() ?? "";
  try {
    const rows = productCode
      ? await prisma.$queryRaw<UnitRow[]>`
          SELECT u."id",u."productCode",p."name" "productName",p."unit" "baseUnit",
            p."quantity" stock,u."name",u."barcode",u."conversionRate",u."salePrice",
            u."purchaseCost",u."isBase",u."canSell",u."canPurchase",u."active"
          FROM "product_units" u JOIN "products" p ON p."code"=u."productCode"
          WHERE u."productCode"=${productCode}
          ORDER BY u."isBase" DESC,u."conversionRate" ASC`
      : await prisma.$queryRaw<UnitRow[]>`
          SELECT u."id",u."productCode",p."name" "productName",p."unit" "baseUnit",
            p."quantity" stock,u."name",u."barcode",u."conversionRate",u."salePrice",
            u."purchaseCost",u."isBase",u."canSell",u."canPurchase",u."active"
          FROM "product_units" u JOIN "products" p ON p."code"=u."productCode"
          WHERE (${search}='' OR p."code" ILIKE ${`%${search}%`} OR p."name" ILIKE ${`%${search}%`} OR u."barcode" ILIKE ${`%${search}%`}
            OR EXISTS (SELECT 1 FROM "product_barcodes" b WHERE b."productUnitId"=u."id" AND b."barcode" ILIKE ${`%${search}%`}))
          ORDER BY p."name",u."isBase" DESC,u."conversionRate" LIMIT 1000`;
    const barcodeRows = rows.length ? await prisma.$queryRaw<BarcodeRow[]>(Prisma.sql`
      SELECT "id","productUnitId","barcode","isPrimary","active","note" FROM "product_barcodes"
      WHERE "productUnitId" IN (${Prisma.join(rows.map((row) => row.id))}) ORDER BY "isPrimary" DESC,"id" ASC`) : [];
    return Response.json({ items: rows.map((row) => serialize(row, barcodeRows.filter((barcode) => barcode.productUnitId === row.id))) });
  } catch (error) {
    console.error("Unit query failed", error);
    return Response.json({ message: "โหลดข้อมูลหน่วยสินค้าไม่สำเร็จ" }, { status: 500 });
  }
}

async function mergeExisting(body: Record<string, unknown>, tx: Prisma.TransactionClient) {
  const targetCode = String(body.productCode ?? "").trim();
  const sourceCode = String(body.sourceProductCode ?? "").trim();
  const unitName = String(body.name ?? "").trim();
  const conversion = decimal(body.conversionRate, "ตัวคูณ");
  if (!targetCode || !sourceCode || targetCode === sourceCode) throw new UnitError("กรุณาเลือกสินค้าชิ้นและสินค้าแพ็คให้ถูกต้อง");
  if (!unitName || unitName.length > 20) throw new UnitError("ชื่อหน่วยต้องมีความยาวไม่เกิน 20 ตัวอักษร");

  const products = await tx.$queryRaw<MergeProduct[]>(Prisma.sql`
    SELECT "code","name","unit","quantity","cost","price","trackExpiry","inactive"
    FROM "products" WHERE "code" IN (${Prisma.join([targetCode, sourceCode])}) FOR UPDATE`);
  const target = products.find((item) => item.code === targetCode);
  const source = products.find((item) => item.code === sourceCode);
  if (!target || !source) throw new UnitError("ไม่พบสินค้าที่ต้องการรวม", 404);
  if (source.inactive) throw new UnitError("สินค้าแพ็คต้นทางถูกปิดใช้งานอยู่");

  const sourceUnits = await tx.$queryRaw<Array<{
    id: bigint; name: string; barcode: string; salePrice: Prisma.Decimal;
    purchaseCost: Prisma.Decimal | null; isBase: boolean; active: boolean;
  }>>`SELECT "id","name","barcode","salePrice","purchaseCost","isBase","active"
      FROM "product_units" WHERE "productCode"=${sourceCode} FOR UPDATE`;
  const sourceBase = sourceUnits.find((unit) => unit.isBase);
  if (!sourceBase) throw new UnitError("สินค้าแพ็คไม่มีหน่วยหลัก กรุณาตรวจสอบข้อมูล", 409);
  if (sourceUnits.some((unit) => !unit.isBase && unit.active)) {
    throw new UnitError("สินค้าแพ็คต้นทางมีหลายหน่วย กรุณาปิดหน่วยเสริมก่อนรวม", 409);
  }

  const duplicate = await tx.$queryRaw<Array<{ id: bigint }>>`
    SELECT "id" FROM "product_units"
    WHERE "productCode"=${targetCode} AND "name"=${unitName} LIMIT 1`;
  if (duplicate.length) throw new UnitError("สินค้าชิ้นมีชื่อหน่วยนี้อยู่แล้ว", 409);

  const positiveLots = await tx.$queryRaw<MergeLot[]>`
    SELECT "id","lotNo","receivedDate","manufacturedDate","expireDate","quantity"
    FROM "inventory_lots" WHERE "productCode"=${sourceCode} AND "quantity">0 FOR UPDATE`;
  const lotQuantity = positiveLots.reduce((sum, lot) => sum.plus(lot.quantity), new Prisma.Decimal(0));
  if ((target.trackExpiry || source.trackExpiry) && !lotQuantity.eq(source.quantity)) {
    throw new UnitError("สต็อกสินค้าแพ็คกับยอด Lot ไม่ตรงกัน กรุณาปรับ Lot ให้ตรงก่อนรวม", 409);
  }

  const transferred = source.quantity.mul(conversion);
  const archivedBarcode = `MERGED-${sourceBase.id.toString()}`;
  await tx.$executeRaw`UPDATE "product_units" SET "barcode"=${archivedBarcode},"active"=false,
    "canSell"=false,"canPurchase"=false,"updatedAt"=NOW() WHERE "id"=${sourceBase.id}`;
  const created = await tx.$queryRaw<Array<{ id: bigint }>>`
    INSERT INTO "product_units" ("productCode","name","barcode","conversionRate","salePrice",
      "purchaseCost","isBase","canSell","canPurchase","active","updatedAt")
    VALUES (${targetCode},${unitName},${sourceBase.barcode},${conversion},${sourceBase.salePrice},
      ${sourceBase.purchaseCost ?? source.cost},false,true,true,true,NOW()) RETURNING "id"`;
  await tx.$executeRaw`UPDATE "product_barcodes" SET "productUnitId"=${created[0].id},"updatedAt"=NOW() WHERE "productUnitId"=${sourceBase.id}`;

  for (const lot of positiveLots) {
    const convertedLotQuantity = lot.quantity.mul(conversion);
    await tx.$executeRaw`
      INSERT INTO "inventory_lots" ("productCode","lotNo","receivedDate","manufacturedDate","expireDate",
        "initialQuantity","quantity","status","updatedAt")
      VALUES (${targetCode},${lot.lotNo},${lot.receivedDate},${lot.manufacturedDate},${lot.expireDate},
        ${convertedLotQuantity},${convertedLotQuantity},'ACTIVE',NOW())`;
    await tx.$executeRaw`UPDATE "inventory_lots" SET "quantity"=0,"status"='CLOSED',"updatedAt"=NOW() WHERE "id"=${lot.id}`;
  }

  await tx.$executeRaw`UPDATE "products" SET "quantity"="quantity"+${transferred},
    "trackExpiry"=("trackExpiry" OR ${source.trackExpiry}),"updatedAt"=NOW() WHERE "code"=${targetCode}`;
  await tx.$executeRaw`UPDATE "products" SET "quantity"=0,"inactive"=true,"updatedAt"=NOW() WHERE "code"=${sourceCode}`;

  if (!source.quantity.eq(0)) {
    const sourceMovement = await tx.stockMovement.create({ data: {
      productCode: sourceCode, productName: source.name, quantityIn: source.quantity.negated(),
      unitCost: source.cost, balance: 0, actor: "Administrator", occurredAt: new Date(), status: "A",
    } });
    const targetMovement = await tx.stockMovement.create({ data: {
      productCode: targetCode, productName: target.name, quantityIn: transferred,
      unitCost: target.cost, balance: target.quantity.plus(transferred), actor: "Administrator",
      occurredAt: new Date(), status: "A",
    } });
    await tx.$executeRaw`UPDATE "stock_movements" SET "note"=${`รวมเป็นหน่วย ${unitName} ของ ${targetCode}`} WHERE "id"=${sourceMovement.id}`;
    await tx.$executeRaw`UPDATE "stock_movements" SET "note"=${`รับโอนจาก ${sourceCode}: ${source.quantity} × ${conversion}`} WHERE "id"=${targetMovement.id}`;
  }

  return {
    merged: true,
    unitId: created[0].id.toString(),
    barcode: sourceBase.barcode,
    sourceQuantity: Number(source.quantity),
    transferredBaseQuantity: Number(transferred),
    sourceArchived: true,
  };
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return Response.json({ message: "ข้อมูลไม่ถูกต้อง" }, { status: 400 }); }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const action = String(body.action ?? "save");
      if (action === "mergeExisting") return mergeExisting(body, tx);

      const productCode = String(body.productCode ?? "").trim();
      if (!productCode) throw new UnitError("กรุณาเลือกสินค้า");
      if (action === "addBarcode") {
        const unitId = BigInt(String(body.unitId ?? 0));
        const barcode = String(body.barcode ?? "").trim();
        const note = String(body.note ?? "").trim().slice(0, 100) || null;
        if (!barcode || barcode.length > 50) throw new UnitError("กรุณาระบุ Barcode ไม่เกิน 50 ตัวอักษร");
        const units = await tx.$queryRaw<Array<{ id: bigint }>>`SELECT "id" FROM "product_units" WHERE "id"=${unitId} AND "productCode"=${productCode}`;
        if (!units.length) throw new UnitError("ไม่พบหน่วยสินค้า", 404);
        await tx.$executeRaw`INSERT INTO "product_barcodes" ("productUnitId","barcode","isPrimary","active","note","updatedAt") VALUES (${unitId},${barcode},false,true,${note},NOW())`;
        return { saved: true };
      }
      if (action === "toggleBarcode") {
        const barcodeId = BigInt(String(body.barcodeId ?? 0));
        const rows = await tx.$queryRaw<Array<{ isPrimary: boolean }>>`
          SELECT b."isPrimary" FROM "product_barcodes" b JOIN "product_units" u ON u."id"=b."productUnitId"
          WHERE b."id"=${barcodeId} AND u."productCode"=${productCode}`;
        if (!rows.length) throw new UnitError("ไม่พบ Barcode", 404);
        if (rows[0].isPrimary) throw new UnitError("ไม่สามารถปิด Barcode หลักได้ กรุณาเปลี่ยน Barcode หลักก่อน");
        await tx.$executeRaw`UPDATE "product_barcodes" SET "active"=${Boolean(body.active)},"updatedAt"=NOW() WHERE "id"=${barcodeId}`;
        return { saved: true };
      }
      if (action === "toggle") {
        const id = BigInt(String(body.id ?? 0));
        const rows = await tx.$queryRaw<Array<{ isBase: boolean }>>`
          SELECT "isBase" FROM "product_units" WHERE "id"=${id} AND "productCode"=${productCode}`;
        if (!rows.length) throw new UnitError("ไม่พบหน่วยสินค้า", 404);
        if (rows[0].isBase) throw new UnitError("ไม่สามารถปิดหน่วยหลักได้");
        await tx.$executeRaw`UPDATE "product_units" SET "active"=${Boolean(body.active)},"updatedAt"=NOW() WHERE "id"=${id}`;
        return { saved: true };
      }

      const id = body.id ? BigInt(String(body.id)) : null;
      const name = String(body.name ?? "").trim();
      const barcode = String(body.barcode ?? "").trim();
      const conversion = decimal(body.conversionRate, "ตัวคูณ");
      const salePrice = decimal(body.salePrice, "ราคาขาย", true);
      const purchaseCost = body.purchaseCost === "" || body.purchaseCost == null ? null : decimal(body.purchaseCost, "ต้นทุน", true);
      const canSell = body.canSell !== false;
      const canPurchase = body.canPurchase !== false;
      if (!name || name.length > 20 || !barcode || barcode.length > 50) throw new UnitError("กรุณาตรวจชื่อหน่วยและ Barcode");

      const collisions = await tx.$queryRaw<Array<{ id: bigint }>>`
        SELECT "id" FROM "product_units"
        WHERE ("barcode"=${barcode} OR ("productCode"=${productCode} AND "name"=${name}))
          AND (${id}::bigint IS NULL OR "id"<>${id})
        UNION ALL
        SELECT b."id" FROM "product_barcodes" b
        WHERE b."barcode"=${barcode} AND (${id}::bigint IS NULL OR b."productUnitId"<>${id}) LIMIT 1`;
      if (collisions.length) throw new UnitError("Barcode หรือชื่อหน่วยนี้มีอยู่แล้ว", 409);

      if (id) {
        const current = await tx.$queryRaw<Array<{ isBase: boolean; barcode: string }>>`
          SELECT "isBase","barcode" FROM "product_units" WHERE "id"=${id} AND "productCode"=${productCode}`;
        if (!current.length) throw new UnitError("ไม่พบหน่วยสินค้า", 404);
        if (current[0].isBase && !conversion.eq(1)) throw new UnitError("หน่วยหลักต้องมีตัวคูณ 1");
        if (barcode !== current[0].barcode) {
          await tx.$executeRaw`UPDATE "product_barcodes" SET "isPrimary"=false,"updatedAt"=NOW() WHERE "productUnitId"=${id} AND "isPrimary"=true`;
          const existingBarcode = await tx.$queryRaw<Array<{ id: bigint }>>`SELECT "id" FROM "product_barcodes" WHERE "productUnitId"=${id} AND "barcode"=${barcode}`;
          if (existingBarcode.length) await tx.$executeRaw`UPDATE "product_barcodes" SET "isPrimary"=true,"active"=true,"updatedAt"=NOW() WHERE "id"=${existingBarcode[0].id}`;
          else await tx.$executeRaw`INSERT INTO "product_barcodes" ("productUnitId","barcode","isPrimary","active","updatedAt") VALUES (${id},${barcode},true,true,NOW())`;
        }
        await tx.$executeRaw`UPDATE "product_units" SET "name"=${name},"barcode"=${barcode},
          "conversionRate"=${conversion},"salePrice"=${salePrice},"purchaseCost"=${purchaseCost},
          "canSell"=${canSell},"canPurchase"=${canPurchase},"updatedAt"=NOW() WHERE "id"=${id}`;
        if (current[0].isBase) await tx.$executeRaw`UPDATE "products" SET "unit"=${name},"price"=${salePrice},
          "cost"=COALESCE(${purchaseCost},"cost"),"updatedAt"=NOW() WHERE "code"=${productCode}`;
        return { saved: true };
      }

      const createdUnits = await tx.$queryRaw<Array<{ id: bigint }>>`INSERT INTO "product_units" ("productCode","name","barcode","conversionRate",
        "salePrice","purchaseCost","isBase","canSell","canPurchase","active","updatedAt")
        VALUES (${productCode},${name},${barcode},${conversion},${salePrice},${purchaseCost},false,${canSell},${canPurchase},true,NOW()) RETURNING "id"`;
      await tx.$executeRaw`INSERT INTO "product_barcodes" ("productUnitId","barcode","isPrimary","active","updatedAt") VALUES (${createdUnits[0].id},${barcode},true,true,NOW())`;
      return { saved: true };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return Response.json(result);
  } catch (error) {
    if (error instanceof UnitError) return Response.json({ message: error.message }, { status: error.status });
    const rawCode = error instanceof Prisma.PrismaClientKnownRequestError ? String(error.meta?.code ?? "") : "";
    if ((error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") || rawCode === "23505") {
      return Response.json({ message: "Barcode หรือชื่อหน่วยนี้มีอยู่แล้ว" }, { status: 409 });
    }
    console.error("Unit mutation failed", error);
    return Response.json({ message: "บันทึกหน่วยสินค้าไม่สำเร็จ" }, { status: 500 });
  }
}
