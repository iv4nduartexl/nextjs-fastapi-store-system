import {
  countReducer,
  countSummary,
  emptyCount,
  filterProducts,
  fromDisplay,
  toCountPayload,
  toDisplay,
} from "@/lib/inventory/count";
import type { PosProduct } from "@/lib/pos/catalog-search";
import { looksLikeCode, quickCreatePrefill, toPosProduct } from "@/lib/pos/quick-create";

function product(over: Partial<PosProduct> = {}): PosProduct {
  return {
    id: "p1",
    name: "Coca Cola 2L",
    sku: "7790001",
    category: "Bebidas",
    unit_type: "unit",
    price: "12000",
    stock: "10",
    min_stock: null,
    ...over,
  };
}

const cola = product();
const agua = product({ id: "p2", name: "Agua", sku: null, stock: "5", price: "5000" });
const queso = product({ id: "p3", name: "Queso", category: "Lácteos", unit_type: "gram", stock: "3000", price: "60000" });
const catalog = [cola, agua, queso];

describe("inventory count", () => {
  it("counts by scanning (+1 each) or typing, remembering the stock seen at that moment", () => {
    let draft = emptyCount("Bebidas", new Date(2026, 9, 11));
    draft = countReducer(draft, { type: "scan", product: cola });
    draft = countReducer(draft, { type: "scan", product: cola });
    expect(draft.entries.p1).toEqual({ counted: 2, expected: 10 });

    // A sale happened meanwhile: the next edit uses the fresh stock
    draft = countReducer(draft, { type: "set", product: { ...cola, stock: "9" }, counted: 8 });
    expect(draft.entries.p1).toEqual({ counted: 8, expected: 9 });

    draft = countReducer(draft, { type: "set", product: cola, counted: null });
    expect(draft.entries.p1).toBeUndefined();
  });

  it("keeps weighed products in grams while showing kg", () => {
    expect(toDisplay(2500, "gram")).toBe(2.5);
    expect(fromDisplay(2.5, "gram")).toBe(2500);
    expect(fromDisplay(3, "unit")).toBe(3);
  });

  it("summarises progress, differences and their value", () => {
    let draft = emptyCount("Bebidas");
    draft = countReducer(draft, { type: "set", product: cola, counted: 8 });
    draft = countReducer(draft, { type: "set", product: agua, counted: 5 });
    // Counted outside the category (found on the shelf): still counts
    draft = countReducer(draft, { type: "set", product: queso, counted: 2500 });

    const summary = countSummary(catalog, draft);
    expect(summary).toMatchObject({ total: 2, counted: 3, withDifferences: 1, up: 0, down: 1, uncountedWithStock: 0 });
    expect(summary.valueChange).toBe(-24000);

    expect(filterProducts([cola, agua], draft, "differences").map((p) => p.id)).toEqual(["p1"]);
    expect(filterProducts([cola, agua], countReducer(draft, { type: "set", product: agua, counted: null }), "pending").map((p) => p.id)).toEqual(["p2"]);
  });

  it("builds the request", () => {
    let draft = emptyCount(null);
    draft = countReducer(draft, { type: "set", product: queso, counted: 2500 });
    expect(toCountPayload(draft, true, "  fin de mes ")).toEqual({
      category: undefined,
      notes: "fin de mes",
      zero_uncounted: true,
      lines: [{ item_id: "p3", counted: 2500, expected: 3000 }],
    });
  });
});

describe("create a product from the register", () => {
  it("puts codes in the barcode field and words in the name", () => {
    expect(looksLikeCode("7791234567890")).toBe(true);
    expect(looksLikeCode("ABC-1234")).toBe(true);
    expect(looksLikeCode("coca 2l")).toBe(false);
    expect(looksLikeCode("7up")).toBe(false);
    expect(quickCreatePrefill(" 7791234 ")).toEqual({ name: "", sku: "7791234" });
    expect(quickCreatePrefill("galletitas maría")).toEqual({ name: "Galletitas maría", sku: "" });
  });

  it("maps the API item to the register's product", () => {
    expect(toPosProduct({ id: "x", name: "Pan", price: "3000", stock: "0", unit_type: "unit" })).toEqual({
      id: "x", name: "Pan", sku: null, category: null, unit_type: "unit", price: "3000", stock: "0", min_stock: null,
    });
  });
});
