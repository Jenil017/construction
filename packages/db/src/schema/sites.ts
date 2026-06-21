import { index, pgTable, text, uuid, varchar } from "drizzle-orm/pg-core";
import { primaryId, softDelete, timestamps } from "./_shared";
import { users } from "./users";

/**
 * A site is the top-level tenant boundary. Every business record (users/members,
 * DPR, attendance, inventory, expenses, purchases, salary, reports) attaches to a
 * site, and every query must filter by `siteId`. The `ownerUserId` is the user who
 * created the site; the owner has implicit full access to it (see common/rbac).
 * `code` is an optional human reference, globally unique when set.
 */
export const sites = pgTable(
  "sites",
  {
    ...primaryId,
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id),
    name: text("name").notNull(),
    code: varchar("code", { length: 40 }).unique(),
    address: text("address"),
    city: varchar("city", { length: 120 }),
    state: varchar("state", { length: 120 }),
    // Seller identity for invoicing (the site is the GST-registered business unit
    // that issues invoices). All optional — set on sites that bill with GST.
    // `gstin` is the 15-char GSTIN; `legalName` the registered business name
    // (falls back to `name`); `stateCode` the 2-digit GST state code (e.g. "24"
    // Gujarat), used to decide intra- vs inter-state tax on an invoice.
    gstin: varchar("gstin", { length: 15 }),
    legalName: text("legal_name"),
    stateCode: varchar("state_code", { length: 2 }),
    // active | inactive | completed
    status: varchar("status", { length: 20 }).notNull().default("active"),
    ...timestamps,
    ...softDelete,
  },
  (table) => [
    index("sites_owner_idx").on(table.ownerUserId),
    index("sites_status_idx").on(table.status),
  ],
);

export type Site = typeof sites.$inferSelect;
export type NewSite = typeof sites.$inferInsert;
