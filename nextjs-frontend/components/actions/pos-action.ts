"use server";

import { apiFetch } from "@/lib/api-server";
import type { PosProduct } from "@/lib/pos/catalog-search";
import { toPosProduct } from "@/lib/pos/quick-create";

/** All active products of the business, for in-memory search at the register. */
export async function fetchPosCatalog() {
  return apiFetch<PosProduct[]>("/pos/catalog");
}

export interface QuickCreateItem {
  name: string;
  price: number;
  unit_type: "unit" | "gram" | "liter" | "pack";
  sku?: string;
  category?: string;
  stock?: number;
}

type ApiItem = Parameters<typeof toPosProduct>[0];

/**
 * Create a product while selling. When the code already belongs to a product,
 * returns it as `existing` so the register can just add that one.
 */
export async function quickCreateItem(
  body: QuickCreateItem,
): Promise<{ data?: PosProduct; existing?: PosProduct; error?: string }> {
  const result = await apiFetch<ApiItem>("/items/", {
    method: "POST",
    body: JSON.stringify({ ...body, source: "pos" }),
  });
  if (result.data) return { data: toPosProduct(result.data) };
  const detail = result.detail as { code?: string; item?: ApiItem } | undefined;
  if (result.status === 409 && detail?.code === "sku_exists" && detail.item) {
    return { existing: toPosProduct(detail.item), error: "sku_exists" };
  }
  return { error: detail?.code ?? result.error ?? "generic" };
}
