import type { Database } from "@construction-erp/db";
import { refreshTokens } from "@construction-erp/db/schema";
import type { NewRefreshToken } from "@construction-erp/db/schema";
import { generateOpaqueToken, sha256Hex } from "@construction-erp/shared";
import { and, eq, isNull } from "drizzle-orm";
import type { DbClient } from "../db";
import { AuthenticationError, RefreshTokenReuseError } from "../errors";

/**
 * Refresh-token service. The DB is the source of truth (see docs/architecter.md
 * "Authentication Flow"): tokens are opaque, only their hash is stored, they
 * rotate on use, and presenting an already-rotated token revokes the whole family.
 */
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

export interface RefreshTokenMeta {
  userAgent?: string | null;
  ip?: string | null;
}

export interface IssuedRefreshToken {
  /** Raw token returned to the client; never stored. */
  token: string;
  tokenId: string;
  familyId: string;
  expiresAt: Date;
}

async function buildRefreshRecord(params: {
  userId: string;
  companyId: string;
  familyId: string;
  meta?: RefreshTokenMeta;
}): Promise<{ rawToken: string; expiresAt: Date; row: NewRefreshToken }> {
  const rawToken = generateOpaqueToken();
  const tokenHash = await sha256Hex(rawToken);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000);
  return {
    rawToken,
    expiresAt,
    row: {
      userId: params.userId,
      companyId: params.companyId,
      familyId: params.familyId,
      tokenHash,
      expiresAt,
      userAgent: params.meta?.userAgent ?? null,
      ip: params.meta?.ip ?? null,
    },
  };
}

/** Issue a brand-new session (new family). Used at login. */
export async function issueRefreshToken(
  db: DbClient,
  params: { userId: string; companyId: string; meta?: RefreshTokenMeta },
): Promise<IssuedRefreshToken> {
  const familyId = crypto.randomUUID();
  const { rawToken, expiresAt, row } = await buildRefreshRecord({ ...params, familyId });
  const [inserted] = await db.insert(refreshTokens).values(row).returning();
  if (!inserted) throw new AuthenticationError("Could not start a session. Please try again.");
  return { token: rawToken, tokenId: inserted.id, familyId, expiresAt };
}

export interface RotatedRefreshToken extends IssuedRefreshToken {
  userId: string;
  companyId: string;
}

/**
 * Rotate a refresh token: validate → issue successor in the same family → revoke
 * the presented one. Reuse of an already-rotated/revoked token revokes the family.
 * Runs in a transaction.
 */
export async function rotateRefreshToken(
  db: Database,
  rawToken: string,
  meta?: RefreshTokenMeta,
): Promise<RotatedRefreshToken> {
  const tokenHash = await sha256Hex(rawToken);

  const [current] = await db
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, tokenHash))
    .limit(1);

  if (!current) {
    throw new AuthenticationError("Your session has expired. Please sign in again.");
  }

  // Reuse attack: a token that was already rotated (replaced) is being replayed.
  // Revoke the whole family — and this MUST commit, so it runs outside the
  // rotation transaction (throwing inside a tx would roll the revocation back).
  if (current.replacedByTokenId) {
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.familyId, current.familyId), isNull(refreshTokens.revokedAt)));
    throw new RefreshTokenReuseError();
  }

  // Explicitly revoked (logout / user disabled) — not an attack, just dead.
  if (current.revokedAt) {
    throw new AuthenticationError("Your session has ended. Please sign in again.");
  }

  if (current.expiresAt.getTime() <= Date.now()) {
    throw new AuthenticationError("Your session has expired. Please sign in again.");
  }

  const {
    rawToken: newToken,
    expiresAt,
    row,
  } = await buildRefreshRecord({
    userId: current.userId,
    companyId: current.companyId,
    familyId: current.familyId,
    meta,
  });

  // Atomic rotation: insert successor + revoke the presented token together.
  return db.transaction(async (tx) => {
    const [successor] = await tx.insert(refreshTokens).values(row).returning();
    if (!successor) {
      throw new AuthenticationError("Could not refresh your session. Please sign in again.");
    }
    await tx
      .update(refreshTokens)
      .set({ revokedAt: new Date(), replacedByTokenId: successor.id })
      .where(eq(refreshTokens.id, current.id));

    return {
      token: newToken,
      tokenId: successor.id,
      familyId: current.familyId,
      expiresAt,
      userId: current.userId,
      companyId: current.companyId,
    };
  });
}

/** Look up the user/company a refresh token belongs to (for logout auditing). */
export async function findRefreshTokenOwner(
  db: DbClient,
  rawToken: string,
): Promise<{ userId: string; companyId: string } | null> {
  const tokenHash = await sha256Hex(rawToken);
  const [row] = await db
    .select({ userId: refreshTokens.userId, companyId: refreshTokens.companyId })
    .from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, tokenHash))
    .limit(1);
  return row ?? null;
}

/** Revoke a single active token (logout). No-op if already revoked/unknown. */
export async function revokeRefreshToken(db: DbClient, rawToken: string): Promise<void> {
  const tokenHash = await sha256Hex(rawToken);
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.tokenHash, tokenHash), isNull(refreshTokens.revokedAt)));
}

/** Revoke all of a user's live sessions (used when a user is disabled/deleted). */
export async function revokeUserSessions(db: DbClient, userId: string): Promise<void> {
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
}
