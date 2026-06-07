import {
  RBAC_ACTIONS,
  RBAC_MODULES,
  type RbacAction,
  type RbacModule,
} from "@construction-erp/shared";
import { z } from "@hono/zod-openapi";

// Mutable non-empty tuples so z.enum accepts the readonly shared constants.
const MODULES = [...RBAC_MODULES] as [RbacModule, ...RbacModule[]];
const ACTIONS = [...RBAC_ACTIONS] as [RbacAction, ...RbacAction[]];

export const permissionSchema = z
  .object({
    module: z.enum(MODULES),
    action: z.enum(ACTIONS),
  })
  .openapi("Permission");

export const siteEntrySchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    code: z.string().nullable(),
    city: z.string().nullable(),
    status: z.string(),
    role: z.enum(["owner", "member"]),
    permissions: z.array(permissionSchema),
  })
  .openapi("SiteEntry");

export const authUserSchema = z
  .object({
    id: z.string().uuid(),
    email: z.string().email(),
    name: z.string(),
    isAppOwner: z.boolean().openapi({ description: "May create and manage sites." }),
    sites: z.array(siteEntrySchema).openapi({ description: "Sites the user can access." }),
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
    password: z.string().min(1).openapi({ example: "ChangeMe123!" }),
  })
  .openapi("LoginRequest");

export const refreshBodySchema = z
  .object({ refreshToken: z.string().min(1) })
  .openapi("RefreshRequest");

export const logoutBodySchema = z
  .object({ refreshToken: z.string().min(1) })
  .openapi("LogoutRequest");

export const logoutResultSchema = z.object({ revoked: z.boolean() }).openapi("LogoutResult");
