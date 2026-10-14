import assert from "node:assert/strict";
import { randomBytes, scryptSync } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { sessionPolicy } from "../lib/session-policy";

const prisma = new PrismaClient();
async function main() {
  const now = Date.now();
  assert.equal(sessionPolicy("desktop", now).expiresAt, null);
  assert.equal(sessionPolicy(null, now).expiresAt?.getTime(), now + 12 * 3600000);
  const suffix = randomBytes(6).toString("hex");
  const username = `verify_desktop_${suffix}`;
  const password = randomBytes(24).toString("hex");
  const salt = randomBytes(16).toString("hex");
  const passwordHash = `scrypt$${salt}$${scryptSync(password, salt, 64).toString("hex")}`;
  const position = await prisma.position.create({ data: { name: `Session verification ${suffix}` } });
  let employeeId: number | undefined;
  try {
    const employee = await prisma.employee.create({ data: { username, name: "Temporary session verification", passwordHash, positionId: position.id } });
    employeeId = employee.id;
    const login = async (desktop: boolean) => {
      const response = await fetch("http://127.0.0.1:3000/api/auth/login", {
        method: "POST", headers: { "Content-Type": "application/json", ...(desktop ? { "X-POS-Client": "desktop" } : {}) }, body: JSON.stringify({ username, password }),
      });
      assert.equal(response.status, 200);
      const cookie = response.headers.get("set-cookie")?.split(";")[0];
      assert.ok(cookie);
      return cookie;
    };
    const cookie = await login(true);
    const persistent = await prisma.authSession.findFirstOrThrow({ where: { employeeId } });
    assert.equal(persistent.expiresAt, null);
    await prisma.authSession.update({ where: { id: persistent.id }, data: { createdAt: new Date("2020-01-01"), lastSeenAt: new Date("2020-01-01") } });
    assert.equal((await fetch("http://127.0.0.1:3000/api/auth/session", { headers: { Cookie: cookie } })).status, 200);
    assert.equal((await fetch("http://127.0.0.1:3000/api/auth/logout", { method: "POST", headers: { Cookie: cookie } })).status, 200);
    assert.equal((await fetch("http://127.0.0.1:3000/api/auth/session", { headers: { Cookie: cookie } })).status, 401);
    assert.equal(await prisma.authSession.count({ where: { id: persistent.id } }), 0);
    const browserCookie = await login(false);
    const browser = await prisma.authSession.findFirstOrThrow({ where: { employeeId } });
    assert.ok(browser.expiresAt && browser.expiresAt.getTime() > now + 11 * 3600000);
    await prisma.authSession.update({ where: { id: browser.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    assert.equal((await fetch("http://127.0.0.1:3000/api/auth/session", { headers: { Cookie: browserCookie } })).status, 401);
    const disabledCookie = await login(true);
    await prisma.employee.update({ where: { id: employeeId }, data: { active: false } });
    assert.equal((await fetch("http://127.0.0.1:3000/api/auth/session", { headers: { Cookie: disabledCookie } })).status, 401);
    console.log("PASS: desktop sessions do not expire by age; logout and account disabling revoke access; browser expiry remains 12h.");
  } finally {
    await prisma.loginLog.deleteMany({ where: { username } });
    if (employeeId !== undefined) await prisma.employee.delete({ where: { id: employeeId } });
    await prisma.position.delete({ where: { id: position.id } });
    await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
