import { index, integer, numeric, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { primaryId, timestamps } from "./_shared";
import { salaryRuns } from "./salary-runs";
import { sites } from "./sites";
import { workers } from "./workers";

/**
 * One worker's payslip within a salary run (see docs/prd.md "Salary calculation" +
 * "Payment status"). Wage rates and the worker's name are SNAPSHOTTED here at
 * generation, so the payslip is immutable history even if the worker master later
 * changes. `payableDays` = presentDays + 0.5·halfDays; `gross` = payableDays·dailyWage
 * + overtimeHours·overtimeRate; `netPayable` = gross − advanceDeducted. There is no
 * soft delete — items are owned by the run and removed with it (cascade).
 */
export const salaryRunItems = pgTable(
  "salary_run_items",
  {
    ...primaryId,
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    runId: uuid("run_id")
      .notNull()
      .references(() => salaryRuns.id, { onDelete: "cascade" }),
    workerId: uuid("worker_id")
      .notNull()
      .references(() => workers.id, { onDelete: "cascade" }),
    workerName: varchar("worker_name", { length: 160 }).notNull(),
    presentDays: integer("present_days").notNull().default(0),
    halfDays: integer("half_days").notNull().default(0),
    payableDays: numeric("payable_days", { precision: 6, scale: 2 }).notNull().default("0"),
    overtimeHours: numeric("overtime_hours", { precision: 7, scale: 2 }).notNull().default("0"),
    dailyWage: numeric("daily_wage", { precision: 12, scale: 2 }).notNull(),
    overtimeRate: numeric("overtime_rate", { precision: 12, scale: 2 }),
    gross: numeric("gross", { precision: 14, scale: 2 }).notNull(),
    advanceDeducted: numeric("advance_deducted", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    netPayable: numeric("net_payable", { precision: 14, scale: 2 }).notNull(),
    amountPaid: numeric("amount_paid", { precision: 14, scale: 2 }).notNull().default("0"),
    // unpaid | partial | paid
    paymentStatus: varchar("payment_status", { length: 12 }).notNull().default("unpaid"),
    paymentMode: varchar("payment_mode", { length: 40 }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("salary_run_items_run_idx").on(table.runId),
    index("salary_run_items_site_idx").on(table.siteId),
    index("salary_run_items_worker_idx").on(table.workerId),
  ],
);

export type SalaryRunItem = typeof salaryRunItems.$inferSelect;
export type NewSalaryRunItem = typeof salaryRunItems.$inferInsert;
