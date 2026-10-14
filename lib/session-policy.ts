export const SESSION_HOURS = 12;
export const DESKTOP_COOKIE_SECONDS = 400 * 24 * 60 * 60;

export function sessionPolicy(client: string | null, now = Date.now()) {
  const persistent = client === "desktop";
  return {
    expiresAt: persistent ? null : new Date(now + SESSION_HOURS * 60 * 60 * 1000),
    cookieExpiresAt: new Date(now + (persistent ? DESKTOP_COOKIE_SECONDS * 1000 : SESSION_HOURS * 60 * 60 * 1000)),
  };
}
