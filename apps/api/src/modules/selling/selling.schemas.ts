import { paginationQuerySchema } from "@construction-erp/shared";
import { z } from "@hono/zod-openapi";

export const SALE_STATUSES = ["draft", "confirmed", "cancelled"] as const;
export const SALE_PAYMENT_STATUSES = ["unpaid", "partial", "paid"] as const;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const personSchema = z.object({ id: z.string().uuid(), name: z.string() });

export const saleIdParamSchema = z.object({
  id: z
    .string()
    .uuid()
    .openapi({ param: { name: "id", in: "path" } }),
});

export const saleSchema = z
  .object({
    id: z.string().uuid(),
    siteId: z.string().uuid(),
    saleDate: z.string(),
    // Snapshot of the material's name at sale time.
    itemDescription: z.string(),
    materialId: z.string().uuid(),
    quantity: z.number(),
    unit: z.string(),
    ratePerUnit: z.number(),
    totalAmount: z.number(),
    buyerName: z.string().nullable(),
    buyerContact: z.string().nullable(),
    paymentMode: z.string().nullable(),
    paymentStatus: z.enum(SALE_PAYMENT_STATUSES),
    amountReceived: z.number(),
    notes: z.string().nullable(),
    status: z.enum(SALE_STATUSES),
    createdBy: personSchema.nullable(),
    createdAt: z.string(),
  })
  .openapi("SiteSale");

/** A sellable inventory item — only materials with stock on hand are returned. */
export const availableMaterialSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    sku: z.string().nullable(),
    category: z.string().nullable(),
    unit: z.string(),
    currentStock: z.number(),
    unitCost: z.number().nullable(),
  })
  .openapi("AvailableMaterial");

export const listAvailableMaterialsQuerySchema = z.object({
  search: z
    .string()
    .optional()
    .openapi({ description: "Partial match on material name, SKU, or category." }),
});

export const listSalesQuerySchema = paginationQuerySchema.extend({
  search: z.string().optional().openapi({ description: "Match item name or buyer name." }),
  status: z.enum(SALE_STATUSES).optional(),
  paymentStatus: z.enum(SALE_PAYMENT_STATUSES).optional(),
  dateFrom: z.string().regex(DATE_RE).optional(),
  dateTo: z.string().regex(DATE_RE).optional(),
});

export const createSaleBodySchema = z
  .object({
    saleDate: z.string().regex(DATE_RE).optional(),
    // The inventory item being sold. Name + unit are snapshotted server-side.
    materialId: z.string().uuid(),
    quantity: z.number().positive(),
    ratePerUnit: z.number().nonnegative(),
    buyerName: z.string().max(160).nullable().optional(),
    buyerContact: z.string().max(60).nullable().optional(),
    paymentMode: z.string().max(40).nullable().optional(),
    amountReceived: z.number().nonnegative().optional(),
    notes: z.string().max(2000).nullable().optional(),
  })
  .openapi("CreateSaleRequest");

/**
 * The sold item and quantity are locked once a sale is created (they drive the
 * stock movement) — only these surrounding fields can be edited.
 */
export const updateSaleBodySchema = z
  .object({
    saleDate: z.string().regex(DATE_RE).optional(),
    ratePerUnit: z.number().nonnegative().optional(),
    buyerName: z.string().max(160).nullable().optional(),
    buyerContact: z.string().max(60).nullable().optional(),
    paymentMode: z.string().max(40).nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
  })
  .openapi("UpdateSaleRequest");

export const confirmSaleBodySchema = z
  .object({ status: z.enum(["confirmed", "cancelled"]) })
  .openapi("ConfirmSaleRequest");

export const recordPaymentBodySchema = z
  .object({
    amountReceived: z.number().nonnegative(),
    paymentMode: z.string().max(40).nullable().optional(),
  })
  .openapi("RecordSalePaymentRequest");

export const deleteSaleResultSchema = z
  .object({ id: z.string().uuid(), deleted: z.boolean() })
  .openapi("DeleteSaleResult");
