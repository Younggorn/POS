import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function bangkokDayRange(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const start = new Date(`${values.year}-${values.month}-${values.day}T00:00:00+07:00`);
  const end = new Date(start.getTime() + 86_400_000);
  const previousStart = new Date(start.getTime() - 86_400_000);
  return { start, end, previousStart };
}

export async function GET() {
  try {
    const { start, end, previousStart } = bangkokDayRange();
    const saleWhere: Prisma.SaleWhereInput = { cancelled: false, soldAt: { gte: start, lt: end } };

    const [today, previousDay, profitRows, hourlyRows, lowStockRows, latestSales] = await Promise.all([
      prisma.sale.aggregate({ where: saleWhere, _count: { _all: true }, _sum: { total: true } }),
      prisma.sale.aggregate({
        where: { cancelled: false, soldAt: { gte: previousStart, lt: start } },
        _sum: { total: true },
      }),
      prisma.$queryRaw<Array<{ profit: Prisma.Decimal }>>`
        SELECT COALESCE(SUM((si."unitPrice" - si."unitDiscount" - si."unitCost") * si."quantity"), 0) AS profit
        FROM "sale_items" si
        INNER JOIN "sales" s ON s."id" = si."saleId"
        WHERE s."cancelled" = false AND s."soldAt" >= ${start} AND s."soldAt" < ${end}
      `,
      prisma.$queryRaw<Array<{ hour: number; total: Prisma.Decimal }>>`
        SELECT EXTRACT(HOUR FROM ("soldAt" + INTERVAL '7 hours'))::integer AS hour,
               COALESCE(SUM("total"), 0) AS total
        FROM "sales"
        WHERE "cancelled" = false AND "soldAt" >= ${start} AND "soldAt" < ${end}
        GROUP BY 1 ORDER BY 1
      `,
      prisma.$queryRaw<Array<{ code: string; name: string; quantity: Prisma.Decimal; minStock: Prisma.Decimal; unit: string | null }>>`
        SELECT "code", "name", "quantity", "minStock", "unit"
        FROM "products"
        WHERE "inactive" = false AND "minStock" > 0 AND "quantity" <= "minStock"
        ORDER BY ("minStock" - "quantity") DESC, "name" ASC
      `,
      prisma.sale.findMany({
        where: { cancelled: false },
        select: {
          id: true,
          invoiceNo: true,
          paymentType: true,
          total: true,
          soldAt: true,
          customer: { select: { code: true, name: true } },
          _count: { select: { items: true } },
        },
        orderBy: [{ soldAt: "desc" }, { id: "desc" }],
        take: 5,
      }),
    ]);

    const todayTotal = Number(today._sum.total ?? 0);
    const previousTotal = Number(previousDay._sum.total ?? 0);
    const trendPercent = previousTotal > 0 ? ((todayTotal - previousTotal) / previousTotal) * 100 : todayTotal > 0 ? 100 : 0;
    const byHour = new Map(hourlyRows.map((row) => [row.hour, Number(row.total)]));
    const hours = Array.from({ length: 14 }, (_, index) => index + 8);

    return Response.json({
      source: "postgresql",
      generatedAt: new Date().toISOString(),
      day: { start: start.toISOString(), end: end.toISOString() },
      today: {
        total: todayTotal,
        bills: today._count._all,
        average: today._count._all > 0 ? todayTotal / today._count._all : 0,
        grossProfit: Number(profitRows[0]?.profit ?? 0),
        previousTotal,
        trendPercent,
      },
      hourly: hours.map((hour) => ({ hour, label: `${String(hour).padStart(2, "0")}:00`, total: byHour.get(hour) ?? 0 })),
      lowStock: {
        count: lowStockRows.length,
        items: lowStockRows.slice(0, 5).map((row) => ({
          code: row.code,
          name: row.name,
          stock: Number(row.quantity),
          min: Number(row.minStock),
          unit: row.unit ?? "ชิ้น",
        })),
      },
      latestSales: latestSales.map((sale) => ({
        id: sale.id,
        invoiceNo: sale.invoiceNo ?? sale.id,
        customer: sale.customer?.code === "000000" ? "ลูกค้าทั่วไป" : sale.customer?.name ?? "ลูกค้าทั่วไป",
        paymentType: sale.paymentType === "0" ? "C" : sale.paymentType === "2" ? "T" : sale.paymentType,
        total: Number(sale.total),
        soldAt: sale.soldAt?.toISOString() ?? null,
        itemCount: sale._count.items,
      })),
    });
  } catch (error) {
    console.error("Dashboard query failed", error);
    return Response.json({ message: "โหลดข้อมูล Dashboard ไม่สำเร็จ" }, { status: 503 });
  }
}
