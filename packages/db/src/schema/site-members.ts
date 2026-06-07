import { index, pgTable, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { primaryId, timestamps } from "./_shared";
import { sites } from "./sites";
import { users } from "./users";

/**
 * Membership of a user on a site. This is the unit that grants a non-owner user
 * access to a site's data. Per-module access levels live in `site_member_permissions`.
 * (The site owner has implicit access and has no row here.) Unique per (site, user).
 */
export const siteMembers = pgTable(
  "site_members",
  {
    ...primaryId,
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (table) => [
    index("site_members_site_idx").on(table.siteId),
    index("site_members_user_idx").on(table.userId),
    uniqueIndex("site_members_unique_idx").on(table.siteId, table.userId),
  ],
);

export type SiteMember = typeof siteMembers.$inferSelect;
export type NewSiteMember = typeof siteMembers.$inferInsert;
