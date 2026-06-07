import { createMiddleware } from "hono/factory";
import type { Env } from "../../env";
import { AuthenticationError, SiteAccessError, ValidationError } from "../errors";

/**
 * Enforces that the request carries a valid active site. Must run after
 * `requireAuth`. Distinguishes two failures:
 *   - no `X-Site-Id` header at all → 400 VALIDATION_ERROR ("select a site"),
 *   - a header was sent but the user can't access it (revoked / unknown) →
 *     403 SITE_ACCESS_REVOKED, so the client can drop the stale site and refetch.
 */
export const requireSiteContext = createMiddleware<Env>(async (c, next) => {
  const auth = c.get("auth");
  if (!auth) throw new AuthenticationError("Please sign in to continue.");
  if (!auth.siteId) {
    if (c.req.header("X-Site-Id")) throw new SiteAccessError();
    throw new ValidationError("Select a site to continue.");
  }
  await next();
});
