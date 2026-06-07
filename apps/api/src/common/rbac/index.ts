import { siteMemberPermissions, siteMembers, sites } from "@construction-erp/db/schema";
import {
  ACTIONS_FOR_LEVEL,
  type AccessLevel,
  type Permission,
  type RbacAction,
  type RbacModule,
  fullPermissions,
} from "@construction-erp/shared";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { DbClient } from "../db";

/** True if the permission set grants `action` on `module`. */
export function hasPermission(
  permissions: Permission[],
  module: RbacModule,
  action: RbacAction,
): boolean {
  return permissions.some((p) => p.module === module && p.action === action);
}

export interface UserSiteAccess {
  isOwner: boolean;
  permissions: Permission[];
}

/** Expand stored (module, level) rows into flat `{ module, action }` permissions. */
function expandRows(rows: { module: string; accessLevel: string }[]): Permission[] {
  const permissions: Permission[] = [];
  for (const row of rows) {
    const actions = ACTIONS_FOR_LEVEL[row.accessLevel as AccessLevel] ?? [];
    for (const action of actions) permissions.push({ module: row.module as RbacModule, action });
  }
  return permissions;
}

/**
 * Resolve a user's access to one site. The owner short-circuits to full access
 * (no membership row needed). A member's per-module levels are loaded and
 * expanded to actions. Returns null when the user neither owns nor is a member
 * of the site (→ no access).
 */
export async function loadUserSiteAccess(
  db: DbClient,
  userId: string,
  siteId: string,
): Promise<UserSiteAccess | null> {
  const [site] = await db
    .select({ id: sites.id, ownerUserId: sites.ownerUserId })
    .from(sites)
    .where(and(eq(sites.id, siteId), isNull(sites.deletedAt)))
    .limit(1);
  if (!site) return null;

  if (site.ownerUserId === userId) {
    return { isOwner: true, permissions: fullPermissions() };
  }

  const [member] = await db
    .select({ id: siteMembers.id })
    .from(siteMembers)
    .where(and(eq(siteMembers.siteId, siteId), eq(siteMembers.userId, userId)))
    .limit(1);
  if (!member) return null;

  const rows = await db
    .select({
      module: siteMemberPermissions.module,
      accessLevel: siteMemberPermissions.accessLevel,
    })
    .from(siteMemberPermissions)
    .where(eq(siteMemberPermissions.siteMemberId, member.id));

  return { isOwner: false, permissions: expandRows(rows) };
}

export interface UserSiteEntry {
  id: string;
  name: string;
  code: string | null;
  city: string | null;
  status: string;
  role: "owner" | "member";
  permissions: Permission[];
}

/**
 * Load every site a user can access (owned + member), with that site's permissions.
 * Powers the site switcher and the `/auth/me` + login responses. Owned sites get
 * the implicit full permission set. Avoids N+1 by loading all member permissions
 * in one query.
 */
export async function loadUserSites(db: DbClient, userId: string): Promise<UserSiteEntry[]> {
  const owned = await db
    .select({
      id: sites.id,
      name: sites.name,
      code: sites.code,
      city: sites.city,
      status: sites.status,
    })
    .from(sites)
    .where(and(eq(sites.ownerUserId, userId), isNull(sites.deletedAt)));

  const memberRows = await db
    .select({
      memberId: siteMembers.id,
      id: sites.id,
      name: sites.name,
      code: sites.code,
      city: sites.city,
      status: sites.status,
    })
    .from(siteMembers)
    .innerJoin(sites, and(eq(sites.id, siteMembers.siteId), isNull(sites.deletedAt)))
    .where(eq(siteMembers.userId, userId));

  // Load all member-permission rows for this user's memberships in one query.
  const memberIds = memberRows.map((r) => r.memberId);
  const permsByMember = new Map<string, Permission[]>();
  if (memberIds.length > 0) {
    const permRows = await db
      .select({
        siteMemberId: siteMemberPermissions.siteMemberId,
        module: siteMemberPermissions.module,
        accessLevel: siteMemberPermissions.accessLevel,
      })
      .from(siteMemberPermissions)
      .where(inArray(siteMemberPermissions.siteMemberId, memberIds));
    for (const row of permRows) {
      const list = permsByMember.get(row.siteMemberId) ?? [];
      const actions = ACTIONS_FOR_LEVEL[row.accessLevel as AccessLevel] ?? [];
      for (const action of actions) list.push({ module: row.module as RbacModule, action });
      permsByMember.set(row.siteMemberId, list);
    }
  }

  const full = fullPermissions();
  const ownedEntries: UserSiteEntry[] = owned.map((s) => ({
    ...s,
    role: "owner" as const,
    permissions: full,
  }));
  const memberEntries: UserSiteEntry[] = memberRows.map((s) => ({
    id: s.id,
    name: s.name,
    code: s.code,
    city: s.city,
    status: s.status,
    role: "member" as const,
    permissions: permsByMember.get(s.memberId) ?? [],
  }));

  return [...ownedEntries, ...memberEntries];
}
