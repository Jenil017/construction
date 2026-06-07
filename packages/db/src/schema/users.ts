import { boolean, index, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { primaryId, softDelete, timestamps } from "./_shared";

/**
 * A user is a global principal — email is globally unique so login needs only
 * email+password. `passwordHash` is a PBKDF2 string from @construction-erp/shared.
 * Users are created by an owner (no public signup). A user gains access to data
 * by being a member of one or more sites (see `site_members`); `isOwner` is the
 * global capability flag that lets a user create new sites and manage them.
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
