import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_ROUTES = new Set([
  "/",
  "/login",
  "/login/password",
  "/forgot-password",
  "/reset-password",
  "/create-password",
]);

function isPublicRoute(pathname: string) {
  return PUBLIC_ROUTES.has(pathname);
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  if (!request.cookies.has("rekordly_session")) {
    const loginUrl = new URL("/login", request.url);
    const returnTo = `${pathname}${search}`;
    if (returnTo !== "/") loginUrl.searchParams.set("return_to", returnTo);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
