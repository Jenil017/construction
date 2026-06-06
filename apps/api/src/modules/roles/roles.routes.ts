import { rolePermissions, roles, userRoles } from "@construction-erp/db/schema";
import {
  RBAC_ACTIONS,
  RBAC_MODULES,
  RBAC_SCOPES,
  type RbacAction,
  type RbacModule,
  type RbacScope,
  apiErrorSchema,
  apiSuccessSchema,
  buildPaginationMeta,
} from "@construction-erp/shared";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { and, asc, count, desc, eq, ilike, inArray, isNull, or } from "drizzle-orm";
import { writeAudit } from "../../common/audit";
import { type DbClient, getDb } from "../../common/db";
import { ConflictError, NotFoundError } from "../../common/errors";
import { getRequestMeta } from "../../common/http/request-meta";
import { requireAuth } from "../../common/middleware/require-auth";
import { requirePermission } from "../../common/middleware/require-permission";
import type { Env } from "../../env";
import {
  createRoleBodySchema,
  deleteRoleResultSchema,
  listRolesQuerySchema,
  permissionCatalogSchema,
  roleIdParamSchema,
  roleSchema,
  updateRoleBodySchema,
} from "./roles.schemas";

export const roleRoutes = new OpenAPIHono<Env>();

interface PermissionRow {
  module: RbacModule;
  action: RbacAction;
  scope: RbacScope;
}

interface RoleRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isSystem: boolean;
  createdAt: Date;
}

function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "role";
}

function dedupePermissions(perms: PermissionRow[]): PermissionRow[] {
  const map = new Map<string, PermissionRow>();
  for (const p of perms) map.set(`${p.module}:${p.action}`, p); // last write wins
  return [...map.values()];
}

function serializeRole(row: RoleRow, perms: PermissionRow[]) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    isSystem: row.isSystem,
    permissions: perms,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Permissions for a set of roles in one query (avoids N+1). */
async function permissionsByRole(
  db: DbClient,
  roleIds: string[],
): Promise<Map<string, PermissionRow[]>> {
  const map = new Map<string, PermissionRow[]>();
  if (roleIds.length === 0) return map;
  const rows = await db
    .select({
      roleId: rolePermissions.roleId,
      module: rolePermissions.module,
      action: rolePermissions.action,
      scope: rolePermissions.scope,
    })
    .from(rolePermissions)
    .where(inArray(rolePermissions.roleId, roleIds));
  for (const row of rows) {
    const list = map.get(row.roleId) ?? [];
    list.push({
      module: row.module as RbacModule,
      action: row.action as RbacAction,
      scope: row.scope as RbacScope,
    });
    map.set(row.roleId, list);
  }
  return map;
}

const catalogRoute = createRoute({
  method: "get",
  path: "/roles/catalog",
  tags: ["Roles"],
  summary: "Permission catalog (modules, actions, scopes)",
  description: "Permission: roles:view. Drives the permission-matrix UI.",
  middleware: [requireAuth, requirePermission("roles", "view")] as const,
  responses: {
    200: {
      description: "Available modules, actions, and scopes",
      content: { "application/json": { schema: apiSuccessSchema(permissionCatalogSchema) } },
    },
  },
});

roleRoutes.openapi(catalogRoute, (c) =>
  c.json(
    {
      success: true as const,
      data: {
        modules: [...RBAC_MODULES],
        actions: [...RBAC_ACTIONS],
        scopes: [...RBAC_SCOPES],
      },
    },
    200,
  ),
);

const listRolesRoute = createRoute({
  method: "get",
  path: "/roles",
  tags: ["Roles"],
  summary: "List roles in the company",
  description: "Permission: roles:view.",
  middleware: [requireAuth, requirePermission("roles", "view")] as const,
  request: { query: listRolesQuerySchema },
  responses: {
    200: {
      description: "A page of roles",
      content: { "application/json": { schema: apiSuccessSchema(z.array(roleSchema)) } },
    },
  },
});

roleRoutes.openapi(listRolesRoute, async (c) => {
  const { page, pageSize, sortOrder, search } = c.req.valid("query");
  const auth = c.get("auth");
  const db = getDb(c);

  const filters = [eq(roles.companyId, auth.companyId), isNull(roles.deletedAt)];
  if (search) {
    const pattern = `%${search}%`;
    const term = or(ilike(roles.name, pattern), ilike(roles.slug, pattern));
    if (term) filters.push(term);
  }
  const whereClause = and(...filters);
  const orderBy = sortOrder === "asc" ? asc(roles.name) : desc(roles.createdAt);

  const [totalRow] = await db.select({ value: count() }).from(roles).where(whereClause);
  const total = totalRow?.value ?? 0;

  const rows = await db
    .select()
    .from(roles)
    .where(whereClause)
    .orderBy(orderBy)
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const permMap = await permissionsByRole(
    db,
    rows.map((r) => r.id),
  );
  const data = rows.map((row) => serializeRole(row, permMap.get(row.id) ?? []));

  return c.json(
    { success: true as const, data, meta: buildPaginationMeta(page, pageSize, total) },
    200,
  );
});

const createRoleRoute = createRoute({
  method: "post",
  path: "/roles",
  tags: ["Roles"],
  summary: "Create a role with a permission set",
  description: "Permission: roles:create.",
  middleware: [requireAuth, requirePermission("roles", "create")] as const,
  request: {
    body: { content: { "application/json": { schema: createRoleBodySchema } }, required: true },
  },
  responses: {
    201: {
      description: "Role created",
      content: { "application/json": { schema: apiSuccessSchema(roleSchema) } },
    },
    409: {
      description: "Slug already in use",
      content: { "application/json": { schema: apiErrorSchema } },
    },
  },
});

roleRoutes.openapi(createRoleRoute, async (c) => {
  const body = c.req.valid("json");
  const auth = c.get("auth");
  const db = getDb(c);
  const meta = getRequestMeta(c);
  const slug = body.slug ?? slugify(body.name);

  const [existing] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(and(eq(roles.companyId, auth.companyId), eq(roles.slug, slug), isNull(roles.deletedAt)))
    .limit(1);
  if (existing) throw new ConflictError("A role with this name already exists.");

  const permissions = dedupePermissions(body.permissions);

  const created = await db.transaction(async (tx) => {
    const [role] = await tx
      .insert(roles)
      .values({
        companyId: auth.companyId,
        name: body.name,
        slug,
        description: body.description ?? null,
        isSystem: false,
      })
      .returning();
    if (!role) throw new ConflictError("Could not create the role. Please try again.");

    await tx.insert(rolePermissions).values(
      permissions.map((p) => ({
        roleId: role.id,
        module: p.module,
        action: p.action,
        scope: p.scope,
      })),
    );

    await writeAudit(tx, {
      companyId: auth.companyId,
      actorUserId: auth.userId,
      module: "roles",
      action: "create",
      entityType: "role",
      entityId: role.id,
      after: { name: body.name, slug, permissionCount: permissions.length },
      ip: meta.ip,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });
    return role;
  });

  return c.json({ success: true as const, data: serializeRole(created, permissions) }, 201);
});

const getRoleRoute = createRoute({
  method: "get",
  path: "/roles/{id}",
  tags: ["Roles"],
  summary: "Get a role by id",
  description: "Permission: roles:view.",
  middleware: [requireAuth, requirePermission("roles", "view")] as const,
  request: { params: roleIdParamSchema },
  responses: {
    200: {
      description: "The role",
      content: { "application/json": { schema: apiSuccessSchema(roleSchema) } },
    },
    404: { description: "Not found", content: { "application/json": { schema: apiErrorSchema } } },
  },
});

roleRoutes.openapi(getRoleRoute, async (c) => {
  const { id } = c.req.valid("param");
  const auth = c.get("auth");
  const db = getDb(c);

  const [role] = await db
    .select()
    .from(roles)
    .where(and(eq(roles.id, id), eq(roles.companyId, auth.companyId), isNull(roles.deletedAt)))
    .limit(1);
  if (!role) throw new NotFoundError("Role not found.");

  const permMap = await permissionsByRole(db, [role.id]);
  return c.json(
    { success: true as const, data: serializeRole(role, permMap.get(role.id) ?? []) },
    200,
  );
});

const updateRoleRoute = createRoute({
  method: "patch",
  path: "/roles/{id}",
  tags: ["Roles"],
  summary: "Update a role's name, description, or permissions",
  description: "Permission: roles:update.",
  middleware: [requireAuth, requirePermission("roles", "update")] as const,
  request: {
    params: roleIdParamSchema,
    body: { content: { "application/json": { schema: updateRoleBodySchema } }, required: true },
  },
  responses: {
    200: {
      description: "Role updated",
      content: { "application/json": { schema: apiSuccessSchema(roleSchema) } },
    },
    404: { description: "Not found", content: { "application/json": { schema: apiErrorSchema } } },
  },
});

roleRoutes.openapi(updateRoleRoute, async (c) => {
  const { id } = c.req.valid("param");
  const body = c.req.valid("json");
  const auth = c.get("auth");
  const db = getDb(c);
  const meta = getRequestMeta(c);

  const [existing] = await db
    .select()
    .from(roles)
    .where(and(eq(roles.id, id), eq(roles.companyId, auth.companyId), isNull(roles.deletedAt)))
    .limit(1);
  if (!existing) throw new NotFoundError("Role not found.");

  const permissions = body.permissions ? dedupePermissions(body.permissions) : undefined;
  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.description !== undefined) updates.description = body.description;

  await db.transaction(async (tx) => {
    if (Object.keys(updates).length > 0) {
      await tx.update(roles).set(updates).where(eq(roles.id, id));
    }
    if (permissions) {
      await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, id));
      await tx.insert(rolePermissions).values(
        permissions.map((p) => ({
          roleId: id,
          module: p.module,
          action: p.action,
          scope: p.scope,
        })),
      );
    }
    await writeAudit(tx, {
      companyId: auth.companyId,
      actorUserId: auth.userId,
      module: "roles",
      action: "update",
      entityType: "role",
      entityId: id,
      before: { name: existing.name, description: existing.description },
      after: {
        name: body.name ?? existing.name,
        description: body.description === undefined ? existing.description : body.description,
        ...(permissions ? { permissionCount: permissions.length } : {}),
      },
      ip: meta.ip,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });
  });

  const [updated] = await db.select().from(roles).where(eq(roles.id, id)).limit(1);
  const role = updated ?? existing;
  const permMap = await permissionsByRole(db, [id]);
  return c.json({ success: true as const, data: serializeRole(role, permMap.get(id) ?? []) }, 200);
});

const deleteRoleRoute = createRoute({
  method: "delete",
  path: "/roles/{id}",
  tags: ["Roles"],
  summary: "Soft-delete a custom role",
  description: "Permission: roles:delete. System roles cannot be deleted.",
  middleware: [requireAuth, requirePermission("roles", "delete")] as const,
  request: { params: roleIdParamSchema },
  responses: {
    200: {
      description: "Role deleted",
      content: { "application/json": { schema: apiSuccessSchema(deleteRoleResultSchema) } },
    },
    404: { description: "Not found", content: { "application/json": { schema: apiErrorSchema } } },
    409: {
      description: "System role",
      content: { "application/json": { schema: apiErrorSchema } },
    },
  },
});

roleRoutes.openapi(deleteRoleRoute, async (c) => {
  const { id } = c.req.valid("param");
  const auth = c.get("auth");
  const db = getDb(c);
  const meta = getRequestMeta(c);

  const [existing] = await db
    .select()
    .from(roles)
    .where(and(eq(roles.id, id), eq(roles.companyId, auth.companyId), isNull(roles.deletedAt)))
    .limit(1);
  if (!existing) throw new NotFoundError("Role not found.");
  if (existing.isSystem) throw new ConflictError("System roles cannot be deleted.");

  await db.transaction(async (tx) => {
    await tx.update(roles).set({ deletedAt: new Date() }).where(eq(roles.id, id));
    // Remove assignments so users immediately lose this role.
    await tx.delete(userRoles).where(eq(userRoles.roleId, id));
    await writeAudit(tx, {
      companyId: auth.companyId,
      actorUserId: auth.userId,
      module: "roles",
      action: "delete",
      entityType: "role",
      entityId: id,
      before: { name: existing.name, slug: existing.slug },
      ip: meta.ip,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });
  });

  return c.json({ success: true as const, data: { id, deleted: true } }, 200);
});
