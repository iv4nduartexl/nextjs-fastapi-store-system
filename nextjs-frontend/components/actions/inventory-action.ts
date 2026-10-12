"use server";

import { revalidatePath } from "next/cache";

import { apiFetch } from "@/lib/api-server";
import type { InventoryCountPayload } from "@/lib/inventory/count";

export interface InventoryCountSummary {
  id: string;
  category: string | null;
  notes: string | null;
  lines_counted: number;
  lines_changed: number;
  applied_at: string;
  user_name: string | null;
}

export interface InventoryCountLine {
  item_id: string | null;
  item_name: string;
  unit_type: string;
  expected: string;
  counted: string;
  previous_stock: string;
  new_stock: string;
}

export interface InventoryCountRead extends InventoryCountSummary {
  lines: InventoryCountLine[];
}

export async function applyInventoryCount(payload: InventoryCountPayload) {
  const result = await apiFetch<InventoryCountRead>("/inventory/counts", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (result.data) {
    revalidatePath("/[locale]/products", "page");
    revalidatePath("/[locale]/products/inventory", "page");
  }
  const detail = result.detail as { code?: string } | undefined;
  return { data: result.data, error: result.data ? undefined : detail?.code ?? result.error };
}

export async function fetchInventoryCounts() {
  return apiFetch<InventoryCountSummary[]>("/inventory/counts");
}

export async function fetchInventoryCount(id: string) {
  return apiFetch<InventoryCountRead>(`/inventory/counts/${id}`);
}
