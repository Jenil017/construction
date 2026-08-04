import {
  dateSchema,
  moneySchema,
  optionalPaymentModeSchema,
  paginationQuerySchema,
  quantitySchema,
  searchSchema,
} from "@construction-erp/shared";
import { z } from "@hono/zod-openapi";
import {
  nullableGstin,
  nullableHsn,
  nullablePhone,
  nullableStateCode,
  nullableText,
  requiredText,
} from "../../common/validation";

export const INVOICE_TYPES = ["tax", "bill"] as const;
export const INVOICE_STATUSES = ["issued", "cancelled"] as const;
export const INVOICE_PAYMENT_STATUSES = ["unpaid", "partial", "paid"] as const;
export const SUPPLY_TYPES = ["intra", "inter"] as const;

const personSchema = z.object({ id: z.string().uuid(), name: z.string() });

export const invoiceIdParamSchema = z.object({
  id: z
    .string()
    .uuid()
    .openapi({ param: { name: "id", in: "path" } }),
});

// ─── Output ─────────────────────────────────────────────────────────────────────
export const invoiceItemSchema = z
  .object({
    id: z.string().uuid(),
    materialId: z.string().uuid().nullable(),
    description: z.string(),
    hsnCode: z.string().nullable(),
    quantity: z.number(),
    unit: z.string().nullable(),
    rate: z.number(),
    discountAmount: z.number(),
    taxableValue: z.number(),
    gstRate: z.number(),
    cgstAmount: z.number(),
    sgstAmount: z.number(),
    igstAmount: z.number(),
    taxAmount: z.number(),
    lineTotal: z.number(),
  })
  .openapi("InvoiceItem");

export const invoiceSchema = z
  .object({
    id: z.string().uuid(),
    siteId: z.string().uuid(),
    invoiceType: z.enum(INVOICE_TYPES),
    invoiceNumber: z.string(),
    financialYear: z.string(),
    invoiceDate: z.string(),
    dueDate: z.string().nullable(),
    supplyType: z.enum(SUPPLY_TYPES),
    placeOfSupply: z.string().nullable(),
    reverseCharge: z.boolean(),
    sellerName: z.string(),
    sellerGstin: z.string().nullable(),
    sellerAddress: z.string().nullable(),
    sellerState: z.string().nullable(),
    sellerStateCode: z.string().nullable(),
    buyerName: z.string(),
    buyerGstin: z.string().nullable(),
    buyerAddress: z.string().nullable(),
    buyerState: z.string().nullable(),
    buyerStateCode: z.string().nullable(),
    buyerContact: z.string().nullable(),
    subTotal: z.number(),
    discountTotal: z.number(),
    cgstTotal: z.number(),
    sgstTotal: z.number(),
    igstTotal: z.number(),
    taxTotal: z.number(),
    roundOff: z.number(),
    grandTotal: z.number(),
    amountInWords: z.string().nullable(),
    paymentStatus: z.enum(INVOICE_PAYMENT_STATUSES),
    amountReceived: z.number(),
    paymentMode: z.string().nullable(),
    notes: z.string().nullable(),
    status: z.enum(INVOICE_STATUSES),
    createdBy: personSchema.nullable(),
    createdAt: z.string(),
    items: z.array(invoiceItemSchema),
  })
  .openapi("Invoice");

// ─── Input ──────────────────────────────────────────────────────────────────────
export const invoiceItemInputSchema = z
  .object({
    materialId: z.string().uuid().nullable().optional(),
    description: requiredText(200, "Describe the item."),
    hsnCode: nullableHsn,
    quantity: quantitySchema(),
    unit: nullableText(40),
    rate: moneySchema(),
    discountAmount: moneySchema().optional(),
    // Combined GST rate %, e.g. 18. Ignored (forced to 0) for `bill` invoices.
    gstRate: z.number().min(0).max(50).optional(),
  })
  // A discount larger than the line was previously clamped to 0 silently, so the
  // printed invoice showed a discount that had never been applied. Reject it.
  .refine((line) => (line.discountAmount ?? 0) <= line.quantity * line.rate, {
    message: "The discount cannot be more than the line value.",
    path: ["discountAmount"],
  });

const invoiceBaseFields = {
  invoiceDate: dateSchema.optional(),
  dueDate: z
    .union([z.literal(""), z.null(), dateSchema])
    .transform((v) => (v === "" || v === undefined ? null : v))
    .nullable()
    .optional(),
  reverseCharge: z.boolean().optional(),
  placeOfSupply: nullableText(120),
  // Seller overrides — default from the site when omitted.
  sellerName: nullableText(200),
  sellerGstin: nullableGstin,
  sellerAddress: nullableText(2000),
  sellerState: nullableText(120),
  sellerStateCode: nullableStateCode,
  // Buyer.
  buyerName: requiredText(200, "Enter the buyer's name."),
  buyerGstin: nullableGstin,
  buyerAddress: nullableText(2000),
  buyerState: nullableText(120),
  buyerStateCode: nullableStateCode,
  buyerContact: nullablePhone,
  notes: nullableText(2000),
  amountReceived: moneySchema().optional(),
  paymentMode: optionalPaymentModeSchema.nullable(),
  // Capped: an unbounded array lets one request carry 100k line items.
  items: z
    .array(invoiceItemInputSchema)
    .min(1, "Add at least one line item.")
    .max(200, "An invoice can have at most 200 line items."),
};

/**
 * Cross-field rules that need the whole body. Applied to create and update alike.
 *  - A due date before the invoice date is a data-entry slip, not a valid term.
 *  - `amountReceived` above the invoice value would mark it "paid" and corrupt
 *    the receivables ledger (the same guard purchases has always had).
 */
function checkDueDate(
  body: { invoiceDate?: string; dueDate?: string | null },
  ctx: z.RefinementCtx,
): void {
  if (body.invoiceDate && body.dueDate && body.dueDate < body.invoiceDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "The due date cannot be before the invoice date.",
      path: ["dueDate"],
    });
  }
}

export const createInvoiceBodySchema = z
  .object({
    invoiceType: z.enum(INVOICE_TYPES),
    ...invoiceBaseFields,
  })
  .superRefine(checkDueDate)
  .openapi("CreateInvoiceRequest");

/** Update replaces the header details and the full set of line items. */
export const updateInvoiceBodySchema = z
  .object(invoiceBaseFields)
  .superRefine(checkDueDate)
  .openapi("UpdateInvoiceRequest");

export const listInvoicesQuerySchema = paginationQuerySchema
  .extend({
    search: searchSchema.openapi({ description: "Match invoice number or buyer name." }),
    invoiceType: z.enum(INVOICE_TYPES).optional(),
    status: z.enum(INVOICE_STATUSES).optional(),
    paymentStatus: z.enum(INVOICE_PAYMENT_STATUSES).optional(),
    dateFrom: dateSchema.optional(),
    dateTo: dateSchema.optional(),
  })
  .refine((q) => !q.dateFrom || !q.dateTo || q.dateFrom <= q.dateTo, {
    message: "The start date must be before the end date.",
    path: ["dateTo"],
  });

export const cancelInvoiceBodySchema = z
  .object({ status: z.literal("cancelled") })
  .openapi("CancelInvoiceRequest");

export const recordInvoicePaymentBodySchema = z
  .object({
    // The cap against `grandTotal` lives in the handler — the ceiling is a
    // property of the invoice being paid, which the schema cannot see.
    amountReceived: moneySchema(),
    paymentMode: optionalPaymentModeSchema.nullable(),
  })
  .openapi("RecordInvoicePaymentRequest");

export const deleteInvoiceResultSchema = z
  .object({ id: z.string().uuid(), deleted: z.boolean() })
  .openapi("DeleteInvoiceResult");
