"use server";

import { cookies } from "next/headers";

import { authJwtLogin } from "@/app/clientService";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/routing";
import { loginSchema } from "@/lib/definitions";
import { getErrorMessage } from "@/lib/utils";

export async function login(prevState: unknown, formData: FormData) {
  const validatedFields = loginSchema.safeParse({
    username: formData.get("username") as string,
    password: formData.get("password") as string,
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
    };
  }

  const { username, password } = validatedFields.data;

  const input = {
    body: {
      username,
      password,
    },
  };

  let destination = "/dashboard";
  try {
    const { data, error } = await authJwtLogin(input);
    if (error) {
      return { server_validation_error: getErrorMessage(error) };
    }
    const cookieStore = await cookies();
    cookieStore.set("accessToken", data.access_token, {
      maxAge: 86400,
      httpOnly: true,
      sameSite: "lax",
    });
    // A fresh login is never an impersonation
    cookieStore.delete("adminToken");
    destination = await landingPage(data.access_token);
  } catch (err) {
    console.error("Login error:", err);
    return {
      server_error: "An unexpected error occurred. Please try again later.",
    };
  }
  redirect({ href: destination, locale: await getLocale() });
}

/** Where to go after signing in: forced password change, the admin panel, or the store. */
async function landingPage(token: string): Promise<string> {
  try {
    const res = await fetch(`${process.env.API_BASE_URL}/users/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return "/dashboard";
    const me = await res.json();
    if (me.must_change_password) return "/change-password";
    if (me.is_superuser && !me.business_id) return "/admin";
  } catch {
    // Fall back to the dashboard; its layout redirects again if needed
  }
  return "/dashboard";
}
