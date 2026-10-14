import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
const n = (value: unknown) => Number(value ?? 0);
function date(value: string | null, fallback: Date) { if (!value) return fallback; const parsed = new Date(`${value}T00:00:00+07:00`); return Number.isNaN(parsed.getTime()) ? fallback : parsed; }

export async function GET(request: Request) {
  const url = new URL(request.url); const now = new Date(); const fallback = new Date(now); fallback.setDate(fallback.getDate() - 29);
  const from = date(url.searchParams.get("from"), fallback); const to = date(url.searchParams.get("to"), now); to.setDate(to.getDate() + 1);
  try {
    const [sales, purchases, returns, top, stock, daily] = await Promise.all([
      prisma.sale.aggregate({ where: { cancelled: false, soldAt: { gte: from, lt: to } }, _sum: { total: true, vatAmount: true }, _count: true }),
      prisma.purchaseReceipt.aggregate({ where: { cancelled:false,receivedAt: { gte: from, lt: to } }, _sum: { total: true, vatAmount: true }, _count: true }),
      prisma.$queryRaw<Array<{ total: Prisma.Decimal | null; count: bigint }>>`SELECT SUM("total") total,COUNT(*) count FROM "sale_returns" WHERE "returnedAt">=${from} AND "returnedAt"<${to}`,
      prisma.$queryRaw<Array<{ code: string; name: string; quantity: Prisma.Decimal; revenue: Prisma.Decimal; profit: Prisma.Decimal }>>`
        SELECT COALESCE(si."productCode", '-') code, COALESCE(p."name", si."productCode", '-') name,
          SUM(CASE WHEN si."baseQuantity">0 THEN si."baseQuantity" ELSE si."quantity" END) quantity, SUM((si."unitPrice"-si."unitDiscount")*si."quantity") revenue,
          SUM(((si."unitPrice"-si."unitDiscount")-si."unitCost")*si."quantity") profit
        FROM "sale_items" si JOIN "sales" s ON s.id=si."saleId" LEFT JOIN "products" p ON p.code=si."productCode"
        WHERE s.cancelled=false AND s."soldAt">=${from} AND s."soldAt"<${to}
        GROUP BY si."productCode", p."name" ORDER BY revenue DESC LIMIT 15`,
      prisma.product.aggregate({ where: { inactive: false }, _sum: { quantity: true }, _count: true }),
      prisma.$queryRaw<Array<{ reportDay: Date; total: Prisma.Decimal; bills: bigint }>>`
        SELECT date_trunc('day', "soldAt" AT TIME ZONE 'Asia/Bangkok') "reportDay", SUM(total) total, COUNT(*) bills
        FROM "sales" WHERE cancelled=false AND "soldAt">=${from} AND "soldAt"<${to}
        GROUP BY 1 ORDER BY 1`,
    ]);
    const paymentRows = await prisma.$queryRaw<Array<{type:string;total:Prisma.Decimal;count:bigint}>>`
      SELECT CASE sp."method" WHEN 'cash' THEN 'C' WHEN 'transfer' THEN 'T' WHEN 'card' THEN 'D' ELSE 'U' END type,
        SUM(sp."amount") total,COUNT(DISTINCT sp."saleId") count
      FROM "sale_payments" sp JOIN "sales" s ON s.id=sp."saleId"
      WHERE s.cancelled=false AND s."soldAt">=${from} AND s."soldAt"<${to}
      GROUP BY 1 ORDER BY 1`;
    return Response.json({ range: { from: from.toISOString(), to: to.toISOString() }, sales: { count: sales._count, total: n(sales._sum.total), vat: n(sales._sum.vatAmount), returns: n(returns[0]?.total), returnCount: Number(returns[0]?.count ?? 0), net: n(sales._sum.total) - n(returns[0]?.total) }, purchases: { count: purchases._count, total: n(purchases._sum.total), vat: n(purchases._sum.vatAmount) }, stock: { products: stock._count, quantity: n(stock._sum.quantity) }, payments: paymentRows.map((p) => ({ type: p.type, total: n(p.total), count: Number(p.count) })), topProducts: top.map((p) => ({ ...p, quantity: n(p.quantity), revenue: n(p.revenue), profit: n(p.profit) })), daily: daily.map((d) => ({ date: d.reportDay.toISOString(), total: n(d.total), bills: Number(d.bills) })) });
  } catch (error) { console.error("Report query failed", error); return Response.json({ message: "สร้างรายงานไม่สำเร็จ" }, { status: 500 }); }
}
