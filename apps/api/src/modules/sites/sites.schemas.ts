import { paginationQuerySchema, searchSchema } from "@construction-erp/shared";
import { z } from "@hono/zod-openapi";
import {
  nullableGstin,
  nullableStateCode,
  nullableText,
  requiredText,
} from "../../common/validation";

export const SITE_STATUSES = ["active", "inactive", "completed"] as const;

export const siteIdParamSchema = z.object({
  id: z
    .string()
    .uuid()
    .openapi({ param: { name: "id", in: "path" } }),
});

export const siteSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    code: z.string().nullable(),
    address: z.string().nullable(),
    city: z.string().nullable(),
    state: z.string().nullable(),
    status: z.string(),
    // Seller identity used on invoices. `stateCode` is what decides intra- vs
    // inter-state GST, so a site with no state code can only ever issue
    // CGST+SGST invoices (see resolveSupplyType in invoices.routes.ts).
    gstin: z.string().nullable(),
    legalName: z.string().nullable(),
    stateCode: z.string().nullable(),
    role: z.enum(["owner", "member"]),
    memberCount: z.number().int(),
    createdAt: z.string(),
  })
  .openapi("Site");

export const listSitesQuerySchema = paginationQuerySchema.extend({
  search: searchSchema.openapi({ description: "Match against site name or code." }),
  status: z.enum(SITE_STATUSES).optional(),
});

/** Seller-identity fields, shared by create and update. */
const gstFields = {
  gstin: nullableGstin,
  legalName: nullableText(200),
  stateCode: nullableStateCode,
};

export const createSiteBodySchema = z
  .object({
    name: requiredText(160, "Enter the site name."),
    code: nullableText(40),
    address: nullableText(2000),
    city: nullableText(120),
    state: nullableText(120),
    status: z.enum(SITE_STATUSES).optional(),
    ...gstFields,
  })
  .openapi("CreateSiteRequest");

export const updateSiteBodySchema = z
  .object({
    name: requiredText(160, "Enter the site name.").optional(),
    code: nullableText(40),
    address: nullableText(2000),
    city: nullableText(120),
    state: nullableText(120),
    status: z.enum(SITE_STATUSES).optional(),
    ...gstFields,
  })
  .openapi("UpdateSiteRequest");

export const deleteSiteResultSchema = z
  .object({ id: z.string().uuid(), deleted: z.boolean() })
  .openapi("DeleteSiteResult");
