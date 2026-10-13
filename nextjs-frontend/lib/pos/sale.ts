// Checkout rules for the sale flow: payment methods, what blocks charging and the payload sent.
import type { CartItem } from "@/lib/pos/pricing";

/** "card" also covers bank transfers: both are money that lands in the account */
export type PaymentMethod = "cash" | "card" | "credit" | "internal";

/** Order of the payment tiles; `key` is the function-key shortcut (digits 1–4 also work) */
export const PAYMENT_METHODS: { method: PaymentMethod; key: string }[] = [
  { method: "cash", key: "F2" },
  { method: "card", key: "F3" },
  { method: "credit", key: "F4" },
  { method: "internal", key: "F5" },
];

/** Reason codes, translated under sales.pos.blocked.* */
export type CheckoutBlocker =
  | "emptyCart"
  | "overrideReason"
  | "notEnoughCash"
  | "chooseCustomer"
  | "partialExceedsTotal";

export interface CheckoutState {
  cart: CartItem[];
  method: PaymentMethod;
  /** What the customer handed over, as typed; empty means the exact amount */
  tendered: string;
  total: number;
  customerId: string | null;
  partialPayment: number | null;
}

/** An empty "received" field means the customer paid the exact amount */
export function effectiveTendered(tendered: string, total: number): number {
  return tendered.trim() === "" ? total : parseFloat(tendered) || 0;
}

export function checkoutBlockers(state: CheckoutState): CheckoutBlocker[] {
  const reasons: CheckoutBlocker[] = [];
  if (state.cart.length === 0) reasons.push("emptyCart");
  if (state.cart.some((c) => c.manualOverridePrice != null && !(c.manualOverrideReason || "").trim())) {
    reasons.push("overrideReason");
  }
  if (state.method === "cash" && effectiveTendered(state.tendered, state.total) < state.total) {
    reasons.push("notEnoughCash");
  }
  if (state.method === "credit") {
    if (!state.customerId) reasons.push("chooseCustomer");
    if (state.partialPayment && state.partialPayment > state.total) reasons.push("partialExceedsTotal");
  }
  return reasons;
}

export function toSaleCreate(
  state: CheckoutState & {
    requestId: string;
    subtotalOverride: { amount: number; reason: string } | null;
  },
) {
  const isCredit = state.method === "credit";
  return {
    request_id: state.requestId,
    items: state.cart.map((c) => ({
      item_id: c.itemId,
      quantity: c.quantity,
      unit_price_override: c.manualOverridePrice,
      manual_override_reason: c.manualOverrideReason,
    })),
    payment_method: state.method,
    amount_tendered: state.method === "cash" ? effectiveTendered(state.tendered, state.total) : undefined,
    customer_id: isCredit ? state.customerId ?? undefined : undefined,
    subtotal_override: state.subtotalOverride?.amount,
    subtotal_override_reason: state.subtotalOverride?.reason,
    // Saved in the same transaction as the sale: all or nothing
    partial_payment: isCredit && state.partialPayment ? state.partialPayment : undefined,
  };
}

export function newCheckoutId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
