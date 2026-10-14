import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "node:crypto";
import { validatePayments, type PaymentInput } from "@/lib/payments";

export const dynamic = "force-dynamic";
const number = (value: unknown) => Number(value ?? 0);
class CustomerError extends Error { constructor(message:string,readonly status=400){super(message)} }

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("search")?.trim();
  try {
    const customers = await prisma.customer.findMany({ where: query ? { OR: [{ code: { contains: query, mode: "insensitive" } }, { name: { contains: query, mode: "insensitive" } }, { phone: { contains: query } }] } : {}, take: 200, orderBy: { name: "asc" } });
    const debts = await prisma.$queryRaw<Array<{ id: bigint; documentNo: string; customerCode: string; customerName: string; originalAmount: Prisma.Decimal; paidAmount: Prisma.Decimal; dueDate: Date; status: string; note: string | null }>>`
      SELECT r."id",r."documentNo",r."customerCode",c."name" "customerName",r."originalAmount",r."paidAmount",r."dueDate",r."status",r."note"
      FROM "receivables" r JOIN "customers" c ON c."code"=r."customerCode" WHERE r."status"<>'PAID' ORDER BY r."dueDate",r."id" LIMIT 200`;
    const balances = new Map<string, number>(); for (const d of debts) balances.set(d.customerCode, (balances.get(d.customerCode) ?? 0) + number(d.originalAmount) - number(d.paidAmount));
    const balance = debts.reduce((sum, d) => sum + number(d.originalAmount) - number(d.paidAmount), 0); const overdue = debts.filter((d) => d.dueDate < new Date()).reduce((sum, d) => sum + number(d.originalAmount) - number(d.paidAmount), 0);
    return Response.json({
      customers: customers.map((c) => ({ ...c, balance: balances.get(c.code) ?? 0 })),
      debts: debts.map((d) => ({ id: d.id.toString(), documentNo: d.documentNo, customer: { code: d.customerCode, name: d.customerName }, originalAmount: number(d.originalAmount), paidAmount: number(d.paidAmount), balance: number(d.originalAmount) - number(d.paidAmount), dueDate: d.dueDate.toISOString(), status: d.status, note: d.note, payments: [] })),
      summary: { customers: customers.length, balance, overdue },
    });
  } catch (error) { console.error("Customer query failed", error); return Response.json({ message: "โหลดข้อมูลลูกค้าไม่สำเร็จ" }, { status: 500 }); }
}

export async function POST(request: Request) {
  const actor = request.headers.get("x-auth-user-name") ?? "Administrator";
  let body: Record<string, unknown>; try { body = await request.json(); } catch { return Response.json({ message: "ข้อมูลไม่ถูกต้อง" }, { status: 400 }); }
  const action = String(body.action ?? "customer");
  try {
    if (action === "customer") {
      const name = String(body.name ?? "").trim();
      const phone = String(body.phone ?? "").trim();
      const normalizedPhone = phone.replace(/[^0-9]/g, "");
      if (!name || !phone) return Response.json({ message: "กรุณาระบุชื่อลูกค้าและโทรศัพท์" }, { status: 400 });
      if (name.length > 80 || phone.length > 40 || !normalizedPhone) return Response.json({ message: "ชื่อหรือหมายเลขโทรศัพท์ไม่ถูกต้อง" }, { status: 400 });
      const duplicate = await prisma.$queryRaw<Array<{ code: string }>>`SELECT "code" FROM "customers" WHERE regexp_replace(COALESCE("phone",''),'[^0-9]','','g')=${normalizedPhone} LIMIT 1`;
      if (duplicate.length) return Response.json({ message: "หมายเลขโทรศัพท์นี้มีลูกค้าใช้งานแล้ว" }, { status: 409 });
      const customer = await prisma.$transaction(async (tx) => {
        const sequence = await tx.$queryRaw<Array<{ value: bigint }>>`SELECT nextval('customer_number_seq') AS value`;
        const next = Number(sequence[0]?.value ?? 0);
        if (next < 1 || next > 999999) throw new Error("CUSTOMER_NUMBER_LIMIT");
        return tx.customer.create({ data: { code: String(next).padStart(6, "0"), name, phone, email: String(body.email ?? "").trim() || null, address1: String(body.address ?? "").trim() || null, taxId: String(body.taxId ?? "").trim() || null, creditDays: Math.max(0, Math.trunc(number(body.creditDays))), priceLevel: Math.min(4, Math.max(0, Math.trunc(number(body.priceLevel)))) } });
      });
      return Response.json({ customer }, { status: 201 });
    }
    if (action === "debt") {
      const customerCode = String(body.customerCode ?? "").trim(); const amount = new Prisma.Decimal(number(body.amount));
      if (!customerCode || amount.lte(0)) return Response.json({ message: "ลูกค้าและยอดหนี้ไม่ถูกต้อง" }, { status: 400 });
      const dueDate = new Date(String(body.dueDate ?? "")); if (Number.isNaN(dueDate.getTime())) return Response.json({ message: "วันครบกำหนดไม่ถูกต้อง" }, { status: 400 });
      const doc = `AR${Date.now().toString().slice(-12)}`;
      const note = String(body.note ?? "").trim() || null; const rows = await prisma.$queryRaw<Array<{ id: bigint; documentNo: string }>>`INSERT INTO "receivables" ("customerCode","documentNo","originalAmount","dueDate","note") VALUES (${customerCode},${doc},${amount},${dueDate},${note}) RETURNING "id","documentNo"`;
      return Response.json({ debt: { id: rows[0].id.toString(), documentNo: rows[0].documentNo } }, { status: 201 });
    }
    if (action === "payment") {
      const id = BigInt(String(body.receivableId ?? "0")); const amount = new Prisma.Decimal(number(body.amount));
      if (amount.lte(0)) return Response.json({ message: "ยอดรับชำระต้องมากกว่า 0" }, { status: 400 });
      let payments;
      try { payments = validatePayments(body.payments as PaymentInput[] | undefined, amount, body.method); }
      catch (error) { return Response.json({ message: error instanceof Error ? error.message : "ข้อมูลการชำระเงินไม่ถูกต้อง" }, { status: 400 }); }
      const payment = await prisma.$transaction(async (tx) => {
        const debts = await tx.$queryRaw<Array<{ originalAmount: Prisma.Decimal; paidAmount: Prisma.Decimal; documentNo: string }>>`SELECT "originalAmount","paidAmount","documentNo" FROM "receivables" WHERE "id"=${id} FOR UPDATE`; const debt = debts[0]; if (!debt) throw new Error("NOT_FOUND");
        const balance = debt.originalAmount.minus(debt.paidAmount); if (amount.gt(balance)) throw new Error("OVERPAY");
        const batchId=randomUUID();
        await tx.debtPayment.createMany({data:payments.map(item=>({receivableId:id,batchId,amount:item.amount,method:item.method,receivedAmount:item.receivedAmount,changeAmount:item.changeAmount,reference:item.reference,receivedBy:actor}))});
        const paid = debt.paidAmount.plus(amount); const status = paid.gte(debt.originalAmount) ? "PAID" : "PARTIAL"; await tx.$executeRaw`UPDATE "receivables" SET "paidAmount"=${paid},"status"=${status} WHERE "id"=${id}`;
        const cash=payments.find(item=>item.method==="cash");if(cash){const shifts=await tx.$queryRaw<Array<{id:number}>>`SELECT "id" FROM "cash_shifts" WHERE "status"='OPEN' ORDER BY "openedAt" DESC LIMIT 1`;if(shifts[0]){const reason=`รับชำระหนี้ ${debt.documentNo}`;await tx.$executeRaw`INSERT INTO "cash_movements" ("shiftId","type","amount","reason","actor") VALUES (${shifts[0].id},'IN',${cash.amount},${reason},${actor})`;}}
        return {batchId,amount,payments};
      });
      return Response.json({ payment: { batchId:payment.batchId,amount:number(payment.amount),payments:payment.payments.map(item=>({...item,amount:number(item.amount),receivedAmount:item.receivedAmount===null?null:number(item.receivedAmount),changeAmount:item.changeAmount===null?null:number(item.changeAmount)})) } }, { status: 201 });
    }
    return Response.json({ message: "ไม่รองรับคำสั่งนี้" }, { status: 400 });
  } catch (error) { if(error instanceof CustomerError)return Response.json({message:error.message},{status:error.status});if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return Response.json({ message: "หมายเลขโทรศัพท์นี้มีลูกค้าใช้งานแล้ว" }, { status: 409 }); const message = error instanceof Error && error.message === "OVERPAY" ? "ยอดรับชำระเกินยอดคงค้าง" : error instanceof Error && error.message === "NOT_FOUND" ? "ไม่พบรายการลูกหนี้" : "บันทึกข้อมูลลูกค้าไม่สำเร็จ"; return Response.json({ message }, { status: message.includes("ไม่พบ") ? 404 : message.includes("เกิน") ? 400 : 500 }); }
}
