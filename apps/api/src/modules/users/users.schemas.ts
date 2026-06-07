import {
  ACCESS_LEVELS,
  type AccessLevel,
  RBAC_MODULES,
  type RbacModule,
  paginationQuerySchema,
} from "@construction-erp/shared";
import { z } from "@hono/zod-openapi";

const MODULES = [...RBAC_MODULES] as [RbacModule, ...RbacModule[]];
const LEVELS = [...ACCESS_LEVELS] as [AccessLevel, ...AccessLevel[]];

export const userIdParamSchema = z.object({
  id: z
    .string()
    .uuid()
    .openapi({
      param: { name: "id", in: "path" },
      example: "00000000-0000-0000-0000-000000000000",
    }),
});

/** A single per-module access grant (read or read+write) on the active site. */
export const modulePermissionSchema = z
  .object({
    module: z.enum(MODULES),
    level: z.enum(LEVELS),
  })
  .openapi("ModulePermission");

/** A member of the active site (the user + their per-module access on this site). */
export const memberSchema = z
  .object({
    id: z.string().uuid(),
    email: z.string().email(),
    name: z.string(),
    phone: z.string().nullable(),
    status: z.string(),
    lastLoginAt: z.string().nullable(),
    createdAt: z.string(),
    permissions: z.array(modulePermissionSchema),
  })
  .openapi("Member");

export const listUsersQuerySchema = paginationQuerySchema.extend({
  search: z.string().optional().openapi({ description: "Match against name or email." }),
  status: z.enum(["active", "disabled"]).optional(),
});

export const createUserBodySchema = z
  .object({
    name: z.string().min(1).max(120),
    email: z.string().email(),
    // Required only when creating a brand-new user; ignored when adding an
    // existing user (by email) to this site.
    password: z.string().min(8).max(100).optional(),
    phone: z.string().max(20).optional(),
    permissions: z
      .array(modulePermissionSchema)
      .min(1)
      .openapi({ description: "Per-module access on this site." }),
  })
  .openapi("CreateUserRequest");

export const updateUserBodySchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    phone: z.string().max(20).nullable().optional(),
    status: z.enum(["active", "disabled"]).optional(),
    password: z.string().min(8).max(100).optional(),
    permissions: z.array(modulePermissionSchema).min(1).optional(),
  })
  .openapi("UpdateUserRequest");

export const removeUserResultSchema = z
  .object({ id: z.string().uuid(), removed: z.boolean() })
  .openapi("RemoveUserResult");
