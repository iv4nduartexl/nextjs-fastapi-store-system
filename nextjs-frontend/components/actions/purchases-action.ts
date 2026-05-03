"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

export type PurchaseStatus = "received" | "partial" | "cancelled";
export type PurchasePaymentStatus = "paid" | "unpaid" | "partial";
export type PurchasePaymentMethod = "cash" | "card" | "transfer" | "credit";

export interface PurchaseItemCreate {
  item_id?: string;
  item_name: string;
  unit_type: string;
  quantity: number;
  total_cost_price: number;
  sku?: string;
  category?: string;
  sell_price?: number;
  overwrite_sell_price?: boolean;
}

export interface PurchaseCreate {
  supplier_name?: string;
  reference_number?: string;
  purchase_date?: string; // ISO string
  payment_method: PurchasePaymentMethod;
  payment_status: PurchasePaymentStatus;
  tax?: number;
  notes?: string;
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
  supplier_name: string | null;
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
  purchase_items: PurchaseItemRead[];
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
    return {
      error:
        typeof err.detail === "string" ? err.detail : `Error ${res.status}`,
    };
  }

  const data: PurchaseRead = await res.json();
  revalidatePath("/products");
  revalidatePath("/purchases");
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
