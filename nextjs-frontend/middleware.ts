import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing-config";

const intlMiddleware = createMiddleware(routing);

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Skip middleware for server action requests and Next.js internal requests
  if (request.headers.get("next-action") || request.headers.get("next-router-state-tree")) {
    return NextResponse.next();
  }

  // Check if path is a protected route (with or without locale prefix)
  const isProtected =
    /^\/(en|es)?\/(dashboard|products|sales|purchases|customers|cashbox|statistics)(\/.*)?$/.test(
      pathname,
    ) ||
    /^\/(dashboard|products|sales|purchases|customers|cashbox|statistics)(\/.*)?$/.test(
      pathname,
    );

  if (isProtected) {
    const token = request.cookies.get("accessToken");

    if (!token) {
      const locale = pathname.startsWith("/es") ? "es" : "en";
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
