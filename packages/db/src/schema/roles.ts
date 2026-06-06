import { boolean, index, pgTable, text, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { primaryId, softDelete, timestamps } from "./_shared";
import { companies } from "./companies";

/**
 * A role is a named bundle of permissions scoped to one company. Seeded system
 * roles (`isSystem`) cannot be deleted but their permissions can be edited.
 * Slug is unique per company.
 */
export const roles = pgTable(
  "roles",
  {
    ...primaryId,
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    name: text("name").notNull(),
    slug: varchar("slug", { length: 60 }).notNull(),
    description: text("description"),
    isSystem: boolean("is_system").notNull().default(false),
    ...timestamps,
    ...softDelete,
  },
  (table) => [
    index("roles_company_idx").on(table.companyId),
    uniqueIndex("roles_company_slug_idx").on(table.companyId, table.slug),
  ],
);

export type Role = typeof roles.$inferSelect;
export type NewRole = typeof roles.$inferInsert;
