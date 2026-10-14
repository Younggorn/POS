import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await prisma.productCategory.findMany({
      select: { id: true, name: true, _count: { select: { products: { where: { inactive: false } } } } },
      orderBy: { name: "asc" },
    });
    return Response.json({
      source: "postgresql",
      items: rows.filter((row) => row._count.products > 0).map((row) => ({ id: row.id, name: row.name, count: row._count.products })),
    });
  } catch (error) {
    console.error("Category query failed", error);
    return Response.json({ source: "unavailable", items: [], message: "Database is not available" }, { status: 503 });
  }
}
