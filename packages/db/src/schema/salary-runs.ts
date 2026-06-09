import { sql } from "drizzle-orm";
import { date, index, integer, numeric, pgTable, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { primaryId, softDelete, timestamps } from "./_shared";
import { sites } from "./sites";
import { users } from "./users";

/**
 * A payroll run: salary computed for every worker over one period from APPROVED
 * attendance (see docs/prd.md "Salary calculation"). Site-scoped. Generation is one
 * transaction (insert run + per-worker `salary_run_items` + settle advances + audit).
 * At most one live run per (site, period) — the partial unique index is the
 * idempotency guard (a second generate for the same period returns CONFLICT). The
 * stored totals are denormalized sums of the items, for list/report display.
 * Soft-deletable so a run can be discarded and regenerated after attendance changes.
 */
export const salaryRuns = pgTable(
  "salary_runs",
  {
    ...primaryId,
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    totalWorkers: integer("total_workers").notNull().default(0),
    totalGross: numeric("total_gross", { precision: 14, scale: 2 }).notNull().default("0"),
    totalAdvances: numeric("total_advances", { precision: 14, scale: 2 }).notNull().default("0"),
    totalNet: numeric("total_net", { precision: 14, scale: 2 }).notNull().default("0"),
    generatedByUserId: uuid("generated_by_user_id")
      .notNull()
      .references(() => users.id),
    ...timestamps,
    ...softDelete,
  },
  (table) => [
    index("salary_runs_site_idx").on(table.siteId),
    uniqueIndex("salary_runs_site_period_uniq")
      .on(table.siteId, table.periodStart, table.periodEnd)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

export type SalaryRun = typeof salaryRuns.$inferSelect;
export type NewSalaryRun = typeof salaryRuns.$inferInsert;
