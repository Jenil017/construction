import { users } from "@construction-erp/db/schema";
import type { Permission } from "@construction-erp/shared";
import { and, eq, isNull } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import type { Env } from "../../env";
import { verifyAccessToken } from "../auth/jwt";
import { getDb } from "../db";
import { AuthenticationError } from "../errors";
import { loadUserSiteAccess } from "../rbac";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Authenticates the request from the `Authorization: Bearer <jwt>` header and
 * confirms the user is still active. If an `X-Site-Id` header is present and the
 * user owns or is a member of that site, the site's permissions are loaded and
 * attached. A missing/invalid/unauthorized site simply leaves `siteId` null —
 * `requireSiteContext` enforces site presence on site-scoped routes (so
 * account-level routes like /auth/me keep working regardless of the header).
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

  const siteHeader = c.req.header("X-Site-Id");
  let siteId: string | null = null;
  let isOwner = false;
  let permissions: Permission[] = [];

  if (siteHeader && UUID_RE.test(siteHeader)) {
    const access = await loadUserSiteAccess(db, user.id, siteHeader);
    if (access) {
      siteId = siteHeader;
      isOwner = access.isOwner;
      permissions = access.permissions;
    }
  }

  c.set("auth", {
    userId: user.id,
    siteId,
    email: user.email,
    name: user.name,
    isOwner,
    isAppOwner: user.isOwner,
    permissions,
  });

  await next();
});
