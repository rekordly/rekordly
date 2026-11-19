import { resolveApiBaseUrl } from "./api.ts";

export const SHOPPER_COOKIE_NAME = "rekordly_shopper_session";
export const SHOPPER_HEADER_NAME = "X-Shopper-Session-Token";
const SHOPPER_COOKIE_MAX_AGE = 30 * 86400; // 30 days

export interface ShopperProxyOptions {
  /** Path segments after `/api/shopper/` or `/orders/api/`, e.g. `["verify"]` */
  pathSegments: string[];
  /** Store slug when called via `/s/[slug]/api/shopper/*` */
  storeSlug?: string;
  /** Optional custom fetch implementation for unit tests */
  fetchImpl?: typeof fetch;
  /** Optional explicit Go API base URL override for unit tests */
  apiBaseUrl?: string;
}

function parseCookieHeader(cookieHeader: string | null, name: string): string {
  if (!cookieHeader) return "";
  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx <= 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    if (key === name) {
      return decodeURIComponent(trimmed.slice(eqIdx + 1).trim());
    }
  }
  return "";
}

function getEffectiveHost(request: Request): string {
  const fwdHost = request.headers.get("x-forwarded-host");
  if (fwdHost) {
    const first = fwdHost.split(",")[0]?.trim().toLowerCase();
    if (first) return first;
  }
  const host = request.headers.get("host")?.trim().toLowerCase();
  if (host) return host;
  try {
    return new URL(request.url).host.toLowerCase();
  } catch {
    return "";
  }
}

function isOriginSameHost(request: Request): boolean {
  const originHeader = request.headers.get("origin")?.trim();
  if (!originHeader) return false;
  let originHost = "";
  try {
    originHost = new URL(originHeader).host.toLowerCase();
  } catch {
    return false;
  }
  const effectiveHost = getEffectiveHost(request);
  return Boolean(originHost && effectiveHost && originHost === effectiveHost);
}

function shouldUseSecureCookie(request: Request): boolean {
  if (process.env.NODE_ENV === "production") return true;
  const fwdProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  if (fwdProto === "https") return true;
  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return false;
  }
}

function buildHostOnlyShopperCookie(token: string, maxAge: number, secure: boolean): string {
  const parts = [
    `${SHOPPER_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    `Max-Age=${maxAge}`,
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (secure) {
    parts.push("Secure");
  }
  return parts.join("; ");
}

export async function handleShopperProxyRequest(
  request: Request,
  options: ShopperProxyOptions,
): Promise<Response> {
  const method = request.method.toUpperCase();
  const action = (options.pathSegments[0] ?? "").toLowerCase();
  const storeSlug = options.storeSlug?.trim();
  const fetchFn = options.fetchImpl ?? fetch;
  const apiBase = (options.apiBaseUrl ?? resolveApiBaseUrl()).replace(/\/+$/, "");

  // CSRF check on POST: Origin header must match the current storefront / app host
  if (method === "POST") {
    if (!isOriginSameHost(request)) {
      return Response.json(
        {
          error: {
            code: "CSRF_ORIGIN_MISMATCH",
            message: "Cross-origin request blocked",
          },
        },
        { status: 403 },
      );
    }
  }

  const sessionToken = parseCookieHeader(request.headers.get("cookie"), SHOPPER_COOKIE_NAME);
  const upstreamHeaders = new Headers();
  upstreamHeaders.set("Accept", "application/json");
  if (sessionToken) {
    upstreamHeaders.set(SHOPPER_HEADER_NAME, sessionToken);
  }
  const idempKey = request.headers.get("idempotency-key");
  if (idempKey) {
    upstreamHeaders.set("Idempotency-Key", idempKey);
  }
  const fwdFor = request.headers.get("x-forwarded-for");
  if (fwdFor) {
    upstreamHeaders.set("X-Forwarded-For", fwdFor);
  }

  let upstreamPath = "";
  let upstreamBody: string | undefined;

  if (method === "GET" && action === "me") {
    upstreamPath = "/api/v1/public/shopper/me";
  } else if (method === "GET" && action === "orders") {
    const reqUrl = new URL(request.url);
    const queryStore = reqUrl.searchParams.get("store")?.trim() || storeSlug || "";
    upstreamPath = queryStore
      ? `/api/v1/public/shopper/orders?store=${encodeURIComponent(queryStore)}`
      : "/api/v1/public/shopper/orders";
  } else if (method === "POST" && action === "code") {
    upstreamPath = "/api/v1/public/shopper/code";
    upstreamHeaders.set("Content-Type", "application/json");
    let payload: Record<string, unknown> = {};
    try {
      payload = (await request.json()) as Record<string, unknown>;
    } catch {
      payload = {};
    }
    if (storeSlug && !payload.store_slug) {
      payload.store_slug = storeSlug;
    }
    upstreamBody = JSON.stringify(payload);
  } else if (method === "POST" && action === "verify") {
    upstreamPath = "/api/v1/public/shopper/verify";
    upstreamHeaders.set("Content-Type", "application/json");
    upstreamBody = await request.text();
  } else if (method === "POST" && action === "logout") {
    upstreamPath = "/api/v1/public/shopper/logout";
    upstreamHeaders.set("Content-Type", "application/json");
    upstreamBody = "{}";
  } else if (method === "POST" && action === "checkout" && storeSlug) {
    upstreamPath = `/api/v1/public/storefronts/${encodeURIComponent(storeSlug)}/checkout`;
    upstreamHeaders.set("Content-Type", "application/json");
    upstreamBody = await request.text();
  } else {
    return Response.json(
      { error: { code: "NOT_FOUND", message: "Unknown shopper proxy route" } },
      { status: 404 },
    );
  }

  const upstreamRes = await fetchFn(`${apiBase}${upstreamPath}`, {
    method,
    headers: upstreamHeaders,
    body: method === "POST" ? upstreamBody : undefined,
    cache: "no-store",
  });

  const rawText = await upstreamRes.text();
  const responseHeaders = new Headers({
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  const secureCookie = shouldUseSecureCookie(request);

  if (action === "verify" && upstreamRes.ok) {
    try {
      const parsed = JSON.parse(rawText) as {
        data?: { shopper?: unknown; session_token?: string };
      };
      const newToken = parsed.data?.session_token?.trim() ?? "";
      if (newToken) {
        responseHeaders.set(
          "Set-Cookie",
          buildHostOnlyShopperCookie(newToken, SHOPPER_COOKIE_MAX_AGE, secureCookie),
        );
      }
      if (parsed.data && "session_token" in parsed.data) {
        delete parsed.data.session_token;
      }
      return new Response(JSON.stringify(parsed), {
        status: upstreamRes.status,
        headers: responseHeaders,
      });
    } catch {
      // fall through if response is not JSON
    }
  }

  if (action === "logout") {
    responseHeaders.set("Set-Cookie", buildHostOnlyShopperCookie("", 0, secureCookie));
  }

  return new Response(rawText, {
    status: upstreamRes.status,
    headers: responseHeaders,
  });
}
