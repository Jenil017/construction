import { sql } from "drizzle-orm";
import { index, numeric, pgTable, text, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { primaryId, softDelete, timestamps } from "./_shared";
import { sites } from "./sites";

/**
 * A material in a site's inventory master (see docs/prd.md "Inventory").
 * Site-scoped — every query filters by `siteId`. `currentStock` is a denormalized
 * cached balance that is ONLY ever changed inside a stock-movement transaction
 * (see `stock_movements` + the inventory module); it must never be edited directly
 * via the master update endpoint. `reorderLevel` drives low-stock alerts (null =
 * no alert). `supplierRef` is free text for now — a supplier FK lands in Phase 7.
 */
export const materials = pgTable(
  "materials",
  {
    ...primaryId,
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 160 }).notNull(),
    // Optional human code; unique per site among non-deleted rows (partial index below).
    sku: varchar("sku", { length: 60 }),
    category: varchar("category", { length: 80 }),
    unit: varchar("unit", { length: 40 }).notNull(),
    currentStock: numeric("current_stock", { precision: 14, scale: 3 }).notNull().default("0"),
    reorderLevel: numeric("reorder_level", { precision: 14, scale: 3 }),
    unitCost: numeric("unit_cost", { precision: 14, scale: 2 }),
    supplierRef: varchar("supplier_ref", { length: 160 }),
    notes: text("notes"),
    ...timestamps,
    ...softDelete,
  },
  (table) => [
    index("materials_site_idx").on(table.siteId),
    index("materials_site_name_idx").on(table.siteId, table.name),
    index("materials_category_idx").on(table.category),
    // A SKU is unique within a site, ignoring blank/deleted rows.
    uniqueIndex("materials_site_sku_uniq")
      .on(table.siteId, table.sku)
      .where(sql`${table.sku} IS NOT NULL AND ${table.deletedAt} IS NULL`),
  ],
);

export type Material = typeof materials.$inferSelect;
export type NewMaterial = typeof materials.$inferInsert;
