import { index, pgEnum, pgTable, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { primaryId, timestamps } from "./_shared";
import { siteMembers } from "./site-members";

/** Per-module access level a member holds on a site: read-only or read+write. */
export const siteAccessLevelEnum = pgEnum("site_access_level", ["read", "read_write"]);

/**
 * One row per (member, module) granting an access level. `read` expands to the
 * `view` action; `read_write` expands to the full action set at load time
 * (see common/rbac + @construction-erp/shared ACTIONS_FOR_LEVEL). Storing a level
 * (not a row per action) keeps the model simple — two levels, mostly read by default.
 */
export const siteMemberPermissions = pgTable(
  "site_member_permissions",
  {
    ...primaryId,
    siteMemberId: uuid("site_member_id")
      .notNull()
      .references(() => siteMembers.id, { onDelete: "cascade" }),
    module: varchar("module", { length: 40 }).notNull(),
    accessLevel: siteAccessLevelEnum("access_level").notNull().default("read"),
    ...timestamps,
  },
  (table) => [
    index("site_member_permissions_member_idx").on(table.siteMemberId),
    uniqueIndex("site_member_permissions_unique_idx").on(table.siteMemberId, table.module),
  ],
);

export type SiteMemberPermission = typeof siteMemberPermissions.$inferSelect;
export type NewSiteMemberPermission = typeof siteMemberPermissions.$inferInsert;
