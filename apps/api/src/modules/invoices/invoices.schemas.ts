import { paginationQuerySchema } from "@construction-erp/shared";
import { z } from "@hono/zod-openapi";

export const INVOICE_TYPES = ["tax", "bill"] as const;
export const INVOICE_STATUSES = ["issued", "cancelled"] as const;
export const INVOICE_PAYMENT_STATUSES = ["unpaid", "partial", "paid"] as const;
export const SUPPLY_TYPES = ["intra", "inter"] as const;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
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
const gstinSchema = z
  .string()
  .trim()
  .regex(/^[0-9A-Z]{15}$/, "GSTIN must be 15 characters (letters/digits).")
  .nullable()
  .optional();

const stateCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{2}$/, "State code must be 2 digits.")
  .nullable()
  .optional();

export const invoiceItemInputSchema = z.object({
  materialId: z.string().uuid().nullable().optional(),
  description: z.string().trim().min(1).max(200),
  hsnCode: z.string().trim().max(10).nullable().optional(),
  quantity: z.number().positive(),
  unit: z.string().trim().max(40).nullable().optional(),
  rate: z.number().nonnegative(),
  discountAmount: z.number().nonnegative().optional(),
  // Combined GST rate %, e.g. 18. Ignored (forced to 0) for `bill` invoices.
  gstRate: z.number().min(0).max(50).optional(),
});

const invoiceBaseFields = {
  invoiceDate: z.string().regex(DATE_RE).optional(),
  dueDate: z.string().regex(DATE_RE).nullable().optional(),
  reverseCharge: z.boolean().optional(),
  placeOfSupply: z.string().trim().max(120).nullable().optional(),
  // Seller overrides — default from the site when omitted.
  sellerName: z.string().trim().max(200).nullable().optional(),
  sellerGstin: gstinSchema,
  sellerAddress: z.string().trim().max(2000).nullable().optional(),
  sellerState: z.string().trim().max(120).nullable().optional(),
  sellerStateCode: stateCodeSchema,
  // Buyer.
  buyerName: z.string().trim().min(1).max(200),
  buyerGstin: gstinSchema,
  buyerAddress: z.string().trim().max(2000).nullable().optional(),
  buyerState: z.string().trim().max(120).nullable().optional(),
  buyerStateCode: stateCodeSchema,
  buyerContact: z.string().trim().max(60).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  amountReceived: z.number().nonnegative().optional(),
  paymentMode: z.string().trim().max(40).nullable().optional(),
  items: z.array(invoiceItemInputSchema).min(1, "Add at least one line item."),
};

export const createInvoiceBodySchema = z
  .object({
    invoiceType: z.enum(INVOICE_TYPES),
    ...invoiceBaseFields,
  })
  .openapi("CreateInvoiceRequest");

/** Update replaces the header details and the full set of line items. */
export const updateInvoiceBodySchema = z.object(invoiceBaseFields).openapi("UpdateInvoiceRequest");

export const listInvoicesQuerySchema = paginationQuerySchema.extend({
  search: z.string().optional().openapi({ description: "Match invoice number or buyer name." }),
  invoiceType: z.enum(INVOICE_TYPES).optional(),
  status: z.enum(INVOICE_STATUSES).optional(),
  paymentStatus: z.enum(INVOICE_PAYMENT_STATUSES).optional(),
  dateFrom: z.string().regex(DATE_RE).optional(),
  dateTo: z.string().regex(DATE_RE).optional(),
});

export const cancelInvoiceBodySchema = z
  .object({ status: z.literal("cancelled") })
  .openapi("CancelInvoiceRequest");

export const recordInvoicePaymentBodySchema = z
  .object({
    amountReceived: z.number().nonnegative(),
    paymentMode: z.string().trim().max(40).nullable().optional(),
  })
  .openapi("RecordInvoicePaymentRequest");

export const deleteInvoiceResultSchema = z
  .object({ id: z.string().uuid(), deleted: z.boolean() })
  .openapi("DeleteInvoiceResult");
