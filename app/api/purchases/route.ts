import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isPositivePurchaseNumber } from "@/lib/purchase-validation";

export const dynamic = "force-dynamic";
class ApiError extends Error { constructor(message: string, readonly status = 400) { super(message); } }
const num = (value: unknown) => Number(value ?? 0);
function generatedLot(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}${value("month")}${value("day")}`;
}

export async function GET() {
  try {
    const [receipts, suppliers, summary] = await Promise.all([
      prisma.purchaseReceipt.findMany({ where:{cancelled:false},take: 100, orderBy: [{ receivedAt: "desc" }, { id: "desc" }], select: { id: true, supplierCode: true, stockDate: true, deliveryNo: true, taxInvoiceNo: true, deliveryDate: true, vatAmount: true, total: true, receivedBy: true, receivedAt: true, status: true,cancelled:true, supplier: { select: { code: true, name: true } }, items: { select: { id: true, productCode: true, quantity: true, unitCost: true, unit: true,conversionRate:true,baseQuantity:true,productUnit:{select:{salePrice:true}} } } } }),
      prisma.supplier.findMany({ take: 500, orderBy: { name: "asc" }, select: { code: true, name: true, phone: true, creditDays: true, taxId: true } }),
      prisma.purchaseReceipt.aggregate({where:{cancelled:false}, _sum: { total: true }, _count: true }),
    ]);
    const codes = [...new Set(receipts.flatMap((r) => r.items.flatMap((i) => i.productCode ? [i.productCode] : [])))];
    const [products, lotRows] = await Promise.all([
      prisma.product.findMany({ where: { code: { in: codes } }, select: { code: true, name: true } }),
      prisma.$queryRaw<Array<{ purchaseItemId: bigint; lotNo: string; expireDate: Date }>>`SELECT "purchaseItemId","lotNo","expireDate" FROM "inventory_lots" WHERE "purchaseItemId" IS NOT NULL`,
    ]);
    const names = new Map(products.map((p) => [p.code, p.name])); const lots = new Map(lotRows.map((l) => [l.purchaseItemId, l]));
    return Response.json({ receipts: receipts.map((r) => ({ ...r, total: num(r.total), vatAmount: num(r.vatAmount), stockDate: r.stockDate?.toISOString() ?? null, receivedAt: r.receivedAt?.toISOString() ?? null, items: r.items.map((i) => ({ id: i.id.toString(), code: i.productCode, name: i.productCode ? names.get(i.productCode) ?? i.productCode : "-", quantity: num(i.quantity), unitCost: num(i.unitCost),unit:i.unit??"-",conversionRate:num(i.conversionRate),baseQuantity:num(i.baseQuantity),salePrice:i.productUnit?num(i.productUnit.salePrice):null, lotNo: lots.get(i.id)?.lotNo ?? null, expireDate: lots.get(i.id)?.expireDate.toISOString() ?? null })) })), suppliers, summary: { count: summary._count, total: num(summary._sum.total) } });
  } catch (error) { console.error("Purchase query failed", error); return Response.json({ message: "โหลดข้อมูลจัดซื้อไม่สำเร็จ" }, { status: 500 }); }
}

export async function DELETE(request:Request){
  const actor=request.headers.get("x-auth-user-name")??"Administrator";let body:{id?:string};try{body=await request.json()}catch{return Response.json({message:"ข้อมูลไม่ถูกต้อง"},{status:400})}const id=body.id?.trim();if(!id)return Response.json({message:"กรุณาระบุเลขที่รับเข้า"},{status:400});
  try{const result=await prisma.$transaction(async tx=>{const receipt=await tx.purchaseReceipt.findUnique({where:{id},select:{id:true,cancelled:true,items:{select:{id:true,productCode:true,baseQuantity:true,quantity:true,conversionRate:true}}}});if(!receipt)throw new ApiError("ไม่พบเอกสารรับเข้า",404);if(receipt.cancelled)throw new ApiError("เอกสารนี้ถูกลบแล้ว",409);if(!receipt.items.length)throw new ApiError("เอกสารนี้ไม่มีรายการสินค้า",409);
    const codes=[...new Set(receipt.items.flatMap(item=>item.productCode?[item.productCode]:[]))];const products=await tx.$queryRaw<Array<{code:string;name:string;quantity:Prisma.Decimal;cost:Prisma.Decimal;lotId:string|null;categoryName:string|null}>>(Prisma.sql`SELECT p."code",p."name",p."quantity",p."cost",p."lotId",c."name" "categoryName" FROM "products" p LEFT JOIN "product_categories" c ON c.id=p."categoryId" WHERE p."code" IN (${Prisma.join(codes)}) FOR UPDATE OF p`);const byCode=new Map(products.map(product=>[product.code,product]));
    const quantityByCode=new Map<string,Prisma.Decimal>();for(const item of receipt.items){if(!item.productCode||!byCode.has(item.productCode))throw new ApiError("มีสินค้าบางรายการที่ไม่สามารถย้อนสต็อกได้",409);const base=item.baseQuantity.gt(0)?item.baseQuantity:item.quantity.mul(item.conversionRate);quantityByCode.set(item.productCode,(quantityByCode.get(item.productCode)??new Prisma.Decimal(0)).plus(base))}
    for(const[code,quantity]of quantityByCode){const product=byCode.get(code)!;if(product.quantity.lt(quantity))throw new ApiError(`สต็อก ${product.name} คงเหลือไม่พอสำหรับลบเอกสารนี้`,409)}
    const lots=await tx.$queryRaw<Array<{id:bigint;productCode:string;initialQuantity:Prisma.Decimal;quantity:Prisma.Decimal}>>`SELECT l."id",l."productCode",l."initialQuantity",l."quantity" FROM "inventory_lots" l WHERE l."purchaseItemId" IN (SELECT id FROM "purchase_receipt_items" WHERE "receiptId"=${id}) FOR UPDATE`;
    const usedLot=lots.find(lot=>!lot.quantity.eq(lot.initialQuantity));if(usedLot)throw new ApiError(`Lot ของสินค้า ${byCode.get(usedLot.productCode)?.name??usedLot.productCode} ถูกนำไปขายหรือปรับแล้ว จึงลบเอกสารไม่ได้`,409);
    const now=new Date();for(const[code,quantity]of quantityByCode){const product=byCode.get(code)!;const updated=await tx.product.update({where:{code},data:{quantity:{decrement:quantity}},select:{quantity:true}});const movement=await tx.stockMovement.create({data:{productCode:code,lotId:product.lotId,productName:product.name,categoryName:product.categoryName,quantityIn:quantity.negated(),unitCost:product.cost,balance:updated.quantity,actor,occurredAt:now,status:"X"}});await tx.$executeRaw`UPDATE "stock_movements" SET "note"=${`ลบเอกสารรับเข้า ${id}`} WHERE "id"=${movement.id}`}
    if(lots.length)await tx.$executeRaw`UPDATE "inventory_lots" SET "quantity"=0,"status"='CANCELLED',"updatedAt"=NOW() WHERE "purchaseItemId" IN (SELECT id FROM "purchase_receipt_items" WHERE "receiptId"=${id})`;
    const claimed=await tx.$executeRaw`UPDATE "purchase_receipts" SET "cancelled"=true,"status"='X',"cancelReason"='ลบเอกสารรับเข้าจากหน้าจัดซื้อ' WHERE "id"=${id} AND "cancelled"=false`;if(claimed!==1)throw new ApiError("เอกสารนี้ถูกลบแล้ว",409);return{id};
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:15000});return Response.json({receipt:result,message:"ลบเอกสารและย้อนสต็อกเรียบร้อยแล้ว"})}catch(error){if(error instanceof ApiError)return Response.json({message:error.message},{status:error.status});console.error("Delete purchase failed",error);return Response.json({message:"ลบเอกสารรับเข้าไม่สำเร็จ"},{status:500})}
}

type InputRow = { code?: string; quantity?: number; unitCost?: number; salePrice?: number; unitId?: string|null; lotNo?: string; manufacturedDate?: string; expireDate?: string };
export async function POST(request: Request) {
  let body: { supplierCode?: string; deliveryNo?: string; taxInvoiceNo?: string; vatAmount?: number; items?: InputRow[] };
  try { body = await request.json(); } catch { return Response.json({ message: "ข้อมูลไม่ถูกต้อง" }, { status: 400 }); }
  const supplierCode = body.supplierCode?.trim(); if (!supplierCode) return Response.json({ message: "กรุณาเลือกผู้จำหน่าย" }, { status: 400 });
  if (!Array.isArray(body.items) || !body.items.length || body.items.some(row => !row || !isPositivePurchaseNumber(row.quantity) || !isPositivePurchaseNumber(row.unitCost) || !isPositivePurchaseNumber(row.salePrice))) {
    return Response.json({ message: "จำนวน ราคาทุน และราคาขายต้องเป็นตัวเลขมากกว่า 0" }, { status: 400 });
  }
  const rows = (body.items ?? []).map((row) => ({ code: row.code?.trim() ?? "", unitId:row.unitId?BigInt(row.unitId):null,quantity: new Prisma.Decimal(num(row.quantity)), unitCost: new Prisma.Decimal(num(row.unitCost)),salePrice:row.salePrice===undefined||row.salePrice===null?null:new Prisma.Decimal(num(row.salePrice)), lotNo: row.lotNo?.trim() || generatedLot(), manufacturedDate: null, expireDate: row.expireDate ? new Date(`${row.expireDate}T00:00:00+07:00`) : null }));
  if (!rows.length || rows.some((r) => !r.code || r.quantity.lte(0) || r.unitCost.lt(0)||(r.salePrice?.lt(0)??false))) return Response.json({ message: "กรุณาตรวจสินค้า จำนวน ราคาทุน และราคาขาย" }, { status: 400 });
  try {
    const receipt = await prisma.$transaction(async (tx) => {
      if (!await tx.supplier.findUnique({ where: { code: supplierCode } })) throw new ApiError("ไม่พบผู้จำหน่าย", 404);
      const codes = [...new Set(rows.map((r) => r.code))];
      const products = await tx.product.findMany({ where: { code: { in: codes } }, include: { category: true } }); const byCode = new Map(products.map((p) => [p.code, p]));
      const missing = codes.find((code) => !byCode.has(code)); if (missing) throw new ApiError(`ไม่พบสินค้า ${missing}`, 404);
      const settings = await tx.$queryRaw<Array<{ code: string; trackExpiry: boolean; shelfLifeDays: number | null }>>`SELECT "code","trackExpiry","shelfLifeDays" FROM "products" WHERE "code" IN (${Prisma.join(codes)})`; const settingByCode = new Map(settings.map((s) => [s.code, s]));
      type UnitRow={id:bigint;productCode:string;name:string;conversionRate:Prisma.Decimal;salePrice:Prisma.Decimal;purchaseCost:Prisma.Decimal|null;isBase:boolean};const unitRows=await tx.$queryRaw<UnitRow[]>(Prisma.sql`SELECT "id","productCode","name","conversionRate","salePrice","purchaseCost","isBase" FROM "product_units" WHERE "productCode" IN (${Prisma.join(codes)}) AND "active"=true AND "canPurchase"=true ORDER BY "isBase" DESC`);const unitsByProduct=new Map<string,UnitRow[]>();for(const unit of unitRows)unitsByProduct.set(unit.productCode,[...(unitsByProduct.get(unit.productCode)??[]),unit]);
      const seq = await tx.$queryRaw<Array<{ value: bigint }>>`SELECT nextval('purchase_number_seq') AS value`; const now = new Date(); const id = `PR${now.toISOString().slice(2, 10).replaceAll("-", "")}${seq[0].value.toString().padStart(5, "0")}`;
      const subtotal = rows.reduce((sum, row) => sum.plus(row.quantity.mul(row.unitCost)), new Prisma.Decimal(0)); const vatAmount = new Prisma.Decimal(num(body.vatAmount));
      const created = await tx.purchaseReceipt.create({ data: { id, supplierCode, stockDate: now, deliveryNo: body.deliveryNo?.trim() || null, taxInvoiceNo: body.taxInvoiceNo?.trim() || null, vatType: "I", vatAmount, total: subtotal.plus(vatAmount), receivedBy: "Administrator", receivedAt: now, status: "C" } });
      for (const row of rows) {
        const p = byCode.get(row.code)!; const setting = settingByCode.get(row.code);const availableUnits=unitsByProduct.get(row.code)??[];const unit=row.unitId?availableUnits.find(u=>u.id===row.unitId):availableUnits[0];if(!unit)throw new ApiError(`หน่วยที่สแกนของ ${p.name} ไม่อนุญาตให้รับเข้า`,409); const baseQuantity=row.quantity.mul(unit.conversionRate);let expireDate = row.expireDate;
        if (!expireDate && row.manufacturedDate && setting?.shelfLifeDays) { expireDate = new Date(row.manufacturedDate); expireDate.setUTCDate(expireDate.getUTCDate() + setting.shelfLifeDays); }
        if (setting?.trackExpiry && (!row.lotNo || !expireDate)) throw new ApiError(`สินค้า ${p.name} ต้องระบุ Lot และวันหมดอายุ`);
        const item = await tx.purchaseReceiptItem.create({ data: { receiptId: id, productCode: row.code, lotId: p.lotId, quantity: row.quantity, unit: unit.name, unitCost: row.unitCost, discount: 0 } });await tx.$executeRaw`UPDATE "purchase_receipt_items" SET "productUnitId"=${unit.id},"conversionRate"=${unit.conversionRate},"baseQuantity"=${baseQuantity} WHERE "id"=${item.id}`;
        const effectiveSalePrice=row.salePrice??unit.salePrice;await tx.$executeRaw`UPDATE "product_units" SET "purchaseCost"=${row.unitCost},"salePrice"=${effectiveSalePrice},"updatedAt"=NOW() WHERE "id"=${unit.id}`;
        if (row.lotNo && expireDate) { await tx.$executeRaw`INSERT INTO "inventory_lots" ("productCode","purchaseItemId","lotNo","receivedDate","manufacturedDate","expireDate","initialQuantity","quantity","status","updatedAt") VALUES (${row.code},${item.id},${row.lotNo},${now},${row.manufacturedDate},${expireDate},${baseQuantity},${baseQuantity},'ACTIVE',NOW())`; await tx.$executeRaw`UPDATE "products" SET "trackExpiry"=true WHERE "code"=${row.code}`; }
        const baseCost=row.unitCost.div(unit.conversionRate);const updated = await tx.product.update({ where: { code: row.code }, data: { quantity: { increment: baseQuantity }, cost: baseCost }, select: { quantity: true } });
        if(unit.isBase)await tx.$executeRaw`UPDATE "products" SET "price"=${effectiveSalePrice},"updatedAt"=NOW() WHERE "code"=${row.code}`;
        const movement = await tx.stockMovement.create({ data: { productCode: row.code, lotId: p.lotId, productName: p.name, categoryName: p.category?.name, quantityIn: baseQuantity, unitCost: baseCost, balance: updated.quantity, actor: "Administrator", occurredAt: now, status: "P" } });
        await tx.$executeRaw`UPDATE "stock_movements" SET "note"=${`รับสินค้า ${id}${row.lotNo ? ` Lot ${row.lotNo}` : ""}`} WHERE "id"=${movement.id}`;
      }
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15000 });
    return Response.json({ receipt: { id: receipt.id, total: num(receipt.total) } }, { status: 201 });
  } catch (error) { if (error instanceof ApiError) return Response.json({ message: error.message }, { status: error.status }); console.error("Create purchase failed", error); return Response.json({ message: "บันทึกรับสินค้าไม่สำเร็จ" }, { status: 500 }); }
}
