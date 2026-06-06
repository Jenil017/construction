import { paginationQuerySchema } from "@construction-erp/shared";
import { z } from "@hono/zod-openapi";
import { permissionSchema } from "../auth/auth.schemas";

export const roleIdParamSchema = z.object({
  id: z
    .string()
    .uuid()
    .openapi({ param: { name: "id", in: "path" } }),
});

export const roleSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    slug: z.string(),
    description: z.string().nullable(),
    isSystem: z.boolean(),
    permissions: z.array(permissionSchema),
    createdAt: z.string(),
  })
  .openapi("Role");

export const listRolesQuerySchema = paginationQuerySchema.extend({
  search: z.string().optional().openapi({ description: "Match against role name or slug." }),
});

export const createRoleBodySchema = z
  .object({
    name: z.string().min(1).max(80),
    slug: z
      .string()
      .min(1)
      .max(60)
      .regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers, and hyphens only.")
      .optional(),
    description: z.string().max(280).optional(),
    permissions: z.array(permissionSchema).min(1),
  })
  .openapi("CreateRoleRequest");

export const updateRoleBodySchema = z
  .object({
    name: z.string().min(1).max(80).optional(),
    description: z.string().max(280).nullable().optional(),
    permissions: z.array(permissionSchema).min(1).optional(),
  })
  .openapi("UpdateRoleRequest");

export const permissionCatalogSchema = z
  .object({
    modules: z.array(z.string()),
    actions: z.array(z.string()),
    scopes: z.array(z.string()),
  })
  .openapi("PermissionCatalog");

export const deleteRoleResultSchema = z
  .object({ id: z.string().uuid(), deleted: z.boolean() })
  .openapi("DeleteRoleResult");
