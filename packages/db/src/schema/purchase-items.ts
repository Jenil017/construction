import { index, numeric, pgTable, uuid, varchar } from "drizzle-orm/pg-core";
import { primaryId, timestamps } from "./_shared";
import { materials } from "./materials";
import { purchases } from "./purchases";
import { sites } from "./sites";

/**
 * One line on a purchase (see docs/prd.md "Purchases And Suppliers"). `materialId`
 * is optional — a line may be a stock material (so receiving inwards it into
 * inventory) or a free-text non-stock item/service. `amount` = quantity·rate
 * (denormalized). `receivedQty` accumulates across partial receipts; "pending
 * material" = quantity − receivedQty. There is no soft delete — items are owned by
 * the purchase and removed with it (cascade).
 */
export const purchaseItems = pgTable(
  "purchase_items",
  {
    ...primaryId,
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    purchaseId: uuid("purchase_id")
      .notNull()
      .references(() => purchases.id, { onDelete: "cascade" }),
    materialId: uuid("material_id").references(() => materials.id),
    description: varchar("description", { length: 200 }).notNull(),
    quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull(),
    unit: varchar("unit", { length: 40 }),
    rate: numeric("rate", { precision: 14, scale: 2 }).notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    receivedQty: numeric("received_qty", { precision: 14, scale: 3 }).notNull().default("0"),
    ...timestamps,
  },
  (table) => [
    index("purchase_items_purchase_idx").on(table.purchaseId),
    index("purchase_items_site_idx").on(table.siteId),
    index("purchase_items_material_idx").on(table.materialId),
  ],
);

export type PurchaseItem = typeof purchaseItems.$inferSelect;
export type NewPurchaseItem = typeof purchaseItems.$inferInsert;
