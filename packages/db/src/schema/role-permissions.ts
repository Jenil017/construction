import { index, pgTable, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { primaryId, timestamps } from "./_shared";
import { roles } from "./roles";

/**
 * One row per granted { module, action, scope } on a role. The valid set is
 * enumerable from RBAC_MODULES/RBAC_ACTIONS/RBAC_SCOPES in @construction-erp/shared,
 * so there is no separate permissions master table. Unique per (role, module, action).
 */
export const rolePermissions = pgTable(
  "role_permissions",
  {
    ...primaryId,
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    module: varchar("module", { length: 40 }).notNull(),
    action: varchar("action", { length: 20 }).notNull(),
    scope: varchar("scope", { length: 20 }).notNull(),
    ...timestamps,
  },
  (table) => [
    index("role_permissions_role_idx").on(table.roleId),
    uniqueIndex("role_permissions_unique_idx").on(table.roleId, table.module, table.action),
  ],
);

export type RolePermission = typeof rolePermissions.$inferSelect;
export type NewRolePermission = typeof rolePermissions.$inferInsert;
