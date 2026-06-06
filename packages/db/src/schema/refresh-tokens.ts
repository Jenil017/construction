import { index, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { primaryId } from "./_shared";
import { companies } from "./companies";
import { users } from "./users";

/**
 * Refresh-token sessions — the server-side source of truth for refresh tokens
 * (see docs/architecter.md "Authentication Flow"). Only the SHA-256 hash of the
 * opaque token is stored. Rotation: on use, the current row is revoked and a
 * successor is inserted in the same `familyId`. Presenting an already-revoked
 * token is reuse → the whole family is revoked. No soft delete (revocation is
 * tracked via `revokedAt`).
 */
export const refreshTokens = pgTable(
  "refresh_tokens",
  {
    ...primaryId,
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    familyId: uuid("family_id").notNull(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    replacedByTokenId: uuid("replaced_by_token_id"),
    userAgent: text("user_agent"),
    ip: varchar("ip", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("refresh_tokens_hash_idx").on(table.tokenHash),
    index("refresh_tokens_family_idx").on(table.familyId),
    index("refresh_tokens_user_idx").on(table.userId),
  ],
);

export type RefreshToken = typeof refreshTokens.$inferSelect;
export type NewRefreshToken = typeof refreshTokens.$inferInsert;
