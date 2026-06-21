import {
  boolean,
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { primaryId, softDelete, timestamps } from "./_shared";
import { sites } from "./sites";
import { users } from "./users";

/**
 * A customer-facing bill/invoice (see the Invoices module). Two variants via
 * `invoiceType`:
 *   - `tax`  — a GST **tax invoice**: per-line taxable value + CGST/SGST (intra-state)
 *              or IGST (inter-state), driven by `supplyType` (seller state vs buyer
 *              state). Carries a tax breakup.
 *   - `bill` — a non-GST **bill of supply / cash memo**: line items + total, NO tax.
 *
 * Numbering is a per-site, per-type, per-financial-year series: `invoiceSeq` is the
 * gapless counter and `invoiceNumber` is its formatted form (e.g. `VESU/26-27/0042`).
 * Seller fields are snapshotted from the site at creation so an issued invoice stays
 * fixed even if the site is later edited. Line items live in `invoice_items`; the
 * money columns here are their denormalized totals. Invoices do NOT move inventory
 * (that's the Selling module) — they are billing documents. Payment is tracked via
 * `paymentStatus` + `amountReceived`. Workflow: `issued` → `cancelled`. Soft-deleted.
 */
export const invoices = pgTable(
  "invoices",
  {
    ...primaryId,
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    // tax | bill
    invoiceType: varchar("invoice_type", { length: 8 }).notNull(),
    invoiceNumber: varchar("invoice_number", { length: 32 }).notNull(),
    invoiceSeq: integer("invoice_seq").notNull(),
    // Indian financial year, e.g. "2026-27".
    financialYear: varchar("financial_year", { length: 9 }).notNull(),
    invoiceDate: date("invoice_date").notNull(),
    dueDate: date("due_date"),
    // intra | inter — drives CGST+SGST vs IGST.
    supplyType: varchar("supply_type", { length: 8 }).notNull().default("intra"),
    placeOfSupply: varchar("place_of_supply", { length: 120 }),
    reverseCharge: boolean("reverse_charge").notNull().default(false),
    // Seller snapshot (defaults from the site at creation; frozen on the issued invoice).
    sellerName: varchar("seller_name", { length: 200 }).notNull(),
    sellerGstin: varchar("seller_gstin", { length: 15 }),
    sellerAddress: text("seller_address"),
    sellerState: varchar("seller_state", { length: 120 }),
    sellerStateCode: varchar("seller_state_code", { length: 2 }),
    // Buyer (bill-to).
    buyerName: varchar("buyer_name", { length: 200 }).notNull(),
    buyerGstin: varchar("buyer_gstin", { length: 15 }),
    buyerAddress: text("buyer_address"),
    buyerState: varchar("buyer_state", { length: 120 }),
    buyerStateCode: varchar("buyer_state_code", { length: 2 }),
    buyerContact: varchar("buyer_contact", { length: 60 }),
    // Totals, denormalized from invoice_items.
    subTotal: numeric("sub_total", { precision: 14, scale: 2 }).notNull().default("0"),
    discountTotal: numeric("discount_total", { precision: 14, scale: 2 }).notNull().default("0"),
    cgstTotal: numeric("cgst_total", { precision: 14, scale: 2 }).notNull().default("0"),
    sgstTotal: numeric("sgst_total", { precision: 14, scale: 2 }).notNull().default("0"),
    igstTotal: numeric("igst_total", { precision: 14, scale: 2 }).notNull().default("0"),
    taxTotal: numeric("tax_total", { precision: 14, scale: 2 }).notNull().default("0"),
    roundOff: numeric("round_off", { precision: 8, scale: 2 }).notNull().default("0"),
    grandTotal: numeric("grand_total", { precision: 14, scale: 2 }).notNull().default("0"),
    amountInWords: text("amount_in_words"),
    // Payment.
    paymentStatus: varchar("payment_status", { length: 12 }).notNull().default("unpaid"),
    amountReceived: numeric("amount_received", { precision: 14, scale: 2 }).notNull().default("0"),
    paymentMode: varchar("payment_mode", { length: 40 }),
    notes: text("notes"),
    // issued | cancelled
    status: varchar("status", { length: 12 }).notNull().default("issued"),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id),
    ...timestamps,
    ...softDelete,
  },
  (table) => [
    index("invoices_site_idx").on(table.siteId),
    index("invoices_site_date_idx").on(table.siteId, table.invoiceDate),
    index("invoices_status_idx").on(table.status),
    index("invoices_payment_status_idx").on(table.paymentStatus),
    // One invoice number per site.
    uniqueIndex("invoices_number_unique").on(table.siteId, table.invoiceNumber),
    // Gapless per-site/type/FY series — spans cancelled + soft-deleted rows so a
    // sequence number is never reused.
    uniqueIndex("invoices_seq_unique").on(
      table.siteId,
      table.invoiceType,
      table.financialYear,
      table.invoiceSeq,
    ),
  ],
);

export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;
