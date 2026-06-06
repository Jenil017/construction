import { index, pgTable, text, varchar } from "drizzle-orm/pg-core";
import { primaryId, softDelete, timestamps } from "./_shared";

/**
 * Company = tenant root. Every other business table carries `companyId` and
 * queries must always filter by it (see docs/architecter.md "Multi-Tenant Model").
 */
export const companies = pgTable(
  "companies",
  {
    ...primaryId,
    name: text("name").notNull(),
    slug: varchar("slug", { length: 80 }).notNull().unique(),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    ...timestamps,
    ...softDelete,
  },
  (table) => [index("companies_status_idx").on(table.status)],
);

export type Company = typeof companies.$inferSelect;
export type NewCompany = typeof companies.$inferInsert;
