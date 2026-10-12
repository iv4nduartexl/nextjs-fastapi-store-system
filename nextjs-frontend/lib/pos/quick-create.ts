// Creating a product from the register when what the customer brings isn't in the catalog.

import type { PosProduct } from "@/lib/pos/catalog-search";

/** A scanned/typed barcode or SKU rather than a product name: no spaces, mostly digits. */
export function looksLikeCode(text: string): boolean {
  const t = text.trim();
  if (!t || /\s/.test(t)) return false;
  const digits = (t.match(/\d/g) ?? []).length;
  return digits >= 4 && digits * 2 >= t.length;
}

/** Prefill the form from what was searched: a code goes to "Código", anything else is the name. */
export function quickCreatePrefill(text: string): { name: string; sku: string } {
  const t = text.trim();
  if (looksLikeCode(t)) return { name: "", sku: t };
  return { name: t.charAt(0).toUpperCase() + t.slice(1), sku: "" };
}

/** An item as returned by the API → the shape the register works with. */
export function toPosProduct(item: {
  id: string;
  name: string;
  sku?: string | null;
  category?: string | null;
  unit_type?: string | null;
  price?: string | number | null;
  stock?: string | number | null;
  min_stock?: string | number | null;
}): PosProduct {
  return {
    id: item.id,
    name: item.name,
    sku: item.sku ?? null,
    category: item.category ?? null,
    unit_type: item.unit_type ?? "unit",
    price: item.price != null ? String(item.price) : null,
    stock: String(item.stock ?? "0"),
    min_stock: item.min_stock != null ? String(item.min_stock) : null,
  };
}
