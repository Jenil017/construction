import { rolePermissions, roles, userRoles } from "@construction-erp/db/schema";
import type { Permission, RbacAction, RbacModule, RbacScope } from "@construction-erp/shared";
import { and, eq, isNull } from "drizzle-orm";
import type { AuthRole } from "../auth/context";
import type { DbClient } from "../db";

/** True if the permission set grants `action` on `module` (any scope). */
export function hasPermission(
  permissions: Permission[],
  module: RbacModule,
  action: RbacAction,
): boolean {
  return permissions.some((p) => p.module === module && p.action === action);
}

// Broader scope wins when two roles grant the same module:action.
const SCOPE_RANK: Record<RbacScope, number> = { company: 3, site: 2, own: 1 };

export interface UserAccess {
  roles: AuthRole[];
  permissions: Permission[];
}

/**
 * Load a user's roles and flattened permissions in a single indexed join
 * (user_roles → roles → role_permissions). Called per protected request so
 * permission changes take effect promptly. Soft-deleted roles are excluded.
 */
export async function loadUserAccess(
  db: DbClient,
  userId: string,
  companyId: string,
): Promise<UserAccess> {
  const rows = await db
    .select({
      roleId: roles.id,
      roleSlug: roles.slug,
      roleName: roles.name,
      module: rolePermissions.module,
      action: rolePermissions.action,
      scope: rolePermissions.scope,
    })
    .from(userRoles)
    .innerJoin(roles, and(eq(roles.id, userRoles.roleId), isNull(roles.deletedAt)))
    .leftJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
    .where(and(eq(userRoles.userId, userId), eq(userRoles.companyId, companyId)));

  const roleMap = new Map<string, AuthRole>();
  const permMap = new Map<string, Permission>();

  for (const row of rows) {
    if (!roleMap.has(row.roleId)) {
      roleMap.set(row.roleId, { id: row.roleId, slug: row.roleSlug, name: row.roleName });
    }
    if (row.module && row.action && row.scope) {
      const key = `${row.module}:${row.action}`;
      const next: Permission = {
        module: row.module as RbacModule,
        action: row.action as RbacAction,
        scope: row.scope as RbacScope,
      };
      const existing = permMap.get(key);
      if (!existing || SCOPE_RANK[next.scope] > SCOPE_RANK[existing.scope]) {
        permMap.set(key, next);
      }
    }
  }

  return { roles: [...roleMap.values()], permissions: [...permMap.values()] };
}
