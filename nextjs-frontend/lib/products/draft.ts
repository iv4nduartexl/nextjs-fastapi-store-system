// The "new product" wizard: draft shape, what blocks each step and the payload sent to the API.
import { normalize } from "@/lib/pos/catalog-search";
import { findSimilarProduct } from "@/lib/purchases/checks";

export type ProductUnit = "unit" | "gram" | "liter" | "pack";
export const PRODUCT_UNITS: ProductUnit[] = ["unit", "gram", "liter", "pack"];

export type ProductStep = "product" | "price" | "stock" | "review";
export const PRODUCT_STEPS: ProductStep[] = ["product", "price", "stock", "review"];

export interface ProductDraft {
  version: 1;
  sku: string;
  name: string;
  category: string;
  description: string;
  unit: ProductUnit;
  price: number | null;
  /** In the unit people think in: kg for weighed products (the API stores grams) */
  stock: number | null;
  minStock: number | null;
}

/** What the duplicate / similar checks need from the catalog */
export interface CatalogProduct {
  id: string;
  name: string;
  sku: string | null;
}

/** Reason codes, translated under addItem.wizard.blocked.* */
export type ProductBlocker = "nameRequired" | "skuTaken" | "invalidPrice" | "invalidStock";

export type ProductWarning = { type: "similarName"; existing: string } | { type: "noPrice" };

export function emptyProductDraft(keep?: Pick<ProductDraft, "category" | "unit">): ProductDraft {
  return {
    version: 1,
    sku: "",
    name: "",
    category: keep?.category ?? "",
    description: "",
    unit: keep?.unit ?? "unit",
    price: null,
    stock: null,
    minStock: null,
  };
}

/** The product that already uses this barcode / SKU, if any (same matching as the register) */
export function skuOwner<T extends CatalogProduct>(draft: ProductDraft, catalog: T[]): T | undefined {
  const wanted = normalize(draft.sku.trim());
  if (!wanted) return undefined;
  return catalog.find((p) => p.sku != null && normalize(p.sku) === wanted);
}

export function stepBlockers(draft: ProductDraft, step: ProductStep, catalog: CatalogProduct[]): ProductBlocker[] {
  const reasons: ProductBlocker[] = [];
  if (step === "product") {
    if (!draft.name.trim()) reasons.push("nameRequired");
    if (skuOwner(draft, catalog)) reasons.push("skuTaken");
  }
  if (step === "price" && draft.price != null && draft.price < 0) reasons.push("invalidPrice");
  if (step === "stock" && ((draft.stock != null && draft.stock < 0) || (draft.minStock != null && draft.minStock < 0))) {
    reasons.push("invalidStock");
  }
  return reasons;
}

/** The first step that still has blockers (the furthest the user may go), or "review". */
export function firstBlockedStep(draft: ProductDraft, catalog: CatalogProduct[]): ProductStep {
  for (const step of PRODUCT_STEPS.slice(0, 3)) {
    if (stepBlockers(draft, step, catalog).length > 0) return step;
  }
  return "review";
}

/** No price is allowed, but the product can't be sold until it has one */
export function canSkipPrice(draft: ProductDraft): boolean {
  return draft.price == null || draft.price === 0;
}

export function productWarnings(draft: ProductDraft, catalog: CatalogProduct[]): ProductWarning[] {
  const warnings: ProductWarning[] = [];
  const similar = draft.name.trim() ? findSimilarProduct(draft.name, catalog) : undefined;
  if (similar) warnings.push({ type: "similarName", existing: similar.name });
  if (canSkipPrice(draft)) warnings.push({ type: "noPrice" });
  return warnings;
}

/** kg → g for weighed products; everything else is stored as typed */
export function toStoredQuantity(value: number, unit: ProductUnit): number {
  return unit === "gram" ? Math.round(value * 1000 * 1000) / 1000 : value;
}

export function toItemCreate(draft: ProductDraft) {
  const text = (s: string) => s.trim() || undefined;
  return {
    name: draft.name.trim(),
    sku: text(draft.sku),
    category: text(draft.category),
    description: text(draft.description),
    unit_type: draft.unit,
    price: draft.price != null && draft.price > 0 ? draft.price : undefined,
    stock: toStoredQuantity(draft.stock ?? 0, draft.unit),
    min_stock: draft.minStock != null ? toStoredQuantity(draft.minStock, draft.unit) : undefined,
    source: "products" as const,
  };
}
