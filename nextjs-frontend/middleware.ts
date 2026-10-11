import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing-config";

const intlMiddleware = createMiddleware(routing);

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Check if path is a protected route (with or without locale prefix)
  const isProtected =
    /^\/(en|es)?\/(dashboard|products|sales|purchases|customers|cashbox|statistics|chat)(\/.*)?$/.test(
      pathname,
    ) ||
    /^\/(dashboard|products|sales|purchases|customers|cashbox|statistics|chat)(\/.*)?$/.test(
      pathname,
    );

  if (isProtected) {
    const token = request.cookies.get("accessToken");

    if (!token) {
      const match = pathname.match(/^\/(en|es)(\/|$)/);
      const locale =
        match?.[1] ?? request.cookies.get("NEXT_LOCALE")?.value ?? routing.defaultLocale;
      return NextResponse.redirect(new URL(`/${locale}/login`, request.url));
    }

    // Note: For production, you might want to validate the token
    // using a proper edge-compatible validation method
    // For now, we let the middleware pass through and rely on client-side auth checks
  }

  return intlMiddleware(request);
}

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
