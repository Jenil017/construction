import {
  RBAC_ACTIONS,
  RBAC_MODULES,
  RBAC_SCOPES,
  type RbacAction,
  type RbacModule,
  type RbacScope,
} from "@construction-erp/shared";
import { z } from "@hono/zod-openapi";

// Mutable non-empty tuples so z.enum accepts the readonly shared constants.
const MODULES = [...RBAC_MODULES] as [RbacModule, ...RbacModule[]];
const ACTIONS = [...RBAC_ACTIONS] as [RbacAction, ...RbacAction[]];
const SCOPES = [...RBAC_SCOPES] as [RbacScope, ...RbacScope[]];

export const permissionSchema = z
  .object({
    module: z.enum(MODULES),
    action: z.enum(ACTIONS),
    scope: z.enum(SCOPES),
  })
  .openapi("Permission");

export const roleSummarySchema = z
  .object({
    id: z.string().uuid(),
    slug: z.string(),
    name: z.string(),
  })
  .openapi("RoleSummary");

export const authUserSchema = z
  .object({
    id: z.string().uuid(),
    email: z.string().email(),
    name: z.string(),
    companyId: z.string().uuid(),
    roles: z.array(roleSummarySchema),
    permissions: z.array(permissionSchema),
  })
  .openapi("AuthUser");

export const sessionSchema = z
  .object({
    accessToken: z.string(),
    refreshToken: z.string(),
    tokenType: z.literal("Bearer"),
    expiresIn: z.number().int().openapi({ description: "Access token lifetime in seconds." }),
    user: authUserSchema,
  })
  .openapi("Session");

export const loginBodySchema = z
  .object({
    email: z.string().email().openapi({ example: "admin@demo.test" }),
    password: z.string().min(1).openapi({ example: "Admin@12345" }),
  })
  .openapi("LoginRequest");

export const refreshBodySchema = z
  .object({ refreshToken: z.string().min(1) })
  .openapi("RefreshRequest");

export const logoutBodySchema = z
  .object({ refreshToken: z.string().min(1) })
  .openapi("LogoutRequest");

export const logoutResultSchema = z.object({ revoked: z.boolean() }).openapi("LogoutResult");
