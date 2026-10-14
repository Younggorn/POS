import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ status: "ok", database: "connected" });
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "UNKNOWN";
    return Response.json({ status: "degraded", database: "unavailable", configured: Boolean(process.env.DATABASE_URL), errorCode: code }, { status: 503 });
  }
}
