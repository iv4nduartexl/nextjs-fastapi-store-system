import { formatDateInputValue, toDateInputValue } from "@/lib/dates";
import { draftWarnings, findSimilarProduct, firstBlockedStep, needsCashboxQuestion, stepBlockers } from "@/lib/purchases/checks";
import {
  draftReducer,
  emptyDraft,
  findLineForProduct,
  lineFromProduct,
  newProductLine,
  purchaseTotal,
  type PurchaseDraft,
  type PurchasingProduct,
} from "@/lib/purchases/draft";
import { toPurchaseCreate } from "@/lib/purchases/payload";
import { margin, suggestPriceForCost, suggestPriceForNewProduct, typicalMarkup } from "@/lib/purchases/pricing";

function product(over: Partial<PurchasingProduct> = {}): PurchasingProduct {
  return {
    id: "p1",
    name: "Coca Cola 2L",
    sku: "7790001",
    category: "Bebidas",
    unit_type: "unit",
    price: "12000",
    stock: "10",
    min_stock: null,
    last_unit_cost: "8500",
    last_purchased_at: null,
    ...over,
  };
}

const catalog = [product(), product({ id: "p2", name: "Queso Paraguay", unit_type: "gram", price: "80000", last_unit_cost: "60000" })];

// Dated today unless a test says otherwise, so the past-date cashbox question stays out of the way
function withLines(...lines: ReturnType<typeof lineFromProduct>[]): PurchaseDraft {
  return lines.reduce((d, line) => draftReducer(d, { type: "addLine", line }), emptyDraft(toDateInputValue()));
}

describe("lines", () => {
  it("prefills the last cost and current sell price", () => {
    const line = lineFromProduct(product(), { quantity: 24 });
    expect(line.unitCost).toBe(8500);
    expect(line.lineTotal).toBe(204000);
    expect(line.sellPrice).toBe(12000);
  });

  it("keeps unit cost and line total in sync, including kg pricing", () => {
    let draft = withLines(lineFromProduct(catalog[1]));
    const key = draft.lines[0].key;
    draft = draftReducer(draft, { type: "updateLine", key, patch: { quantity: 2500 }, changed: "quantity" });
    expect(draft.lines[0].lineTotal).toBe(150000); // 2.5 kg × 60.000

    draft = draftReducer(draft, { type: "updateLine", key, patch: { lineTotal: 100000 }, changed: "lineTotal" });
    expect(draft.lines[0].unitCost).toBe(40000);
  });

  it("keeps the typed total when the quantity changes and recalculates the unit cost", () => {
    let draft = withLines(lineFromProduct(catalog[1], { quantity: 2500 }));
    const key = draft.lines[0].key;
    draft = draftReducer(draft, { type: "updateLine", key, patch: { lineTotal: 100000 }, changed: "lineTotal" });
    expect(draft.lines[0].costSource).toBe("line");
    draft = draftReducer(draft, { type: "updateLine", key, patch: { quantity: 2000 }, changed: "quantity" });
    expect(draft.lines[0].lineTotal).toBe(100000);
    expect(draft.lines[0].unitCost).toBe(50000);
  });

  it("keeps the typed unit cost when the quantity changes and recalculates the total", () => {
    let draft = withLines(lineFromProduct(product(), { quantity: 2 }));
    const key = draft.lines[0].key;
    draft = draftReducer(draft, { type: "updateLine", key, patch: { lineTotal: 30000 }, changed: "lineTotal" });
    draft = draftReducer(draft, { type: "updateLine", key, patch: { unitCost: 9000 }, changed: "unitCost" });
    expect(draft.lines[0].costSource).toBe("unit");
    draft = draftReducer(draft, { type: "updateLine", key, patch: { quantity: 3 }, changed: "quantity" });
    expect(draft.lines[0].unitCost).toBe(9000);
    expect(draft.lines[0].lineTotal).toBe(27000);
  });

  it("works with decimal costs", () => {
    let draft = withLines(lineFromProduct(product(), { quantity: 3 }));
    const key = draft.lines[0].key;
    draft = draftReducer(draft, { type: "updateLine", key, patch: { unitCost: 1234.56 }, changed: "unitCost" });
    expect(draft.lines[0].lineTotal).toBe(3703.68);
    draft = draftReducer(draft, { type: "updateLine", key, patch: { lineTotal: 100 }, changed: "lineTotal" });
    expect(draft.lines[0].unitCost).toBe(33.33);
    expect(draft.lines[0].lineTotal).toBe(100);
  });

  it("treats lines from old saved drafts (no cost source) as unit cost", () => {
    const old = { ...lineFromProduct(product(), { quantity: 2 }), costSource: undefined };
    let draft = withLines(old);
    draft = draftReducer(draft, { type: "updateLine", key: old.key, patch: { quantity: 4 }, changed: "quantity" });
    expect(draft.lines[0].lineTotal).toBe(34000);
  });

  it("finds an existing line so a product isn't added twice", () => {
    const draft = withLines(lineFromProduct(product()));
    expect(findLineForProduct(draft, "p1")).toBeDefined();
    expect(findLineForProduct(draft, "other")).toBeUndefined();
  });
});

describe("step blockers", () => {
  it("asks for a supplier or an explicit 'no supplier'", () => {
    const draft = emptyDraft("2026-10-11");
    expect(stepBlockers(draft, "supplier")).toEqual(["chooseSupplier"]);
    expect(stepBlockers(draftReducer(draft, { type: "setNoSupplier", value: true }), "supplier")).toEqual([]);
  });

  it("requires quantity, cost and a sell price for new products", () => {
    const draft = withLines(newProductLine("Galletas"));
    expect(stepBlockers(draft, "products")).toEqual(["lineQuantity", "lineCost", "newProductPrice"]);
  });

  it("validates the partial payment against the total", () => {
    let draft = withLines(lineFromProduct(product(), { quantity: 10 }));
    draft = draftReducer(draft, { type: "setPayment", patch: { kind: "partial", paidAmount: 85000 } });
    expect(stepBlockers(draft, "payment")).toEqual(["partialAmount"]);
    draft = draftReducer(draft, { type: "setPayment", patch: { paidAmount: 40000 } });
    expect(stepBlockers(draft, "payment")).toEqual([]);
  });

  it("points to the first step that still needs something", () => {
    const draft = draftReducer(emptyDraft("2026-10-11"), { type: "setNoSupplier", value: true });
    expect(firstBlockedStep(draft)).toBe("products");
  });
});

describe("warnings", () => {
  it("flags selling at a loss, big cost jumps and invoice mismatches", () => {
    let draft = withLines(lineFromProduct(product(), { quantity: 10 }));
    const key = draft.lines[0].key;
    draft = draftReducer(draft, { type: "updateLine", key, patch: { unitCost: 13000 }, changed: "unitCost" });
    draft = draftReducer(draft, { type: "setHeader", patch: { invoiceTotal: 140000 } });
    const types = draftWarnings(draft, catalog).map((w) => w.type);
    expect(types).toEqual(["loss", "costJump", "invoiceMismatch"]);
  });

  it("suggests linking when a new product looks like an existing one", () => {
    expect(findSimilarProduct("coca cola 2l", catalog)?.id).toBe("p1");
    expect(findSimilarProduct("Galletas María", catalog)).toBeUndefined();
  });
});

describe("pricing", () => {
  it("computes margins", () => {
    expect(margin(8500, 12000)).toBeCloseTo(0.2917, 3);
  });

  it("suggests a price that keeps the markup only when the margin drops", () => {
    expect(suggestPriceForCost(9000, 8500, 12000)).toBe(12800);
    expect(suggestPriceForCost(8000, 8500, 12000)).toBeNull();
  });

  it("suggests a price for new products from the store's usual markup", () => {
    const markup = typicalMarkup([
      { cost: 100, price: 150 },
      { cost: 100, price: 140 },
      { cost: 100, price: 130 },
    ]);
    expect(markup).toBeCloseTo(1.4);
    expect(suggestPriceForNewProduct(5000, markup)).toBe(7000);
  });
});

describe("payload", () => {
  it("maps the wizard choices to the purchase request", () => {
    let draft = withLines(lineFromProduct(product(), { quantity: 10 }), {
      ...newProductLine("Galletas María"),
      quantity: 12,
      unitCost: 5000,
      lineTotal: 60000,
      sellPrice: 7000,
      category: "Almacén",
    });
    const key = draft.lines[0].key;
    draft = draftReducer(draft, { type: "updateLine", key, patch: { sellPrice: 12500 } });
    draft = draftReducer(draft, { type: "setSupplier", supplier: { name: "Distri" } });
    draft = draftReducer(draft, { type: "setPayment", patch: { kind: "later" } });

    const body = toPurchaseCreate(draft, new Date(2026, 9, 11, 10));
    expect(body.payment_method).toBe("credit");
    expect(body.payment_status).toBe("unpaid");
    expect(body.items[0]).toMatchObject({ item_id: "p1", sell_price: 12500, overwrite_previous_value: true, sku: undefined });
    expect(body.items[1]).toMatchObject({ item_id: undefined, item_name: "Galletas María", sell_price: 7000, category: "Almacén" });
    expect(purchaseTotal(draft)).toBe(145000);
  });

  it("doesn't touch the price when the change is unchecked in review", () => {
    let draft = withLines(lineFromProduct(product(), { quantity: 1 }));
    const key = draft.lines[0].key;
    draft = draftReducer(draft, { type: "updateLine", key, patch: { sellPrice: 13000, applyPriceChange: false } });
    draft = draftReducer(draft, { type: "setPayment", patch: { kind: "paid", method: "transfer" } });
    const body = toPurchaseCreate(draft);
    expect(body.items[0].sell_price).toBeUndefined();
    expect(body.items[0].overwrite_previous_value).toBe(false);
    expect(body.paid_amount).toBe(8500);
  });
});

describe("past-dated purchases and the cashbox", () => {
  const today = "2026-10-11";
  function dated(date: string, patch: Partial<PurchaseDraft["payment"]>): PurchaseDraft {
    const draft = { ...withLines(lineFromProduct(product(), { quantity: 10 })), date };
    return draftReducer(draft, { type: "setPayment", patch });
  }

  it("asks only when something is paid now and the date isn't today", () => {
    expect(needsCashboxQuestion(dated(today, { kind: "paid" }), today)).toBe(false);
    expect(needsCashboxQuestion(dated("2026-10-05", { kind: "later" }), today)).toBe(false);
    expect(needsCashboxQuestion(dated("2026-10-05", { kind: "paid" }), today)).toBe(true);
    expect(needsCashboxQuestion(dated("2026-10-05", { kind: "partial", paidAmount: 1000 }), today)).toBe(true);
  });

  it("blocks the payment step until the source is chosen", () => {
    const draft = dated("2000-01-01", { kind: "paid", method: "cash" });
    expect(stepBlockers(draft, "payment")).toEqual(["cashboxSource"]);
    expect(stepBlockers(draftReducer(draft, { type: "setPayment", patch: { fromCashboxToday: false } }), "payment")).toEqual([]);
  });

  it("forgets the answer when switching to pay later", () => {
    let draft = dated("2000-01-01", { kind: "paid", fromCashboxToday: true });
    draft = draftReducer(draft, { type: "setPayment", patch: { kind: "later" } });
    expect(draft.payment.fromCashboxToday).toBeNull();
  });

  it("sends whether the payment touches today's cashbox", () => {
    const now = new Date(2026, 9, 11, 10);
    expect(toPurchaseCreate(dated(today, { kind: "paid" }), now).payment_affects_cashbox).toBe(true);
    expect(toPurchaseCreate(dated("2026-10-05", { kind: "paid", fromCashboxToday: true }), now).payment_affects_cashbox).toBe(true);
    expect(toPurchaseCreate(dated("2026-10-05", { kind: "paid", fromCashboxToday: false }), now).payment_affects_cashbox).toBe(false);
    expect(toPurchaseCreate(dated("2026-10-05", { kind: "later" }), now).payment_affects_cashbox).toBeUndefined();
  });

  it("formats picked days without timezone shifts", () => {
    expect(formatDateInputValue("2026-10-05", "es-PY")).toBe("05/10/2026");
  });
});
