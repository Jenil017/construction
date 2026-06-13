import { date, index, numeric, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { primaryId, softDelete, timestamps } from "./_shared";
import { sites } from "./sites";
import { users } from "./users";

/**
 * A Daily Progress Report: one dated record of work on a site (see docs/prd.md
 * "DPR"). Site-scoped — every query filters by `siteId`. Photos live in
 * `dpr_photos` (R2 object keys; bytes are never stored here). Workflow:
 * `submitted` → `approved` — a report is submitted on creation (no draft stage);
 * approval requires the `dpr:approve` permission.
 */
export const dpr = pgTable(
  "dpr",
  {
    ...primaryId,
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    reportDate: date("report_date").notNull(),
    workCategory: varchar("work_category", { length: 120 }),
    location: varchar("location", { length: 200 }),
    completedWork: text("completed_work"),
    pendingWork: text("pending_work"),
    quantityValue: numeric("quantity_value", { precision: 14, scale: 2 }),
    quantityUnit: varchar("quantity_unit", { length: 40 }),
    remarks: text("remarks"),
    // submitted | approved
    status: varchar("status", { length: 20 }).notNull().default("submitted"),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id),
    approvedByUserId: uuid("approved_by_user_id").references(() => users.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    ...timestamps,
    ...softDelete,
  },
  (table) => [
    index("dpr_site_idx").on(table.siteId),
    index("dpr_date_idx").on(table.reportDate),
    index("dpr_status_idx").on(table.status),
    index("dpr_created_by_idx").on(table.createdByUserId),
  ],
);

export type Dpr = typeof dpr.$inferSelect;
export type NewDpr = typeof dpr.$inferInsert;
