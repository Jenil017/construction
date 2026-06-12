import { date, index, numeric, pgTable, uuid, varchar } from "drizzle-orm/pg-core";
import { primaryId, softDelete, timestamps } from "./_shared";
import { sites } from "./sites";
import { users } from "./users";
import { workers } from "./workers";

/**
 * A payment made to a worker against a month's net salary (see the Salary module's
 * per-worker monthly view). Net payable for a month is computed on the fly from
 * attendance and advances; these rows record what has actually been paid out, so a
 * worker's balance for a month = netPayable − Σ payments. `periodMonth` is the
 * "YYYY-MM" the payment is applied to. Site-scoped, soft-deleted.
 */
export const salaryPayments = pgTable(
  "salary_payments",
  {
    ...primaryId,
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    workerId: uuid("worker_id")
      .notNull()
      .references(() => workers.id, { onDelete: "cascade" }),
    // The month this payment settles, "YYYY-MM".
    periodMonth: varchar("period_month", { length: 7 }).notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    paidDate: date("paid_date").notNull(),
    paymentMode: varchar("payment_mode", { length: 40 }),
    note: varchar("note", { length: 200 }),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id),
    ...timestamps,
    ...softDelete,
  },
  (table) => [
    index("salary_payments_site_idx").on(table.siteId),
    index("salary_payments_worker_idx").on(table.workerId),
    index("salary_payments_period_idx").on(table.siteId, table.periodMonth),
  ],
);

export type SalaryPayment = typeof salaryPayments.$inferSelect;
export type NewSalaryPayment = typeof salaryPayments.$inferInsert;
