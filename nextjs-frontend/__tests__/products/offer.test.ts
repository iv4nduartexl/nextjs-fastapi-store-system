import { emptyOffer, offerErrors, offerName, offerPreview, toDiscountRuleInput, type OfferDraft } from "@/lib/products/offer";

const words = { per: "por", from: "desde" };

function offer(overrides: Partial<OfferDraft>): OfferDraft {
  return { ...emptyOffer(), ...overrides };
}

describe("toDiscountRuleInput", () => {
  it("stores a pack as the total price for the quantity", () => {
    expect(toDiscountRuleInput(offer({ kind: "pack", qty: 3, packPrice: 30000 }), "n")).toEqual({
      name: "n",
      min_qty: 3,
      rule_type: "fixed_price",
      fixed_unit_price: 30000,
    });
  });

  it("turns 'take 3, pay 2' into buy 2 + 1 free", () => {
    expect(toDiscountRuleInput(offer({ kind: "buyGet", qty: 3, pay: 2 }), "n")).toMatchObject({
      min_qty: 3,
      rule_type: "buy_x_get_y",
      buy_qty: 2,
      free_qty: 1,
    });
  });

  it("stores a percent with its starting quantity", () => {
    expect(toDiscountRuleInput(offer({ kind: "percent", qty: 6, percent: 10 }), "n")).toMatchObject({
      min_qty: 6,
      rule_type: "percent",
      percent_off: 10,
    });
  });
});

describe("offerName", () => {
  it("reads like the shop says it", () => {
    expect(offerName(offer({ kind: "pack", qty: 3, packPrice: 30000 }), words)).toBe("3 por ₲30.000");
    expect(offerName(offer({ kind: "buyGet", qty: 3, pay: 2 }), words)).toBe("3x2");
    expect(offerName(offer({ kind: "percent", qty: 6, percent: 10 }), words)).toBe("10% desde 6");
    expect(offerName(offer({ kind: "pack", qty: 2, packPrice: 50000 }), { ...words, unit: "kg" })).toBe(
      "2 kg por ₲50.000",
    );
  });
});

describe("offerErrors", () => {
  it("accepts complete offers", () => {
    expect(offerErrors(offer({ kind: "pack", qty: 3, packPrice: 30000 }), 12000, "unit")).toEqual([]);
    expect(offerErrors(offer({ kind: "buyGet", qty: 2, pay: 1 }), 12000, "unit")).toEqual([]);
    expect(offerErrors(offer({ kind: "percent", qty: 1.5, percent: 10 }), 50000, "gram")).toEqual([]);
  });

  it("needs at least 2 whole units for countable products", () => {
    expect(offerErrors(offer({ kind: "pack", qty: 1, packPrice: 5000 }), 12000, "unit")).toContain("qty");
    expect(offerErrors(offer({ kind: "pack", qty: 2.5, packPrice: 5000 }), 12000, "unit")).toContain("qty");
  });

  it("rejects a pack that isn't cheaper than buying them one by one", () => {
    expect(offerErrors(offer({ kind: "pack", qty: 3, packPrice: 36000 }), 12000, "unit")).toEqual(["packPrice"]);
  });

  it("needs to pay for fewer than they take", () => {
    expect(offerErrors(offer({ kind: "buyGet", qty: 3, pay: 3 }), 12000, "unit")).toEqual(["pay"]);
    expect(offerErrors(offer({ kind: "buyGet", qty: 3, pay: 0 }), 12000, "unit")).toEqual(["pay"]);
  });

  it("keeps the percent between 1 and 99", () => {
    expect(offerErrors(offer({ kind: "percent", qty: 6, percent: 100 }), 12000, "unit")).toEqual(["percent"]);
    expect(offerErrors(offer({ kind: "percent", qty: 6, percent: null }), 12000, "unit")).toEqual(["percent"]);
  });
});

describe("offerPreview (same pricing as the register)", () => {
  it("prices a pack", () => {
    const p = offerPreview(offer({ kind: "pack", qty: 3, packPrice: 30000 }), 12000, "unit", 3);
    expect(p).toMatchObject({ total: 30000, normal: 36000, savings: 6000, perUnit: 10000, applies: true });
    expect(offerPreview(offer({ kind: "pack", qty: 3, packPrice: 30000 }), 12000, "unit", 1).applies).toBe(false);
  });

  it("prices take 3 pay 2", () => {
    expect(offerPreview(offer({ kind: "buyGet", qty: 3, pay: 2 }), 12000, "unit", 3).total).toBeCloseTo(24000);
  });

  it("prices a percent", () => {
    expect(offerPreview(offer({ kind: "percent", qty: 6, percent: 10 }), 12000, "unit", 6).total).toBeCloseTo(64800);
  });

  it("works in kg for weighed products", () => {
    const p = offerPreview(offer({ kind: "pack", qty: 2, packPrice: 90000 }), 50000, "gram", 2);
    expect(p).toMatchObject({ total: 90000, normal: 100000, perUnit: 45000 });
  });
});
