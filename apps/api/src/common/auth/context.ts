import type { Permission } from "@construction-erp/shared";

/** A role the current user holds (name/slug for display + nav decisions). */
export interface AuthRole {
  id: string;
  slug: string;
  name: string;
}

/**
 * The authenticated principal attached to the request context by `requireAuth`.
 * `permissions` is the flattened union of all the user's roles' permissions and
 * is what `requirePermission` checks against.
 */
export interface AuthContext {
  userId: string;
  companyId: string;
  email: string;
  name: string;
  roles: AuthRole[];
  permissions: Permission[];
}
