// Early login redirect only. This is a convenience, not a security boundary:
// cookies here are just presence hints, and the Go API authorises every request.
import { NextResponse, type NextRequest } from "next/server";

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

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/public") ||
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
