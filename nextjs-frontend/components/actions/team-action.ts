"use server";

import { apiFetch } from "@/lib/api-server";

export type Role = "owner" | "cashier";

export interface TeamUser {
  id: string;
  email: string;
  username: string | null;
  full_name: string | null;
  role: Role;
  is_active: boolean;
  must_change_password: boolean;
  last_login_at: string | null;
}

export interface TemporaryPassword {
  user_id: string;
  email: string;
  temporary_password: string;
}

export async function listTeam() {
  return apiFetch<TeamUser[]>("/business/users");
}

export async function createTeamMember(input: {
  email: string;
  username?: string;
  full_name?: string;
  role: Role;
}) {
  return apiFetch<TemporaryPassword>("/business/users", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateTeamMember(
  userId: string,
  changes: { role?: Role; is_active?: boolean; full_name?: string },
) {
  return apiFetch<TeamUser>(`/business/users/${userId}`, {
    method: "PATCH",
    body: JSON.stringify(changes),
  });
}

export async function resetTeamMemberPassword(userId: string) {
  return apiFetch<TemporaryPassword>(`/business/users/${userId}/reset-password`, {
    method: "POST",
  });
}

export async function renameBusiness(name: string) {
  return apiFetch<{ id: string; name: string }>("/business", {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
}
