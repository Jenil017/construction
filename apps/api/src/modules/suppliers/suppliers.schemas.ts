import { paginationQuerySchema, searchSchema } from "@construction-erp/shared";
import { z } from "@hono/zod-openapi";
import {
  nullableEmail,
  nullableGstin,
  nullablePhone,
  nullableText,
  requiredText,
} from "../../common/validation";

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
  contactPerson: nullableText(120),
  phone: nullablePhone,
  email: nullableEmail,
  gstin: nullableGstin,
  address: nullableText(2000),
  notes: nullableText(2000),
};

export const createSupplierBodySchema = z
  .object({ name: requiredText(160), ...supplierFields })
  .openapi("CreateSupplierRequest");

export const updateSupplierBodySchema = z
  .object({ name: requiredText(160).optional(), ...supplierFields })
  .openapi("UpdateSupplierRequest");

export const listSuppliersQuerySchema = paginationQuerySchema.extend({
  search: searchSchema.openapi({ description: "Match name, contact, phone, or GSTIN." }),
});

export const deleteSupplierResultSchema = z
  .object({ id: z.string().uuid(), deleted: z.boolean() })
  .openapi("DeleteSupplierResult");
