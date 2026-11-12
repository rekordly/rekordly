const SW_VERSION = "rekordly-sw-v1-2026-11-12";
const STATIC_CACHE = `${SW_VERSION}-static`;
const NAV_CACHE = `${SW_VERSION}-nav`;
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll([OFFLINE_URL, "/rekordly-logo.svg", "/favicon.ico"]))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => !key.startsWith(SW_VERSION))
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

function isSafeStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".ico") ||
    url.pathname.endsWith(".woff2")
  );
}

function isSensitiveOrDynamic(url) {
  return (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/v1/") ||
    url.pathname.startsWith("/s/") ||
    url.searchParams.has("token") ||
    url.searchParams.has("signature")
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") {
    // Never cache mutations as replay authority.
    return;
  }

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) {
    return;
  }
  if (isSensitiveOrDynamic(url)) {
    // Never cache authenticated API, guest-token pages, or signed private URLs.
    return;
  }

  if (isSafeStaticAsset(url)) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        });
      })
    );
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && !url.pathname.startsWith("/s/")) {
            const copy = res.clone();
            caches.open(NAV_CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(async () => {
          const cached = await caches.match(req);
          if (cached) return cached;
          return (await caches.match(OFFLINE_URL)) || Response.error();
        })
    );
  }
});
