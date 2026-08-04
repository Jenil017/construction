import {
  dateSchema,
  moneySchema,
  optionalPaymentModeSchema,
  paginationQuerySchema,
  pastOrTodaySchema,
  quantitySchema,
  searchSchema,
} from "@construction-erp/shared";
import { z } from "@hono/zod-openapi";
import { nullablePhone, nullableText } from "../../common/validation";

export const SALE_STATUSES = ["draft", "confirmed", "cancelled"] as const;
export const SALE_PAYMENT_STATUSES = ["unpaid", "partial", "paid"] as const;

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
  search: searchSchema.openapi({
    description: "Partial match on material name, SKU, or category.",
  }),
});

export const listSalesQuerySchema = paginationQuerySchema
  .extend({
    search: searchSchema.openapi({ description: "Match item name or buyer name." }),
    status: z.enum(SALE_STATUSES).optional(),
    paymentStatus: z.enum(SALE_PAYMENT_STATUSES).optional(),
    dateFrom: dateSchema.optional(),
    dateTo: dateSchema.optional(),
  })
  .refine((q) => !q.dateFrom || !q.dateTo || q.dateFrom <= q.dateTo, {
    message: "The start date must be before the end date.",
    path: ["dateTo"],
  });

export const createSaleBodySchema = z
  .object({
    saleDate: pastOrTodaySchema.optional(),
    // The inventory item being sold. Name + unit are snapshotted server-side.
    materialId: z.string().uuid(),
    quantity: quantitySchema(),
    ratePerUnit: moneySchema(),
    buyerName: nullableText(160),
    buyerContact: nullablePhone,
    paymentMode: optionalPaymentModeSchema.nullable(),
    amountReceived: moneySchema().optional(),
    notes: nullableText(2000),
  })
  .openapi("CreateSaleRequest");

/**
 * The sold item and quantity are locked once a sale is created (they drive the
 * stock movement) — only these surrounding fields can be edited.
 */
export const updateSaleBodySchema = z
  .object({
    saleDate: pastOrTodaySchema.optional(),
    ratePerUnit: moneySchema().optional(),
    buyerName: nullableText(160),
    buyerContact: nullablePhone,
    paymentMode: optionalPaymentModeSchema.nullable(),
    notes: nullableText(2000),
  })
  .openapi("UpdateSaleRequest");

export const confirmSaleBodySchema = z
  .object({ status: z.enum(["confirmed", "cancelled"]) })
  .openapi("ConfirmSaleRequest");

export const recordPaymentBodySchema = z
  .object({
    amountReceived: moneySchema(),
    paymentMode: optionalPaymentModeSchema.nullable(),
  })
  .openapi("RecordSalePaymentRequest");

export const deleteSaleResultSchema = z
  .object({ id: z.string().uuid(), deleted: z.boolean() })
  .openapi("DeleteSaleResult");
