import { createMiddleware } from "hono/factory";
import type { Env } from "../../env";
import { AuthenticationError, AuthorizationError } from "../errors";

/**
 * Guards platform-operator routes — provisioning or suspending contractor-owner
 * accounts. Checks `users.is_platform_admin` (`auth.isPlatformAdmin`), which is
 * a strictly higher tier than `is_owner`: every contractor-owner has `is_owner`,
 * but only the deployment operator has this.
 *
 * It deliberately grants no tenant data access — a platform admin still needs a
 * real membership (or ownership) to read a site, so support access stays an
 * explicit, auditable act rather than an ambient superpower. Must run after
 * `requireAuth`.
 */
export const requirePlatformAdmin = createMiddleware<Env>(async (c, next) => {
  const auth = c.get("auth");
  if (!auth) throw new AuthenticationError("Please sign in to continue.");
  if (!auth.isPlatformAdmin) {
    throw new AuthorizationError("This action is restricted to platform administrators.");
  }
  await next();
});
