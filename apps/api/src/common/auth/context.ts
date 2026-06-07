import type { Permission } from "@construction-erp/shared";

/**
 * The authenticated principal attached to the request context by `requireAuth`.
 *
 * - `siteId` is the active site (from the `X-Site-Id` header), or null on
 *   account-level routes (login/me/sites list/create-site).
 * - `isOwner` is true when the user owns the active site → full access to it.
 * - `isAppOwner` mirrors `users.is_owner` — the global capability to create and
 *   manage sites (independent of any single site).
 * - `permissions` is the flattened `{ module, action }` set for the active site
 *   (empty on account-level routes), and is what `requirePermission` checks.
 */
export interface AuthContext {
  userId: string;
  siteId: string | null;
  email: string;
  name: string;
  isOwner: boolean;
  isAppOwner: boolean;
  permissions: Permission[];
}
