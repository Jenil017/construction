/*
 * Service worker for the Construction ERP PWA.
 *
 * Deliberately conservative: it exists mainly to make the app installable (a
 * registered SW with a fetch handler) and to speed up repeat loads — NOT to make
 * an API-backed ERP work offline. So:
 *   - hashed Next build assets (/_next/static/**) + the app icons are cache-first
 *     (their URLs are content-addressed, so a cache hit is always correct);
 *   - everything else (HTML navigations, the cross-origin API) goes to the
 *     network untouched, so users never see stale pages or stale data.
 */

const STATIC_CACHE = "erp-static-v1";

self.addEventListener("install", () => {
  // Activate this SW as soon as it's installed (don't wait for old tabs to close).
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== STATIC_CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

function isCacheableStatic(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icon-") ||
    url.pathname === "/apple-touch-icon.png" ||
    url.pathname === "/manifest.webmanifest"
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // Only ever touch our own origin — never the ERP API or other cross-origin calls.
  if (url.origin !== self.location.origin) return;

  if (!isCacheableStatic(url)) return; // navigations & dynamic data: straight to network.

  event.respondWith(
    caches.open(STATIC_CACHE).then(async (cache) => {
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    }),
  );
});
