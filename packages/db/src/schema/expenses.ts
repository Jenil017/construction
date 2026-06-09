import {
  boolean,
  date,
  index,
  numeric,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { primaryId, softDelete, timestamps } from "./_shared";
import { sites } from "./sites";
import { users } from "./users";

/**
 * A site expense (see docs/prd.md "Expenses"). Site-scoped. Workflow:
 * `pending` → `approved` | `rejected` (approval gated by `expenses:approve`, the
 * docs/architecter.md "expense approval → ledger" op — the audit trail is the
 * ledger for MVP). `isPettyCash` flags petty-cash spend. Receipt image uploads are
 * deferred (they reuse the DPR R2 presigned-URL flow once bucket CORS is set — see
 * docs/progress.md). Soft-deleted.
 */
export const expenses = pgTable(
  "expenses",
  {
    ...primaryId,
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    expenseDate: date("expense_date").notNull(),
    category: varchar("category", { length: 80 }).notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    description: varchar("description", { length: 300 }),
    paidTo: varchar("paid_to", { length: 160 }),
    paymentMode: varchar("payment_mode", { length: 40 }),
    isPettyCash: boolean("is_petty_cash").notNull().default(false),
    // pending | approved | rejected
    status: varchar("status", { length: 12 }).notNull().default("pending"),
    approvedByUserId: uuid("approved_by_user_id").references(() => users.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id),
    ...timestamps,
    ...softDelete,
  },
  (table) => [
    index("expenses_site_idx").on(table.siteId),
    index("expenses_site_date_idx").on(table.siteId, table.expenseDate),
    index("expenses_category_idx").on(table.category),
    index("expenses_status_idx").on(table.status),
  ],
);

export type Expense = typeof expenses.$inferSelect;
export type NewExpense = typeof expenses.$inferInsert;
