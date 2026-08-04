import {
  dateSchema,
  moneySchema,
  optionalText,
  paginationQuerySchema,
  pastOrTodaySchema,
  quantitySchema,
  searchSchema,
} from "@construction-erp/shared";
import { z } from "@hono/zod-openapi";
import { nullableText, requiredText } from "../../common/validation";

/** Stock movement types. Transfers are deferred (see docs/progress.md). */
export const MOVEMENT_TYPES = ["inward", "outward", "wastage", "adjustment"] as const;

export const materialIdParamSchema = z.object({
  id: z
    .string()
    .uuid()
    .openapi({ param: { name: "id", in: "path" } }),
});

const personSchema = z.object({ id: z.string().uuid(), name: z.string() });

export const stockMovementSchema = z
  .object({
    id: z.string().uuid(),
    siteId: z.string().uuid(),
    materialId: z.string().uuid(),
    materialName: z.string().nullable(),
    type: z.enum(MOVEMENT_TYPES),
    quantity: z.number(),
    balanceAfter: z.number(),
    unitCost: z.number().nullable(),
    reference: z.string().nullable(),
    note: z.string().nullable(),
    movementDate: z.string(),
    createdBy: personSchema.nullable(),
    createdAt: z.string(),
  })
  .openapi("StockMovement");

export const materialSchema = z
  .object({
    id: z.string().uuid(),
    siteId: z.string().uuid(),
    name: z.string(),
    sku: z.string().nullable(),
    category: z.string().nullable(),
    unit: z.string(),
    currentStock: z.number(),
    reorderLevel: z.number().nullable(),
    unitCost: z.number().nullable(),
    supplierRef: z.string().nullable(),
    notes: z.string().nullable(),
    /** Derived: reorderLevel is set and currentStock has fallen to/below it. */
    lowStock: z.boolean(),
    createdAt: z.string(),
  })
  .openapi("Material");

export const materialDetailSchema = materialSchema
  .extend({ recentMovements: z.array(stockMovementSchema) })
  .openapi("MaterialDetail");

export const listMaterialsQuerySchema = paginationQuerySchema.extend({
  search: searchSchema.openapi({ description: "Match name, SKU, or category." }),
  category: optionalText(80),
  status: z
    .enum(["low_stock"])
    .optional()
    .openapi({ description: "Only materials at/below their reorder level." }),
});

export const listMovementsQuerySchema = paginationQuerySchema
  .extend({
    materialId: z.string().uuid().optional(),
    type: z.enum(MOVEMENT_TYPES).optional(),
    dateFrom: dateSchema.optional(),
    dateTo: dateSchema.optional(),
    search: searchSchema.openapi({ description: "Match the reference field." }),
  })
  .refine((q) => !q.dateFrom || !q.dateTo || q.dateFrom <= q.dateTo, {
    message: "The start date must be before the end date.",
    path: ["dateTo"],
  });

const masterFields = {
  sku: nullableText(60),
  category: nullableText(80),
  reorderLevel: quantitySchema({ allowZero: true }).nullable().optional(),
  unitCost: moneySchema().nullable().optional(),
  supplierRef: nullableText(160),
  notes: nullableText(2000),
};

export const createMaterialBodySchema = z
  .object({
    name: requiredText(160),
    unit: requiredText(40),
    ...masterFields,
    /** Optional starting stock; > 0 records an opening adjustment movement. */
    openingStock: quantitySchema({ allowZero: true }).optional(),
  })
  .openapi("CreateMaterialRequest");

export const updateMaterialBodySchema = z
  .object({
    name: requiredText(160).optional(),
    unit: requiredText(40).optional(),
    ...masterFields,
  })
  .openapi("UpdateMaterialRequest");

/**
 * Record a stock movement. For inward/outward/wastage send a positive `quantity`;
 * for adjustment send the counted `newStock` (the handler validates the pairing
 * and computes the signed effect on stock).
 */
export const createMovementBodySchema = z
  .object({
    materialId: z.string().uuid(),
    type: z.enum(MOVEMENT_TYPES),
    quantity: quantitySchema().optional(),
    newStock: quantitySchema({ allowZero: true }).optional(),
    movementDate: pastOrTodaySchema.optional(),
    unitCost: moneySchema().nullable().optional(),
    reference: nullableText(160),
    note: nullableText(2000),
  })
  .openapi("CreateMovementRequest");

export const deleteMaterialResultSchema = z
  .object({ id: z.string().uuid(), deleted: z.boolean() })
  .openapi("DeleteMaterialResult");
