/* Lexora online-first: only this public fallback is cached. No app/data shell. */
const CACHE_PREFIX = "lexora-public-";
// v2 also refreshes the security headers stored with the public fallback.
const CACHE_NAME = `${CACHE_PREFIX}v2`;
const PUBLIC_ASSETS = ["/offline.html", "/offline.css", "/offline.js", "/icons/lexora.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(
        PUBLIC_ASSETS.map((url) => new Request(url, { credentials: "omit", cache: "reload" })),
      );
      await self.skipWaiting();
    })(),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME) await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});
self.addEventListener("fetch", (event) => {
  const { request } = event,
    url = new URL(request.url);
  if (
    url.origin !== self.location.origin ||
    request.method !== "GET" ||
    url.pathname.startsWith("/api/")
  )
    return;
  // Never intercept POST, RSC, Auth or application reads. They require the server.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const fallback = await (await caches.open(CACHE_NAME)).match("/offline.html");
        return fallback || Response.error();
      }),
    );
  } else if (PUBLIC_ASSETS.includes(url.pathname) && !url.search) {
    event.respondWith(
      (async () => {
        const cached = await (await caches.open(CACHE_NAME)).match(url.pathname);
        return cached || fetch(request);
      })(),
    );
  }
});
