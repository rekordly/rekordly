import assert from "node:assert/strict";
import test from "node:test";

import {
  handleShopperProxyRequest,
  SHOPPER_COOKIE_NAME,
  SHOPPER_HEADER_NAME,
} from "../src/lib/shopper-proxy.ts";

interface RecordedUpstreamCall {
  url: string;
  method: string;
  headers: Headers;
  body: string | undefined;
}

function createFakeUpstreamFetch() {
  const calls: RecordedUpstreamCall[] = [];
  const validToken = "sess_tok_live_abc123";

  const fetchImpl: typeof fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = (init?.method ?? "GET").toUpperCase();
    const headers = new Headers(init?.headers);
    const body = typeof init?.body === "string" ? init.body : undefined;
    calls.push({ url, method, headers, body });

    const parsedUrl = new URL(url);
    const sessionHeader = headers.get(SHOPPER_HEADER_NAME) ?? "";

    // Go API strictly rejects requests that try to authenticate with a browser Cookie instead of X-Shopper-Session-Token
    if (headers.get("cookie")?.includes(SHOPPER_COOKIE_NAME) && !sessionHeader) {
      return Response.json({ error: { code: "UNAUTHORIZED", message: "Cookie not accepted on API domain" } }, { status: 401 });
    }

    if (parsedUrl.pathname === "/api/v1/public/shopper/code" && method === "POST") {
      return Response.json({ data: { message: "If you have orders, we've sent a code" } }, { status: 200 });
    }

    if (parsedUrl.pathname === "/api/v1/public/shopper/verify" && method === "POST") {
      return Response.json(
        {
          data: {
            shopper: { email: "ada@example.com", name: "Ada Obi", saved_addresses: ["12 Marina, Lagos"] },
            session_token: validToken,
          },
        },
        { status: 200 },
      );
    }

    if (parsedUrl.pathname === "/api/v1/public/shopper/me" && method === "GET") {
      if (sessionHeader !== validToken) {
        return Response.json({ error: { code: "UNAUTHORIZED", message: "Shopper session required" } }, { status: 401 });
      }
      return Response.json(
        {
          data: {
            shopper: { email: "ada@example.com", name: "Ada Obi", saved_addresses: ["12 Marina, Lagos"] },
          },
        },
        { status: 200 },
      );
    }

    if (parsedUrl.pathname === "/api/v1/public/shopper/orders" && method === "GET") {
      if (sessionHeader !== validToken) {
        return Response.json({ error: { code: "UNAUTHORIZED", message: "Shopper session required" } }, { status: 401 });
      }
      const storeFilter = parsedUrl.searchParams.get("store");
      const allOrders = [
        { order_reference: "ORD-001", storefront_slug: "emperor-fashion", storefront_name: "Emperor Fashion" },
        { order_reference: "ORD-002", storefront_slug: "beta-shoes", storefront_name: "Beta Shoes" },
      ];
      const filtered = storeFilter ? allOrders.filter((o) => o.storefront_slug === storeFilter) : allOrders;
      return Response.json({ data: { orders: filtered } }, { status: 200 });
    }

    if (parsedUrl.pathname.endsWith("/checkout") && method === "POST") {
      return Response.json(
        {
          data: {
            order: {
              order_reference: "ORD-003",
              linked_shopper: sessionHeader === validToken,
            },
          },
        },
        { status: 201 },
      );
    }

    if (parsedUrl.pathname === "/api/v1/public/shopper/logout" && method === "POST") {
      return Response.json({ data: { signed_out: true } }, { status: 200 });
    }

    return Response.json({ error: { code: "NOT_FOUND", message: "Not found" } }, { status: 404 });
  };

  return { fetchImpl, calls, validToken };
}

test("same-origin shopper proxy works on /s/<slug> (localhost:3000), custom domain Host: shop.example.com, and /orders", async () => {
  const { fetchImpl, calls, validToken } = createFakeUpstreamFetch();

  // 1. /s/emperor-fashion/api/shopper/verify on localhost:3000 sets host-only cookie (no Domain attribute) and strips session_token from JSON
  const verifyReqLocal = new Request("http://localhost:3000/s/emperor-fashion/api/shopper/verify", {
    method: "POST",
    headers: {
      Host: "localhost:3000",
      Origin: "http://localhost:3000",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email: "ada@example.com", code: "123456" }),
  });
  const verifyResLocal = await handleShopperProxyRequest(verifyReqLocal, {
    storeSlug: "emperor-fashion",
    pathSegments: ["verify"],
    fetchImpl,
    apiBaseUrl: "http://api.internal:8080",
  });
  assert.equal(verifyResLocal.status, 200);
  const setCookieLocal = verifyResLocal.headers.get("set-cookie") ?? "";
  assert.match(setCookieLocal, /rekordly_shopper_session=sess_tok_live_abc123/);
  assert.match(setCookieLocal, /HttpOnly/);
  assert.match(setCookieLocal, /SameSite=Lax/);
  assert.match(setCookieLocal, /Path=\//);
  assert.doesNotMatch(setCookieLocal, /Domain=/i, "cookie must be host-only with no Domain attribute");
  const verifyBodyLocal = (await verifyResLocal.json()) as { data: { shopper: { email: string }; session_token?: string } };
  assert.equal(verifyBodyLocal.data.shopper.email, "ada@example.com");
  assert.equal(verifyBodyLocal.data.session_token, undefined, "session_token must not leak to browser JSON");

  // 2. Simulated custom domain Host: shop.example.com sets host-only Secure cookie and forwards X-Shopper-Session-Token to Go API
  const verifyReqCustom = new Request("https://shop.example.com/s/emperor-fashion/api/shopper/verify", {
    method: "POST",
    headers: {
      Host: "shop.example.com",
      Origin: "https://shop.example.com",
      "X-Forwarded-Proto": "https",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ token: "magic_link_token" }),
  });
  const verifyResCustom = await handleShopperProxyRequest(verifyReqCustom, {
    storeSlug: "emperor-fashion",
    pathSegments: ["verify"],
    fetchImpl,
    apiBaseUrl: "http://api.internal:8080",
  });
  assert.equal(verifyResCustom.status, 200);
  const setCookieCustom = verifyResCustom.headers.get("set-cookie") ?? "";
  assert.match(setCookieCustom, /Secure/);
  assert.doesNotMatch(setCookieCustom, /Domain=/i);

  // Use the host-only cookie on shop.example.com to fetch store-scoped orders & submit checkout
  const ordersReqCustom = new Request("https://shop.example.com/s/emperor-fashion/api/shopper/orders", {
    method: "GET",
    headers: {
      Host: "shop.example.com",
      Cookie: `${SHOPPER_COOKIE_NAME}=${validToken}`,
    },
  });
  const ordersResCustom = await handleShopperProxyRequest(ordersReqCustom, {
    storeSlug: "emperor-fashion",
    pathSegments: ["orders"],
    fetchImpl,
    apiBaseUrl: "http://api.internal:8080",
  });
  assert.equal(ordersResCustom.status, 200);
  const ordersJsonCustom = (await ordersResCustom.json()) as { data: { orders: Array<{ storefront_slug: string }> } };
  assert.equal(ordersJsonCustom.data.orders.length, 1);
  assert.equal(ordersJsonCustom.data.orders[0].storefront_slug, "emperor-fashion");
  const lastOrdersCall = calls[calls.length - 1];
  assert.equal(lastOrdersCall.headers.get(SHOPPER_HEADER_NAME), validToken);
  assert.equal(lastOrdersCall.headers.get("cookie"), null, "browser cookies must never be forwarded to Go API");

  // Checkout on custom domain forwards X-Shopper-Session-Token and Idempotency-Key
  const checkoutReqCustom = new Request("https://shop.example.com/s/emperor-fashion/api/shopper/checkout", {
    method: "POST",
    headers: {
      Host: "shop.example.com",
      Origin: "https://shop.example.com",
      Cookie: `${SHOPPER_COOKIE_NAME}=${validToken}`,
      "Idempotency-Key": "idem-custom-123",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ customer_name: "Ada Obi" }),
  });
  const checkoutResCustom = await handleShopperProxyRequest(checkoutReqCustom, {
    storeSlug: "emperor-fashion",
    pathSegments: ["checkout"],
    fetchImpl,
    apiBaseUrl: "http://api.internal:8080",
  });
  assert.equal(checkoutResCustom.status, 201);
  const lastCheckoutCall = calls[calls.length - 1];
  assert.equal(lastCheckoutCall.headers.get(SHOPPER_HEADER_NAME), validToken);
  assert.equal(lastCheckoutCall.headers.get("idempotency-key"), "idem-custom-123");

  // 3. Cross-store /orders/api/orders returns orders across all stores
  const allOrdersReq = new Request("http://localhost:3000/orders/api/orders", {
    method: "GET",
    headers: {
      Host: "localhost:3000",
      Cookie: `${SHOPPER_COOKIE_NAME}=${validToken}`,
    },
  });
  const allOrdersRes = await handleShopperProxyRequest(allOrdersReq, {
    pathSegments: ["orders"],
    fetchImpl,
    apiBaseUrl: "http://api.internal:8080",
  });
  assert.equal(allOrdersRes.status, 200);
  const allOrdersJson = (await allOrdersRes.json()) as { data: { orders: unknown[] } };
  assert.equal(allOrdersJson.data.orders.length, 2);
});

test("shopper proxy POST routes enforce CSRF Origin check and reject foreign or missing Origin with 403", async () => {
  const { fetchImpl, calls } = createFakeUpstreamFetch();

  // Foreign Origin -> 403
  const foreignOriginReq = new Request("https://shop.example.com/s/emperor-fashion/api/shopper/verify", {
    method: "POST",
    headers: {
      Host: "shop.example.com",
      Origin: "https://evil.attacker.example",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email: "ada@example.com", code: "123456" }),
  });
  const foreignRes = await handleShopperProxyRequest(foreignOriginReq, {
    storeSlug: "emperor-fashion",
    pathSegments: ["verify"],
    fetchImpl,
    apiBaseUrl: "http://api.internal:8080",
  });
  assert.equal(foreignRes.status, 403);
  assert.equal(calls.length, 0, "foreign Origin POST must be blocked before calling Go API");

  // Missing Origin on POST -> 403
  const missingOriginReq = new Request("http://localhost:3000/orders/api/logout", {
    method: "POST",
    headers: {
      Host: "localhost:3000",
    },
  });
  const missingRes = await handleShopperProxyRequest(missingOriginReq, {
    pathSegments: ["logout"],
    fetchImpl,
    apiBaseUrl: "http://api.internal:8080",
  });
  assert.equal(missingRes.status, 403);
  assert.equal(calls.length, 0);
});
