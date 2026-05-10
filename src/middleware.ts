import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Edge-runtime middleware. We deliberately do NOT touch Prisma here (Edge
 * cannot run native deps); we only enforce cookie presence + path allowlists.
 * Real session validation happens inside route handlers via getSession() in
 * src/lib/auth.ts which has full DB access.
 *
 * Layered guard:
 *  • /api/health, /api/auth/*  → always public
 *  • /signin, /signup, /forgot-password, /reset-password, /legal/*, /assets, etc. → public
 *  • everything else under /api/**  → must carry a session cookie
 *  • everything else (UI pages)     → must carry a session cookie
 *  • /admin and /api/admin/**       → cookie required (role check happens
 *      inside the route, since we'd need DB access to verify the role)
 */

import { SESSION_COOKIE } from "@/lib/auth-shared";

const PUBLIC_API_PREFIXES = ["/api/health", "/api/auth"];
const PUBLIC_PAGES = new Set([
  "/signin",
  "/signup",
  "/forgot-password",
  "/onboarding-error"
]);
const PUBLIC_PAGE_PREFIXES = [
  "/reset-password",
  "/verify-email",
  "/legal",
  "/_next",
  "/favicon",
  "/assets"
];

function isPublicApi(path: string): boolean {
  return PUBLIC_API_PREFIXES.some((p) => path === p || path.startsWith(p + "/"));
}

function isPublicPage(path: string): boolean {
  if (PUBLIC_PAGES.has(path)) return true;
  return PUBLIC_PAGE_PREFIXES.some((p) => path === p || path.startsWith(p + "/"));
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSession = !!req.cookies.get(SESSION_COOKIE)?.value;

  // API routes
  if (pathname.startsWith("/api/")) {
    if (isPublicApi(pathname)) return NextResponse.next();
    if (!hasSession) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }
    return NextResponse.next();
  }

  // UI pages
  if (isPublicPage(pathname)) {
    // Bounce already-authed users away from sign-in/sign-up.
    if (hasSession && (pathname === "/signin" || pathname === "/signup")) {
      const url = req.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/signin";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Run on everything except Next.js internals and static files.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|assets/).*)"]
};
