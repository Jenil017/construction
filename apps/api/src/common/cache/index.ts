import { createMiddleware } from "hono/factory";
import type { Env } from "../../env";

/**
 * Edge-cache middleware (Cloudflare Cache API) for STABLE, NON-TENANT reference
 * reads ONLY. Per docs/architecter.md: "Cloudflare Cache API only for stable
 * reference data after confirming tenant safety. Never cache salary, attendance,
 * expense, auth, or permission responses."
 *
 * Place it LAST in a route's middleware array (after requireAuth/permission) so a
 * cache hit never bypasses the auth/permission checks — it only skips recomputing
 * an identical, tenant-independent body. Use exclusively where the response is the
 * same for every caller (e.g. the report-type catalog).
 */
export function edgeCache(maxAgeSeconds: number) {
  return createMiddleware<Env>(async (c, next) => {
    // `caches` exists only in the Workers runtime (absent in some test contexts).
    const cache = typeof caches !== "undefined" ? caches.default : undefined;
    const cacheKey = new Request(c.req.url, { method: "GET" });

    if (cache) {
      const hit = await cache.match(cacheKey);
      if (hit) return hit;
    }

    await next();

    if (cache && c.res.ok) {
      c.header("Cache-Control", `public, max-age=${maxAgeSeconds}`);
      c.executionCtx.waitUntil(cache.put(cacheKey, c.res.clone()));
    }
  });
}
