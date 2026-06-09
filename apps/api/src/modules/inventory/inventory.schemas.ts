import { paginationQuerySchema } from "@construction-erp/shared";
import { z } from "@hono/zod-openapi";

/** Stock movement types. Transfers are deferred (see docs/progress.md). */
export const MOVEMENT_TYPES = ["inward", "outward", "wastage", "adjustment"] as const;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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
  search: z.string().optional().openapi({ description: "Match name, SKU, or category." }),
  category: z.string().optional(),
  status: z
    .enum(["low_stock"])
    .optional()
    .openapi({ description: "Only materials at/below their reorder level." }),
});

export const listMovementsQuerySchema = paginationQuerySchema.extend({
  materialId: z.string().uuid().optional(),
  type: z.enum(MOVEMENT_TYPES).optional(),
  dateFrom: z.string().regex(DATE_RE).optional(),
  dateTo: z.string().regex(DATE_RE).optional(),
  search: z.string().optional().openapi({ description: "Match the reference field." }),
});

const masterFields = {
  sku: z.string().max(60).nullable().optional(),
  category: z.string().max(80).nullable().optional(),
  reorderLevel: z.number().nonnegative().nullable().optional(),
  unitCost: z.number().nonnegative().nullable().optional(),
  supplierRef: z.string().max(160).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
};

export const createMaterialBodySchema = z
  .object({
    name: z.string().min(1).max(160),
    unit: z.string().min(1).max(40),
    ...masterFields,
    /** Optional starting stock; > 0 records an opening adjustment movement. */
    openingStock: z.number().nonnegative().optional(),
  })
  .openapi("CreateMaterialRequest");

export const updateMaterialBodySchema = z
  .object({
    name: z.string().min(1).max(160).optional(),
    unit: z.string().min(1).max(40).optional(),
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
    quantity: z.number().positive().optional(),
    newStock: z.number().nonnegative().optional(),
    movementDate: z.string().regex(DATE_RE).optional(),
    unitCost: z.number().nonnegative().nullable().optional(),
    reference: z.string().max(160).nullable().optional(),
    note: z.string().max(2000).nullable().optional(),
  })
  .openapi("CreateMovementRequest");

export const deleteMaterialResultSchema = z
  .object({ id: z.string().uuid(), deleted: z.boolean() })
  .openapi("DeleteMaterialResult");
