"use server";

import { apiFetch } from "@/lib/api-server";
import type { PurchasingProduct } from "@/lib/purchases/draft";

export interface RecentSupplier {
  id: string;
  name: string | null;
  last_purchase_at: string;
}

export interface UsualProduct {
  item_id: string;
  name: string;
  unit_type: string;
  times_bought: number;
  last_quantity: string;
  last_unit_cost: string;
}

/** Catalog with last purchase costs, searched in memory by the wizard. */
export async function fetchPurchasingCatalog() {
  return apiFetch<PurchasingProduct[]>("/purchasing/catalog");
}

export async function fetchRecentSuppliers() {
  return apiFetch<RecentSupplier[]>("/purchasing/suppliers/recent");
}

export async function fetchUsualProducts(supplierId: string) {
  return apiFetch<UsualProduct[]>(`/purchasing/suppliers/${supplierId}/usual-products`);
}

export async function searchSuppliers(q: string) {
  return apiFetch<{ id: string; name: string }[]>(`/suppliers/?limit=8&q=${encodeURIComponent(q)}`);
}

/** Whether a cashbox session is open (cash payments are recorded there). */
export async function hasOpenCashbox(): Promise<boolean> {
  const result = await apiFetch("/cashbox/session/current");
  return result.status === 200;
}

export interface PayableInvoice {
  id: string;
  purchase_date: string;
  reference_number: string | null;
  total_cost: string;
  paid_amount: string;
  remaining: string;
}

export interface SupplierPayables {
  supplier_id: string | null;
  supplier_name: string | null;
  total_owed: string;
  oldest_date: string;
  invoices: PayableInvoice[];
}

export interface PayablesSummary {
  total_owed: string;
  supplier_count: number;
  suppliers: SupplierPayables[];
}

/** What is still owed to suppliers, grouped by supplier. */
export async function fetchPayables() {
  return apiFetch<PayablesSummary>("/purchasing/payables");
}
