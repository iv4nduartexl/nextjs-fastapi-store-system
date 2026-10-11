import { createScannerDetector } from "@/lib/pos/barcode";
import { suggestCashAmounts } from "@/lib/pos/cash";
import {
  findBySku,
  parseMultiplier,
  searchCatalog,
  type PosProduct,
} from "@/lib/pos/catalog-search";

function product(name: string, sku: string | null = null, category: string | null = null): PosProduct {
  return { id: name, name, sku, category, unit_type: "unit", price: "1000", stock: "10", min_stock: null };
}

const catalog = [
  product("Coca Cola 2L", "7790001", "Bebidas"),
  product("Coca Cola 500ml", "7790002", "Bebidas"),
  product("Café Bustelo", "CAF-1", "Almacén"),
  product("Agua mineral", null, "Bebidas"),
  product("Pan francés", "PAN", "Panadería"),
];

describe("searchCatalog", () => {
  it("ignores accents and case", () => {
    expect(searchCatalog(catalog, "cafe").map((p) => p.name)).toEqual(["Café Bustelo"]);
    expect(searchCatalog(catalog, "FRANCES").map((p) => p.name)).toEqual(["Pan francés"]);
  });

  it("matches words in any order", () => {
    expect(searchCatalog(catalog, "2l coca").map((p) => p.name)).toEqual(["Coca Cola 2L"]);
  });

  it("ranks an exact SKU first", () => {
    expect(searchCatalog(catalog, "7790002")[0].name).toBe("Coca Cola 500ml");
  });

  it("searches the category too", () => {
    expect(searchCatalog(catalog, "bebidas")).toHaveLength(3);
  });

  it("returns nothing for an empty query", () => {
    expect(searchCatalog(catalog, "   ")).toEqual([]);
  });
});

describe("findBySku", () => {
  it("finds exact codes only", () => {
    expect(findBySku(catalog, "7790001")?.name).toBe("Coca Cola 2L");
    expect(findBySku(catalog, "779000")).toBeUndefined();
    expect(findBySku(catalog, "caf-1")?.name).toBe("Café Bustelo");
  });
});

describe("parseMultiplier", () => {
  it("splits quantity and term", () => {
    expect(parseMultiplier("3*coca")).toEqual({ quantity: 3, term: "coca" });
    expect(parseMultiplier("12 * 7790001")).toEqual({ quantity: 12, term: "7790001" });
    expect(parseMultiplier("1,5*queso")).toEqual({ quantity: 1.5, term: "queso" });
  });

  it("leaves normal searches alone", () => {
    expect(parseMultiplier("coca 2l")).toEqual({ quantity: null, term: "coca 2l" });
  });
});

describe("createScannerDetector", () => {
  function typeCode(detector: ReturnType<typeof createScannerDetector>, code: string, gap: number, start = 1000) {
    let t = start;
    let result: string | null = null;
    for (const ch of code) result = detector.feed(ch, (t += gap));
    result = detector.feed("Enter", (t += gap));
    return result;
  }

  it("detects fast input ending in Enter as a scan", () => {
    expect(typeCode(createScannerDetector(), "7790001", 10)).toBe("7790001");
  });

  it("ignores human typing speed", () => {
    expect(typeCode(createScannerDetector(), "7790001", 150)).toBeNull();
  });

  it("ignores codes that are too short", () => {
    expect(typeCode(createScannerDetector(), "12", 10)).toBeNull();
  });
});

describe("suggestCashAmounts", () => {
  it("offers the exact amount and the next round bills", () => {
    expect(suggestCashAmounts(39000)).toEqual([39000, 40000, 50000, 100000]);
  });

  it("does not repeat an already round total", () => {
    expect(suggestCashAmounts(50000)).toEqual([50000, 100000]);
  });

  it("returns nothing for an empty sale", () => {
    expect(suggestCashAmounts(0)).toEqual([]);
  });
});
