export function isPositivePurchaseNumber(value: unknown): boolean {
  if (typeof value !== "number" && typeof value !== "string") return false;
  if (typeof value === "string" && !value.trim()) return false;
  return Number.isFinite(Number(value)) && Number(value) > 0;
}
