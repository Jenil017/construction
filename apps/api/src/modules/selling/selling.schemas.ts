import { paginationQuerySchema } from "@construction-erp/shared";
import { z } from "@hono/zod-openapi";

export const SALE_STATUSES = ["draft", "confirmed", "cancelled"] as const;
export const SALE_PAYMENT_STATUSES = ["unpaid", "partial", "paid"] as const;
export const SALE_CATEGORIES = [
  "Scrap Metal",
  "Surplus Material",
  "Sand / Aggregate",
  "Timber / Wood",
  "Bricks / Blocks",
  "Cement Bags",
  "Equipment",
  "Debris",
  "Other",
] as const;

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
    itemDescription: z.string(),
    materialId: z.string().uuid().nullable(),
    category: z.string(),
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

export const listSalesQuerySchema = paginationQuerySchema.extend({
  search: z
    .string()
    .optional()
    .openapi({ description: "Match item description, buyer name, or category." }),
  category: z.string().optional(),
  status: z.enum(SALE_STATUSES).optional(),
  paymentStatus: z.enum(SALE_PAYMENT_STATUSES).optional(),
  dateFrom: z.string().regex(DATE_RE).optional(),
  dateTo: z.string().regex(DATE_RE).optional(),
});

const saleFields = {
  itemDescription: z.string().min(1).max(200),
  materialId: z.string().uuid().nullable().optional(),
  category: z.string().min(1).max(80),
  quantity: z.number().positive(),
  unit: z.string().min(1).max(40),
  ratePerUnit: z.number().nonnegative(),
  buyerName: z.string().max(160).nullable().optional(),
  buyerContact: z.string().max(60).nullable().optional(),
  paymentMode: z.string().max(40).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
};

export const createSaleBodySchema = z
  .object({
    saleDate: z.string().regex(DATE_RE).optional(),
    ...saleFields,
    status: z.enum(["draft", "confirmed"]).optional(),
  })
  .openapi("CreateSaleRequest");

export const updateSaleBodySchema = z
  .object({
    saleDate: z.string().regex(DATE_RE).optional(),
    itemDescription: z.string().min(1).max(200).optional(),
    materialId: z.string().uuid().nullable().optional(),
    category: z.string().min(1).max(80).optional(),
    quantity: z.number().positive().optional(),
    unit: z.string().min(1).max(40).optional(),
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
