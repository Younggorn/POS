import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PAYMENT_METHODS, salePaymentType, validatePayments, type PaymentInput, type ValidatedPayment } from "@/lib/payments";

export const dynamic = "force-dynamic";

type SaleRequest = {
  paymentMethod?: "cash" | "transfer" | "card";
  payments?: PaymentInput[];
  customerCode?: string | null;
  items?: Array<{ code?: string; qty?: number; unitId?: string | null; lotId?: string | null; scannedBarcode?: string | null }>;
};

type CancelRequest = { id?: string; reason?: string };

class SaleError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

const normalizePaymentType = (value: string | null) => value === "0" ? "C" : value === "2" ? "T" : value;

function bangkokDateCode(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}${value.month}${value.day}`;
}

function roundMoney(value: Prisma.Decimal) {
  return value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

async function insertSalePayments(tx: Prisma.TransactionClient, saleId: string, payments: ValidatedPayment[]) {
  await tx.salePayment.createMany({ data: payments.map((payment) => ({ saleId, ...payment })) });
}

async function createMultiUnitSale(body:SaleRequest,actor:string){
  const requested=new Map<string,{unitId:bigint;code:string;qty:number;lotId:string|null;scannedBarcode:string|null}>();
  for(const item of body.items??[]){const unitId=BigInt(item.unitId??"0"),code=item.code?.trim()??"",qty=Number(item.qty),lotId=item.lotId?.trim()||null;if(unitId<=0||!code||!Number.isInteger(qty)||qty<=0||qty>9999||lotId&&!/^\d+$/.test(lotId))throw new SaleError("รายการสินค้า หน่วย Lot หรือจำนวนไม่ถูกต้อง");const key=`${unitId.toString()}:${lotId??"auto"}`,old=requested.get(key);requested.set(key,{unitId,code,qty:(old?.qty??0)+qty,lotId,scannedBarcode:item.scannedBarcode?.trim()||old?.scannedBarcode||null})}
  if(!requested.size||requested.size>200)throw new SaleError("กรุณาเพิ่มสินค้าอย่างน้อย 1 รายการ");
  return prisma.$transaction(async tx=>{const now=new Date();
    const customerCode=body.customerCode?.trim()||null;const customer=customerCode?await tx.customer.findUnique({where:{code:customerCode},select:{code:true,priceLevel:true}}):null;if(customerCode&&!customer)throw new SaleError("ไม่พบลูกค้าที่เลือก",404);const priceLevel=customer?.priceLevel??0;
    type UnitRow={id:bigint;productCode:string;unitName:string;barcode:string;conversionRate:Prisma.Decimal;salePrice:Prisma.Decimal;price1:Prisma.Decimal;price2:Prisma.Decimal;price3:Prisma.Decimal;price4:Prisma.Decimal;productName:string;baseStock:Prisma.Decimal;baseUnit:string|null;baseCost:Prisma.Decimal;lotId:string|null;categoryName:string|null;trackExpiry:boolean};
    const unitIds=[...new Set([...requested.values()].map(row=>row.unitId.toString()))].map(value=>BigInt(value));
    const units=await tx.$queryRaw<UnitRow[]>(Prisma.sql`SELECT u."id",u."productCode",u."name" "unitName",u."barcode",u."conversionRate",u."salePrice",p."price1",p."price2",p."price3",p."price4",p."name" "productName",p."quantity" "baseStock",p."unit" "baseUnit",p."cost" "baseCost",p."lotId",c."name" "categoryName",p."trackExpiry" FROM "product_units" u JOIN "products" p ON p."code"=u."productCode" LEFT JOIN "product_categories" c ON c."id"=p."categoryId" WHERE u."id" IN (${Prisma.join(unitIds)}) AND u."active"=true AND u."canSell"=true AND p."inactive"=false FOR UPDATE OF p`);
    const unitPrice=(unit:UnitRow)=>{const tier=[null,unit.price1,unit.price2,unit.price3,unit.price4][priceLevel];return tier&&tier.gt(0)?tier.mul(unit.conversionRate):unit.salePrice};
    const byId=new Map(units.map(u=>[u.id,u]));if(units.length!==unitIds.length)throw new SaleError("มีหน่วยสินค้าที่ไม่พร้อมขาย กรุณาโหลดรายการใหม่",409);
    const baseByProduct=new Map<string,Prisma.Decimal>();for(const row of requested.values()){const unit=byId.get(row.unitId)!;if(unit.productCode!==row.code)throw new SaleError("หน่วยสินค้าไม่ตรงกับสินค้า",409);const base=unit.conversionRate.mul(row.qty);baseByProduct.set(row.code,(baseByProduct.get(row.code)??new Prisma.Decimal(0)).plus(base))}
    const availableLots=new Map<string,Array<{id:bigint;quantity:Prisma.Decimal;discountType:string|null;discountValue:Prisma.Decimal|null}>>();
    for(const unit of units.filter((u,i,a)=>u.trackExpiry&&a.findIndex(x=>x.productCode===u.productCode)===i)){const lots=await tx.$queryRaw<Array<{id:bigint;quantity:Prisma.Decimal;discountType:string|null;discountValue:Prisma.Decimal|null}>>`SELECT l."id",l."quantity",promo."discountType",promo."discountValue" FROM "inventory_lots" l LEFT JOIN LATERAL (SELECT "discountType","discountValue" FROM "inventory_lot_promotions" WHERE "lotId"=l."id" AND "active"=true AND "startsAt"<=NOW() AND ("endsAt" IS NULL OR "endsAt">=NOW()) ORDER BY "createdAt" DESC,"id" DESC LIMIT 1) promo ON true WHERE l."productCode"=${unit.productCode} AND l."status"='ACTIVE' AND l."quantity">0 AND l."expireDate">=CURRENT_DATE ORDER BY l."expireDate","receivedDate","id" FOR UPDATE`;availableLots.set(unit.productCode,lots)}
    const pricing=new Map<string,{unitPrice:Prisma.Decimal;unitDiscount:Prisma.Decimal}>();
    const seq=await tx.$queryRaw<Array<{value:bigint}>>`SELECT nextval('sale_number_seq') AS value`;const id=`S${bangkokDateCode(now)}${seq[0].value.toString().padStart(6,"0")}`;let subtotal=new Prisma.Decimal(0),discountAmount=new Prisma.Decimal(0);
    const setting=await tx.shopSetting.findUnique({where:{id:1},select:{vatRate:true}});const vatRate=setting?.vatRate??new Prisma.Decimal(7);
    for(const[key,row]of requested){const unit=byId.get(row.unitId)!;const normal=unitPrice(unit);const lots=availableLots.get(unit.productCode)??[];const chosen=row.lotId?lots.find(lot=>lot.id.toString()===row.lotId):(lots.length===1?lots[0]:null);let unitDiscount=new Prisma.Decimal(0);if(chosen?.discountType){const baseDiscount=chosen.discountType==="percent"?normal.div(unit.conversionRate).mul(chosen.discountValue??0).div(100):normal.div(unit.conversionRate).minus(chosen.discountValue??0);const calculated=baseDiscount.mul(unit.conversionRate);unitDiscount=calculated.gt(0)?calculated:new Prisma.Decimal(0)}pricing.set(key,{unitPrice:normal,unitDiscount});const qty=new Prisma.Decimal(row.qty);subtotal=subtotal.plus(normal.mul(qty));discountAmount=discountAmount.plus(unitDiscount.mul(qty))}subtotal=roundMoney(subtotal);discountAmount=roundMoney(discountAmount);const total=roundMoney(subtotal.minus(discountAmount));const vatAmount=roundMoney(total.mul(vatRate).div(new Prisma.Decimal(100).plus(vatRate)));
    let payments:ValidatedPayment[];try{payments=validatePayments(body.payments,total,body.paymentMethod)}catch(error){throw new SaleError(error instanceof Error?error.message:"ข้อมูลการชำระเงินไม่ถูกต้อง")}
    await tx.sale.create({data:{id,invoiceNo:id,customerCode:customer?.code??null,paymentType:salePaymentType(payments),discountAmount,vatType:"I",vatAmount,subtotal,total,soldBy:actor,soldAt:now,status:"C"}});
    await insertSalePayments(tx,id,payments);
    const allocationPlans=new Map<string,Array<{lotId:bigint;quantity:Prisma.Decimal}>>();
    for(const[key,row]of requested){const unit=byId.get(row.unitId)!;if(!unit.trackExpiry)continue;const baseQty=unit.conversionRate.mul(row.qty),lots=availableLots.get(unit.productCode)??[];let remaining=baseQty;const plan:Array<{lotId:bigint;quantity:Prisma.Decimal}>=[];
      if(row.lotId){const lot=lots.find(item=>item.id.toString()===row.lotId);if(lot){const used=Prisma.Decimal.min(remaining,lot.quantity);if(used.gt(0)){lot.quantity=lot.quantity.minus(used);plan.push({lotId:lot.id,quantity:used});remaining=remaining.minus(used)}}}
      else for(const lot of lots){if(remaining.lte(0))break;const used=Prisma.Decimal.min(remaining,lot.quantity);if(used.lte(0))continue;lot.quantity=lot.quantity.minus(used);remaining=remaining.minus(used);plan.push({lotId:lot.id,quantity:used})}
      allocationPlans.set(key,plan);
    }
    for(const[key,row]of requested){const unit=byId.get(row.unitId)!;const saleQty=new Prisma.Decimal(row.qty),baseQty=unit.conversionRate.mul(saleQty),linePricing=pricing.get(key)!;const item=await tx.saleItem.create({data:{saleId:id,productCode:unit.productCode,lotId:unit.lotId,quantity:saleQty,unit:unit.unitName,unitPrice:linePricing.unitPrice,unitCost:unit.baseCost.mul(unit.conversionRate),unitDiscount:linePricing.unitDiscount,promotionStatus:linePricing.unitDiscount.gt(0)?"P":null}});await tx.$executeRaw`UPDATE "sale_items" SET "productUnitId"=${row.unitId},"conversionRate"=${unit.conversionRate},"baseQuantity"=${baseQty},"scannedBarcode"=${row.scannedBarcode} WHERE "id"=${item.id}`;
      for(const allocation of allocationPlans.get(key)??[]){await tx.$executeRaw`UPDATE "inventory_lots" SET "quantity"="quantity"-${allocation.quantity},"status"=CASE WHEN "quantity"-${allocation.quantity}=0 THEN 'CLOSED' ELSE "status" END,"updatedAt"=NOW() WHERE "id"=${allocation.lotId}`;await tx.$executeRaw`INSERT INTO "sale_lot_allocations" ("saleItemId","lotId","quantity") VALUES (${item.id},${allocation.lotId},${allocation.quantity})`}
    }
    for(const[code,baseQty]of baseByProduct){const unit=units.find(u=>u.productCode===code)!;const updated=await tx.product.update({where:{code},data:{quantity:{decrement:baseQty}},select:{quantity:true}});await tx.stockMovement.create({data:{productCode:code,lotId:unit.lotId,productName:unit.productName,categoryName:unit.categoryName,quantityIn:baseQty.negated(),unitCost:unit.baseCost,balance:updated.quantity,actor,occurredAt:now,status:"S"}})}
    const shifts=await tx.$queryRaw<Array<{id:number}>>`SELECT "id" FROM "cash_shifts" WHERE "status"='OPEN' ORDER BY "openedAt" DESC LIMIT 1`;if(shifts[0])await tx.$executeRaw`UPDATE "sales" SET "shiftId"=${shifts[0].id} WHERE "id"=${id}`;
    return{id,invoiceNo:id,subtotal:Number(subtotal),vatAmount:Number(vatAmount),total:Number(total),soldAt:now.toISOString()}
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:15000})
}

function positiveInteger(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function dateBoundary(value: string | null, nextDay = false) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00+07:00`);
  if (Number.isNaN(date.getTime())) return null;
  if (nextDay) date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id")?.trim();

  try {
    if (id) {
      const [sale, shop, cancellationRows] = await Promise.all([
        prisma.sale.findUnique({
          where: { id },
          select: {
            id: true, invoiceNo: true, paymentType: true, subtotal: true, discountAmount: true,
            vatAmount: true, total: true, soldBy: true, soldAt: true, cancelled: true,
            customer: { select: { code: true, name: true, address1: true, address2: true, taxId: true } },
            items: { select: { id: true, productCode: true, quantity: true, unit: true, unitPrice: true, unitDiscount: true, lotAllocations: { select: { quantity: true, lot: { select: { id: true, lotNo: true, expireDate: true } } } } } },
            payments: { select: { method: true, amount: true, receivedAmount: true, changeAmount: true, reference: true }, orderBy: { id: "asc" } },
          },
        }),
        prisma.shopSetting.findUnique({ where: { id: 1 } }),
        prisma.$queryRaw<Array<{ cancelReason: string | null; cancelledAt: Date | null; cancelledBy: string | null }>>`
          SELECT "cancelReason", "cancelledAt", "cancelledBy" FROM "sales" WHERE "id" = ${id}
        `,
      ]);
      if (!sale) return Response.json({ message: "ไม่พบบิลขาย" }, { status: 404 });

      const returnedRows = await prisma.$queryRaw<Array<{ saleItemId: bigint; quantity: Prisma.Decimal }>>`SELECT "saleItemId",SUM("quantity") quantity FROM "sale_return_items" WHERE "saleItemId" IN (SELECT id FROM "sale_items" WHERE "saleId"=${id}) GROUP BY "saleItemId"`;
      const returnedByItem = new Map(returnedRows.map((row) => [row.saleItemId, Number(row.quantity)]));

      const codes = sale.items.flatMap((item) => item.productCode ? [item.productCode] : []);
      const products = await prisma.product.findMany({ where: { code: { in: codes } }, select: { code: true, name: true } });
      const names = new Map(products.map((product) => [product.code, product.name]));
      return Response.json({
        sale: {
          ...sale,
          paymentType: normalizePaymentType(sale.paymentType),
          customer: sale.customer?.code === "000000" ? null : sale.customer,
          cancelReason: cancellationRows[0]?.cancelReason ?? null,
          cancelledAt: cancellationRows[0]?.cancelledAt?.toISOString() ?? null,
          cancelledBy: cancellationRows[0]?.cancelledBy ?? null,
          subtotal: Number(sale.subtotal),
          discountAmount: Number(sale.discountAmount),
          vatAmount: Number(sale.vatAmount),
          total: Number(sale.total),
          payments: sale.payments.map((payment) => ({ ...payment, amount: Number(payment.amount), receivedAmount: payment.receivedAmount === null ? null : Number(payment.receivedAmount), changeAmount: payment.changeAmount === null ? null : Number(payment.changeAmount) })),
          items: sale.items.map((item) => ({
            id: item.id.toString(),
            code: item.productCode ?? "-",
            name: item.productCode ? names.get(item.productCode) ?? item.productCode : "สินค้าไม่ระบุ",
            quantity: Number(item.quantity),
            unit: item.unit ?? "ชิ้น",
            unitPrice: Number(item.unitPrice),
            unitDiscount: Number(item.unitDiscount),
            lineTotal: Number(item.unitPrice.mul(item.quantity).minus(item.unitDiscount.mul(item.quantity))),
            lots: item.lotAllocations.map((allocation) => ({ id: allocation.lot.id.toString(), lotNo: allocation.lot.lotNo, expireDate: allocation.lot.expireDate.toISOString(), quantity: Number(allocation.quantity) })),
            returnedQuantity: returnedByItem.get(item.id) ?? 0,
          })),
        },
        shop: shop ? { name: shop.name, address1: shop.address1, address2: shop.address2, phone: shop.phone, taxId: shop.taxId } : null,
      });
    }

    const search = url.searchParams.get("search")?.trim();
    const paymentType = url.searchParams.get("paymentType")?.trim();
    const dateFrom = dateBoundary(url.searchParams.get("dateFrom"));
    const dateTo = dateBoundary(url.searchParams.get("dateTo"), true);
    const page = positiveInteger(url.searchParams.get("page"), 1);
    const limit = Math.min(positiveInteger(url.searchParams.get("limit"), 20), 100);
    const where: Prisma.SaleWhereInput = {
      ...(search ? { OR: [
        { id: { contains: search, mode: "insensitive" } },
        { invoiceNo: { contains: search, mode: "insensitive" } },
        { customer: { name: { contains: search, mode: "insensitive" } } },
      ] } : {}),
      ...(paymentType && ["C", "T", "D", "M"].includes(paymentType)
        ? paymentType === "M"
          ? { paymentType: "M" }
          : { payments: { some: { method: paymentType === "C" ? "cash" : paymentType === "T" ? "transfer" : "card" } } }
        : {}),
      ...(dateFrom || dateTo ? { soldAt: { ...(dateFrom ? { gte: dateFrom } : {}), ...(dateTo ? { lt: dateTo } : {}) } } : {}),
    };
    const [rows, total] = await prisma.$transaction([
      prisma.sale.findMany({
        where,
        select: {
          id: true, invoiceNo: true, paymentType: true, total: true, vatAmount: true,
          soldBy: true, soldAt: true, cancelled: true, customer: { select: { code: true, name: true } },
          _count: { select: { items: true } },
        },
        orderBy: [{ soldAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.sale.count({ where }),
    ]);
    const totalPages = Math.ceil(total / limit);
    return Response.json({
      items: rows.map((row) => ({
        id: row.id,
        invoiceNo: row.invoiceNo ?? row.id,
        customer: row.customer?.code === "000000" ? "ลูกค้าทั่วไป" : row.customer?.name ?? "ลูกค้าทั่วไป",
        customerCode: row.customer?.code === "000000" ? null : row.customer?.code ?? null,
        paymentType: normalizePaymentType(row.paymentType),
        total: Number(row.total),
        vatAmount: Number(row.vatAmount),
        soldBy: row.soldBy ?? "-",
        soldAt: row.soldAt?.toISOString() ?? null,
        cancelled: row.cancelled,
        itemCount: row._count.items,
      })),
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
    });
  } catch (error) {
    console.error("Sale query failed", error);
    return Response.json({ message: "โหลดประวัติการขายไม่สำเร็จ" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const actor = request.headers.get("x-auth-user-name") ?? "Administrator";
  let body: CancelRequest;
  try {
    body = await request.json();
  } catch {
    return Response.json({ message: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const id = body.id?.trim();
  const reason = body.reason?.trim();
  if (!id) return Response.json({ message: "กรุณาระบุเลขที่บิล" }, { status: 400 });
  if (!reason || reason.length < 3 || reason.length > 200) {
    return Response.json({ message: "กรุณาระบุเหตุผลการยกเลิก 3–200 ตัวอักษร" }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findUnique({
        where: { id },
        select: { id: true, invoiceNo: true, cancelled: true, items: { select: { id: true, productCode: true, quantity: true } } },
      });
      if (!sale) throw new SaleError("ไม่พบบิลขาย", 404);
      if (sale.cancelled) throw new SaleError("บิลนี้ถูกยกเลิกแล้ว", 409);
      const returned = await tx.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*) count FROM "sale_return_items" WHERE "saleItemId" IN (SELECT id FROM "sale_items" WHERE "saleId"=${id})`;
      if (Number(returned[0]?.count ?? 0) > 0) throw new SaleError("บิลนี้มีการคืนสินค้าบางรายการแล้ว กรุณาคืนเฉพาะจำนวนที่เหลือแทนการยกเลิกทั้งบิล", 409);

      const quantities = new Map<string, Prisma.Decimal>();
      for (const item of sale.items) {
        if (!item.productCode) throw new SaleError("บิลมีรายการสินค้าที่ไม่สามารถคืนสต็อกได้ กรุณาติดต่อผู้ดูแลระบบ", 409);
        quantities.set(item.productCode, (quantities.get(item.productCode) ?? new Prisma.Decimal(0)).plus(item.quantity));
      }
      if (quantities.size === 0) throw new SaleError("บิลนี้ไม่มีรายการสินค้าสำหรับคืนสต็อก", 409);

      const baseRows=await tx.$queryRaw<Array<{productCode:string|null;quantity:Prisma.Decimal}>>`SELECT "productCode",SUM(CASE WHEN "baseQuantity">0 THEN "baseQuantity" ELSE "quantity" END) quantity FROM "sale_items" WHERE "saleId"=${id} GROUP BY "productCode"`;
      quantities.clear();for(const row of baseRows)if(row.productCode)quantities.set(row.productCode,row.quantity);
      const products = await tx.product.findMany({
        where: { code: { in: [...quantities.keys()] } },
        select: { code: true, name: true, lotId: true, cost: true, category: { select: { name: true } } },
      });
      const productByCode = new Map(products.map((product) => [product.code, product]));
      const missing = [...quantities.keys()].find((code) => !productByCode.has(code));
      if (missing) throw new SaleError(`ไม่พบสินค้า ${missing} จึงยังคืนสต็อกไม่ได้`, 409);

      const now = new Date();
      const claimed = await tx.$queryRaw<Array<{ id: string }>>`
        UPDATE "sales"
        SET "cancelled" = true, "status" = 'X', "cancelReason" = ${reason},
            "cancelledAt" = ${now}, "cancelledBy" = ${actor}
        WHERE "id" = ${id} AND "cancelled" = false
        RETURNING "id"
      `;
      if (claimed.length !== 1) throw new SaleError("บิลนี้ถูกยกเลิกแล้ว", 409);

      const lotAllocations = await tx.$queryRaw<Array<{ lotId: bigint; quantity: Prisma.Decimal }>>`
        SELECT a."lotId",a."quantity" FROM "sale_lot_allocations" a
        JOIN "sale_items" i ON i."id"=a."saleItemId" WHERE i."saleId"=${id} FOR UPDATE OF a
      `;
      for (const allocation of lotAllocations) {
        await tx.$executeRaw`UPDATE "inventory_lots" SET "quantity"="quantity"+${allocation.quantity},"status"='ACTIVE',"updatedAt"=NOW() WHERE "id"=${allocation.lotId}`;
      }

      for (const [code, quantity] of quantities) {
        const product = productByCode.get(code)!;
        const updated = await tx.product.update({
          where: { code },
          data: { quantity: { increment: quantity } },
          select: { quantity: true },
        });
        await tx.stockMovement.create({
          data: {
            productCode: code,
            lotId: product.lotId,
            productName: product.name,
            categoryName: product.category?.name,
            quantityIn: quantity,
            unitCost: product.cost,
            balance: updated.quantity,
            actor,
            occurredAt: now,
            status: "R",
          },
        });
      }

      return { id: sale.id, invoiceNo: sale.invoiceNo ?? sale.id, cancelled: true, cancelReason: reason, cancelledAt: now.toISOString(), cancelledBy: actor };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10_000 });
    return Response.json({ sale: result });
  } catch (error) {
    if (error instanceof SaleError) return Response.json({ message: error.message }, { status: error.status });
    console.error("Cancel sale failed", error);
    return Response.json({ message: "ยกเลิกบิลไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const actor = request.headers.get("x-auth-user-name") ?? "Administrator";
  let body: SaleRequest;
  try {
    body = await request.json();
  } catch {
    return Response.json({ message: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  const paymentMethod = body.paymentMethod;
  if (!Array.isArray(body.payments) && !PAYMENT_METHODS.includes(paymentMethod as typeof PAYMENT_METHODS[number])) {
    return Response.json({ message: "กรุณาเลือกวิธีชำระเงิน" }, { status: 400 });
  }
  if((body.items??[]).some(item=>item.unitId)){try{return Response.json({sale:await createMultiUnitSale(body,actor)},{status:201})}catch(error){if(error instanceof SaleError)return Response.json({message:error.message},{status:error.status});console.error("Create multi-unit sale failed",error);return Response.json({message:"บันทึกการขายหลายหน่วยไม่สำเร็จ"},{status:500})}}

  const merged = new Map<string, number>();
  for (const item of body.items ?? []) {
    const code = item.code?.trim();
    const qty = Number(item.qty);
    if (!code || !Number.isInteger(qty) || qty <= 0 || qty > 9999) {
      return Response.json({ message: "รายการสินค้าหรือจำนวนไม่ถูกต้อง" }, { status: 400 });
    }
    merged.set(code, (merged.get(code) ?? 0) + qty);
  }
  if (merged.size === 0 || merged.size > 200) {
    return Response.json({ message: merged.size === 0 ? "ยังไม่มีสินค้าในรายการขาย" : "หนึ่งบิลรองรับสินค้าไม่เกิน 200 รายการ" }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const now = new Date();
      const products = await tx.product.findMany({
        where: { code: { in: [...merged.keys()] }, inactive: false },
        select: { code: true, name: true, quantity: true, unit: true, price: true, price1:true, price2:true, price3:true, price4:true, cost: true, lotId: true, category: { select: { name: true } } },
      });
      const customerCode=body.customerCode?.trim()||null;
      const customer=customerCode?await tx.customer.findUnique({where:{code:customerCode},select:{code:true,priceLevel:true}}):null;
      if(customerCode&&!customer)throw new SaleError("ไม่พบลูกค้าที่เลือก",404);
      const productByCode = new Map(products.map((product) => [product.code, product]));
      const missing = [...merged.keys()].find((code) => !productByCode.has(code));
      const expiryRows = await tx.$queryRaw<Array<{ code: string; trackExpiry: boolean }>>`
        SELECT "code","trackExpiry" FROM "products" WHERE "code" IN (${Prisma.join([...merged.keys()])})
      `;
      const trackExpiry = new Map(expiryRows.map((row) => [row.code, row.trackExpiry]));
      if (missing) throw new SaleError(`ไม่พบสินค้า ${missing}`, 404);

      const sequenceRows = await tx.$queryRaw<Array<{ value: bigint }>>`SELECT nextval('sale_number_seq') AS value`;
      const sequence = sequenceRows[0]?.value;
      if (!sequence) throw new SaleError("สร้างเลขที่บิลไม่สำเร็จ", 500);
      const id = `S${bangkokDateCode(now)}${sequence.toString().padStart(6, "0")}`;

      let subtotal = new Prisma.Decimal(0);
      const saleItems: Array<{
        productCode: string;
        lotId: string | null;
        quantity: Prisma.Decimal;
        unit: string | null;
        unitPrice: Prisma.Decimal;
        unitCost: Prisma.Decimal;
      }> = [];
      const allocations = new Map<string, Array<{ lotId: bigint; quantity: Prisma.Decimal }>>();

      for (const [code, rawQty] of merged) {
        const product = productByCode.get(code)!;
        const quantity = new Prisma.Decimal(rawQty);
        const tierPrice=[product.price,product.price1,product.price2,product.price3,product.price4][customer?.priceLevel??0];
        const unitPrice=tierPrice.gt(0)?tierPrice:product.price;
        if (trackExpiry.get(code)) {
          const lots = await tx.$queryRaw<Array<{ id: bigint; quantity: Prisma.Decimal }>>`
            SELECT "id","quantity" FROM "inventory_lots"
            WHERE "productCode"=${code} AND "status"='ACTIVE' AND "quantity">0 AND "expireDate">=CURRENT_DATE
            ORDER BY "expireDate" ASC,"receivedDate" ASC,"id" ASC FOR UPDATE
          `;
          let remaining = quantity;
          const plan: Array<{ lotId: bigint; quantity: Prisma.Decimal }> = [];
          for (const lot of lots) {
            if (remaining.lte(0)) break;
            const used = Prisma.Decimal.min(remaining, lot.quantity);
            plan.push({ lotId: lot.id, quantity: used });
            remaining = remaining.minus(used);
          }
          for (const allocation of plan) await tx.$executeRaw`UPDATE "inventory_lots" SET "quantity"="quantity"-${allocation.quantity},"status"=CASE WHEN "quantity"-${allocation.quantity}=0 THEN 'CLOSED' ELSE "status" END,"updatedAt"=NOW() WHERE "id"=${allocation.lotId}`;
          allocations.set(code, plan);
        }
        const updated = await tx.product.updateMany({
          where: { code, inactive: false },
          data: { quantity: { decrement: quantity } },
        });
        if (updated.count !== 1) throw new SaleError(`สินค้า “${product.name}” ไม่พร้อมขาย กรุณาโหลดรายการใหม่`, 409);

        const balance = product.quantity.minus(quantity);
        subtotal = subtotal.plus(unitPrice.mul(quantity));
        saleItems.push({
          productCode: product.code,
          lotId: product.lotId,
          quantity,
          unit: product.unit,
          unitPrice,
          unitCost: product.cost,
        });
        await tx.stockMovement.create({
          data: {
            productCode: product.code,
            lotId: product.lotId,
            productName: product.name,
            categoryName: product.category?.name,
            quantityIn: quantity.negated(),
            unitCost: product.cost,
            balance,
            actor,
            occurredAt: now,
            status: "S",
          },
        });
      }

      subtotal = roundMoney(subtotal);
      const setting = await tx.shopSetting.findUnique({ where: { id: 1 }, select: { vatRate: true } });
      const vatRate = setting?.vatRate ?? new Prisma.Decimal(7);
      const vatAmount = roundMoney(subtotal.mul(vatRate).div(new Prisma.Decimal(100).plus(vatRate)));
      let payments:ValidatedPayment[];try{payments=validatePayments(body.payments,subtotal,body.paymentMethod)}catch(error){throw new SaleError(error instanceof Error?error.message:"ข้อมูลการชำระเงินไม่ถูกต้อง")}
      const openShifts = await tx.$queryRaw<Array<{ id: number }>>`SELECT "id" FROM "cash_shifts" WHERE "status"='OPEN' ORDER BY "openedAt" DESC LIMIT 1`;
      await tx.sale.create({
        data: {
          id,
          invoiceNo: id,
          customerCode: customer?.code ?? null,
          paymentType: salePaymentType(payments),
          discountAmount: 0,
          vatType: "I",
          vatAmount,
          subtotal,
          total: subtotal,
          soldBy: actor,
          soldAt: now,
          status: "C",
          items: { create: saleItems },
        },
      });
      await insertSalePayments(tx,id,payments);
      if (allocations.size) {
        const createdItems = await tx.$queryRaw<Array<{ id: bigint; productCode: string }>>`SELECT "id","productCode" FROM "sale_items" WHERE "saleId"=${id}`;
        const itemByCode = new Map(createdItems.map((item) => [item.productCode, item.id]));
        for (const [code, plan] of allocations) {
          const saleItemId = itemByCode.get(code);
          if (!saleItemId) throw new SaleError("ไม่พบรายการขายสำหรับตัด Lot", 500);
          for (const allocation of plan) await tx.$executeRaw`INSERT INTO "sale_lot_allocations" ("saleItemId","lotId","quantity") VALUES (${saleItemId},${allocation.lotId},${allocation.quantity})`;
        }
      }
      if (openShifts[0]) await tx.$executeRaw`UPDATE "sales" SET "shiftId"=${openShifts[0].id} WHERE "id"=${id}`;

      return { id, invoiceNo: id, subtotal: Number(subtotal), vatAmount: Number(vatAmount), total: Number(subtotal), soldAt: now.toISOString() };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10_000 });

    return Response.json({ sale: result }, { status: 201 });
  } catch (error) {
    if (error instanceof SaleError) return Response.json({ message: error.message }, { status: error.status });
    console.error("Create sale failed", error);
    return Response.json({ message: "บันทึกการขายไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });
  }
}
