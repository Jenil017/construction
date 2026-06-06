/**
 * Permission-based RBAC primitives. See docs/architecter.md + docs/backend_guideline.md.
 * A permission is { module, action, scope }. The backend checks these before every
 * protected operation; role names alone are never the authorization decision.
 */

export const RBAC_MODULES = [
  "dashboard",
  "companies",
  "projects",
  "sites",
  "dpr",
  "inventory",
  "attendance",
  "salary",
  "expenses",
  "purchases",
  "suppliers",
  "reports",
  "users",
  "roles",
  "files",
] as const;

export const RBAC_ACTIONS = ["view", "create", "update", "delete", "approve", "export"] as const;

export const RBAC_SCOPES = ["company", "site", "own"] as const;

export type RbacModule = (typeof RBAC_MODULES)[number];
export type RbacAction = (typeof RBAC_ACTIONS)[number];
export type RbacScope = (typeof RBAC_SCOPES)[number];

export interface Permission {
  module: RbacModule;
  action: RbacAction;
  scope: RbacScope;
}

/** Canonical string form, e.g. "inventory:create:site". Handy for sets/lookups. */
export function permissionKey(p: Permission): string {
  return `${p.module}:${p.action}:${p.scope}`;
}
