import { paginationQuerySchema } from "@construction-erp/shared";
import { z } from "@hono/zod-openapi";

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
    role: z.enum(["owner", "member"]),
    memberCount: z.number().int(),
    createdAt: z.string(),
  })
  .openapi("Site");

export const listSitesQuerySchema = paginationQuerySchema.extend({
  search: z.string().optional().openapi({ description: "Match against site name or code." }),
  status: z.enum(SITE_STATUSES).optional(),
});

export const createSiteBodySchema = z
  .object({
    name: z.string().min(1).max(160),
    code: z.string().max(40).optional(),
    address: z.string().max(2000).optional(),
    city: z.string().max(120).optional(),
    state: z.string().max(120).optional(),
    status: z.enum(SITE_STATUSES).optional(),
  })
  .openapi("CreateSiteRequest");

export const updateSiteBodySchema = z
  .object({
    name: z.string().min(1).max(160).optional(),
    code: z.string().max(40).nullable().optional(),
    address: z.string().max(2000).nullable().optional(),
    city: z.string().max(120).nullable().optional(),
    state: z.string().max(120).nullable().optional(),
    status: z.enum(SITE_STATUSES).optional(),
  })
  .openapi("UpdateSiteRequest");

export const deleteSiteResultSchema = z
  .object({ id: z.string().uuid(), deleted: z.boolean() })
  .openapi("DeleteSiteResult");
