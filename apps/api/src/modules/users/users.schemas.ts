import { paginationQuerySchema } from "@construction-erp/shared";
import { z } from "@hono/zod-openapi";
import { roleSummarySchema } from "../auth/auth.schemas";

export const userIdParamSchema = z.object({
  id: z
    .string()
    .uuid()
    .openapi({
      param: { name: "id", in: "path" },
      example: "00000000-0000-0000-0000-000000000000",
    }),
});

export const userSchema = z
  .object({
    id: z.string().uuid(),
    email: z.string().email(),
    name: z.string(),
    phone: z.string().nullable(),
    status: z.string(),
    lastLoginAt: z.string().nullable(),
    createdAt: z.string(),
    roles: z.array(roleSummarySchema),
  })
  .openapi("User");

export const listUsersQuerySchema = paginationQuerySchema.extend({
  search: z.string().optional().openapi({ description: "Match against name or email." }),
  status: z.enum(["active", "disabled"]).optional(),
});

export const createUserBodySchema = z
  .object({
    name: z.string().min(1).max(120),
    email: z.string().email(),
    password: z.string().min(8).max(100),
    phone: z.string().max(20).optional(),
    roleIds: z.array(z.string().uuid()).min(1).openapi({ description: "Roles to assign." }),
  })
  .openapi("CreateUserRequest");

export const updateUserBodySchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    phone: z.string().max(20).nullable().optional(),
    status: z.enum(["active", "disabled"]).optional(),
    roleIds: z.array(z.string().uuid()).min(1).optional(),
    password: z.string().min(8).max(100).optional(),
  })
  .openapi("UpdateUserRequest");

export const deleteUserResultSchema = z
  .object({ id: z.string().uuid(), deleted: z.boolean() })
  .openapi("DeleteUserResult");
