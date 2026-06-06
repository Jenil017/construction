import { roles, userRoles, users } from "@construction-erp/db/schema";
import {
  OWNER_ROLE_SLUG,
  apiErrorSchema,
  apiSuccessSchema,
  buildPaginationMeta,
  hashPassword,
} from "@construction-erp/shared";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { and, asc, count, desc, eq, ilike, inArray, isNull, ne, or } from "drizzle-orm";
import { writeAudit } from "../../common/audit";
import { revokeUserSessions } from "../../common/auth";
import { type DbClient, getDb } from "../../common/db";
import { ConflictError, NotFoundError, ValidationError } from "../../common/errors";
import { getRequestMeta } from "../../common/http/request-meta";
import { requireAuth } from "../../common/middleware/require-auth";
import { requirePermission } from "../../common/middleware/require-permission";
import type { Env } from "../../env";
import {
  createUserBodySchema,
  deleteUserResultSchema,
  listUsersQuerySchema,
  updateUserBodySchema,
  userIdParamSchema,
  userSchema,
} from "./users.schemas";

export const userRoutes = new OpenAPIHono<Env>();

interface RoleSummary {
  id: string;
  slug: string;
  name: string;
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

function serializeUser(row: UserRow, roleList: RoleSummary[]) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    phone: row.phone,
    status: row.status,
    lastLoginAt: row.lastLoginAt ? row.lastLoginAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    roles: roleList,
  };
}

/** Roles for a set of users in one query (avoids N+1). */
async function rolesByUser(
  db: DbClient,
  companyId: string,
  userIds: string[],
): Promise<Map<string, RoleSummary[]>> {
  const map = new Map<string, RoleSummary[]>();
  if (userIds.length === 0) return map;
  const rows = await db
    .select({ userId: userRoles.userId, id: roles.id, slug: roles.slug, name: roles.name })
    .from(userRoles)
    .innerJoin(roles, and(eq(roles.id, userRoles.roleId), isNull(roles.deletedAt)))
    .where(and(eq(userRoles.companyId, companyId), inArray(userRoles.userId, userIds)));
  for (const row of rows) {
    const list = map.get(row.userId) ?? [];
    list.push({ id: row.id, slug: row.slug, name: row.name });
    map.set(row.userId, list);
  }
  return map;
}

/** Validate that every roleId belongs to the company; returns the deduped ids. */
async function assertRolesValid(
  db: DbClient,
  companyId: string,
  roleIds: string[],
): Promise<string[]> {
  const unique = [...new Set(roleIds)];
  const found = await db
    .select({ id: roles.id })
    .from(roles)
    .where(and(eq(roles.companyId, companyId), inArray(roles.id, unique), isNull(roles.deletedAt)));
  const foundIds = new Set(found.map((r) => r.id));
  if (unique.some((id) => !foundIds.has(id))) {
    throw new ValidationError("One or more selected roles are invalid.");
  }
  return unique;
}

/** Throw if `targetUserId` is the only remaining active owner of the company. */
async function assertNotLastOwner(
  db: DbClient,
  companyId: string,
  targetUserId: string,
): Promise<void> {
  const [ownerRole] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(
      and(eq(roles.companyId, companyId), eq(roles.slug, OWNER_ROLE_SLUG), isNull(roles.deletedAt)),
    )
    .limit(1);
  if (!ownerRole) return;

  const [targetHasOwner] = await db
    .select({ id: userRoles.id })
    .from(userRoles)
    .where(and(eq(userRoles.userId, targetUserId), eq(userRoles.roleId, ownerRole.id)))
    .limit(1);
  if (!targetHasOwner) return;

  const others = await db
    .select({ id: users.id })
    .from(userRoles)
    .innerJoin(
      users,
      and(eq(users.id, userRoles.userId), isNull(users.deletedAt), eq(users.status, "active")),
    )
    .where(and(eq(userRoles.roleId, ownerRole.id), ne(userRoles.userId, targetUserId)));
  if (others.length === 0) {
    throw new ConflictError("You cannot disable or remove the last active owner.");
  }
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
  summary: "List users in the company",
  description: "Permission: users:view. Paginated, filterable by status and search.",
  middleware: [requireAuth, requirePermission("users", "view")] as const,
  request: { query: listUsersQuerySchema },
  responses: {
    200: {
      description: "A page of users",
      content: { "application/json": { schema: apiSuccessSchema(z.array(userSchema)) } },
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

  const filters = [eq(users.companyId, auth.companyId), isNull(users.deletedAt)];
  if (status) filters.push(eq(users.status, status));
  if (search) {
    const pattern = `%${search}%`;
    const term = or(ilike(users.name, pattern), ilike(users.email, pattern));
    if (term) filters.push(term);
  }
  const whereClause = and(...filters);
  const orderBy = sortOrder === "asc" ? asc(sortColumn(sortBy)) : desc(sortColumn(sortBy));

  const [totalRow] = await db.select({ value: count() }).from(users).where(whereClause);
  const total = totalRow?.value ?? 0;

  const rows = await db
    .select()
    .from(users)
    .where(whereClause)
    .orderBy(orderBy)
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const roleMap = await rolesByUser(
    db,
    auth.companyId,
    rows.map((r) => r.id),
  );
  const data = rows.map((row) => serializeUser(row, roleMap.get(row.id) ?? []));

  return c.json(
    { success: true as const, data, meta: buildPaginationMeta(page, pageSize, total) },
    200,
  );
});

const createUserRoute = createRoute({
  method: "post",
  path: "/users",
  tags: ["Users"],
  summary: "Create a user and assign roles",
  description: "Permission: users:create.",
  middleware: [requireAuth, requirePermission("users", "create")] as const,
  request: {
    body: { content: { "application/json": { schema: createUserBodySchema } }, required: true },
  },
  responses: {
    201: {
      description: "User created",
      content: { "application/json": { schema: apiSuccessSchema(userSchema) } },
    },
    401: {
      description: "Not authenticated",
      content: { "application/json": { schema: apiErrorSchema } },
    },
    403: {
      description: "Permission denied",
      content: { "application/json": { schema: apiErrorSchema } },
    },
    409: {
      description: "Email already in use",
      content: { "application/json": { schema: apiErrorSchema } },
    },
  },
});

userRoutes.openapi(createUserRoute, async (c) => {
  const body = c.req.valid("json");
  const auth = c.get("auth");
  const db = getDb(c);
  const meta = getRequestMeta(c);
  const email = body.email.trim().toLowerCase();

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing) throw new ConflictError("A user with this email already exists.");

  const roleIds = await assertRolesValid(db, auth.companyId, body.roleIds);
  const passwordHash = await hashPassword(body.password);

  const created = await db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({
        companyId: auth.companyId,
        email,
        passwordHash,
        name: body.name,
        phone: body.phone ?? null,
        status: "active",
      })
      .returning();
    if (!user) throw new ConflictError("Could not create the user. Please try again.");

    await tx
      .insert(userRoles)
      .values(roleIds.map((roleId) => ({ userId: user.id, roleId, companyId: auth.companyId })));

    await writeAudit(tx, {
      companyId: auth.companyId,
      actorUserId: auth.userId,
      module: "users",
      action: "create",
      entityType: "user",
      entityId: user.id,
      after: { email, name: body.name, phone: body.phone ?? null, roleIds },
      ip: meta.ip,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });
    return user;
  });

  const roleMap = await rolesByUser(db, auth.companyId, [created.id]);
  return c.json(
    { success: true as const, data: serializeUser(created, roleMap.get(created.id) ?? []) },
    201,
  );
});

const getUserRoute = createRoute({
  method: "get",
  path: "/users/{id}",
  tags: ["Users"],
  summary: "Get a user by id",
  description: "Permission: users:view.",
  middleware: [requireAuth, requirePermission("users", "view")] as const,
  request: { params: userIdParamSchema },
  responses: {
    200: {
      description: "The user",
      content: { "application/json": { schema: apiSuccessSchema(userSchema) } },
    },
    403: {
      description: "Permission denied",
      content: { "application/json": { schema: apiErrorSchema } },
    },
    404: { description: "Not found", content: { "application/json": { schema: apiErrorSchema } } },
  },
});

userRoutes.openapi(getUserRoute, async (c) => {
  const { id } = c.req.valid("param");
  const auth = c.get("auth");
  const db = getDb(c);

  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, id), eq(users.companyId, auth.companyId), isNull(users.deletedAt)))
    .limit(1);
  if (!user) throw new NotFoundError("User not found.");

  const roleMap = await rolesByUser(db, auth.companyId, [user.id]);
  return c.json(
    { success: true as const, data: serializeUser(user, roleMap.get(user.id) ?? []) },
    200,
  );
});

const updateUserRoute = createRoute({
  method: "patch",
  path: "/users/{id}",
  tags: ["Users"],
  summary: "Update a user (profile, status, roles, password)",
  description: "Permission: users:update.",
  middleware: [requireAuth, requirePermission("users", "update")] as const,
  request: {
    params: userIdParamSchema,
    body: { content: { "application/json": { schema: updateUserBodySchema } }, required: true },
  },
  responses: {
    200: {
      description: "User updated",
      content: { "application/json": { schema: apiSuccessSchema(userSchema) } },
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

  const [existing] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, id), eq(users.companyId, auth.companyId), isNull(users.deletedAt)))
    .limit(1);
  if (!existing) throw new NotFoundError("User not found.");

  const disabling = body.status === "disabled" && existing.status !== "disabled";
  if (disabling && id === auth.userId) {
    throw new ConflictError("You cannot disable your own account.");
  }

  const roleIds = body.roleIds
    ? await assertRolesValid(db, auth.companyId, body.roleIds)
    : undefined;
  // If this action removes the user's owner role or disables them, guard the last owner.
  const willLoseOwner =
    disabling ||
    (roleIds !== undefined && !(await roleIdsIncludeOwner(db, auth.companyId, roleIds)));
  if (willLoseOwner) await assertNotLastOwner(db, auth.companyId, id);

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.phone !== undefined) updates.phone = body.phone;
  if (body.status !== undefined) updates.status = body.status;
  if (body.password !== undefined) updates.passwordHash = await hashPassword(body.password);

  await db.transaction(async (tx) => {
    if (Object.keys(updates).length > 0) {
      await tx.update(users).set(updates).where(eq(users.id, id));
    }
    if (roleIds) {
      await tx.delete(userRoles).where(eq(userRoles.userId, id));
      await tx
        .insert(userRoles)
        .values(roleIds.map((roleId) => ({ userId: id, roleId, companyId: auth.companyId })));
    }
    if (disabling) await revokeUserSessions(tx, id);

    await writeAudit(tx, {
      companyId: auth.companyId,
      actorUserId: auth.userId,
      module: "users",
      action: "update",
      entityType: "user",
      entityId: id,
      before: { name: existing.name, phone: existing.phone, status: existing.status },
      after: {
        name: body.name ?? existing.name,
        phone: body.phone === undefined ? existing.phone : body.phone,
        status: body.status ?? existing.status,
        ...(roleIds ? { roleIds } : {}),
        ...(body.password !== undefined ? { passwordChanged: true } : {}),
      },
      ip: meta.ip,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });
  });

  const [updated] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  const target = updated ?? existing;
  const roleMap = await rolesByUser(db, auth.companyId, [id]);
  return c.json(
    { success: true as const, data: serializeUser(target, roleMap.get(id) ?? []) },
    200,
  );
});

const deleteUserRoute = createRoute({
  method: "delete",
  path: "/users/{id}",
  tags: ["Users"],
  summary: "Soft-delete a user",
  description: "Permission: users:delete. Revokes the user's sessions.",
  middleware: [requireAuth, requirePermission("users", "delete")] as const,
  request: { params: userIdParamSchema },
  responses: {
    200: {
      description: "User deleted",
      content: { "application/json": { schema: apiSuccessSchema(deleteUserResultSchema) } },
    },
    403: {
      description: "Permission denied",
      content: { "application/json": { schema: apiErrorSchema } },
    },
    404: { description: "Not found", content: { "application/json": { schema: apiErrorSchema } } },
    409: { description: "Conflict", content: { "application/json": { schema: apiErrorSchema } } },
  },
});

userRoutes.openapi(deleteUserRoute, async (c) => {
  const { id } = c.req.valid("param");
  const auth = c.get("auth");
  const db = getDb(c);
  const meta = getRequestMeta(c);

  if (id === auth.userId) throw new ConflictError("You cannot delete your own account.");

  const [existing] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, id), eq(users.companyId, auth.companyId), isNull(users.deletedAt)))
    .limit(1);
  if (!existing) throw new NotFoundError("User not found.");

  await assertNotLastOwner(db, auth.companyId, id);

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ deletedAt: new Date(), status: "disabled" })
      .where(eq(users.id, id));
    await revokeUserSessions(tx, id);
    await writeAudit(tx, {
      companyId: auth.companyId,
      actorUserId: auth.userId,
      module: "users",
      action: "delete",
      entityType: "user",
      entityId: id,
      before: { email: existing.email, name: existing.name, status: existing.status },
      ip: meta.ip,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });
  });

  return c.json({ success: true as const, data: { id, deleted: true } }, 200);
});

/** True if the provided roleIds include the company's owner role. */
async function roleIdsIncludeOwner(
  db: DbClient,
  companyId: string,
  roleIds: string[],
): Promise<boolean> {
  if (roleIds.length === 0) return false;
  const [ownerRole] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(
      and(eq(roles.companyId, companyId), eq(roles.slug, OWNER_ROLE_SLUG), isNull(roles.deletedAt)),
    )
    .limit(1);
  if (!ownerRole) return false;
  return roleIds.includes(ownerRole.id);
}
