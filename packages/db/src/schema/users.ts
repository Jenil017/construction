import { index, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { primaryId, softDelete, timestamps } from "./_shared";
import { companies } from "./companies";

/**
 * A user belongs to exactly one company (tenant). Email is globally unique so
 * login needs only email+password. `passwordHash` is a PBKDF2 string from
 * @construction-erp/shared. Users are created by an admin (no public signup).
 */
export const users = pgTable(
  "users",
  {
    ...primaryId,
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    email: varchar("email", { length: 255 }).notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    name: text("name").notNull(),
    phone: varchar("phone", { length: 20 }),
    // active | disabled
    status: varchar("status", { length: 20 }).notNull().default("active"),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    ...timestamps,
    ...softDelete,
  },
  (table) => [
    index("users_company_idx").on(table.companyId),
    index("users_status_idx").on(table.status),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
