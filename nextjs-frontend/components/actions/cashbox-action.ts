"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://backend:8000";

async function getAuthHeaders() {
  const cookieStore = await cookies();
  const token = cookieStore.get("accessToken")?.value;
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export interface CashboxTransactionRead {
  id: string;
  session_id: string | null;
  type: string;
  direction: string;
  amount: string;
  payment_method: string;
  reference_type: string | null;
  reference_id: string | null;
  description: string | null;
  created_at: string;
}

export interface CashboxSessionRead {
  id: string;
  opening_amount: string;
  status: "open" | "closed";
  opened_at: string;
  closed_at: string | null;
  closing_amount_counted: string | null;
  notes: string | null;
  created_at: string;
  // computed
  cash_in: string;
  cash_out: string;
  card_in: string;
  transfer_in: string;
  credit_sales: string;
  expected_cash_balance: string;
  difference: string | null;
  transaction_count: number;
}

// ─── Session actions ──────────────────────────────────────────────────────────

export async function fetchCurrentSession(): Promise<CashboxSessionRead | null> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE_URL}/cashbox/session/current`, {
    headers,
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) return null;
  return res.json();
}

export async function openSession(data: {
  opening_amount: number;
  notes?: string;
}): Promise<{ data?: CashboxSessionRead; error?: string }> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE_URL}/cashbox/session/open`, {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return { error: err.detail ?? "Failed to open session" };
  }
  revalidatePath("/cashbox");
  return { data: await res.json() };
}

export async function closeSession(data: {
  closing_amount_counted: number;
  notes?: string;
}): Promise<{ data?: CashboxSessionRead; error?: string }> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE_URL}/cashbox/session/close`, {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return { error: err.detail ?? "Failed to close session" };
  }
  revalidatePath("/cashbox");
  return { data: await res.json() };
}

export async function addManualTransaction(data: {
  type: "income" | "expense";
  amount: number;
  payment_method: string;
  description?: string;
}): Promise<{ data?: CashboxTransactionRead; error?: string }> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE_URL}/cashbox/transactions`, {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return { error: err.detail ?? "Failed to add transaction" };
  }
  revalidatePath("/cashbox");
  return { data: await res.json() };
}

export async function fetchTransactions(
  sessionId?: string,
  limit = 100
): Promise<CashboxTransactionRead[]> {
  const headers = await getAuthHeaders();
  const params = new URLSearchParams({ limit: String(limit) });
  if (sessionId) params.set("session_id", sessionId);
  const res = await fetch(`${API_BASE_URL}/cashbox/transactions?${params}`, {
    headers,
    cache: "no-store",
  });
  if (!res.ok) return [];
  return res.json();
}

export async function fetchSessions(limit = 20): Promise<CashboxSessionRead[]> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE_URL}/cashbox/sessions?limit=${limit}`, {
    headers,
    cache: "no-store",
  });
  if (!res.ok) return [];
  return res.json();
}

export async function fetchSessionById(id: string): Promise<CashboxSessionRead | null> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE_URL}/cashbox/sessions/${encodeURIComponent(id)}`, {
    headers,
    cache: "no-store",
  });
  if (!res.ok) return null;
  return res.json();
}
