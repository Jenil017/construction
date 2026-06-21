/**
 * Permission-based RBAC primitives. See docs/architecter.md + docs/backend_guideline.md.
 *
 * Site is the tenant boundary. A user's access on a site is a set of permissions
 * `{ module, action }`. Permissions are NOT stored per-action — each (member, module)
 * carries an access *level* (`read` | `read_write`) which expands to actions at load
 * time via `ACTIONS_FOR_LEVEL`. The backend checks `{ module, action }` before every
 * protected operation; the site owner bypasses checks on sites they own.
 */

export const RBAC_MODULES = [
  "dashboard",
  "sites",
  "users",
  "dpr",
  "inventory",
  "attendance",
  "salary",
  "purchases",
  "selling",
  "invoices",
  "expenses",
  "suppliers",
  "reports",
  "files",
] as const;

export const RBAC_ACTIONS = ["view", "create", "update", "delete", "approve", "export"] as const;

/** The two access levels a member can hold per module on a site. */
export const ACCESS_LEVELS = ["read", "read_write"] as const;

export type RbacModule = (typeof RBAC_MODULES)[number];
export type RbacAction = (typeof RBAC_ACTIONS)[number];
export type AccessLevel = (typeof ACCESS_LEVELS)[number];

export interface Permission {
  module: RbacModule;
  action: RbacAction;
}

/** Canonical string form, e.g. "inventory:create". Handy for sets/lookups. */
export function permissionKey(p: Permission): string {
  return `${p.module}:${p.action}`;
}

/** Expansion of an access level to the actions it grants. */
export const ACTIONS_FOR_LEVEL: Record<AccessLevel, readonly RbacAction[]> = {
  read: ["view"],
  read_write: ["view", "create", "update", "delete", "approve", "export"],
};

/** Expand a single (module, level) grant into flat `{ module, action }` permissions. */
export function expandLevel(module: RbacModule, level: AccessLevel): Permission[] {
  return ACTIONS_FOR_LEVEL[level].map((action) => ({ module, action }));
}

/** Every module × every action — the implicit grant for a site owner. */
export function fullPermissions(): Permission[] {
  const permissions: Permission[] = [];
  for (const module of RBAC_MODULES) {
    for (const action of RBAC_ACTIONS) permissions.push({ module, action });
  }
  return permissions;
}
