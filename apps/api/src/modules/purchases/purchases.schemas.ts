import { paginationQuerySchema } from "@construction-erp/shared";
import { z } from "@hono/zod-openapi";

export const PURCHASE_STATUSES = [
  "draft",
  "ordered",
  "partially_received",
  "received",
  "cancelled",
] as const;
export const PURCHASE_PAYMENT_STATUSES = ["unpaid", "partial", "paid"] as const;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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
    supplierId: z.string().uuid(),
    supplierName: z.string().nullable(),
    poNumber: z.string().nullable(),
    orderDate: z.string(),
    expectedDate: z.string().nullable(),
    status: z.enum(PURCHASE_STATUSES),
    notes: z.string().nullable(),
    total: z.number(),
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

export const listPurchasesQuerySchema = paginationQuerySchema.extend({
  search: z.string().optional().openapi({ description: "Match PO number or notes." }),
  status: z.enum(PURCHASE_STATUSES).optional(),
  paymentStatus: z.enum(PURCHASE_PAYMENT_STATUSES).optional(),
  supplierId: z.string().uuid().optional(),
  dateFrom: z.string().regex(DATE_RE).optional(),
  dateTo: z.string().regex(DATE_RE).optional(),
});

const itemInputSchema = z.object({
  materialId: z.string().uuid().nullable().optional(),
  description: z.string().min(1).max(200),
  quantity: z.number().positive(),
  unit: z.string().max(40).nullable().optional(),
  rate: z.number().nonnegative(),
});

export const createPurchaseBodySchema = z
  .object({
    supplierId: z.string().uuid(),
    poNumber: z.string().max(40).nullable().optional(),
    orderDate: z.string().regex(DATE_RE).optional(),
    expectedDate: z.string().regex(DATE_RE).nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
    status: z.enum(["draft", "ordered"]).optional(),
    items: z.array(itemInputSchema).min(1).max(200),
  })
  .openapi("CreatePurchaseRequest");

export const updatePurchaseBodySchema = z
  .object({
    supplierId: z.string().uuid().optional(),
    poNumber: z.string().max(40).nullable().optional(),
    orderDate: z.string().regex(DATE_RE).optional(),
    expectedDate: z.string().regex(DATE_RE).nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
    status: z.enum(["draft", "ordered", "cancelled"]).optional(),
    /** Replaces all line items — allowed only while the purchase is a draft. */
    items: z.array(itemInputSchema).min(1).max(200).optional(),
  })
  .openapi("UpdatePurchaseRequest");

export const receivePurchaseBodySchema = z
  .object({
    items: z
      .array(z.object({ itemId: z.string().uuid(), receivedQty: z.number().nonnegative() }))
      .min(1),
  })
  .openapi("ReceivePurchaseRequest");

export const payPurchaseBodySchema = z
  .object({
    amountPaid: z.number().nonnegative(),
    paymentMode: z.string().max(40).nullable().optional(),
  })
  .openapi("PayPurchaseRequest");

export const deletePurchaseResultSchema = z
  .object({ id: z.string().uuid(), deleted: z.boolean() })
  .openapi("DeletePurchaseResult");
