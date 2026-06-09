import { index, pgTable, text, uuid, varchar } from "drizzle-orm/pg-core";
import { primaryId, softDelete, timestamps } from "./_shared";
import { sites } from "./sites";

/**
 * A supplier / vendor for a site (see docs/prd.md "Purchases And Suppliers").
 * Site-scoped — every query filters by `siteId` (each site manages its own
 * supplier list, consistent with the site-as-tenant model). `gstin` is the
 * Indian GST number (free text; not validated server-side for MVP). Soft-deleted
 * so historical purchases keep a valid supplier reference.
 */
export const suppliers = pgTable(
  "suppliers",
  {
    ...primaryId,
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 160 }).notNull(),
    contactPerson: varchar("contact_person", { length: 120 }),
    phone: varchar("phone", { length: 20 }),
    email: varchar("email", { length: 160 }),
    gstin: varchar("gstin", { length: 20 }),
    address: text("address"),
    notes: text("notes"),
    ...timestamps,
    ...softDelete,
  },
  (table) => [
    index("suppliers_site_idx").on(table.siteId),
    index("suppliers_site_name_idx").on(table.siteId, table.name),
  ],
);

export type Supplier = typeof suppliers.$inferSelect;
export type NewSupplier = typeof suppliers.$inferInsert;
