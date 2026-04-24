"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

export interface CustomerCreate {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  id_number?: string;
  credit_limit?: number;
  notes?: string;
}

export interface CustomerUpdate extends Partial<CustomerCreate> {
  is_active?: boolean;
}

export interface CustomerRead {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  id_number: string | null;
  credit_limit: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  total_credit: string;
  total_paid: string;
  balance: string;
}

export interface CustomerPage {
  items: CustomerRead[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

export interface CustomerPaymentCreate {
  amount: number;
  payment_method: "cash" | "card" | "transfer";
  notes?: string;
}

export interface CustomerPaymentRead {
  id: string;
  amount: string;
  payment_method: string;
  payment_date: string;
  notes: string | null;
  created_at: string;
}

export interface CustomerDetailRead extends CustomerRead {
  credit_sales: import("./sales-action").SaleRead[];
  payments: CustomerPaymentRead[];
}

async function getToken() {
  const cookieStore = await cookies();
  return cookieStore.get("accessToken")?.value;
}

const API = process.env.API_BASE_URL;

export async function createCustomer(
  data: CustomerCreate
): Promise<{ data?: CustomerRead; error?: string }> {
  const token = await getToken();
  if (!token) return { error: "Not authenticated" };

  const res = await fetch(`${API}/customers/`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return { error: err.detail ?? `Error ${res.status}` };
  }
  revalidatePath("/customers");
  return { data: await res.json() };
}

export async function fetchCustomers(
  page = 1,
  size = 20,
  q?: string
): Promise<CustomerPage | { message: string }> {
  const token = await getToken();
  if (!token) return { message: "Not authenticated" };

  const params = new URLSearchParams({ page: String(page), size: String(size) });
  if (q) params.set("q", q);

  const res = await fetch(`${API}/customers/?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (!res.ok) return { message: `Error ${res.status}` };
  return res.json();
}

export async function fetchCustomer(
  id: string
): Promise<CustomerDetailRead | { message: string }> {
  const token = await getToken();
  if (!token) return { message: "Not authenticated" };

  const res = await fetch(`${API}/customers/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (!res.ok) return { message: `Error ${res.status}` };
  return res.json();
}

export async function updateCustomer(
  id: string,
  data: CustomerUpdate
): Promise<{ data?: CustomerRead; error?: string }> {
  const token = await getToken();
  if (!token) return { error: "Not authenticated" };

  const res = await fetch(`${API}/customers/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return { error: err.detail ?? `Error ${res.status}` };
  }
  revalidatePath(`/customers/${id}`);
  revalidatePath("/customers");
  return { data: await res.json() };
}

export async function recordPayment(
  customerId: string,
  data: CustomerPaymentCreate
): Promise<{ data?: CustomerPaymentRead; error?: string }> {
  const token = await getToken();
  if (!token) return { error: "Not authenticated" };

  const res = await fetch(`${API}/customers/${customerId}/payments`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return { error: err.detail ?? `Error ${res.status}` };
  }
  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/customers");
  return { data: await res.json() };
}
