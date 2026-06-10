import { date, index, numeric, pgTable, text, uuid, varchar } from "drizzle-orm/pg-core";
import { primaryId, softDelete, timestamps } from "./_shared";
import { materials } from "./materials";
import { sites } from "./sites";
import { users } from "./users";

/**
 * A sale of site material (surplus, scrap, waste, etc.) — see the Selling module.
 * Site-scoped. Workflow: `draft` → `confirmed` | `cancelled`. Payment tracked via
 * `paymentStatus` (`unpaid` → `partial` → `paid`) and `amountReceived`. Optional
 * link to an inventory material via `materialId`. Soft-deleted.
 */
export const siteSales = pgTable(
  "site_sales",
  {
    ...primaryId,
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    saleDate: date("sale_date").notNull(),
    itemDescription: varchar("item_description", { length: 200 }).notNull(),
    materialId: uuid("material_id").references(() => materials.id),
    category: varchar("category", { length: 80 }).notNull(),
    quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull(),
    unit: varchar("unit", { length: 40 }).notNull(),
    ratePerUnit: numeric("rate_per_unit", { precision: 14, scale: 2 }).notNull(),
    totalAmount: numeric("total_amount", { precision: 14, scale: 2 }).notNull(),
    buyerName: varchar("buyer_name", { length: 160 }),
    buyerContact: varchar("buyer_contact", { length: 60 }),
    paymentMode: varchar("payment_mode", { length: 40 }),
    // unpaid | partial | paid
    paymentStatus: varchar("payment_status", { length: 12 }).notNull().default("unpaid"),
    amountReceived: numeric("amount_received", { precision: 14, scale: 2 }).notNull().default("0"),
    notes: text("notes"),
    // draft | confirmed | cancelled
    status: varchar("status", { length: 12 }).notNull().default("draft"),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id),
    ...timestamps,
    ...softDelete,
  },
  (table) => [
    index("site_sales_site_idx").on(table.siteId),
    index("site_sales_site_date_idx").on(table.siteId, table.saleDate),
    index("site_sales_status_idx").on(table.status),
    index("site_sales_payment_status_idx").on(table.paymentStatus),
  ],
);

export type SiteSale = typeof siteSales.$inferSelect;
export type NewSiteSale = typeof siteSales.$inferInsert;
