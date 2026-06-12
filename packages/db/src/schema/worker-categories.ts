import { sql } from "drizzle-orm";
import { index, pgTable, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { primaryId, softDelete, timestamps } from "./_shared";
import { sites } from "./sites";

/**
 * A worker category / trade for a site (Mason, Carpenter, Helper, …) — the
 * predefined options behind the worker form's category dropdown. Site-scoped;
 * the name is unique per site among non-deleted rows. New categories can be added
 * on the fly from the worker form (they persist here). Soft-deleted.
 */
export const workerCategories = pgTable(
  "worker_categories",
  {
    ...primaryId,
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 80 }).notNull(),
    ...timestamps,
    ...softDelete,
  },
  (table) => [
    index("worker_categories_site_idx").on(table.siteId),
    uniqueIndex("worker_categories_site_name_uniq")
      .on(table.siteId, table.name)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

export type WorkerCategory = typeof workerCategories.$inferSelect;
export type NewWorkerCategory = typeof workerCategories.$inferInsert;
