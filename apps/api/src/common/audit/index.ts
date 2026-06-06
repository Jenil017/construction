import { auditLogs } from "@construction-erp/db/schema";
import type { DbClient } from "../db";

/**
 * Append an audit-trail row (see docs/architecter.md "Audit Architecture").
 * Callers must never pass secrets or sensitive salary/payment data in
 * before/after — strip password hashes etc. before calling.
 */
export interface AuditEntry {
  companyId: string;
  actorUserId?: string | null;
  module: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

export async function writeAudit(db: DbClient, entry: AuditEntry): Promise<void> {
  await db.insert(auditLogs).values({
    companyId: entry.companyId,
    actorUserId: entry.actorUserId ?? null,
    module: entry.module,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    before: entry.before ?? null,
    after: entry.after ?? null,
    ip: entry.ip ?? null,
    userAgent: entry.userAgent ?? null,
    requestId: entry.requestId ?? null,
  });
}
