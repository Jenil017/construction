import { users } from "@construction-erp/db/schema";
import { apiErrorSchema, apiSuccessSchema, verifyPassword } from "@construction-erp/shared";
import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { and, eq, isNull } from "drizzle-orm";
import { writeAudit } from "../../common/audit";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  findRefreshTokenOwner,
  issueRefreshToken,
  revokeRefreshToken,
  rotateRefreshToken,
  signAccessToken,
} from "../../common/auth";
import { getDb } from "../../common/db";
import type { DbClient } from "../../common/db";
import { AuthenticationError, InvalidCredentialsError } from "../../common/errors";
import { getRequestMeta } from "../../common/http/request-meta";
import { requireAuth } from "../../common/middleware/require-auth";
import { rateLimit } from "../../common/rate-limit";
import { loadUserSites } from "../../common/rbac";
import type { Env } from "../../env";
import {
  authUserSchema,
  loginBodySchema,
  logoutBodySchema,
  logoutResultSchema,
  refreshBodySchema,
  sessionSchema,
} from "./auth.schemas";

export const authRoutes = new OpenAPIHono<Env>();

interface UserRow {
  id: string;
  email: string;
  name: string;
  isOwner: boolean;
}

/** Build the public user payload (profile + the sites they can access). */
async function userPayload(db: DbClient, user: UserRow) {
  const sites = await loadUserSites(db, user.id);
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    isAppOwner: user.isOwner,
    sites,
  };
}

const loginRoute = createRoute({
  method: "post",
  path: "/auth/login",
  tags: ["Auth"],
  summary: "Sign in with email and password",
  description:
    "Returns a short-lived access token, a rotating refresh token, and accessible sites.",
  middleware: [rateLimit({ bucket: "login", limit: 10, windowMs: 60_000 })] as const,
  request: {
    body: { content: { "application/json": { schema: loginBodySchema } }, required: true },
  },
  responses: {
    200: {
      description: "Signed in",
      content: { "application/json": { schema: apiSuccessSchema(sessionSchema) } },
    },
    401: {
      description: "Invalid credentials",
      content: { "application/json": { schema: apiErrorSchema } },
    },
    429: {
      description: "Too many attempts",
      content: { "application/json": { schema: apiErrorSchema } },
    },
  },
});

authRoutes.openapi(loginRoute, async (c) => {
  const { email, password } = c.req.valid("json");
  const db = getDb(c);
  const meta = getRequestMeta(c);
  const normalizedEmail = email.trim().toLowerCase();

  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.email, normalizedEmail), isNull(users.deletedAt)))
    .limit(1);

  // Same generic error whether the email is unknown or the password is wrong.
  if (!user || user.status !== "active") throw new InvalidCredentialsError();
  if (!(await verifyPassword(password, user.passwordHash))) throw new InvalidCredentialsError();

  const accessToken = await signAccessToken({ userId: user.id }, c.env.JWT_SECRET);

  const refresh = await db.transaction(async (tx) => {
    await tx.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
    const issued = await issueRefreshToken(tx, {
      userId: user.id,
      meta: { userAgent: meta.userAgent, ip: meta.ip },
    });
    await writeAudit(tx, {
      actorUserId: user.id,
      module: "auth",
      action: "login",
      entityType: "user",
      entityId: user.id,
      ip: meta.ip,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });
    return issued;
  });

  return c.json(
    {
      success: true as const,
      data: {
        accessToken,
        refreshToken: refresh.token,
        tokenType: "Bearer" as const,
        expiresIn: ACCESS_TOKEN_TTL_SECONDS,
        user: await userPayload(db, user),
      },
    },
    200,
  );
});

const refreshRoute = createRoute({
  method: "post",
  path: "/auth/refresh",
  tags: ["Auth"],
  summary: "Rotate the refresh token and issue a new access token",
  middleware: [rateLimit({ bucket: "refresh", limit: 30, windowMs: 60_000 })] as const,
  request: {
    body: { content: { "application/json": { schema: refreshBodySchema } }, required: true },
  },
  responses: {
    200: {
      description: "Session refreshed",
      content: { "application/json": { schema: apiSuccessSchema(sessionSchema) } },
    },
    401: {
      description: "Invalid, expired, or reused refresh token",
      content: { "application/json": { schema: apiErrorSchema } },
    },
  },
});

authRoutes.openapi(refreshRoute, async (c) => {
  const { refreshToken } = c.req.valid("json");
  const db = getDb(c);
  const meta = getRequestMeta(c);

  const rotated = await rotateRefreshToken(db, refreshToken, {
    userAgent: meta.userAgent,
    ip: meta.ip,
  });

  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, rotated.userId), isNull(users.deletedAt)))
    .limit(1);

  if (!user || user.status !== "active") {
    await revokeRefreshToken(db, rotated.token);
    throw new AuthenticationError("Your account is no longer active. Please contact your admin.");
  }

  const accessToken = await signAccessToken({ userId: user.id }, c.env.JWT_SECRET);

  return c.json(
    {
      success: true as const,
      data: {
        accessToken,
        refreshToken: rotated.token,
        tokenType: "Bearer" as const,
        expiresIn: ACCESS_TOKEN_TTL_SECONDS,
        user: await userPayload(db, user),
      },
    },
    200,
  );
});

const logoutRoute = createRoute({
  method: "post",
  path: "/auth/logout",
  tags: ["Auth"],
  summary: "Revoke a refresh token",
  request: {
    body: { content: { "application/json": { schema: logoutBodySchema } }, required: true },
  },
  responses: {
    200: {
      description: "Logged out",
      content: { "application/json": { schema: apiSuccessSchema(logoutResultSchema) } },
    },
  },
});

authRoutes.openapi(logoutRoute, async (c) => {
  const { refreshToken } = c.req.valid("json");
  const db = getDb(c);
  const meta = getRequestMeta(c);

  const owner = await findRefreshTokenOwner(db, refreshToken);
  await revokeRefreshToken(db, refreshToken);
  if (owner) {
    await writeAudit(db, {
      actorUserId: owner.userId,
      module: "auth",
      action: "logout",
      entityType: "user",
      entityId: owner.userId,
      ip: meta.ip,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });
  }

  return c.json({ success: true as const, data: { revoked: true } }, 200);
});

const meRoute = createRoute({
  method: "get",
  path: "/auth/me",
  tags: ["Auth"],
  summary: "Current user and accessible sites",
  middleware: [requireAuth] as const,
  responses: {
    200: {
      description: "The authenticated user",
      content: { "application/json": { schema: apiSuccessSchema(authUserSchema) } },
    },
    401: {
      description: "Not authenticated",
      content: { "application/json": { schema: apiErrorSchema } },
    },
  },
});

authRoutes.openapi(meRoute, async (c) => {
  const auth = c.get("auth");
  const db = getDb(c);
  const sites = await loadUserSites(db, auth.userId);
  return c.json(
    {
      success: true as const,
      data: {
        id: auth.userId,
        email: auth.email,
        name: auth.name,
        isAppOwner: auth.isAppOwner,
        sites,
      },
    },
    200,
  );
});
