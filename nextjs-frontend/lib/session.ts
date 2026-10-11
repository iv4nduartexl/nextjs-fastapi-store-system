// Server-side only: reads the auth cookies.
import { cache } from "react";
import { cookies } from "next/headers";
import { getLocale } from "next-intl/server";

import { redirect } from "@/i18n/routing";

import type { Me } from "@/lib/me";

export type { Me };

export const ACCESS_TOKEN_COOKIE = "accessToken";
// Holds the superuser's own token while they "view as" another user
export const ADMIN_TOKEN_COOKIE = "adminToken";

export async function getAccessToken(): Promise<string | undefined> {
  return (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value;
}

/** The current user, fetched once per request. Null when signed out or the token is invalid. */
export const getMe = cache(async (): Promise<Me | null> => {
  const token = await getAccessToken();
  if (!token) return null;
  try {
    const res = await fetch(`${process.env.API_BASE_URL}/users/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as Me;
  } catch {
    return null;
  }
});

/** For owner-only pages: cashiers are sent back to the dashboard. */
export async function requireOwnerPage(): Promise<Me> {
  const me = await getMe();
  if (!me || me.role !== "owner") {
    redirect({ href: "/dashboard", locale: await getLocale() });
  }
  return me!;
}
