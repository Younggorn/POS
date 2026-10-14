import "server-only";

import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { prisma } from "@/lib/prisma";

export const SESSION_COOKIE = "up_session";

const scrypt = promisify(scryptCallback);

export const MENU_DEFINITIONS = [
  { id: "dashboard", label: "ภาพรวมร้าน" },
  { id: "pos", label: "ขายสินค้า" },
  { id: "sales", label: "ประวัติการขาย" },
  { id: "products", label: "สินค้าและสต็อก" },
  { id: "product-units", label: "หน่วยสินค้าและ Barcode" },
  { id: "purchase", label: "จัดซื้อและรับเข้า" },
  { id: "shelf-life", label: "Shelf Life / วันหมดอายุ" },
  { id: "returns", label: "คืนสินค้าบางรายการ" },
  { id: "customers", label: "ลูกค้าและลูกหนี้" },
  { id: "customer-management", label: "จัดการลูกค้า" },
  { id: "shifts", label: "กะขายและเงินสด" },
  { id: "reports", label: "รายงาน" },
  { id: "options", label: "จัดการตัวเลือกต่างๆ" },
  { id: "system", label: "อุปกรณ์และงานระบบ" },
  { id: "access-control", label: "พนักงาน ตำแหน่ง และสิทธิ์" },
  { id: "login-logs", label: "Logs การ Login" },
  { id: "backup", label: "Backup" },
] as const;

export type MenuId = (typeof MENU_DEFINITIONS)[number]["id"];
export type AuthUser = {
  id: number;
  username: string;
  name: string;
  positionId: number;
  position: string;
  permissions: string[];
  mustChangePassword: boolean;
};

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt}$${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [algorithm, salt, expectedHex] = stored.split("$");
  if (algorithm !== "scrypt" || !salt || !expectedHex) return false;
  const expected = Buffer.from(expectedHex, "hex");
  const actual = (await scrypt(password, salt, expected.length)) as Buffer;
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function readCookie(request: Request, name: string) {
  const cookie = request.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return null;
}

export async function getSessionUser(request: Request): Promise<AuthUser | null> {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const session = await prisma.authSession.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    select: {
      id: true,
      expiresAt: true,
      employee: {
        select: {
          id: true, username: true, name: true, active: true, mustChangePassword: true,
          position: { select: { id: true, name: true, active: true, permissions: { select: { menuId: true } } } },
        },
      },
    },
  });
  if (!session || (session.expiresAt !== null && session.expiresAt <= new Date()) || !session.employee.active || !session.employee.position.active) {
    if (session) await prisma.authSession.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  return {
    id: session.employee.id,
    username: session.employee.username,
    name: session.employee.name,
    positionId: session.employee.position.id,
    position: session.employee.position.name,
    permissions: session.employee.position.permissions.map((permission) => permission.menuId),
    mustChangePassword: session.employee.mustChangePassword,
  };
}

export function hasAnyPermission(user: AuthUser, permissions: readonly string[]) {
  return permissions.some((permission) => user.permissions.includes(permission));
}

export function createSessionToken() {
  return randomBytes(32).toString("base64url");
}
