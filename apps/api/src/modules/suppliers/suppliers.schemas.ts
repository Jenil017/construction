import { paginationQuerySchema } from "@construction-erp/shared";
import { z } from "@hono/zod-openapi";

export const supplierIdParamSchema = z.object({
  id: z
    .string()
    .uuid()
    .openapi({ param: { name: "id", in: "path" } }),
});

export const supplierSchema = z
  .object({
    id: z.string().uuid(),
    siteId: z.string().uuid(),
    name: z.string(),
    contactPerson: z.string().nullable(),
    phone: z.string().nullable(),
    email: z.string().nullable(),
    gstin: z.string().nullable(),
    address: z.string().nullable(),
    notes: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi("Supplier");

export const supplierDetailSchema = supplierSchema
  .extend({
    /** Sum of (total − amountPaid) over this supplier's unpaid/partial purchases. */
    outstanding: z.number(),
    purchaseCount: z.number(),
  })
  .openapi("SupplierDetail");

const supplierFields = {
  contactPerson: z.string().max(120).nullable().optional(),
  phone: z.string().max(20).nullable().optional(),
  email: z.string().max(160).nullable().optional(),
  gstin: z.string().max(20).nullable().optional(),
  address: z.string().max(2000).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
};

export const createSupplierBodySchema = z
  .object({ name: z.string().min(1).max(160), ...supplierFields })
  .openapi("CreateSupplierRequest");

export const updateSupplierBodySchema = z
  .object({ name: z.string().min(1).max(160).optional(), ...supplierFields })
  .openapi("UpdateSupplierRequest");

export const listSuppliersQuerySchema = paginationQuerySchema.extend({
  search: z.string().optional().openapi({ description: "Match name, contact, phone, or GSTIN." }),
});

export const deleteSupplierResultSchema = z
  .object({ id: z.string().uuid(), deleted: z.boolean() })
  .openapi("DeleteSupplierResult");
