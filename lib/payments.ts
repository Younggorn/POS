import { Prisma } from "@prisma/client";

export const PAYMENT_METHODS = ["cash", "transfer", "card"] as const;
export type PaymentMethod = typeof PAYMENT_METHODS[number];

export type PaymentInput = {
  method?: unknown;
  amount?: unknown;
  receivedAmount?: unknown;
  reference?: unknown;
};

export type ValidatedPayment = {
  method: PaymentMethod;
  amount: Prisma.Decimal;
  receivedAmount: Prisma.Decimal | null;
  changeAmount: Prisma.Decimal | null;
  reference: string | null;
};

const money = (value: unknown, label: string) => {
  const text = typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) throw new Error(`${label}ไม่ถูกต้อง`);
  const decimal = new Prisma.Decimal(text);
  if (decimal.lte(0)) throw new Error(`${label}ต้องมากกว่า 0`);
  return decimal;
};

export function validatePayments(raw: unknown, total: Prisma.Decimal, legacyMethod?: unknown) {
  const inputs: PaymentInput[] = Array.isArray(raw)
    ? raw
    : PAYMENT_METHODS.includes(legacyMethod as PaymentMethod)
      ? [{ method: legacyMethod, amount: total.toString(), receivedAmount: total.toString() }]
      : [];
  if (inputs.length < 1 || inputs.length > PAYMENT_METHODS.length) throw new Error("กรุณาเลือกวิธีชำระเงิน");

  const used = new Set<string>();
  const payments = inputs.map((input) => {
    const method = String(input.method ?? "") as PaymentMethod;
    if (!PAYMENT_METHODS.includes(method)) throw new Error("วิธีชำระเงินไม่ถูกต้อง");
    if (used.has(method)) throw new Error("ไม่สามารถเลือกวิธีชำระเงินซ้ำกันได้");
    used.add(method);
    const amount = money(input.amount, "ยอดชำระ");
    const reference = String(input.reference ?? "").trim() || null;
    if (reference && reference.length > 50) throw new Error("เลขอ้างอิงต้องไม่เกิน 50 ตัวอักษร");
    if (method !== "cash") return { method, amount, receivedAmount: null, changeAmount: null, reference };
    const receivedAmount = input.receivedAmount === undefined || input.receivedAmount === null || input.receivedAmount === ""
      ? amount
      : money(input.receivedAmount, "ยอดรับเงินสด");
    if (receivedAmount.lt(amount)) throw new Error("ยอดรับเงินสดน้อยกว่ายอดชำระเงินสด");
    return { method, amount, receivedAmount, changeAmount: receivedAmount.minus(amount), reference: null };
  });
  const allocated = payments.reduce((sum, payment) => sum.plus(payment.amount), new Prisma.Decimal(0));
  if (!allocated.equals(total)) throw new Error("ผลรวมช่องทางชำระเงินต้องเท่ากับยอดชำระ");
  return payments satisfies ValidatedPayment[];
}

export function salePaymentType(payments: ValidatedPayment[]) {
  if (payments.length > 1) return "M";
  return { cash: "C", transfer: "T", card: "D" }[payments[0].method];
}
