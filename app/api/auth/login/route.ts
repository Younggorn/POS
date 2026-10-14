import { cookies } from "next/headers";
import { createSessionToken, hashSessionToken, SESSION_COOKIE, verifyPassword } from "@/lib/auth";
import { sessionPolicy } from "@/lib/session-policy";
import { prisma } from "@/lib/prisma";
import { requestAuditContext } from "@/lib/login-audit";

export async function POST(request: Request) {
  let body: { username?: string; password?: string };
  try { body = await request.json(); } catch { return Response.json({ message: "ข้อมูลไม่ถูกต้อง" }, { status: 400 }); }
  const username = body.username?.trim().toLowerCase() ?? "";
  const password = body.password ?? "";
  if (!username || !password) return Response.json({ message: "กรุณากรอกชื่อผู้ใช้และรหัสผ่าน" }, { status: 400 });
  const employee = await prisma.employee.findUnique({
    where: { username },
    include: { position: { include: { permissions: true } } },
  });
  const valid = employee ? await verifyPassword(password, employee.passwordHash) : false;
  if (!employee || !valid || !employee.active || !employee.position.active) {
    const reason = !employee ? "ACCOUNT_NOT_FOUND" : !valid ? "INVALID_PASSWORD" : !employee.active ? "EMPLOYEE_INACTIVE" : "POSITION_INACTIVE";
    await prisma.loginLog.create({ data: { employeeId: employee?.id, username, eventType: "LOGIN", success: false, reason, ...requestAuditContext(request) } }).catch((error) => console.error("Login audit failed", error));
    return Response.json({ message: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" }, { status: 401 });
  }
  const token = createSessionToken();
  const { expiresAt, cookieExpiresAt } = sessionPolicy(request.headers.get("x-pos-client"));
  await prisma.$transaction([
    prisma.authSession.deleteMany({ where: { expiresAt: { lt: new Date() } } }),
    prisma.authSession.create({ data: { tokenHash: hashSessionToken(token), employeeId: employee.id, expiresAt } }),
    prisma.employee.update({ where: { id: employee.id }, data: { lastLoginAt: new Date() } }),
    prisma.loginLog.create({ data: { employeeId: employee.id, username, eventType: "LOGIN", success: true, reason: "SUCCESS", ...requestAuditContext(request) } }),
  ]);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true, sameSite: "lax", secure: process.env.AUTH_SECURE_COOKIE === "true", path: "/",
    expires: cookieExpiresAt, priority: "high",
  });
  return Response.json({ user: { id: employee.id, username: employee.username, name: employee.name, position: employee.position.name, permissions: employee.position.permissions.map((item) => item.menuId), mustChangePassword: employee.mustChangePassword } });
}
