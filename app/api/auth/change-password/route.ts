import { cookies } from "next/headers";
import { getSessionUser, hashPassword, hashSessionToken, SESSION_COOKIE, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return Response.json({ message: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
  let body: { currentPassword?: string; newPassword?: string };
  try { body = await request.json(); } catch { return Response.json({ message: "ข้อมูลไม่ถูกต้อง" }, { status: 400 }); }
  const currentPassword = body.currentPassword ?? "";
  const newPassword = body.newPassword ?? "";
  if (newPassword.length < 8 || !/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) return Response.json({ message: "รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัว และมีทั้งตัวอักษรกับตัวเลข" }, { status: 400 });
  const employee = await prisma.employee.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
  if (!employee || !(await verifyPassword(currentPassword, employee.passwordHash))) return Response.json({ message: "รหัสผ่านเดิมไม่ถูกต้อง" }, { status: 401 });
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  await prisma.$transaction([
    prisma.employee.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(newPassword), mustChangePassword: false } }),
    prisma.authSession.deleteMany({ where: { employeeId: user.id, ...(token ? { tokenHash: { not: hashSessionToken(token) } } : {}) } }),
  ]);
  return Response.json({ success: true });
}
