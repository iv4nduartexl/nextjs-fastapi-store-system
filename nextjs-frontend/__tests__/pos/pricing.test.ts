import {
  cartCount,
  cartTotal,
  getPricing,
  roundedUnitPrice,
  type CartItem,
  type QuantityDiscountRule,
} from "@/lib/pos/pricing";

function item(overrides: Partial<CartItem> = {}): CartItem {
  return { itemId: "a", name: "A", unitType: "unit", category: "Bebidas", unitPrice: 1000, quantity: 1, ...overrides };
}

function rule(overrides: Partial<QuantityDiscountRule>): QuantityDiscountRule {
  return {
    id: "r",
    name: "Rule",
    scope: "global",
    item_id: null,
    category: null,
    min_qty: "0",
    rule_type: "percent",
    percent_off: null,
    fixed_unit_price: null,
    buy_qty: null,
    free_qty: null,
    ...overrides,
  };
}

describe("getPricing", () => {
  it("uses the base price without rules", () => {
    const p = getPricing(item({ quantity: 3 }), []);
    expect(p).toMatchObject({ effectiveUnitPrice: 1000, effectiveSubtotal: 3000, pricingSource: "base" });
  });

  it("prices weighed products per kg with grams as quantity", () => {
    const p = getPricing(item({ unitType: "gram", unitPrice: 7000, quantity: 500 }), []);
    expect(p.effectiveSubtotal).toBe(3500);
  });

  it("applies a percent rule only from its minimum quantity", () => {
    const rules = [rule({ name: "10%", min_qty: "3", percent_off: "10" })];
    expect(getPricing(item({ quantity: 2 }), rules).pricingSource).toBe("base");
    const p = getPricing(item({ quantity: 3 }), rules);
    expect(p).toMatchObject({ effectiveSubtotal: 2700, discountAmount: 300, discountRuleName: "10%" });
  });

  it("applies a fixed price for the pack", () => {
    const rules = [rule({ rule_type: "fixed_price", min_qty: "3", fixed_unit_price: "2400" })];
    expect(getPricing(item({ quantity: 3 }), rules).effectiveSubtotal).toBe(2400);
  });

  it("applies buy X get Y", () => {
    const rules = [rule({ rule_type: "buy_x_get_y", buy_qty: "2", free_qty: "1" })];
    // 3 units: one free
    expect(getPricing(item({ quantity: 3 }), rules).effectiveSubtotal).toBeCloseTo(2000);
  });

  it("respects item and category scope and keeps the cheapest rule", () => {
    const rules = [
      rule({ name: "other item", scope: "item", item_id: "b", percent_off: "50" }),
      rule({ name: "other category", scope: "category", category: "Almacén", percent_off: "40" }),
      rule({ name: "small", percent_off: "5" }),
      rule({ name: "big", scope: "category", category: "Bebidas", percent_off: "20" }),
    ];
    expect(getPricing(item(), rules).discountRuleName).toBe("big");
  });

  it("a manual override wins over rules", () => {
    const rules = [rule({ percent_off: "50" })];
    const p = getPricing(item({ quantity: 2, manualOverridePrice: 800, manualOverrideReason: "x" }), rules);
    expect(p).toMatchObject({ effectiveSubtotal: 1600, pricingSource: "manual_override", discountRuleName: null });
  });
});

describe("roundedUnitPrice", () => {
  it("rounds the line up to the next 500 for unit products", () => {
    expect(roundedUnitPrice(item({ unitPrice: 1200, quantity: 3 }))).toBe(4000 / 3);
  });

  it("rounds weighed lines and returns a per-kg price", () => {
    // 121 g at 7.000/kg = 847 → 1.000
    const price = roundedUnitPrice(item({ unitType: "gram", unitPrice: 7000, quantity: 121 }))!;
    expect((price * 121) / 1000).toBeCloseTo(1000);
  });

  it("is null without quantity", () => {
    expect(roundedUnitPrice(item({ quantity: 0 }))).toBeNull();
  });
});

describe("cart totals", () => {
  it("sums the effective subtotals and counts weighed products by kg", () => {
    const cart = [item({ quantity: 2 }), item({ itemId: "b", unitType: "gram", unitPrice: 10000, quantity: 250 })];
    expect(cartTotal(cart, [])).toBe(4500);
    expect(cartCount(cart)).toBe(2.25);
  });
});
