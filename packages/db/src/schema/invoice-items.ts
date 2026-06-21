import { index, integer, numeric, pgTable, uuid, varchar } from "drizzle-orm/pg-core";
import { primaryId, timestamps } from "./_shared";
import { invoices } from "./invoices";
import { materials } from "./materials";
import { sites } from "./sites";

/**
 * One line on an invoice (see the Invoices module). `materialId` is optional — a
 * line can reference an inventory material (for HSN/description prefill) or be a
 * free-text goods/service line (e.g. a works-contract item). `taxableValue` =
 * quantity·rate − discountAmount. For a `tax` invoice the GST is split into
 * `cgstAmount`/`sgstAmount` (intra-state) or `igstAmount` (inter-state) at
 * `gstRate`%; for a `bill` invoice `gstRate` and all tax columns are 0. `lineTotal`
 * = taxableValue + taxAmount. There is no soft delete — items are owned by the
 * invoice and replaced/removed with it (cascade).
 */
export const invoiceItems = pgTable(
  "invoice_items",
  {
    ...primaryId,
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    materialId: uuid("material_id").references(() => materials.id),
    description: varchar("description", { length: 200 }).notNull(),
    hsnCode: varchar("hsn_code", { length: 10 }),
    quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull(),
    unit: varchar("unit", { length: 40 }),
    rate: numeric("rate", { precision: 14, scale: 2 }).notNull(),
    discountAmount: numeric("discount_amount", { precision: 14, scale: 2 }).notNull().default("0"),
    taxableValue: numeric("taxable_value", { precision: 14, scale: 2 }).notNull(),
    gstRate: numeric("gst_rate", { precision: 5, scale: 2 }).notNull().default("0"),
    cgstAmount: numeric("cgst_amount", { precision: 14, scale: 2 }).notNull().default("0"),
    sgstAmount: numeric("sgst_amount", { precision: 14, scale: 2 }).notNull().default("0"),
    igstAmount: numeric("igst_amount", { precision: 14, scale: 2 }).notNull().default("0"),
    taxAmount: numeric("tax_amount", { precision: 14, scale: 2 }).notNull().default("0"),
    lineTotal: numeric("line_total", { precision: 14, scale: 2 }).notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (table) => [
    index("invoice_items_invoice_idx").on(table.invoiceId),
    index("invoice_items_site_idx").on(table.siteId),
    index("invoice_items_material_idx").on(table.materialId),
  ],
);

export type InvoiceItem = typeof invoiceItems.$inferSelect;
export type NewInvoiceItem = typeof invoiceItems.$inferInsert;
