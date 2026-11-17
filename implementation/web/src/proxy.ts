// Early login redirect only. This is a convenience, not a security boundary:
// cookies here are just presence hints, and the Go API authorises every request.
import { NextResponse, type NextRequest } from "next/server";

import { resolveApiBaseUrl } from "@/lib/api";

const SESSION_MARKER_COOKIE = "rekordly_signed_in";
const LOGIN_ROUTE = "/login";
const PUBLIC_ROUTES = new Set([
  "/",
  LOGIN_ROUTE,
  "/login/password",
  "/forgot-password",
  "/reset-password",
  "/create-password",
  "/auth/magic",
  "/auth/google/callback",
]);

const APP_HOSTS = new Set(["localhost", "127.0.0.1", "rekordly.app", "www.rekordly.app", "app.rekordly.app"]);

async function resolveStorefrontSlugFromHost(hostHeader: string | null): Promise<string | null> {
  if (!hostHeader) return null;
  const host = hostHeader.split(":")[0].trim().toLowerCase();
  if (!host || APP_HOSTS.has(host)) return null;

  // Subdomain shortcut: <slug>.rekordly.app | <slug>.rekordly.local | <slug>.localhost
  for (const suffix of [".rekordly.app", ".rekordly.local", ".localhost"]) {
    if (host.endsWith(suffix)) {
      const sub = host.slice(0, -suffix.length);
      if (sub && !sub.includes(".") && sub !== "www" && sub !== "app") {
        return sub;
      }
      return null;
    }
  }

  // Custom domain lookup via backend public projection endpoint
  try {
    const apiBase = resolveApiBaseUrl();
    const res = await fetch(`${apiBase}/api/v1/public/storefronts/by-host?host=${encodeURIComponent(host)}`, {
      signal: AbortSignal.timeout(1500),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: { storefront?: { slug?: string } } };
    return json.data?.storefront?.slug ?? null;
  } catch {
    return null;
  }
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (pathname === "/" || /^\/(shop|about|cart|policies|delivery|privacy|returns|terms|collections|products)(\/|$)/.test(pathname)) {
    const slug = await resolveStorefrontSlugFromHost(request.headers.get("host"));
    if (slug) {
      const targetPath = `/s/${encodeURIComponent(slug)}${pathname === "/" ? "" : pathname}${search}`;
      return NextResponse.rewrite(new URL(targetPath, request.url));
    }
  }

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/public") ||
    pathname.startsWith("/s") ||
    pathname.startsWith("/orders/status") ||
    pathname.startsWith("/purchase-orders/share") ||
    pathname.startsWith("/invitations") ||
    pathname.includes(".") ||
    PUBLIC_ROUTES.has(pathname)
  ) {
    return NextResponse.next();
  }

  const hasSessionHint =
    request.cookies.has(SESSION_MARKER_COOKIE) || request.cookies.has("rekordly_session");

  if (!hasSessionHint) {
    const loginUrl = new URL(LOGIN_ROUTE, request.url);
    loginUrl.searchParams.set("return_to", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
