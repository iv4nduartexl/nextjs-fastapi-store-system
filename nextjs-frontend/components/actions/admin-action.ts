"use server";

import { cookies } from "next/headers";
import { getLocale } from "next-intl/server";

import { redirect } from "@/i18n/routing";
import { apiFetch } from "@/lib/api-server";
import { ACCESS_TOKEN_COOKIE, ADMIN_TOKEN_COOKIE } from "@/lib/session";
import type { Role, TemporaryPassword } from "@/components/actions/team-action";

export interface AdminBusiness {
  id: string;
  name: string;
  is_active: boolean;
  currency_symbol: string | null;
  created_at: string;
  user_count: number;
  sales_count: number;
  last_activity_at: string | null;
}

export interface AdminUser {
  id: string;
  email: string;
  username: string | null;
  full_name: string | null;
  role: Role;
  is_active: boolean;
  must_change_password: boolean;
  last_login_at: string | null;
  is_superuser: boolean;
  business_id: string | null;
  business_name: string | null;
}

export interface AuditLogEntry {
  id: string;
  action: string;
  actor_user_id: string | null;
  actor_name: string | null;
  impersonated_by: string | null;
  impersonator_name: string | null;
  business_id: string | null;
  business_name: string | null;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

export async function listBusinesses(q?: string) {
  const params = q ? `?q=${encodeURIComponent(q)}` : "";
  return apiFetch<AdminBusiness[]>(`/admin/businesses${params}`);
}

export async function getBusiness(id: string) {
  return apiFetch<AdminBusiness>(`/admin/businesses/${id}`);
}

export async function createBusiness(input: {
  name: string;
  owner_email: string;
  owner_username?: string;
  owner_full_name?: string;
}) {
  return apiFetch<{ business: AdminBusiness; owner: TemporaryPassword }>("/admin/businesses", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateBusiness(id: string, changes: { name?: string; is_active?: boolean }) {
  return apiFetch<AdminBusiness>(`/admin/businesses/${id}`, {
    method: "PATCH",
    body: JSON.stringify(changes),
  });
}

export async function listUsers(filters: { q?: string; business_id?: string } = {}) {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.business_id) params.set("business_id", filters.business_id);
  const query = params.toString();
  return apiFetch<AdminUser[]>(`/admin/users${query ? `?${query}` : ""}`);
}

export async function createUser(input: {
  business_id: string;
  email: string;
  username?: string;
  full_name?: string;
  role: Role;
}) {
  return apiFetch<TemporaryPassword>("/admin/users", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateUser(
  id: string,
  changes: { role?: Role; is_active?: boolean; full_name?: string; business_id?: string },
) {
  return apiFetch<AdminUser>(`/admin/users/${id}`, {
    method: "PATCH",
    body: JSON.stringify(changes),
  });
}

export async function resetUserPassword(id: string) {
  return apiFetch<TemporaryPassword>(`/admin/users/${id}/reset-password`, { method: "POST" });
}

export async function listAuditLogs(filters: {
  business_id?: string;
  action?: string;
  page?: number;
}) {
  const params = new URLSearchParams();
  if (filters.business_id) params.set("business_id", filters.business_id);
  if (filters.action) params.set("action", filters.action);
  params.set("page", String(filters.page ?? 1));
  return apiFetch<{ items: AuditLogEntry[]; total: number; page: number; size: number }>(
    `/admin/audit-logs?${params.toString()}`,
  );
}

const cookieOptions = { httpOnly: true, sameSite: "lax" as const };

/** "View as": keep the superuser's token aside and browse the app with the user's token. */
export async function startImpersonation(userId: string): Promise<{ error?: string }> {
  const cookieStore = await cookies();
  const adminToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;
  const result = await apiFetch<{ access_token: string; expires_in: number }>(
    `/admin/impersonate/${userId}`,
    { method: "POST" },
    adminToken,
  );
  if (!result.data || !adminToken) return { error: result.error ?? "Could not start" };

  cookieStore.set(ADMIN_TOKEN_COOKIE, adminToken, { ...cookieOptions, maxAge: 86400 });
  cookieStore.set(ACCESS_TOKEN_COOKIE, result.data.access_token, {
    ...cookieOptions,
    maxAge: result.data.expires_in,
  });
  redirect({ href: "/dashboard", locale: await getLocale() });
  return {};
}

/** Back to the superuser's own session. */
export async function stopImpersonation(userId: string | null): Promise<void> {
  const cookieStore = await cookies();
  const adminToken = cookieStore.get(ADMIN_TOKEN_COOKIE)?.value;
  const locale = await getLocale();
  if (!adminToken) {
    cookieStore.delete(ACCESS_TOKEN_COOKIE);
    redirect({ href: "/login", locale });
    return;
  }
  if (userId) {
    await apiFetch(`/admin/impersonate/${userId}/stop`, { method: "POST" }, adminToken);
  }
  cookieStore.set(ACCESS_TOKEN_COOKIE, adminToken, { ...cookieOptions, maxAge: 86400 });
  cookieStore.delete(ADMIN_TOKEN_COOKIE);
  redirect({ href: "/admin", locale });
}
