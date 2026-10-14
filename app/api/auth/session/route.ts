import { getSessionUser } from "@/lib/auth";

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return Response.json({ message: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
  return Response.json({ user });
}
