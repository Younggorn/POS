import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getSessionUser, hasAnyPermission } from "@/lib/auth";
import { existsSync } from "node:fs";

const publicPaths = ["/api/auth/login", "/api/health"];

function requiredPermissions(path: string, method: string): string[] {
  if (path.startsWith("/api/access-control")) return ["access-control"];
  if (path.startsWith("/api/login-logs")) return ["login-logs"];
  if (path.startsWith("/api/backups")) return ["backup"];
  if (path.startsWith("/api/legacy-sync")) return ["backup"];
  if (path.startsWith("/api/dashboard")) return ["dashboard"];
  if (path.startsWith("/api/held-bills")) return ["pos"];
  if (path.startsWith("/api/product-units")) return ["product-units"];
  if (path.startsWith("/api/products") || path.startsWith("/api/categories")) return ["pos", "products", "product-units", "purchase", "shelf-life"];
  if (path.startsWith("/api/purchases")) return ["purchase"];
  if (path.startsWith("/api/shelf-life")) return ["shelf-life"];
  if (path.startsWith("/api/customers")) return ["customers"];
  if (path.startsWith("/api/customer-management")) return method === "GET" ? ["customer-management", "pos"] : ["customer-management"];
  if (path.startsWith("/api/returns")) return ["returns"];
  if (path.startsWith("/api/shifts")) return ["shifts"];
  if (path.startsWith("/api/reports")) return ["reports"];
  if (path.startsWith("/api/options")) return ["options"];
  if (path.startsWith("/api/system")) return ["system"];
  if (path.startsWith("/api/sales")) return method === "POST" ? ["pos"] : method === "PATCH" ? ["sales"] : ["sales", "returns"];
  return [];
}

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (path !== "/api/health" && !path.startsWith("/api/backups") && existsSync("/backups/restore.lock")) return NextResponse.json({ message: "ระบบกำลังกู้คืนฐานข้อมูล กรุณารอสักครู่" }, { status: 503 });
  if (publicPaths.some((publicPath) => path.startsWith(publicPath))) return NextResponse.next();
  try {
    const user = await getSessionUser(request);
    if (!user) return NextResponse.json({ message: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
    if (path === "/api/auth/session" || path === "/api/auth/logout" || path === "/api/auth/change-password") return NextResponse.next();
    if (user.mustChangePassword) return NextResponse.json({ message: "กรุณาเปลี่ยนรหัสผ่านก่อนใช้งาน" }, { status: 428 });
    const required = requiredPermissions(path, request.method);
    if (required.length && !hasAnyPermission(user, required)) return NextResponse.json({ message: "ไม่มีสิทธิ์ใช้งานส่วนนี้" }, { status: 403 });
    const headers = new Headers(request.headers);
    headers.set("x-auth-user-id", String(user.id));
    headers.set("x-auth-user-name", user.name);
    return NextResponse.next({ request: { headers } });
  } catch (error) {
    console.error("Authorization check failed", error);
    return NextResponse.json({ message: "ตรวจสอบสิทธิ์ไม่สำเร็จ" }, { status: 503 });
  }
}

// The MDB upload route authenticates itself so its large request body can stream
// directly to disk instead of being buffered and truncated by Proxy's 10 MB limit.
export const config = { matcher: "/api/((?!legacy-sync/upload).*)" };
