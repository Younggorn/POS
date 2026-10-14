import "server-only";

export function requestAuditContext(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return {
    ipAddress: (forwarded || request.headers.get("x-real-ip") || null)?.slice(0, 64) ?? null,
    userAgent: request.headers.get("user-agent")?.slice(0, 500) || null,
  };
}
