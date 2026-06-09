import { index, integer, jsonb, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { primaryId, softDelete, timestamps } from "./_shared";
import { sites } from "./sites";
import { users } from "./users";

/**
 * A report export job (see docs/architecter.md "Reporting Flow" + docs/prd.md
 * "Reports"). Site-scoped. Heavy PDF/Excel generation is never done inside the
 * request handler — the route records this row + enqueues it to Cloudflare Queues,
 * and the queue consumer generates the file, stores it in R2, and flips the status.
 *
 * Lifecycle: `queued` → `processing` → `completed` | `failed`.
 *   - `reportType` picks the dataset builder (e.g. `expense_register`).
 *   - `format` is `csv` (spreadsheet-friendly) or `pdf`.
 *   - `params` is the JSON filter set used (date range, etc.).
 *   - `objectKey` / `fileSize` / `rowCount` are set on completion.
 *   - `attempts` tracks retries (the docs/architecter.md "retryable report
 *     processing" requirement); `errorMessage` holds the last user-facing failure.
 * Soft-deletable (the R2 object is best-effort removed alongside).
 */
export const exportJobs = pgTable(
  "export_jobs",
  {
    ...primaryId,
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    reportType: varchar("report_type", { length: 40 }).notNull(),
    // csv | pdf
    format: varchar("format", { length: 8 }).notNull(),
    // queued | processing | completed | failed
    status: varchar("status", { length: 12 }).notNull().default("queued"),
    params: jsonb("params"),
    fileName: varchar("file_name", { length: 200 }),
    objectKey: varchar("object_key", { length: 300 }),
    fileSize: integer("file_size"),
    rowCount: integer("row_count"),
    errorMessage: varchar("error_message", { length: 300 }),
    attempts: integer("attempts").notNull().default(0),
    correlationId: varchar("correlation_id", { length: 64 }),
    requestedByUserId: uuid("requested_by_user_id")
      .notNull()
      .references(() => users.id),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps,
    ...softDelete,
  },
  (table) => [
    index("export_jobs_site_idx").on(table.siteId),
    index("export_jobs_site_status_idx").on(table.siteId, table.status),
    index("export_jobs_requested_by_idx").on(table.requestedByUserId),
    index("export_jobs_created_idx").on(table.createdAt),
  ],
);

export type ExportJob = typeof exportJobs.$inferSelect;
export type NewExportJob = typeof exportJobs.$inferInsert;
