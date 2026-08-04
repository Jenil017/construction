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
import { nullableText, requiredText } from "../../common/validation";

export const PURCHASE_STATUSES = [
  "draft",
  "ordered",
  "partially_received",
  "received",
  "cancelled",
] as const;
export const PURCHASE_PAYMENT_STATUSES = ["unpaid", "partial", "paid"] as const;

const personSchema = z.object({ id: z.string().uuid(), name: z.string() });

export const purchaseIdParamSchema = z.object({
  id: z
    .string()
    .uuid()
    .openapi({ param: { name: "id", in: "path" } }),
});

export const purchaseItemSchema = z
  .object({
    id: z.string().uuid(),
    purchaseId: z.string().uuid(),
    materialId: z.string().uuid().nullable(),
    materialName: z.string().nullable(),
    description: z.string(),
    quantity: z.number(),
    unit: z.string().nullable(),
    rate: z.number(),
    amount: z.number(),
    receivedQty: z.number(),
    /** quantity − receivedQty (still to be received). */
    pending: z.number(),
  })
  .openapi("PurchaseItem");

export const purchaseSchema = z
  .object({
    id: z.string().uuid(),
    siteId: z.string().uuid(),
    sellerName: z.string().nullable(),
    poNumber: z.string().nullable(),
    orderDate: z.string(),
    expectedDate: z.string().nullable(),
    status: z.enum(PURCHASE_STATUSES),
    notes: z.string().nullable(),
    total: z.number(),
    taxAmount: z.number(),
    amountPaid: z.number(),
    paymentStatus: z.enum(PURCHASE_PAYMENT_STATUSES),
    paymentMode: z.string().nullable(),
    createdBy: personSchema.nullable(),
    createdAt: z.string(),
  })
  .openapi("Purchase");

export const purchaseDetailSchema = purchaseSchema
  .extend({ items: z.array(purchaseItemSchema) })
  .openapi("PurchaseDetail");

export const listPurchasesQuerySchema = paginationQuerySchema
  .extend({
    search: searchSchema.openapi({ description: "Match PO number, seller name, or notes." }),
    status: z.enum(PURCHASE_STATUSES).optional(),
    paymentStatus: z.enum(PURCHASE_PAYMENT_STATUSES).optional(),
    dateFrom: dateSchema.optional(),
    dateTo: dateSchema.optional(),
  })
  .refine((q) => !q.dateFrom || !q.dateTo || q.dateFrom <= q.dateTo, {
    message: "The start date must be before the end date.",
    path: ["dateTo"],
  });

const itemInputSchema = z.object({
  materialId: z.string().uuid().nullable().optional(),
  description: requiredText(200),
  quantity: quantitySchema(),
  unit: nullableText(40),
  rate: moneySchema(),
});

export const createPurchaseBodySchema = z
  .object({
    sellerName: requiredText(160),
    poNumber: nullableText(40),
    orderDate: pastOrTodaySchema.optional(),
    notes: nullableText(2000),
    taxAmount: moneySchema().optional(),
    amountPaid: moneySchema().optional(),
    paymentMode: optionalPaymentModeSchema.nullable(),
    items: z.array(itemInputSchema).min(1).max(200),
  })
  .openapi("CreatePurchaseRequest");

export const updatePurchaseBodySchema = z
  .object({
    sellerName: requiredText(160).optional(),
    poNumber: nullableText(40),
    orderDate: pastOrTodaySchema.optional(),
    // Deliveries are expected in the future — this one is not past-or-today.
    expectedDate: dateSchema.nullable().optional(),
    notes: nullableText(2000),
    status: z.enum(["draft", "ordered", "cancelled"]).optional(),
    taxAmount: moneySchema().optional(),
    paymentMode: optionalPaymentModeSchema.nullable(),
    /** Replaces all line items — allowed only while the purchase is a draft. */
    items: z.array(itemInputSchema).min(1).max(200).optional(),
  })
  .openapi("UpdatePurchaseRequest");

export const receivePurchaseBodySchema = z
  .object({
    items: z
      .array(
        z.object({
          itemId: z.string().uuid(),
          receivedQty: quantitySchema({ allowZero: true }),
        }),
      )
      .min(1)
      .max(200),
  })
  .openapi("ReceivePurchaseRequest");

export const payPurchaseBodySchema = z
  .object({
    amountPaid: moneySchema(),
    paymentMode: optionalPaymentModeSchema.nullable(),
  })
  .openapi("PayPurchaseRequest");

export const deletePurchaseResultSchema = z
  .object({ id: z.string().uuid(), deleted: z.boolean() })
  .openapi("DeletePurchaseResult");
