import { cookies } from "next/headers";
import { hashSessionToken, SESSION_COOKIE } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requestAuditContext } from "@/lib/login-audit";

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    const tokenHash = hashSessionToken(token);
    const session = await prisma.authSession.findUnique({ where: { tokenHash }, select: { employee: { select: { id: true, username: true } } } });
    if (session) await prisma.$transaction([
      prisma.loginLog.create({ data: { employeeId: session.employee.id, username: session.employee.username, eventType: "LOGOUT", success: true, reason: "USER_LOGOUT", ...requestAuditContext(request) } }),
      prisma.authSession.delete({ where: { tokenHash } }),
    ]);
  }
  cookieStore.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  return Response.json({ success: true });
}
