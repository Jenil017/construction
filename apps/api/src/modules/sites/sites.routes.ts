import { siteMembers, sites } from "@construction-erp/db/schema";
import { apiErrorSchema, apiSuccessSchema, buildPaginationMeta } from "@construction-erp/shared";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { and, asc, count, desc, eq, ilike, inArray, isNull, or } from "drizzle-orm";
import { writeAudit } from "../../common/audit";
import { type DbClient, getDb } from "../../common/db";
import { AuthorizationError, ConflictError, NotFoundError } from "../../common/errors";
import { getRequestMeta } from "../../common/http/request-meta";
import { requireAuth } from "../../common/middleware/require-auth";
import { requireOwner } from "../../common/middleware/require-owner";
import type { Env } from "../../env";
import {
  createSiteBodySchema,
  deleteSiteResultSchema,
  listSitesQuerySchema,
  siteIdParamSchema,
  siteSchema,
  updateSiteBodySchema,
} from "./sites.schemas";

export const siteRoutes = new OpenAPIHono<Env>();

interface SiteRow {
  id: string;
  name: string;
  code: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  status: string;
  createdAt: Date;
}

const siteColumns = {
  id: sites.id,
  name: sites.name,
  code: sites.code,
  address: sites.address,
  city: sites.city,
  state: sites.state,
  status: sites.status,
  createdAt: sites.createdAt,
};

function serializeSite(row: SiteRow, memberCount: number, role: "owner" | "member" = "owner") {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    address: row.address,
    city: row.city,
    state: row.state,
    status: row.status,
    role,
    memberCount,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Member counts for a set of sites in one grouped query (avoids N+1). */
async function memberCounts(db: DbClient, siteIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (siteIds.length === 0) return map;
  const rows = await db
    .select({ siteId: siteMembers.siteId, value: count() })
    .from(siteMembers)
    .where(inArray(siteMembers.siteId, siteIds))
    .groupBy(siteMembers.siteId);
  for (const row of rows) map.set(row.siteId, row.value);
  return map;
}

/** Load a site owned by the user, or throw (404 if missing, 403 if not owner). */
async function loadOwnedSite(db: DbClient, id: string, userId: string) {
  const [site] = await db
    .select()
    .from(sites)
    .where(and(eq(sites.id, id), isNull(sites.deletedAt)))
    .limit(1);
  if (!site) throw new NotFoundError("Site not found.");
  if (site.ownerUserId !== userId) {
    throw new AuthorizationError("Only the owner can manage this site.");
  }
  return site;
}

/** Throw if a site with this code already exists (codes are globally unique). */
async function assertCodeAvailable(db: DbClient, code: string, excludeId?: string): Promise<void> {
  const [existing] = await db
    .select({ id: sites.id })
    .from(sites)
    .where(and(eq(sites.code, code), isNull(sites.deletedAt)))
    .limit(1);
  if (existing && existing.id !== excludeId) {
    throw new ConflictError("A site with this code already exists.");
  }
}

function sortColumn(sortBy?: string) {
  switch (sortBy) {
    case "name":
      return sites.name;
    case "status":
      return sites.status;
    default:
      return sites.createdAt;
  }
}

const listSitesRoute = createRoute({
  method: "get",
  path: "/sites",
  tags: ["Sites"],
  summary: "List sites you own",
  description: "Account-level. Returns the sites the current user owns, with member counts.",
  middleware: [requireAuth] as const,
  request: { query: listSitesQuerySchema },
  responses: {
    200: {
      description: "A page of sites",
      content: { "application/json": { schema: apiSuccessSchema(z.array(siteSchema)) } },
    },
    401: {
      description: "Not authenticated",
      content: { "application/json": { schema: apiErrorSchema } },
    },
  },
});

siteRoutes.openapi(listSitesRoute, async (c) => {
  const { page, pageSize, sortBy, sortOrder, search, status } = c.req.valid("query");
  const auth = c.get("auth");
  const db = getDb(c);

  const filters = [eq(sites.ownerUserId, auth.userId), isNull(sites.deletedAt)];
  if (status) filters.push(eq(sites.status, status));
  if (search) {
    const pattern = `%${search}%`;
    const term = or(ilike(sites.name, pattern), ilike(sites.code, pattern));
    if (term) filters.push(term);
  }
  const whereClause = and(...filters);
  const orderBy = sortOrder === "asc" ? asc(sortColumn(sortBy)) : desc(sortColumn(sortBy));

  const [totalRow] = await db.select({ value: count() }).from(sites).where(whereClause);
  const total = totalRow?.value ?? 0;

  const rows = await db
    .select(siteColumns)
    .from(sites)
    .where(whereClause)
    .orderBy(orderBy)
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const counts = await memberCounts(
    db,
    rows.map((r) => r.id),
  );
  const data = rows.map((row) => serializeSite(row, counts.get(row.id) ?? 0, "owner"));

  return c.json(
    { success: true as const, data, meta: buildPaginationMeta(page, pageSize, total) },
    200,
  );
});

const createSiteRoute = createRoute({
  method: "post",
  path: "/sites",
  tags: ["Sites"],
  summary: "Create a site",
  description: "Owner only. The creator becomes the site owner with full access.",
  middleware: [requireAuth, requireOwner] as const,
  request: {
    body: { content: { "application/json": { schema: createSiteBodySchema } }, required: true },
  },
  responses: {
    201: {
      description: "Site created",
      content: { "application/json": { schema: apiSuccessSchema(siteSchema) } },
    },
    403: {
      description: "Permission denied",
      content: { "application/json": { schema: apiErrorSchema } },
    },
    409: {
      description: "Site code already in use",
      content: { "application/json": { schema: apiErrorSchema } },
    },
  },
});

siteRoutes.openapi(createSiteRoute, async (c) => {
  const body = c.req.valid("json");
  const auth = c.get("auth");
  const db = getDb(c);
  const meta = getRequestMeta(c);
  const code = body.code?.trim() || null;

  if (code) await assertCodeAvailable(db, code);

  const created = await db.transaction(async (tx) => {
    const [site] = await tx
      .insert(sites)
      .values({
        ownerUserId: auth.userId,
        name: body.name.trim(),
        code,
        address: body.address ?? null,
        city: body.city ?? null,
        state: body.state ?? null,
        status: body.status ?? "active",
      })
      .returning();
    if (!site) throw new ConflictError("Could not create the site. Please try again.");

    await writeAudit(tx, {
      siteId: site.id,
      actorUserId: auth.userId,
      module: "sites",
      action: "create",
      entityType: "site",
      entityId: site.id,
      after: { name: site.name, code },
      ip: meta.ip,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });
    return site;
  });

  return c.json({ success: true as const, data: serializeSite(created, 0, "owner") }, 201);
});

const getSiteRoute = createRoute({
  method: "get",
  path: "/sites/{id}",
  tags: ["Sites"],
  summary: "Get a site you own by id",
  description: "Owner only.",
  middleware: [requireAuth] as const,
  request: { params: siteIdParamSchema },
  responses: {
    200: {
      description: "The site",
      content: { "application/json": { schema: apiSuccessSchema(siteSchema) } },
    },
    403: {
      description: "Permission denied",
      content: { "application/json": { schema: apiErrorSchema } },
    },
    404: { description: "Not found", content: { "application/json": { schema: apiErrorSchema } } },
  },
});

siteRoutes.openapi(getSiteRoute, async (c) => {
  const { id } = c.req.valid("param");
  const auth = c.get("auth");
  const db = getDb(c);

  const site = await loadOwnedSite(db, id, auth.userId);
  const counts = await memberCounts(db, [id]);
  return c.json(
    { success: true as const, data: serializeSite(site, counts.get(id) ?? 0, "owner") },
    200,
  );
});

const updateSiteRoute = createRoute({
  method: "patch",
  path: "/sites/{id}",
  tags: ["Sites"],
  summary: "Update a site (details, status)",
  description: "Owner only.",
  middleware: [requireAuth] as const,
  request: {
    params: siteIdParamSchema,
    body: { content: { "application/json": { schema: updateSiteBodySchema } }, required: true },
  },
  responses: {
    200: {
      description: "Site updated",
      content: { "application/json": { schema: apiSuccessSchema(siteSchema) } },
    },
    403: {
      description: "Permission denied",
      content: { "application/json": { schema: apiErrorSchema } },
    },
    404: { description: "Not found", content: { "application/json": { schema: apiErrorSchema } } },
    409: { description: "Conflict", content: { "application/json": { schema: apiErrorSchema } } },
  },
});

siteRoutes.openapi(updateSiteRoute, async (c) => {
  const { id } = c.req.valid("param");
  const body = c.req.valid("json");
  const auth = c.get("auth");
  const db = getDb(c);
  const meta = getRequestMeta(c);

  const existing = await loadOwnedSite(db, id, auth.userId);

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name.trim();
  if (body.address !== undefined) updates.address = body.address;
  if (body.city !== undefined) updates.city = body.city;
  if (body.state !== undefined) updates.state = body.state;
  if (body.status !== undefined) updates.status = body.status;
  if (body.code !== undefined) {
    const code = body.code?.trim() || null;
    if (code) await assertCodeAvailable(db, code, id);
    updates.code = code;
  }

  await db.transaction(async (tx) => {
    if (Object.keys(updates).length > 0) {
      await tx.update(sites).set(updates).where(eq(sites.id, id));
    }
    await writeAudit(tx, {
      siteId: id,
      actorUserId: auth.userId,
      module: "sites",
      action: "update",
      entityType: "site",
      entityId: id,
      before: { name: existing.name, code: existing.code, status: existing.status },
      after: {
        name: body.name?.trim() ?? existing.name,
        code: "code" in updates ? updates.code : existing.code,
        status: body.status ?? existing.status,
      },
      ip: meta.ip,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });
  });

  const [updated] = await db.select(siteColumns).from(sites).where(eq(sites.id, id)).limit(1);
  const counts = await memberCounts(db, [id]);
  return c.json(
    {
      success: true as const,
      data: serializeSite(updated ?? existing, counts.get(id) ?? 0, "owner"),
    },
    200,
  );
});

const deleteSiteRoute = createRoute({
  method: "delete",
  path: "/sites/{id}",
  tags: ["Sites"],
  summary: "Soft-delete a site",
  description: "Owner only. Removes all member assignments for the site.",
  middleware: [requireAuth] as const,
  request: { params: siteIdParamSchema },
  responses: {
    200: {
      description: "Site deleted",
      content: { "application/json": { schema: apiSuccessSchema(deleteSiteResultSchema) } },
    },
    403: {
      description: "Permission denied",
      content: { "application/json": { schema: apiErrorSchema } },
    },
    404: { description: "Not found", content: { "application/json": { schema: apiErrorSchema } } },
  },
});

siteRoutes.openapi(deleteSiteRoute, async (c) => {
  const { id } = c.req.valid("param");
  const auth = c.get("auth");
  const db = getDb(c);
  const meta = getRequestMeta(c);

  const existing = await loadOwnedSite(db, id, auth.userId);

  await db.transaction(async (tx) => {
    await tx.update(sites).set({ deletedAt: new Date() }).where(eq(sites.id, id));
    // Cascade-remove memberships (and their permissions via FK cascade).
    await tx.delete(siteMembers).where(eq(siteMembers.siteId, id));
    await writeAudit(tx, {
      siteId: id,
      actorUserId: auth.userId,
      module: "sites",
      action: "delete",
      entityType: "site",
      entityId: id,
      before: { name: existing.name, code: existing.code },
      ip: meta.ip,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });
  });

  return c.json({ success: true as const, data: { id, deleted: true } }, 200);
});
