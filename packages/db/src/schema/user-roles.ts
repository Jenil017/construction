import { index, pgTable, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { primaryId, timestamps } from "./_shared";
import { companies } from "./companies";
import { roles } from "./roles";
import { users } from "./users";

/**
 * Many-to-many assignment of roles to users (a user may hold several roles).
 * `companyId` is denormalized for fast tenant-scoped queries. Unique per (user, role).
 */
export const userRoles = pgTable(
  "user_roles",
  {
    ...primaryId,
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    ...timestamps,
  },
  (table) => [
    index("user_roles_user_idx").on(table.userId),
    index("user_roles_role_idx").on(table.roleId),
    uniqueIndex("user_roles_unique_idx").on(table.userId, table.roleId),
  ],
);

export type UserRole = typeof userRoles.$inferSelect;
export type NewUserRole = typeof userRoles.$inferInsert;
