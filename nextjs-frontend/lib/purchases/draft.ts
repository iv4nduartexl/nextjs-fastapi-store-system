// State of a purchase being entered in the wizard (pure, so it can be unit-tested and autosaved).

export type UnitType = "unit" | "gram" | "liter" | "pack";
export type CostMode = "unit" | "line";
export type PaymentKind = "paid" | "partial" | "later";
export type PayMethod = "cash" | "card" | "transfer";

/** A catalog product as the wizard sees it (from GET /purchasing/catalog). */
export interface PurchasingProduct {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  unit_type: string;
  price: string | null;
  stock: string;
  min_stock: string | null;
  last_unit_cost: string | null;
  last_purchased_at: string | null;
}

export interface DraftLine {
  key: string;
  /** null = a new product that will be created */
  itemId: string | null;
  name: string;
  unitType: UnitType;
  /** Units, or grams for weighed products */
  quantity: number | null;
  /** Per unit, or per kg for weighed products */
  unitCost: number | null;
  lineTotal: number | null;
  /** The cost field the user typed (the other one is calculated); missing on old saved drafts = "unit" */
  costSource?: CostMode;
  /** Desired sell price (per kg for weighed products) */
  sellPrice: number | null;
  /** Catalog values at the time the line was added (linked products) */
  currentPrice: number | null;
  currentStock: number | null;
  lastUnitCost: number | null;
  sku: string;
  category: string;
  /** Review checkbox: apply the sell price change to the catalog */
  applyPriceChange: boolean;
}

export interface PurchaseDraft {
  version: 1;
  supplier: { id?: string; name: string } | null;
  noSupplier: boolean;
  date: string;
  invoiceNumber: string;
  invoiceTotal: number | null;
  lines: DraftLine[];
  payment: {
    kind: PaymentKind | null;
    method: PayMethod;
    paidAmount: number | null;
    /** Purchase dated in the past: did the money leave today's cashbox (true) or was it paid back then (false)? */
    fromCashboxToday: boolean | null;
    hasTax: boolean;
    tax: number | null;
    notes: string;
  };
}

export function emptyDraft(today: string): PurchaseDraft {
  return {
    version: 1,
    supplier: null,
    noSupplier: false,
    date: today,
    invoiceNumber: "",
    invoiceTotal: null,
    lines: [],
    payment: { kind: null, method: "cash", paidAmount: null, fromCashboxToday: null, hasTax: false, tax: null, notes: "" },
  };
}

function toNumber(value: string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** How many "price units" a quantity is: units, or kilograms for weighed products. */
export function priceUnits(quantity: number, unitType: UnitType): number {
  return unitType === "gram" ? quantity / 1000 : quantity;
}

export function asUnitType(value: string | null | undefined): UnitType {
  return value === "gram" || value === "liter" || value === "pack" ? value : "unit";
}

let keyCounter = 0;
export function newLineKey(): string {
  keyCounter += 1;
  return `l${Date.now().toString(36)}${keyCounter}`;
}

/**
 * Recompute the calculated cost field. Typing a unit cost or a total makes it the source;
 * a quantity change keeps the source and recalculates the other one.
 */
export function syncLine(line: DraftLine, changed: "quantity" | "unitCost" | "lineTotal"): DraftLine {
  const source: CostMode =
    changed === "unitCost" ? "unit" : changed === "lineTotal" ? "line" : line.costSource ?? "unit";
  const units = line.quantity != null ? priceUnits(line.quantity, line.unitType) : null;
  if (source === "unit") {
    return {
      ...line,
      costSource: source,
      lineTotal: line.unitCost != null && units != null ? round2(line.unitCost * units) : line.lineTotal,
    };
  }
  return {
    ...line,
    costSource: source,
    unitCost: line.lineTotal != null && units ? round2(line.lineTotal / units) : line.unitCost,
  };
}

export function lineFromProduct(
  product: PurchasingProduct,
  preset: { quantity?: number | null; unitCost?: number | null } = {},
): DraftLine {
  const unitType = asUnitType(product.unit_type);
  const lastUnitCost = toNumber(product.last_unit_cost);
  const base: DraftLine = {
    key: newLineKey(),
    itemId: product.id,
    name: product.name,
    unitType,
    quantity: preset.quantity ?? null,
    unitCost: preset.unitCost ?? lastUnitCost,
    lineTotal: null,
    sellPrice: toNumber(product.price),
    currentPrice: toNumber(product.price),
    currentStock: toNumber(product.stock),
    lastUnitCost,
    sku: product.sku ?? "",
    category: product.category ?? "",
    applyPriceChange: true,
  };
  return syncLine(base, "unitCost");
}

export function newProductLine(name: string, sku = ""): DraftLine {
  return {
    key: newLineKey(),
    itemId: null,
    name: name.trim(),
    unitType: "unit",
    quantity: null,
    unitCost: null,
    lineTotal: null,
    costSource: "unit",
    sellPrice: null,
    currentPrice: null,
    currentStock: null,
    lastUnitCost: null,
    sku,
    category: "",
    applyPriceChange: true,
  };
}

export type DraftAction =
  | { type: "replace"; draft: PurchaseDraft }
  | { type: "setSupplier"; supplier: { id?: string; name: string } | null }
  | { type: "setNoSupplier"; value: boolean }
  | { type: "setHeader"; patch: Partial<Pick<PurchaseDraft, "date" | "invoiceNumber" | "invoiceTotal">> }
  | { type: "addLine"; line: DraftLine }
  | { type: "updateLine"; key: string; patch: Partial<DraftLine>; changed?: "quantity" | "unitCost" | "lineTotal" }
  | { type: "removeLine"; key: string }
  | { type: "setPayment"; patch: Partial<PurchaseDraft["payment"]> };

export function draftReducer(draft: PurchaseDraft, action: DraftAction): PurchaseDraft {
  switch (action.type) {
    case "replace":
      return action.draft;
    case "setSupplier":
      return { ...draft, supplier: action.supplier, noSupplier: false };
    case "setNoSupplier":
      return { ...draft, noSupplier: action.value, supplier: action.value ? null : draft.supplier };
    case "setHeader":
      return { ...draft, ...action.patch };
    case "addLine":
      return { ...draft, lines: [...draft.lines, action.line] };
    case "updateLine":
      return {
        ...draft,
        lines: draft.lines.map((line) => {
          if (line.key !== action.key) return line;
          const next = { ...line, ...action.patch };
          return action.changed ? syncLine(next, action.changed) : next;
        }),
      };
    case "removeLine":
      return { ...draft, lines: draft.lines.filter((l) => l.key !== action.key) };
    case "setPayment": {
      const payment = { ...draft.payment, ...action.patch };
      if (payment.kind !== "partial") payment.paidAmount = null;
      if (payment.kind === "later") payment.fromCashboxToday = null;
      if (!payment.hasTax) payment.tax = null;
      return { ...draft, payment };
    }
  }
}

/** The existing line for a catalog product, if it's already in the purchase (so we don't duplicate it). */
export function findLineForProduct(draft: PurchaseDraft, productId: string): DraftLine | undefined {
  return draft.lines.find((l) => l.itemId === productId);
}

export function linesTotal(draft: PurchaseDraft): number {
  return round2(draft.lines.reduce((sum, l) => sum + (l.lineTotal ?? 0), 0));
}

export function purchaseTotal(draft: PurchaseDraft): number {
  return round2(linesTotal(draft) + (draft.payment.hasTax ? draft.payment.tax ?? 0 : 0));
}

export function priceChanged(line: DraftLine): boolean {
  return line.itemId != null && line.sellPrice != null && line.sellPrice !== line.currentPrice;
}
