import {
  canSkipPrice,
  emptyProductDraft,
  firstBlockedStep,
  productWarnings,
  stepBlockers,
  toItemCreate,
  type ProductDraft,
} from "@/lib/products/draft";

const catalog = [
  { id: "1", name: "Coca Cola 2L", sku: "7790001" },
  { id: "2", name: "Pan francés", sku: null },
];

function draft(overrides: Partial<ProductDraft> = {}): ProductDraft {
  return { ...emptyProductDraft(), name: "Fanta 1L", price: 9000, ...overrides };
}

describe("stepBlockers", () => {
  it("needs a name on the first step", () => {
    expect(stepBlockers(draft({ name: "  " }), "product", catalog)).toEqual(["nameRequired"]);
  });

  it("blocks a barcode that already exists (ignoring spaces and case)", () => {
    expect(stepBlockers(draft({ sku: " 7790001 " }), "product", catalog)).toEqual(["skuTaken"]);
    expect(stepBlockers(draft({ sku: "7790002" }), "product", catalog)).toEqual([]);
  });

  it("rejects negative price and stock but allows empty ones", () => {
    expect(stepBlockers(draft({ price: -1 }), "price", catalog)).toEqual(["invalidPrice"]);
    expect(stepBlockers(draft({ price: null }), "price", catalog)).toEqual([]);
    expect(stepBlockers(draft({ stock: -2 }), "stock", catalog)).toEqual(["invalidStock"]);
    expect(stepBlockers(draft({ minStock: -1 }), "stock", catalog)).toEqual(["invalidStock"]);
    expect(stepBlockers(draft({ stock: null }), "stock", catalog)).toEqual([]);
  });
});

describe("firstBlockedStep", () => {
  it("stops at the first step that needs something", () => {
    expect(firstBlockedStep(draft({ name: "" }), catalog)).toBe("product");
    expect(firstBlockedStep(draft({ price: -5 }), catalog)).toBe("price");
    expect(firstBlockedStep(draft({ stock: -1 }), catalog)).toBe("stock");
    expect(firstBlockedStep(draft(), catalog)).toBe("review");
  });
});

describe("price and warnings", () => {
  it("lets the price be skipped, with a warning", () => {
    expect(canSkipPrice(draft({ price: null }))).toBe(true);
    expect(canSkipPrice(draft({ price: 0 }))).toBe(true);
    expect(canSkipPrice(draft())).toBe(false);
    expect(productWarnings(draft({ price: null }), catalog)).toEqual([{ type: "noPrice" }]);
  });

  it("warns about a similar existing product", () => {
    expect(productWarnings(draft({ name: "coca cola 2l" }), catalog)).toEqual([
      { type: "similarName", existing: "Coca Cola 2L" },
    ]);
  });
});

describe("toItemCreate", () => {
  it("stores kg as grams for weighed products", () => {
    const body = toItemCreate(draft({ unit: "gram", stock: 2.5, minStock: 0.5 }));
    expect(body).toMatchObject({ unit_type: "gram", stock: 2500, min_stock: 500 });
  });

  it("keeps other units as typed", () => {
    expect(toItemCreate(draft({ unit: "liter", stock: 1.5 })).stock).toBe(1.5);
    expect(toItemCreate(draft({ stock: 12 })).stock).toBe(12);
  });

  it("trims text, drops empty optional fields and defaults stock to 0", () => {
    const body = toItemCreate(draft({ name: "  Fanta 1L ", sku: "  ", category: " Bebidas ", price: null }));
    expect(body).toEqual({
      name: "Fanta 1L",
      sku: undefined,
      category: "Bebidas",
      description: undefined,
      unit_type: "unit",
      price: undefined,
      stock: 0,
      min_stock: undefined,
      source: "products",
    });
  });
});

describe("emptyProductDraft", () => {
  it("can keep the category and unit for the next product", () => {
    const next = emptyProductDraft({ category: "Bebidas", unit: "pack" });
    expect(next).toMatchObject({ category: "Bebidas", unit: "pack", name: "", sku: "", price: null });
  });
});
