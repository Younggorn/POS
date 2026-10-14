import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function positive(value: string | null, fallback: number) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function validDate(value: string | null, end = false) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T${end ? "23:59:59.999" : "00:00:00"}+07:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const page = positive(url.searchParams.get("page"), 1);
  const limit = Math.min(positive(url.searchParams.get("limit"), 50), 100);
  const search = url.searchParams.get("search")?.trim().slice(0, 100) ?? "";
  const event = url.searchParams.get("event");
  const result = url.searchParams.get("result");
  const from = validDate(url.searchParams.get("from"));
  const to = validDate(url.searchParams.get("to"), true);
  const where: Prisma.LoginLogWhereInput = {
    ...(event === "LOGIN" || event === "LOGOUT" ? { eventType: event } : {}),
    ...(result === "success" ? { success: true } : result === "failed" ? { success: false } : {}),
    ...(from || to ? { occurredAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    ...(search ? { OR: [
      { username: { contains: search, mode: "insensitive" } },
      { ipAddress: { contains: search, mode: "insensitive" } },
      { employee: { name: { contains: search, mode: "insensitive" } } },
    ] } : {}),
  };
  const todayText = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const today = new Date(`${todayText}T00:00:00+07:00`);
  const [items, total, todaySuccess, todayFailed, activeSessions] = await prisma.$transaction([
    prisma.loginLog.findMany({ where, orderBy: [{ occurredAt: "desc" }, { id: "desc" }], skip: (page - 1) * limit, take: limit, include: { employee: { select: { name: true } } } }),
    prisma.loginLog.count({ where }),
    prisma.loginLog.count({ where: { eventType: "LOGIN", success: true, occurredAt: { gte: today } } }),
    prisma.loginLog.count({ where: { eventType: "LOGIN", success: false, occurredAt: { gte: today } } }),
    prisma.authSession.count({ where: { expiresAt: { gt: new Date() } } }),
  ]);
  return Response.json({
    items: items.map((item) => ({ ...item, id: item.id.toString(), employeeName: item.employee?.name ?? null, employee: undefined })),
    page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)),
    summary: { todaySuccess, todayFailed, activeSessions },
  });
}
