"use server";

import { apiFetch } from "@/lib/api-server";
import type { PosProduct } from "@/lib/pos/catalog-search";

/** All active products of the business, for in-memory search at the register. */
export async function fetchPosCatalog() {
  return apiFetch<PosProduct[]>("/pos/catalog");
}
