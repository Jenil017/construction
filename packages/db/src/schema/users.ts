import { boolean, index, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { primaryId, softDelete, timestamps } from "./_shared";

/**
 * A user is a global principal — email is globally unique so login needs only
 * email+password. `passwordHash` is a PBKDF2 string from @construction-erp/shared.
 * Users are created by an owner (no public signup). A user gains access to data
 * by being a member of one or more sites (see `site_members`); `isOwner` is the
 * global capability flag that lets a user create new sites and manage them.
 *
 * `isPlatformAdmin` is a separate, higher tier: the operator of the deployment
 * (us), not a customer. It grants no implicit access to any tenant's data — it
 * only gates platform operations (provisioning/suspending owner accounts). Set
 * it by hand in the DB; nothing in the API can grant it.
 */
export const users = pgTable(
  "users",
  {
    ...primaryId,
    email: varchar("email", { length: 255 }).notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    name: text("name").notNull(),
    phone: varchar("phone", { length: 20 }),
    // active | disabled
    status: varchar("status", { length: 20 }).notNull().default("active"),
    // Global capability: may create + manage sites (the "owner" account).
    isOwner: boolean("is_owner").notNull().default(false),
    // Platform operator (us), not a customer. Grants no tenant data access.
    isPlatformAdmin: boolean("is_platform_admin").notNull().default(false),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    ...timestamps,
    ...softDelete,
  },
  (table) => [
    index("users_status_idx").on(table.status),
    index("users_is_owner_idx").on(table.isOwner),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
