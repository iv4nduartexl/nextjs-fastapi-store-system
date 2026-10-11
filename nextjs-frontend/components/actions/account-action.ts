"use server";

import { cookies } from "next/headers";

import { apiFetch } from "@/lib/api-server";
import { ACCESS_TOKEN_COOKIE } from "@/lib/session";

export type ChangePasswordError =
  | "current_password_incorrect"
  | "password_unchanged"
  | "invalid_password"
  | "generic";

export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<{ ok: boolean; error?: ChangePasswordError; reasons?: string[] }> {
  const result = await apiFetch<{ access_token: string }>("/auth/change-password", {
    method: "POST",
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
  if (result.data) {
    // Changing the password ends every session; keep this one with the new token
    (await cookies()).set(ACCESS_TOKEN_COOKIE, result.data.access_token, {
      maxAge: 86400,
      httpOnly: true,
      sameSite: "lax",
    });
    return { ok: true };
  }

  const detail = result.detail as { code?: string; reasons?: string[] } | string | undefined;
  if (detail === "current_password_incorrect" || detail === "password_unchanged") {
    return { ok: false, error: detail };
  }
  if (typeof detail === "object" && detail?.code === "invalid_password") {
    return { ok: false, error: "invalid_password", reasons: detail.reasons ?? [] };
  }
  return { ok: false, error: "generic" };
}
