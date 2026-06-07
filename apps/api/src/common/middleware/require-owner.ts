import { createMiddleware } from "hono/factory";
import type { Env } from "../../env";
import { AuthenticationError, AuthorizationError } from "../errors";

/**
 * Guards account-level, owner-only actions (creating/managing sites). Checks the
 * global `is_owner` capability (`auth.isAppOwner`), independent of any active site.
 * Must run after `requireAuth`.
 */
export const requireOwner = createMiddleware<Env>(async (c, next) => {
  const auth = c.get("auth");
  if (!auth) throw new AuthenticationError("Please sign in to continue.");
  if (!auth.isAppOwner) {
    throw new AuthorizationError("Only an owner can manage sites.");
  }
  await next();
});
