import { date, index, numeric, pgTable, uuid, varchar } from "drizzle-orm/pg-core";
import { primaryId, softDelete, timestamps } from "./_shared";
import { sites } from "./sites";
import { users } from "./users";
import { workers } from "./workers";

/**
 * An advance paid to a worker against future wages (see docs/prd.md "Advances").
 * Site-scoped. Advances are deducted from net pay at salary generation: a run
 * settles every unsettled advance dated on/before its period end, stamping
 * `settledInRunId` so the same advance is never deducted twice. Deleting a run
 * clears that stamp, returning its advances to the unsettled pool for the next run.
 * (`settledInRunId` is an intentionally soft reference — no FK — to avoid a cyclic
 * dependency with `salary_runs`; integrity is maintained by the salary service.)
 */
export const workerAdvances = pgTable(
  "worker_advances",
  {
    ...primaryId,
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    workerId: uuid("worker_id")
      .notNull()
      .references(() => workers.id, { onDelete: "cascade" }),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    advanceDate: date("advance_date").notNull(),
    note: varchar("note", { length: 200 }),
    settledInRunId: uuid("settled_in_run_id"),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id),
    ...timestamps,
    ...softDelete,
  },
  (table) => [
    index("worker_advances_site_idx").on(table.siteId),
    index("worker_advances_worker_idx").on(table.workerId),
    index("worker_advances_date_idx").on(table.advanceDate),
    index("worker_advances_run_idx").on(table.settledInRunId),
  ],
);

export type WorkerAdvance = typeof workerAdvances.$inferSelect;
export type NewWorkerAdvance = typeof workerAdvances.$inferInsert;
