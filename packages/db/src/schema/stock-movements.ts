import { date, index, numeric, pgTable, text, uuid, varchar } from "drizzle-orm/pg-core";
import { primaryId, timestamps } from "./_shared";
import { materials } from "./materials";
import { sites } from "./sites";
import { users } from "./users";

/**
 * One entry in a site's stock ledger (see docs/prd.md "Inventory" + the
 * docs/architecter.md data-integrity rule: inventory inward/outward is a critical
 * multi-table op). Append-only / immutable — there is no soft delete and no edit;
 * corrections are made with a new `adjustment` movement. Every movement is applied
 * to `materials.currentStock` in the SAME transaction that inserts the row, and
 * `balanceAfter` snapshots the resulting stock so each row is self-describing.
 *
 * `quantity` is always the positive magnitude; the direction is implied by `type`:
 *   inward (+) · outward (−) · wastage (−) · adjustment (sets stock to a counted value).
 * Site-to-site transfers and idempotency keys are deferred (see docs/progress.md).
 */
export const stockMovements = pgTable(
  "stock_movements",
  {
    ...primaryId,
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    materialId: uuid("material_id")
      .notNull()
      .references(() => materials.id, { onDelete: "cascade" }),
    // inward | outward | wastage | adjustment
    type: varchar("type", { length: 20 }).notNull(),
    quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull(),
    balanceAfter: numeric("balance_after", { precision: 14, scale: 3 }).notNull(),
    unitCost: numeric("unit_cost", { precision: 14, scale: 2 }),
    reference: varchar("reference", { length: 160 }),
    note: text("note"),
    movementDate: date("movement_date").notNull(),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id),
    ...timestamps,
  },
  (table) => [
    index("stock_movements_site_idx").on(table.siteId),
    index("stock_movements_material_idx").on(table.materialId),
    index("stock_movements_type_idx").on(table.type),
    index("stock_movements_date_idx").on(table.movementDate),
  ],
);

export type StockMovement = typeof stockMovements.$inferSelect;
export type NewStockMovement = typeof stockMovements.$inferInsert;
