import { sign, verify } from "hono/jwt";
import { JwtTokenExpired } from "hono/utils/jwt/types";
import { AuthenticationError, TokenExpiredError } from "../errors";

/**
 * Short-lived JWT access tokens (HS256 via hono/jwt + Web Crypto). The token
 * carries only the subject + tenant; permissions are loaded fresh from the DB on
 * each request (see common/rbac), so a permission change takes effect within one
 * access-token lifetime without embedding a large claim set.
 */
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

export interface AccessTokenClaims {
  sub: string; // user id
  companyId: string;
}

export async function signAccessToken(
  payload: { userId: string; companyId: string },
  secret: string,
  ttlSeconds: number = ACCESS_TOKEN_TTL_SECONDS,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return sign(
    {
      sub: payload.userId,
      companyId: payload.companyId,
      type: "access",
      iat: now,
      exp: now + ttlSeconds,
    },
    secret,
    "HS256",
  );
}

export async function verifyAccessToken(token: string, secret: string): Promise<AccessTokenClaims> {
  let payload: Record<string, unknown>;
  try {
    payload = (await verify(token, secret, "HS256")) as Record<string, unknown>;
  } catch (error) {
    if (error instanceof JwtTokenExpired) throw new TokenExpiredError();
    throw new AuthenticationError("Your session is invalid. Please sign in again.");
  }

  const sub = payload.sub;
  const companyId = payload.companyId;
  if (payload.type !== "access" || typeof sub !== "string" || typeof companyId !== "string") {
    throw new AuthenticationError("Your session is invalid. Please sign in again.");
  }
  return { sub, companyId };
}
