import type { RbacAction, RbacModule } from "@construction-erp/shared";
import { createMiddleware } from "hono/factory";
import type { Env } from "../../env";
import { AuthenticationError, AuthorizationError } from "../errors";
import { hasPermission } from "../rbac";

const ACTION_VERB: Record<RbacAction, string> = {
  view: "view",
  create: "create",
  update: "update",
  delete: "delete",
  approve: "approve",
  export: "export",
};

/**
 * Guards a route with a required `{ module, action }` permission. Must run after
 * `requireAuth`. Returns the standard `PERMISSION_DENIED` envelope with a
 * user-friendly message (see docs/errors.md).
 */
export function requirePermission(module: RbacModule, action: RbacAction) {
  return createMiddleware<Env>(async (c, next) => {
    const auth = c.get("auth");
    if (!auth) {
      throw new AuthenticationError("Please sign in to continue.");
    }
    if (!hasPermission(auth.permissions, module, action)) {
      throw new AuthorizationError(
        `You do not have permission to ${ACTION_VERB[action]} ${module}.`,
      );
    }
    await next();
  });
}
