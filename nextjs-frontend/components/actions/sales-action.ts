"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

export interface SaleItemCreate {
  item_id: string;
  quantity: number;
}

export interface SaleItemRead {
  id: string;
  item_id: string | null;
  item_name: string;
  unit_type: string;
  unit_price: string;
  quantity: string;
  subtotal: string;
}

export interface SaleRead {
  id: string;
  created_at: string;
  total: string;
  status: "completed" | "cancelled" | "refunded";
  payment_method: "cash" | "card" | "other" | "credit";
  amount_tendered: string | null;
  change_given: string | null;
  notes: string | null;
  customer_id: string | null;
  customer_name: string | null;
  sale_items: SaleItemRead[];
}

export interface SalesPage {
  items: SaleRead[];
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

export async function createSale(input: {
  items: SaleItemCreate[];
  payment_method: "cash" | "card" | "other" | "credit" | "internal";
  amount_tendered?: number;
  notes?: string;
  customer_id?: string;
}): Promise<{ data?: SaleRead; error?: string }> {
  const token = await getToken();
  if (!token) return { error: "Not authenticated" };

  const res = await fetch(`${API}/sales/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return { error: err.detail ?? `Error ${res.status}` };
  }

  const data: SaleRead = await res.json();
  revalidatePath("/products");
  revalidatePath("/sales");
  return { data };
}

export async function fetchSales(
  page: number = 1,
  size: number = 10,
  paymentMethod?: string,
  status?: string,
): Promise<SalesPage | { message: string }> {
  const token = await getToken();
  if (!token) return { message: "Not authenticated" };

  const params = new URLSearchParams({
    page: String(page),
    size: String(size),
  });
  if (paymentMethod) params.set("payment_method", paymentMethod);
  if (status) params.set("status", status);

  const res = await fetch(`${API}/sales/?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (!res.ok) return { message: `Error ${res.status}` };
  return res.json();
}

export async function fetchSale(
  id: string,
): Promise<SaleRead | { message: string }> {
  const token = await getToken();
  if (!token) return { message: "Not authenticated" };

  const res = await fetch(`${API}/sales/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (!res.ok) return { message: `Error ${res.status}` };
  return res.json();
}

export async function cancelCreditSale(
  saleId: string,
): Promise<{ data?: SaleRead; error?: string }> {
  const token = await getToken();
  if (!token) return { error: "Not authenticated" };

  const res = await fetch(`${API}/sales/${saleId}/cancel`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return { error: err.detail ?? `Error ${res.status}` };
  }

  const data: SaleRead = await res.json();
  revalidatePath("/sales");
  revalidatePath("/customers");
  return { data };
}
