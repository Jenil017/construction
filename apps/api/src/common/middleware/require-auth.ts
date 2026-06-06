import { users } from "@construction-erp/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import type { Env } from "../../env";
import { verifyAccessToken } from "../auth/jwt";
import { getDb } from "../db";
import { AuthenticationError } from "../errors";
import { loadUserAccess } from "../rbac";

/**
 * Authenticates the request from the `Authorization: Bearer <jwt>` header,
 * confirms the user is still active, loads their roles + permissions, and
 * attaches the `auth` context. Mount before `requirePermission`.
 */
export const requireAuth = createMiddleware<Env>(async (c, next) => {
  const header = c.req.header("Authorization");
  if (!header?.startsWith("Bearer ")) {
    throw new AuthenticationError("Please sign in to continue.");
  }

  const token = header.slice("Bearer ".length).trim();
  const claims = await verifyAccessToken(token, c.env.JWT_SECRET);

  const db = getDb(c);
  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, claims.sub), isNull(users.deletedAt)))
    .limit(1);

  if (!user || user.status !== "active") {
    throw new AuthenticationError("Your account is no longer active. Please contact your admin.");
  }

  const access = await loadUserAccess(db, user.id, user.companyId);
  c.set("auth", {
    userId: user.id,
    companyId: user.companyId,
    email: user.email,
    name: user.name,
    roles: access.roles,
    permissions: access.permissions,
  });

  await next();
});
