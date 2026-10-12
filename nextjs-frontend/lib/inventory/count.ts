// Inventory count: pure state and maths, kept out of the UI so it can be tested.
// Quantities are stored like stock everywhere else: grams for weighed products, units otherwise.

import type { PosProduct } from "@/lib/pos/catalog-search";

export interface CountEntry {
  counted: number;
  /** System stock when this product was (last) counted, so later sales aren't lost on apply */
  expected: number;
}

export interface CountDraft {
  version: 1;
  /** null = the whole catalog */
  category: string | null;
  startedAt: string;
  entries: Record<string, CountEntry>;
}

export type CountAction =
  | { type: "set"; product: PosProduct; counted: number | null }
  | { type: "scan"; product: PosProduct };

export type CountFilter = "pending" | "counted" | "differences";

export function emptyCount(category: string | null, now: Date = new Date()): CountDraft {
  return { version: 1, category, startedAt: now.toISOString(), entries: {} };
}

function stockOf(product: PosProduct): number {
  return parseFloat(product.stock) || 0;
}

/** Products counted one by one with the scanner (each scan = +1). Weighed/liquid ones are typed. */
export function isScanCountable(product: PosProduct): boolean {
  return product.unit_type === "unit" || product.unit_type === "pack";
}

export function countReducer(draft: CountDraft, action: CountAction): CountDraft {
  const { product } = action;
  const entries = { ...draft.entries };
  if (action.type === "set") {
    if (action.counted == null || action.counted < 0) delete entries[product.id];
    else entries[product.id] = { counted: action.counted, expected: stockOf(product) };
  } else {
    const current = entries[product.id]?.counted ?? 0;
    entries[product.id] = { counted: current + 1, expected: stockOf(product) };
  }
  return { ...draft, entries };
}

export function inScope(products: PosProduct[], category: string | null): PosProduct[] {
  return category ? products.filter((p) => p.category === category) : products;
}

export function difference(entry: CountEntry): number {
  return Math.round((entry.counted - entry.expected) * 1000) / 1000;
}

/** Counted products plus the ones still to count, filtered for the list. */
export function filterProducts(products: PosProduct[], draft: CountDraft, filter: CountFilter): PosProduct[] {
  return products.filter((p) => {
    const entry = draft.entries[p.id];
    if (filter === "pending") return !entry;
    if (filter === "counted") return !!entry;
    return !!entry && difference(entry) !== 0;
  });
}

/** Grams ↔ kg for weighed products; everything else is shown as stored. */
export function toDisplay(quantity: number, unitType: string): number {
  return unitType === "gram" ? quantity / 1000 : quantity;
}

export function fromDisplay(value: number, unitType: string): number {
  return unitType === "gram" ? Math.round(value * 1000) : value;
}

export function displayDecimals(unitType: string): number {
  return unitType === "gram" || unitType === "liter" ? 3 : 0;
}

export interface CountSummary {
  total: number;
  counted: number;
  withDifferences: number;
  /** Products that go up / down */
  up: number;
  down: number;
  /** Value of the differences at sale price (negative = missing goods) */
  valueChange: number;
  /** Products in scope with stock that weren't counted (set to 0 only if the user chooses so) */
  uncountedWithStock: number;
}

export function countSummary(products: PosProduct[], draft: CountDraft): CountSummary {
  const scope = inScope(products, draft.category);
  const summary: CountSummary = {
    total: scope.length,
    counted: 0,
    withDifferences: 0,
    up: 0,
    down: 0,
    valueChange: 0,
    uncountedWithStock: 0,
  };
  for (const product of scope) {
    const entry = draft.entries[product.id];
    if (!entry) {
      if (stockOf(product) > 0) summary.uncountedWithStock++;
      continue;
    }
    summary.counted++;
    const diff = difference(entry);
    if (diff === 0) continue;
    summary.withDifferences++;
    if (diff > 0) summary.up++;
    else summary.down++;
    summary.valueChange += toDisplay(diff, product.unit_type) * (parseFloat(product.price ?? "0") || 0);
  }
  summary.valueChange = Math.round(summary.valueChange);
  // Counted products outside the category (scanned anyway) still count
  for (const id of Object.keys(draft.entries)) {
    if (!scope.some((p) => p.id === id)) summary.counted++;
  }
  return summary;
}

export interface InventoryCountPayload {
  category?: string;
  notes?: string;
  zero_uncounted: boolean;
  lines: { item_id: string; counted: number; expected: number }[];
}

export function toCountPayload(draft: CountDraft, zeroUncounted: boolean, notes = ""): InventoryCountPayload {
  return {
    category: draft.category ?? undefined,
    notes: notes.trim() || undefined,
    zero_uncounted: zeroUncounted,
    lines: Object.entries(draft.entries).map(([item_id, entry]) => ({
      item_id,
      counted: entry.counted,
      expected: entry.expected,
    })),
  };
}
