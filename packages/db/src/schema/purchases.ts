import { date, index, numeric, pgTable, text, uuid, varchar } from "drizzle-orm/pg-core";
import { primaryId, softDelete, timestamps } from "./_shared";
import { sites } from "./sites";
import { suppliers } from "./suppliers";
import { users } from "./users";

/**
 * A purchase from a supplier (see docs/prd.md "Purchases And Suppliers"). A single
 * entity covers the request → order → goods-received flow via `status`
 * (`draft` → `ordered` → `partially_received` → `received`, or `cancelled`) instead
 * of separate PR/PO/GRN tables (MVP simplification). Line items live in
 * `purchase_items`; `total` is their denormalized sum. Receiving goods inwards the
 * material-linked lines into inventory in one transaction (the docs/architecter.md
 * "purchase receipt → stock update" critical op). `paymentStatus` tracks supplier
 * payment (`unpaid` → `partial` → `paid`). Soft-deleted.
 */
export const purchases = pgTable(
  "purchases",
  {
    ...primaryId,
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    supplierId: uuid("supplier_id").references(() => suppliers.id),
    sellerName: varchar("seller_name", { length: 160 }),
    poNumber: varchar("po_number", { length: 40 }),
    orderDate: date("order_date").notNull(),
    expectedDate: date("expected_date"),
    // draft | ordered | partially_received | received | cancelled
    status: varchar("status", { length: 20 }).notNull().default("draft"),
    notes: text("notes"),
    total: numeric("total", { precision: 14, scale: 2 }).notNull().default("0"),
    amountPaid: numeric("amount_paid", { precision: 14, scale: 2 }).notNull().default("0"),
    // unpaid | partial | paid
    paymentStatus: varchar("payment_status", { length: 12 }).notNull().default("unpaid"),
    paymentMode: varchar("payment_mode", { length: 40 }),
    taxAmount: numeric("tax_amount", { precision: 14, scale: 2 }).notNull().default("0"),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id),
    ...timestamps,
    ...softDelete,
  },
  (table) => [
    index("purchases_site_idx").on(table.siteId),
    index("purchases_site_status_idx").on(table.siteId, table.status),
    index("purchases_supplier_idx").on(table.supplierId),
    index("purchases_order_date_idx").on(table.orderDate),
  ],
);

export type Purchase = typeof purchases.$inferSelect;
export type NewPurchase = typeof purchases.$inferInsert;
