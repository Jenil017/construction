import { index, integer, jsonb, pgTable, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { primaryId, timestamps } from "./_shared";
import { sites } from "./sites";
import { users } from "./users";

/**
 * Idempotency records for critical mutating operations (see docs/architecter.md
 * "Use idempotency keys for: payments, salary generation, inventory stock
 * movements, purchase creation, export generation"). A client sends a stable
 * `Idempotency-Key` header; the first request claims a row (`in_progress`) and,
 * on success, stores the response (`completed`). A replay with the same key
 * returns the stored response instead of re-running the operation; a replay with
 * a *different* payload (or a different user) is an `IDEMPOTENCY_CONFLICT`.
 *
 * Scoped per site (the tenant key). `requestHash` is a SHA-256 of method+path+body
 * so a reused key with a changed payload is detected. No soft delete — rows are
 * short-lived operational records (a TTL/cleanup job is a future enhancement).
 */
export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    ...primaryId,
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    idempotencyKey: varchar("idempotency_key", { length: 200 }).notNull(),
    method: varchar("method", { length: 8 }).notNull(),
    path: varchar("path", { length: 300 }).notNull(),
    requestHash: varchar("request_hash", { length: 64 }).notNull(),
    // in_progress | completed
    status: varchar("status", { length: 12 }).notNull().default("in_progress"),
    statusCode: integer("status_code"),
    responseBody: jsonb("response_body"),
    ...timestamps,
  },
  (table) => [
    // One claim per (site, key) — the conflict target the middleware races on.
    uniqueIndex("idempotency_keys_site_key_uniq").on(table.siteId, table.idempotencyKey),
    index("idempotency_keys_created_idx").on(table.createdAt),
  ],
);

export type IdempotencyKey = typeof idempotencyKeys.$inferSelect;
export type NewIdempotencyKey = typeof idempotencyKeys.$inferInsert;
