import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";
import { usersCurrentUser } from "@/app/clientService";
import { routing } from "./i18n/routing";

const intlMiddleware = createMiddleware(routing);

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Check if path is a protected route (with or without locale prefix)
  const isProtected = /^\/(en|es)?\/(dashboard|products|sales|purchases|customers|cashbox)(\/.*)?$/.test(pathname) ||
    /^\/(dashboard|products|sales|purchases|customers|cashbox)(\/.*)?$/.test(pathname);

  if (isProtected) {
    const token = request.cookies.get("accessToken");

    if (!token) {
      const locale = pathname.startsWith("/es") ? "es" : "en";
      return NextResponse.redirect(new URL(`/${locale}/login`, request.url));
    }

    const { error } = await usersCurrentUser({
      headers: { Authorization: `Bearer ${token.value}` },
    });

    if (error) {
      const locale = pathname.startsWith("/es") ? "es" : "en";
      return NextResponse.redirect(new URL(`/${locale}/login`, request.url));
    }
  }

  return intlMiddleware(request);
}

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
