import { MENU_DEFINITIONS, getSessionUser, hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

class AccessError extends Error { constructor(message: string, readonly status = 400) { super(message); } }

const validMenus = new Set<string>(MENU_DEFINITIONS.map((menu) => menu.id));
const cleanPermissions = (value: unknown) => Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === "string" && validMenus.has(item)))] : [];

async function ensureAnotherAdministrator(positionId: number) {
  const count = await prisma.employee.count({
    where: {
      active: true,
      positionId: { not: positionId },
      position: { active: true, permissions: { some: { menuId: "access-control" } } },
    },
  });
  if (count === 0) throw new AccessError("ต้องมีผู้ดูแลระบบที่ใช้งานได้อย่างน้อย 1 คน", 409);
}

async function ensureAnotherAdministratorEmployee(employeeId: number) {
  const count = await prisma.employee.count({ where: { id: { not: employeeId }, active: true, position: { active: true, permissions: { some: { menuId: "access-control" } } } } });
  if (count === 0) throw new AccessError("ต้องมีผู้ดูแลระบบที่ใช้งานได้อย่างน้อย 1 คน", 409);
}

export async function GET() {
  try {
    const [positions, employees] = await Promise.all([
      prisma.position.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }], include: { permissions: { select: { menuId: true } }, _count: { select: { employees: true } } } }),
      prisma.employee.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }], select: { id: true, username: true, name: true, positionId: true, active: true, mustChangePassword: true, lastLoginAt: true, createdAt: true, position: { select: { name: true } } } }),
    ]);
    return Response.json({
      menus: MENU_DEFINITIONS,
      positions: positions.map((position) => ({ ...position, permissions: position.permissions.map((item) => item.menuId), employeeCount: position._count.employees, _count: undefined })),
      employees: employees.map((employee) => ({ ...employee, lastLoginAt: employee.lastLoginAt?.toISOString() ?? null, createdAt: employee.createdAt.toISOString(), position: employee.position.name })),
    });
  } catch (error) {
    console.error("Load access control failed", error);
    return Response.json({ message: "โหลดข้อมูลพนักงานและสิทธิ์ไม่สำเร็จ" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const currentUser = await getSessionUser(request);
  if (!currentUser) return Response.json({ message: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return Response.json({ message: "ข้อมูลไม่ถูกต้อง" }, { status: 400 }); }
  try {
    const action = String(body.action ?? "");
    if (action === "createPosition") {
      const name = String(body.name ?? "").trim();
      const permissions = cleanPermissions(body.permissions);
      if (name.length < 2 || !permissions.length) throw new AccessError("กรุณาระบุชื่อตำแหน่งและเลือกอย่างน้อย 1 เมนู");
      const position = await prisma.position.create({ data: { name, description: String(body.description ?? "").trim() || null, permissions: { create: permissions.map((menuId) => ({ menuId })) } } });
      return Response.json({ position }, { status: 201 });
    }
    if (action === "updatePosition") {
      const id = Number(body.id); const name = String(body.name ?? "").trim(); const permissions = cleanPermissions(body.permissions); const active = body.active !== false;
      if (!Number.isInteger(id) || id <= 0 || name.length < 2 || !permissions.length) throw new AccessError("ข้อมูลตำแหน่งไม่ถูกต้อง");
      const old = await prisma.position.findUnique({ where: { id }, include: { permissions: true, employees: { where: { active: true }, select: { id: true } } } });
      if (!old) throw new AccessError("ไม่พบตำแหน่ง", 404);
      if ((!active || !permissions.includes("access-control")) && old.permissions.some((item) => item.menuId === "access-control") && old.employees.length) await ensureAnotherAdministrator(id);
      await prisma.$transaction([
        prisma.position.update({ where: { id }, data: { name, description: String(body.description ?? "").trim() || null, active } }),
        prisma.positionPermission.deleteMany({ where: { positionId: id } }),
        prisma.positionPermission.createMany({ data: permissions.map((menuId) => ({ positionId: id, menuId })) }),
        ...(!active ? [prisma.authSession.deleteMany({ where: { employee: { positionId: id } } })] : []),
      ]);
      return Response.json({ success: true });
    }
    if (action === "createEmployee") {
      const username = String(body.username ?? "").trim().toLowerCase(); const name = String(body.name ?? "").trim(); const password = String(body.password ?? ""); const positionId = Number(body.positionId);
      if (!/^[a-z0-9._-]{3,50}$/.test(username)) throw new AccessError("ชื่อผู้ใช้ต้องมี 3-50 ตัว ใช้ตัวอักษรอังกฤษ ตัวเลข จุด ขีดกลาง หรือขีดล่าง");
      if (name.length < 2 || password.length < 8 || !Number.isInteger(positionId)) throw new AccessError("กรุณาตรวจชื่อ รหัสผ่านอย่างน้อย 8 ตัว และตำแหน่ง");
      const employee = await prisma.employee.create({ data: { username, name, passwordHash: await hashPassword(password), positionId, mustChangePassword: true } });
      return Response.json({ employee: { id: employee.id } }, { status: 201 });
    }
    if (action === "updateEmployee") {
      const id = Number(body.id); const name = String(body.name ?? "").trim(); const positionId = Number(body.positionId); const active = body.active !== false; const password = String(body.password ?? "");
      if (!Number.isInteger(id) || id <= 0 || name.length < 2 || !Number.isInteger(positionId)) throw new AccessError("ข้อมูลพนักงานไม่ถูกต้อง");
      const old = await prisma.employee.findUnique({ where: { id }, include: { position: { include: { permissions: true } } } });
      if (!old) throw new AccessError("ไม่พบพนักงาน", 404);
      if (id === currentUser.id && !active) throw new AccessError("ไม่สามารถปิดบัญชีที่กำลังใช้งานอยู่", 409);
      if (password && password.length < 8) throw new AccessError("รหัสผ่านต้องมีอย่างน้อย 8 ตัว");
      if (old.active && old.position.permissions.some((item) => item.menuId === "access-control") && (!active || positionId !== old.positionId)) await ensureAnotherAdministratorEmployee(id);
      await prisma.employee.update({ where: { id }, data: { name, positionId, active, ...(password ? { passwordHash: await hashPassword(password), mustChangePassword: true } : {}) } });
      if (!active || password) await prisma.authSession.deleteMany({ where: { employeeId: id, ...(id === currentUser.id ? { id: { lt: 0 } } : {}) } });
      return Response.json({ success: true });
    }
    throw new AccessError("ไม่รู้จักคำสั่ง");
  } catch (error) {
    if (error instanceof AccessError) return Response.json({ message: error.message }, { status: error.status });
    if (typeof error === "object" && error && "code" in error && error.code === "P2002") return Response.json({ message: "ชื่อผู้ใช้หรือชื่อตำแหน่งนี้มีอยู่แล้ว" }, { status: 409 });
    if (typeof error === "object" && error && "code" in error && error.code === "P2003") return Response.json({ message: "ไม่พบตำแหน่งที่เลือก" }, { status: 409 });
    console.error("Save access control failed", error);
    return Response.json({ message: "บันทึกข้อมูลพนักงานและสิทธิ์ไม่สำเร็จ" }, { status: 500 });
  }
}
