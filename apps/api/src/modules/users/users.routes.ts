import { siteMemberPermissions, siteMembers, users } from "@construction-erp/db/schema";
import {
  type AccessLevel,
  type RbacModule,
  apiErrorSchema,
  apiSuccessSchema,
  buildPaginationMeta,
  hashPassword,
} from "@construction-erp/shared";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { and, asc, count, desc, eq, ilike, inArray, isNull, or } from "drizzle-orm";
import { writeAudit } from "../../common/audit";
import { revokeUserSessions } from "../../common/auth";
import { type DbClient, getDb } from "../../common/db";
import { ConflictError, NotFoundError, ValidationError } from "../../common/errors";
import { getRequestMeta } from "../../common/http/request-meta";
import { requireAuth } from "../../common/middleware/require-auth";
import { requirePermission } from "../../common/middleware/require-permission";
import { requireSiteContext } from "../../common/middleware/require-site-context";
import type { Env } from "../../env";
import {
  createUserBodySchema,
  listUsersQuerySchema,
  memberSchema,
  removeUserResultSchema,
  updateUserBodySchema,
  userIdParamSchema,
} from "./users.schemas";

export const userRoutes = new OpenAPIHono<Env>();

interface MemberPerm {
  module: string;
  level: AccessLevel;
}

interface UserRow {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  status: string;
  lastLoginAt: Date | null;
  createdAt: Date;
}

function serializeMember(row: UserRow, permissions: MemberPerm[]) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    phone: row.phone,
    status: row.status,
    lastLoginAt: row.lastLoginAt ? row.lastLoginAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    permissions: permissions.map((p) => ({ module: p.module as RbacModule, level: p.level })),
  };
}

/** The membership row id for (site, user), or null if not a member of the site. */
async function findMembership(
  db: DbClient,
  siteId: string,
  userId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ id: siteMembers.id })
    .from(siteMembers)
    .where(and(eq(siteMembers.siteId, siteId), eq(siteMembers.userId, userId)))
    .limit(1);
  return row?.id ?? null;
}

/** Per-module levels for a set of memberships in one query (avoids N+1). */
async function permsByMembership(
  db: DbClient,
  membershipIds: string[],
): Promise<Map<string, MemberPerm[]>> {
  const map = new Map<string, MemberPerm[]>();
  if (membershipIds.length === 0) return map;
  const rows = await db
    .select({
      siteMemberId: siteMemberPermissions.siteMemberId,
      module: siteMemberPermissions.module,
      level: siteMemberPermissions.accessLevel,
    })
    .from(siteMemberPermissions)
    .where(inArray(siteMemberPermissions.siteMemberId, membershipIds));
  for (const row of rows) {
    const list = map.get(row.siteMemberId) ?? [];
    list.push({ module: row.module, level: row.level as AccessLevel });
    map.set(row.siteMemberId, list);
  }
  return map;
}

function sortColumn(sortBy?: string) {
  switch (sortBy) {
    case "name":
      return users.name;
    case "email":
      return users.email;
    default:
      return users.createdAt;
  }
}

const listUsersRoute = createRoute({
  method: "get",
  path: "/users",
  tags: ["Users"],
  summary: "List members of the active site",
  description: "Permission: users:view. Scoped to the active site (X-Site-Id).",
  middleware: [requireAuth, requireSiteContext, requirePermission("users", "view")] as const,
  request: { query: listUsersQuerySchema },
  responses: {
    200: {
      description: "A page of members",
      content: { "application/json": { schema: apiSuccessSchema(z.array(memberSchema)) } },
    },
    401: {
      description: "Not authenticated",
      content: { "application/json": { schema: apiErrorSchema } },
    },
    403: {
      description: "Permission denied",
      content: { "application/json": { schema: apiErrorSchema } },
    },
  },
});

userRoutes.openapi(listUsersRoute, async (c) => {
  const { page, pageSize, sortBy, sortOrder, search, status } = c.req.valid("query");
  const auth = c.get("auth");
  const db = getDb(c);
  const siteId = auth.siteId as string;

  const filters = [eq(siteMembers.siteId, siteId), isNull(users.deletedAt)];
  if (status) filters.push(eq(users.status, status));
  if (search) {
    const pattern = `%${search}%`;
    const term = or(ilike(users.name, pattern), ilike(users.email, pattern));
    if (term) filters.push(term);
  }
  const whereClause = and(...filters);
  const orderBy = sortOrder === "asc" ? asc(sortColumn(sortBy)) : desc(sortColumn(sortBy));

  const [totalRow] = await db
    .select({ value: count() })
    .from(siteMembers)
    .innerJoin(users, eq(users.id, siteMembers.userId))
    .where(whereClause);
  const total = totalRow?.value ?? 0;

  const rows = await db
    .select({
      membershipId: siteMembers.id,
      id: users.id,
      email: users.email,
      name: users.name,
      phone: users.phone,
      status: users.status,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
    })
    .from(siteMembers)
    .innerJoin(users, eq(users.id, siteMembers.userId))
    .where(whereClause)
    .orderBy(orderBy)
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const permMap = await permsByMembership(
    db,
    rows.map((r) => r.membershipId),
  );
  const data = rows.map((row) => serializeMember(row, permMap.get(row.membershipId) ?? []));

  return c.json(
    { success: true as const, data, meta: buildPaginationMeta(page, pageSize, total) },
    200,
  );
});

const createUserRoute = createRoute({
  method: "post",
  path: "/users",
  tags: ["Users"],
  summary: "Add a member to the active site",
  description:
    "Permission: users:create. Creates a new user (password required) or adds an existing " +
    "user (by email) to this site, with the given per-module access.",
  middleware: [requireAuth, requireSiteContext, requirePermission("users", "create")] as const,
  request: {
    body: { content: { "application/json": { schema: createUserBodySchema } }, required: true },
  },
  responses: {
    201: {
      description: "Member added",
      content: { "application/json": { schema: apiSuccessSchema(memberSchema) } },
    },
    403: {
      description: "Permission denied",
      content: { "application/json": { schema: apiErrorSchema } },
    },
    409: {
      description: "Already a member",
      content: { "application/json": { schema: apiErrorSchema } },
    },
  },
});

userRoutes.openapi(createUserRoute, async (c) => {
  const body = c.req.valid("json");
  const auth = c.get("auth");
  const db = getDb(c);
  const meta = getRequestMeta(c);
  const siteId = auth.siteId as string;
  const email = body.email.trim().toLowerCase();

  const [existing] = await db
    .select()
    .from(users)
    .where(and(eq(users.email, email), isNull(users.deletedAt)))
    .limit(1);

  if (existing) {
    const already = await findMembership(db, siteId, existing.id);
    if (already) throw new ConflictError("This user is already a member of this site.");
  } else if (!body.password) {
    throw new ValidationError("A password is required to create a new user.", {
      fields: { password: "A password is required to create a new user." },
    });
  }

  const passwordHash = existing ? null : await hashPassword(body.password as string);

  const member = await db.transaction(async (tx) => {
    let user = existing;
    if (!user) {
      const [created] = await tx
        .insert(users)
        .values({
          email,
          passwordHash: passwordHash as string,
          name: body.name.trim(),
          phone: body.phone ?? null,
          isOwner: false,
          status: "active",
        })
        .returning();
      if (!created) throw new ConflictError("Could not create the user. Please try again.");
      user = created;
    }

    const [membership] = await tx
      .insert(siteMembers)
      .values({ siteId, userId: user.id })
      .returning();
    if (!membership) throw new ConflictError("Could not add the member. Please try again.");

    await tx.insert(siteMemberPermissions).values(
      body.permissions.map((p) => ({
        siteMemberId: membership.id,
        module: p.module,
        accessLevel: p.level,
      })),
    );

    await writeAudit(tx, {
      siteId,
      actorUserId: auth.userId,
      module: "users",
      action: "create",
      entityType: "site_member",
      entityId: user.id,
      after: {
        email: user.email,
        name: user.name,
        linkedExisting: !!existing,
        permissions: body.permissions,
      },
      ip: meta.ip,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });

    return { user, membershipId: membership.id };
  });

  const permMap = await permsByMembership(db, [member.membershipId]);
  return c.json(
    {
      success: true as const,
      data: serializeMember(member.user, permMap.get(member.membershipId) ?? []),
    },
    201,
  );
});

const updateUserRoute = createRoute({
  method: "patch",
  path: "/users/{id}",
  tags: ["Users"],
  summary: "Update a member (profile, status, password, access)",
  description: "Permission: users:update. Access changes apply to the active site only.",
  middleware: [requireAuth, requireSiteContext, requirePermission("users", "update")] as const,
  request: {
    params: userIdParamSchema,
    body: { content: { "application/json": { schema: updateUserBodySchema } }, required: true },
  },
  responses: {
    200: {
      description: "Member updated",
      content: { "application/json": { schema: apiSuccessSchema(memberSchema) } },
    },
    403: {
      description: "Permission denied",
      content: { "application/json": { schema: apiErrorSchema } },
    },
    404: { description: "Not found", content: { "application/json": { schema: apiErrorSchema } } },
    409: { description: "Conflict", content: { "application/json": { schema: apiErrorSchema } } },
  },
});

userRoutes.openapi(updateUserRoute, async (c) => {
  const { id } = c.req.valid("param");
  const body = c.req.valid("json");
  const auth = c.get("auth");
  const db = getDb(c);
  const meta = getRequestMeta(c);
  const siteId = auth.siteId as string;

  const membershipId = await findMembership(db, siteId, id);
  if (!membershipId) throw new NotFoundError("This user is not a member of this site.");

  const [existing] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, id), isNull(users.deletedAt)))
    .limit(1);
  if (!existing) throw new NotFoundError("User not found.");

  const disabling = body.status === "disabled" && existing.status !== "disabled";
  if (disabling && id === auth.userId) {
    throw new ConflictError("You cannot disable your own account.");
  }

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name.trim();
  if (body.phone !== undefined) updates.phone = body.phone;
  if (body.status !== undefined) updates.status = body.status;
  if (body.password !== undefined) updates.passwordHash = await hashPassword(body.password);

  await db.transaction(async (tx) => {
    if (Object.keys(updates).length > 0) {
      await tx.update(users).set(updates).where(eq(users.id, id));
    }
    if (body.permissions) {
      await tx
        .delete(siteMemberPermissions)
        .where(eq(siteMemberPermissions.siteMemberId, membershipId));
      await tx.insert(siteMemberPermissions).values(
        body.permissions.map((p) => ({
          siteMemberId: membershipId,
          module: p.module,
          accessLevel: p.level,
        })),
      );
    }
    if (disabling) await revokeUserSessions(tx, id);

    await writeAudit(tx, {
      siteId,
      actorUserId: auth.userId,
      module: "users",
      action: "update",
      entityType: "site_member",
      entityId: id,
      before: { name: existing.name, phone: existing.phone, status: existing.status },
      after: {
        name: body.name ?? existing.name,
        phone: body.phone === undefined ? existing.phone : body.phone,
        status: body.status ?? existing.status,
        ...(body.permissions ? { permissions: body.permissions } : {}),
        ...(body.password !== undefined ? { passwordChanged: true } : {}),
      },
      ip: meta.ip,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });
  });

  const [updated] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  const permMap = await permsByMembership(db, [membershipId]);
  return c.json(
    {
      success: true as const,
      data: serializeMember(updated ?? existing, permMap.get(membershipId) ?? []),
    },
    200,
  );
});

const removeUserRoute = createRoute({
  method: "delete",
  path: "/users/{id}",
  tags: ["Users"],
  summary: "Remove a member from the active site",
  description:
    "Permission: users:delete. Removes the user's access to this site (not their account).",
  middleware: [requireAuth, requireSiteContext, requirePermission("users", "delete")] as const,
  request: { params: userIdParamSchema },
  responses: {
    200: {
      description: "Member removed",
      content: { "application/json": { schema: apiSuccessSchema(removeUserResultSchema) } },
    },
    403: {
      description: "Permission denied",
      content: { "application/json": { schema: apiErrorSchema } },
    },
    404: { description: "Not found", content: { "application/json": { schema: apiErrorSchema } } },
  },
});

userRoutes.openapi(removeUserRoute, async (c) => {
  const { id } = c.req.valid("param");
  const auth = c.get("auth");
  const db = getDb(c);
  const meta = getRequestMeta(c);
  const siteId = auth.siteId as string;

  const membershipId = await findMembership(db, siteId, id);
  if (!membershipId) throw new NotFoundError("This user is not a member of this site.");

  const [existing] = await db.select().from(users).where(eq(users.id, id)).limit(1);

  await db.transaction(async (tx) => {
    // Deleting the membership cascades its permissions (FK onDelete: cascade).
    await tx.delete(siteMembers).where(eq(siteMembers.id, membershipId));
    await writeAudit(tx, {
      siteId,
      actorUserId: auth.userId,
      module: "users",
      action: "delete",
      entityType: "site_member",
      entityId: id,
      before: existing ? { email: existing.email, name: existing.name } : undefined,
      ip: meta.ip,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });
  });

  return c.json({ success: true as const, data: { id, removed: true } }, 200);
});
