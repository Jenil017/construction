import { index, jsonb, pgTable, text, uuid, varchar } from "drizzle-orm/pg-core";
import { primaryId, timestamps } from "./_shared";

/**
 * Append-only audit trail (see docs/architecter.md "Audit Architecture").
 * Captures who did what to which entity. `siteId` is the tenant key for
 * site-scoped events and is null for account-level events (login/logout).
 * Never store secrets or full sensitive documents here. No soft delete —
 * audit rows are immutable.
 */
export const auditLogs = pgTable(
  "audit_logs",
  {
    ...primaryId,
    // Nullable: account-level events (login/logout) have no site context.
    siteId: uuid("site_id"),
    actorUserId: uuid("actor_user_id"),
    module: varchar("module", { length: 40 }).notNull(),
    action: varchar("action", { length: 40 }).notNull(),
    entityType: varchar("entity_type", { length: 60 }).notNull(),
    entityId: varchar("entity_id", { length: 64 }),
    before: jsonb("before"),
    after: jsonb("after"),
    ip: varchar("ip", { length: 64 }),
    userAgent: text("user_agent"),
    requestId: varchar("request_id", { length: 64 }),
    ...timestamps,
  },
  (table) => [
    index("audit_logs_site_idx").on(table.siteId),
    index("audit_logs_actor_idx").on(table.actorUserId),
    index("audit_logs_entity_idx").on(table.entityType, table.entityId),
    index("audit_logs_created_idx").on(table.createdAt),
  ],
);

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
