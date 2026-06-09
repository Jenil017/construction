import { index, numeric, pgTable, text, uuid, varchar } from "drizzle-orm/pg-core";
import { primaryId, softDelete, timestamps } from "./_shared";
import { sites } from "./sites";

/**
 * A worker on a site (the worker master for Attendance & Salary — see docs/prd.md
 * "Attendance And Salary"). Site-scoped: every query filters by `siteId`.
 * `dailyWage` is the full-day rate (a half-day pays half, an absent day nothing);
 * `overtimeRate` is the per-hour overtime rate (null = overtime is unpaid). These
 * rates are snapshotted onto `salary_run_items` at salary generation, so changing a
 * worker's rate does not retroactively alter an already-generated run. Soft-deleted
 * (a removed worker is retired, not erased — past attendance/salary is retained).
 */
export const workers = pgTable(
  "workers",
  {
    ...primaryId,
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 160 }).notNull(),
    phone: varchar("phone", { length: 20 }),
    // Trade / designation, e.g. "Mason", "Helper", "Carpenter".
    trade: varchar("trade", { length: 80 }),
    dailyWage: numeric("daily_wage", { precision: 12, scale: 2 }).notNull().default("0"),
    overtimeRate: numeric("overtime_rate", { precision: 12, scale: 2 }),
    notes: text("notes"),
    ...timestamps,
    ...softDelete,
  },
  (table) => [
    index("workers_site_idx").on(table.siteId),
    index("workers_site_name_idx").on(table.siteId, table.name),
  ],
);

export type Worker = typeof workers.$inferSelect;
export type NewWorker = typeof workers.$inferInsert;
