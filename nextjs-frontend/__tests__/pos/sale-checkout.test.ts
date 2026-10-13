import type { CartItem } from "@/lib/pos/pricing";
import { checkoutBlockers, effectiveTendered, toSaleCreate, type CheckoutState } from "@/lib/pos/sale";

const line: CartItem = { itemId: "a", name: "A", unitType: "unit", category: null, unitPrice: 1000, quantity: 2 };

function state(overrides: Partial<CheckoutState> = {}): CheckoutState {
  return { cart: [line], method: "cash", tendered: "", total: 2000, customerId: null, partialPayment: null, ...overrides };
}

describe("effectiveTendered", () => {
  it("treats an empty field as the exact amount", () => {
    expect(effectiveTendered("", 2000)).toBe(2000);
    expect(effectiveTendered("  ", 2000)).toBe(2000);
    expect(effectiveTendered("5000", 2000)).toBe(5000);
  });
});

describe("checkoutBlockers", () => {
  it("lets an exact cash sale through", () => {
    expect(checkoutBlockers(state())).toEqual([]);
  });

  it("blocks an empty cart", () => {
    expect(checkoutBlockers(state({ cart: [] }))).toContain("emptyCart");
  });

  it("blocks cash below the total", () => {
    expect(checkoutBlockers(state({ tendered: "1500" }))).toEqual(["notEnoughCash"]);
  });

  it("does not check cash for other methods", () => {
    expect(checkoutBlockers(state({ method: "card", tendered: "1" }))).toEqual([]);
    expect(checkoutBlockers(state({ method: "internal", tendered: "1" }))).toEqual([]);
  });

  it("needs a customer for credit and a partial payment within the total", () => {
    expect(checkoutBlockers(state({ method: "credit" }))).toEqual(["chooseCustomer"]);
    expect(checkoutBlockers(state({ method: "credit", customerId: "c" }))).toEqual([]);
    expect(checkoutBlockers(state({ method: "credit", customerId: "c", partialPayment: 2500 }))).toEqual([
      "partialExceedsTotal",
    ]);
  });

  it("blocks a manual price without a reason", () => {
    const cart = [{ ...line, manualOverridePrice: 500, manualOverrideReason: " " }];
    expect(checkoutBlockers(state({ cart }))).toEqual(["overrideReason"]);
  });
});

describe("toSaleCreate", () => {
  const base = { requestId: "req-1", subtotalOverride: null };

  it("sends the exact amount as tendered for an empty cash field", () => {
    const payload = toSaleCreate({ ...state(), ...base });
    expect(payload).toMatchObject({ request_id: "req-1", payment_method: "cash", amount_tendered: 2000 });
    expect(payload.items).toEqual([
      { item_id: "a", quantity: 2, unit_price_override: undefined, manual_override_reason: undefined },
    ]);
  });

  it("only sends customer and partial payment for credit", () => {
    const credit = toSaleCreate({ ...state({ method: "credit", customerId: "c", partialPayment: 500 }), ...base });
    expect(credit).toMatchObject({ customer_id: "c", partial_payment: 500, amount_tendered: undefined });

    const card = toSaleCreate({ ...state({ method: "card", customerId: "c", partialPayment: 500 }), ...base });
    expect(card).toMatchObject({ payment_method: "card", customer_id: undefined, partial_payment: undefined });
  });

  it("includes the subtotal override", () => {
    const payload = toSaleCreate({ ...state(), requestId: "r", subtotalOverride: { amount: 1500, reason: "promo" } });
    expect(payload).toMatchObject({ subtotal_override: 1500, subtotal_override_reason: "promo" });
  });
});
