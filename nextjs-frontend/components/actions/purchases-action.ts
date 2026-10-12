"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api-server";
import { UUID } from "crypto";

export type PurchaseStatus = "received" | "partial" | "cancelled";
export type PurchasePaymentStatus = "paid" | "unpaid" | "partial";
export type PurchasePaymentMethod = "cash" | "card" | "transfer" | "credit";

export interface SupplierCreate {
  id?: UUID | undefined;
  name: string;
}

export interface SupplierRead {
  id: UUID;
  name: string;
}

export interface PurchaseItemCreate {
  item_id?: string;
  item_name: string;
  unit_type: string;
  quantity: number;
  total_cost_price: number;
  sku?: string;
  category?: string;
  sell_price?: number;
  overwrite_previous_value?: boolean;
}

export interface PurchaseCreate {
  supplier?: SupplierCreate;
  reference_number?: string;
  purchase_date?: string; // ISO string
  payment_method: PurchasePaymentMethod;
  payment_status: PurchasePaymentStatus;
  tax?: number;
  notes?: string;
  /** Required for payment_status "partial": the amount paid now */
  paid_amount?: number;
  /** Total printed on the supplier's invoice (for checking) */
  invoice_total?: number;
  /** Whether what's paid now leaves today's open cashbox (false = paid back on the purchase date) */
  payment_affects_cashbox?: boolean;
  items: PurchaseItemCreate[];
}

export interface PurchaseItemRead {
  id: string;
  item_id: string | null;
  item_name: string;
  unit_type: string;
  quantity: string;
  cost_price: string;
  subtotal: string;
}

export interface PurchaseRead {
  id: string;
  supplier: SupplierRead | null;
  reference_number: string | null;
  purchase_date: string;
  created_at: string;
  status: PurchaseStatus;
  payment_status: PurchasePaymentStatus;
  payment_method: PurchasePaymentMethod;
  subtotal: string;
  tax: string;
  total_cost: string;
  notes: string | null;
  cancelled_at?: string | null;
  cancel_reason?: string | null;
  paid_amount?: string | null;
  invoice_total?: string | null;
  payments?: SupplierPaymentRead[];
  user_id?: string | null;
  /** Who registered / cancelled the purchase */
  user_name?: string | null;
  cancelled_by_name?: string | null;
  purchase_items: PurchaseItemRead[];
}

export interface NegativeStockItem {
  id: string;
  name: string;
  stock: number;
  quantity: number;
}

export interface CancelPurchaseResult {
  data?: PurchaseRead;
  error?: string;
  code?: "already_cancelled" | "negative_stock";
  items?: NegativeStockItem[];
}

export interface SupplierPaymentRead {
  id: string;
  amount: string;
  /** "write_off": the balance was declared no longer owed (no money moved) */
  method: "cash" | "card" | "transfer" | "write_off";
  paid_at: string;
  affects_cashbox: boolean;
  notes: string | null;
  user_name: string | null;
  created_at: string;
}

export interface PurchasesPage {
  items: PurchaseRead[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

async function getToken() {
  const cookieStore = await cookies();
  return cookieStore.get("accessToken")?.value;
}

const API = process.env.API_BASE_URL;

export async function createPurchase(
  input: PurchaseCreate,
): Promise<{ data?: PurchaseRead; error?: string }> {
  const token = await getToken();
  if (!token) return { error: "Not authenticated" };

  const res = await fetch(`${API}/purchases/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error("CreatePurchase ~ error: ", err)
    return {
      error:
        typeof err.detail === "string" ? err.detail : `Error ${res.status}`,
    };
  }

  const data: PurchaseRead = await res.json();
  revalidatePath("/[locale]/products", "page");
  revalidatePath("/[locale]/purchases", "page");
  return { data };
}

export async function fetchPurchases(
  page: number = 1,
  size: number = 10,
  q?: string,
  paymentStatus?: string,
  status?: string,
): Promise<PurchasesPage | { message: string }> {
  const token = await getToken();
  if (!token) return { message: "Not authenticated" };

  const params = new URLSearchParams({
    page: String(page),
    size: String(size),
  });
  if (q) params.set("q", q);
  if (paymentStatus) params.set("payment_status", paymentStatus);
  if (status) params.set("status", status);

  const res = await fetch(`${API}/purchases/?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (!res.ok) return { message: `Error ${res.status}` };
  return res.json();
}

export async function fetchPurchase(
  id: string,
): Promise<PurchaseRead | { message: string }> {
  const token = await getToken();
  if (!token) return { message: "Not authenticated" };

  const res = await fetch(`${API}/purchases/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (!res.ok) return { message: `Error ${res.status}` };
  return res.json();
}

export async function cancelPurchase(
  purchaseId: string,
  reason?: string,
  force: boolean = false,
): Promise<CancelPurchaseResult> {
  const token = await getToken();
  if (!token) return { error: "Not authenticated" };

  const res = await fetch(`${API}/purchases/${purchaseId}/cancel`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ reason: reason || null, force }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const detail = err.detail;
    if (detail && typeof detail === "object") {
      return { error: detail.message, code: detail.code, items: detail.items };
    }
    return {
      error: typeof detail === "string" ? detail : `Error ${res.status}`,
    };
  }

  const data: PurchaseRead = await res.json();
  revalidatePath("/[locale]/products", "page");
  revalidatePath("/[locale]/purchases", "page");
  revalidatePath("/[locale]/purchases/[id]", "page");
  revalidatePath("/[locale]/cashbox", "page");
  return { data };
}

/** Pay (part of) what is still owed on a purchase. */
export async function addSupplierPayment(
  purchaseId: string,
  input: { amount: number; method: "cash" | "card" | "transfer"; paid_at?: string; affects_cashbox?: boolean; notes?: string },
): Promise<{ data?: PurchaseRead; error?: string }> {
  const result = await apiFetch<PurchaseRead>(`/purchases/${purchaseId}/payments`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (result.data) {
    revalidatePath("/[locale]/purchases", "page");
    revalidatePath("/[locale]/purchases/[id]", "page");
    revalidatePath("/[locale]/cashbox", "page");
  }
  return { data: result.data, error: result.error };
}

/** Undo a mistaken supplier payment (owners). */
export async function deleteSupplierPayment(
  purchaseId: string,
  paymentId: string,
): Promise<{ data?: PurchaseRead; error?: string }> {
  const result = await apiFetch<PurchaseRead>(`/purchases/${purchaseId}/payments/${paymentId}`, { method: "DELETE" });
  if (result.data) {
    revalidatePath("/[locale]/purchases", "page");
    revalidatePath("/[locale]/purchases/[id]", "page");
    revalidatePath("/[locale]/cashbox", "page");
  }
  return { data: result.data, error: result.error };
}

/** The rest of a purchase is no longer owed (owners). The purchase and its stock stay. */
export async function writeOffSupplierDebt(
  purchaseId: string,
  reason?: string,
): Promise<{ data?: PurchaseRead; error?: string }> {
  const result = await apiFetch<PurchaseRead>(`/purchases/${purchaseId}/write-off`, {
    method: "POST",
    body: JSON.stringify({ reason: reason ?? null }),
  });
  if (result.data) {
    revalidatePath("/[locale]/purchases", "page");
    revalidatePath("/[locale]/purchases/[id]", "page");
  }
  return { data: result.data, error: result.error };
}
