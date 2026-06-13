import { dpr, dprPhotos, users } from "@construction-erp/db/schema";
import { apiErrorSchema, apiSuccessSchema, buildPaginationMeta } from "@construction-erp/shared";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { and, asc, count, desc, eq, ilike, inArray, isNull, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { writeAudit } from "../../common/audit";
import { type DbClient, getDb } from "../../common/db";
import {
  AuthorizationError,
  ConflictError,
  NotFoundError,
  UploadError,
  ValidationError,
} from "../../common/errors";
import { getRequestMeta } from "../../common/http/request-meta";
import { requireAuth } from "../../common/middleware/require-auth";
import { requirePermission } from "../../common/middleware/require-permission";
import { requireSiteContext } from "../../common/middleware/require-site-context";
import {
  type R2Config,
  deleteObject,
  presignGetUrl,
  presignPutUrl,
  r2ConfigFromEnv,
} from "../../common/r2";
import type { Env } from "../../env";
import {
  confirmDprPhotoBodySchema,
  createDprBodySchema,
  deleteDprPhotoResultSchema,
  deleteDprResultSchema,
  dprIdParamSchema,
  dprPhotoParamSchema,
  dprPhotoSchema,
  dprSchema,
  dprUploadUrlBodySchema,
  dprUploadUrlResultSchema,
  listDprQuerySchema,
  updateDprBodySchema,
} from "./dpr.schemas";

export const dprRoutes = new OpenAPIHono<Env>();

const creator = alias(users, "creator");
const approver = alias(users, "approver");

const dprColumns = {
  id: dpr.id,
  siteId: dpr.siteId,
  reportDate: dpr.reportDate,
  workCategory: dpr.workCategory,
  location: dpr.location,
  completedWork: dpr.completedWork,
  pendingWork: dpr.pendingWork,
  quantityValue: dpr.quantityValue,
  quantityUnit: dpr.quantityUnit,
  remarks: dpr.remarks,
  status: dpr.status,
  createdById: dpr.createdByUserId,
  createdByName: creator.name,
  approvedById: dpr.approvedByUserId,
  approvedByName: approver.name,
  approvedAt: dpr.approvedAt,
  createdAt: dpr.createdAt,
};

interface DprRow {
  id: string;
  siteId: string;
  reportDate: string;
  workCategory: string | null;
  location: string | null;
  completedWork: string | null;
  pendingWork: string | null;
  quantityValue: string | null;
  quantityUnit: string | null;
  remarks: string | null;
  status: string;
  createdById: string;
  createdByName: string | null;
  approvedById: string | null;
  approvedByName: string | null;
  approvedAt: Date | null;
  createdAt: Date;
}

interface PhotoOut {
  id: string;
  fileName: string | null;
  contentType: string | null;
  sizeBytes: number | null;
  url: string | null;
  createdAt: string;
}

function serializeDpr(row: DprRow, photos: PhotoOut[], photoCount: number) {
  return {
    id: row.id,
    siteId: row.siteId,
    reportDate: row.reportDate,
    workCategory: row.workCategory,
    location: row.location,
    completedWork: row.completedWork,
    pendingWork: row.pendingWork,
    quantityValue: row.quantityValue != null ? Number(row.quantityValue) : null,
    quantityUnit: row.quantityUnit,
    remarks: row.remarks,
    status: row.status,
    createdBy: row.createdById ? { id: row.createdById, name: row.createdByName ?? "—" } : null,
    approvedBy: row.approvedById ? { id: row.approvedById, name: row.approvedByName ?? "—" } : null,
    approvedAt: row.approvedAt ? row.approvedAt.toISOString() : null,
    photoCount,
    photos,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Photo counts for a set of DPRs in one grouped query (avoids N+1). */
async function photoCounts(db: DbClient, dprIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (dprIds.length === 0) return map;
  const rows = await db
    .select({ dprId: dprPhotos.dprId, value: count() })
    .from(dprPhotos)
    .where(inArray(dprPhotos.dprId, dprIds))
    .groupBy(dprPhotos.dprId);
  for (const row of rows) map.set(row.dprId, row.value);
  return map;
}

/** Load a DPR's photos with short-lived presigned GET URLs (null if R2 unset). */
async function loadPhotos(db: DbClient, cfg: R2Config | null, dprId: string): Promise<PhotoOut[]> {
  const rows = await db
    .select()
    .from(dprPhotos)
    .where(eq(dprPhotos.dprId, dprId))
    .orderBy(asc(dprPhotos.createdAt));
  return Promise.all(
    rows.map(async (p) => ({
      id: p.id,
      fileName: p.fileName,
      contentType: p.contentType,
      sizeBytes: p.sizeBytes,
      url: cfg ? await presignGetUrl(cfg, p.objectKey) : null,
      createdAt: p.createdAt.toISOString(),
    })),
  );
}

/** Load one serialized DPR (with photos) scoped to the site. */
async function loadDpr(db: DbClient, cfg: R2Config | null, siteId: string, id: string) {
  const [row] = await db
    .select(dprColumns)
    .from(dpr)
    .leftJoin(creator, eq(creator.id, dpr.createdByUserId))
    .leftJoin(approver, eq(approver.id, dpr.approvedByUserId))
    .where(and(eq(dpr.id, id), eq(dpr.siteId, siteId), isNull(dpr.deletedAt)))
    .limit(1);
  if (!row) return null;
  const photos = await loadPhotos(db, cfg, id);
  return serializeDpr(row as DprRow, photos, photos.length);
}

/** Load the raw DPR row (for guards), scoped to the site. */
async function loadDprRow(db: DbClient, siteId: string, id: string) {
  const [row] = await db
    .select()
    .from(dpr)
    .where(and(eq(dpr.id, id), eq(dpr.siteId, siteId), isNull(dpr.deletedAt)))
    .limit(1);
  return row ?? null;
}

/**
 * Who may change a report (edit, delete, add/remove photos): only the member
 * who created it or the site owner, and only while it isn't locked. The site
 * owner locks a report (via /lock); once locked it's read-only for everyone —
 * the uploader can no longer fix data or photos.
 */
function assertCanModify(
  auth: { userId: string; isOwner: boolean },
  row: { createdByUserId: string; status: string },
) {
  if (!auth.isOwner && row.createdByUserId !== auth.userId) {
    throw new AuthorizationError("You can only edit reports you created.");
  }
  if (row.status === "approved") {
    throw new ConflictError("This report is locked and can no longer be edited.");
  }
}

function sortColumn(sortBy?: string) {
  switch (sortBy) {
    case "status":
      return dpr.status;
    case "createdAt":
      return dpr.createdAt;
    default:
      return dpr.reportDate;
  }
}

const listDprRoute = createRoute({
  method: "get",
  path: "/dpr",
  tags: ["DPR"],
  summary: "List daily progress reports for the active site",
  description: "Permission: dpr:view. Site-scoped (X-Site-Id). Filterable by status, date, search.",
  middleware: [requireAuth, requireSiteContext, requirePermission("dpr", "view")] as const,
  request: { query: listDprQuerySchema },
  responses: {
    200: {
      description: "A page of reports",
      content: { "application/json": { schema: apiSuccessSchema(z.array(dprSchema)) } },
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

dprRoutes.openapi(listDprRoute, async (c) => {
  const { page, pageSize, sortBy, sortOrder, search, status, date } = c.req.valid("query");
  const auth = c.get("auth");
  const db = getDb(c);
  const siteId = auth.siteId as string;

  const filters = [eq(dpr.siteId, siteId), isNull(dpr.deletedAt)];
  // Members only see reports they created; the site owner sees everyone's.
  if (!auth.isOwner) filters.push(eq(dpr.createdByUserId, auth.userId));
  if (status) filters.push(eq(dpr.status, status));
  if (date) filters.push(eq(dpr.reportDate, date));
  if (search) {
    const pattern = `%${search}%`;
    const term = or(ilike(dpr.workCategory, pattern), ilike(dpr.location, pattern));
    if (term) filters.push(term);
  }
  const whereClause = and(...filters);
  const orderBy = sortOrder === "asc" ? asc(sortColumn(sortBy)) : desc(sortColumn(sortBy));

  const [totalRow] = await db.select({ value: count() }).from(dpr).where(whereClause);
  const total = totalRow?.value ?? 0;

  const rows = await db
    .select(dprColumns)
    .from(dpr)
    .leftJoin(creator, eq(creator.id, dpr.createdByUserId))
    .leftJoin(approver, eq(approver.id, dpr.approvedByUserId))
    .where(whereClause)
    .orderBy(orderBy)
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const counts = await photoCounts(
    db,
    rows.map((r) => r.id),
  );
  // List omits photo URLs (signing per photo is for the detail view).
  const data = rows.map((row) => serializeDpr(row as DprRow, [], counts.get(row.id) ?? 0));

  return c.json(
    { success: true as const, data, meta: buildPaginationMeta(page, pageSize, total) },
    200,
  );
});

const createDprRoute = createRoute({
  method: "post",
  path: "/dpr",
  tags: ["DPR"],
  summary: "Create a daily progress report",
  description: "Permission: dpr:create. Site-scoped.",
  middleware: [requireAuth, requireSiteContext, requirePermission("dpr", "create")] as const,
  request: {
    body: { content: { "application/json": { schema: createDprBodySchema } }, required: true },
  },
  responses: {
    201: {
      description: "Created",
      content: { "application/json": { schema: apiSuccessSchema(dprSchema) } },
    },
    403: {
      description: "Permission denied",
      content: { "application/json": { schema: apiErrorSchema } },
    },
  },
});

dprRoutes.openapi(createDprRoute, async (c) => {
  const body = c.req.valid("json");
  const auth = c.get("auth");
  const db = getDb(c);
  const meta = getRequestMeta(c);
  const siteId = auth.siteId as string;

  const created = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(dpr)
      .values({
        siteId,
        reportDate: body.reportDate,
        workCategory: body.workCategory ?? null,
        location: body.location ?? null,
        completedWork: body.completedWork ?? null,
        pendingWork: body.pendingWork ?? null,
        quantityValue: body.quantityValue != null ? String(body.quantityValue) : null,
        quantityUnit: body.quantityUnit ?? null,
        remarks: body.remarks ?? null,
        status: "submitted",
        createdByUserId: auth.userId,
      })
      .returning();
    if (!row) throw new ConflictError("Could not create the report. Please try again.");
    await writeAudit(tx, {
      siteId,
      actorUserId: auth.userId,
      module: "dpr",
      action: "create",
      entityType: "dpr",
      entityId: row.id,
      after: { reportDate: row.reportDate, status: row.status, workCategory: row.workCategory },
      ip: meta.ip,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });
    return row;
  });

  const cfg = r2ConfigFromEnv(c.env);
  const data = await loadDpr(db, cfg, siteId, created.id);
  if (!data) throw new ConflictError("Could not load the created report.");
  return c.json({ success: true as const, data }, 201);
});

const getDprRoute = createRoute({
  method: "get",
  path: "/dpr/{id}",
  tags: ["DPR"],
  summary: "Get a report by id (with photos)",
  description: "Permission: dpr:view.",
  middleware: [requireAuth, requireSiteContext, requirePermission("dpr", "view")] as const,
  request: { params: dprIdParamSchema },
  responses: {
    200: {
      description: "The report",
      content: { "application/json": { schema: apiSuccessSchema(dprSchema) } },
    },
    403: {
      description: "Permission denied",
      content: { "application/json": { schema: apiErrorSchema } },
    },
    404: { description: "Not found", content: { "application/json": { schema: apiErrorSchema } } },
  },
});

dprRoutes.openapi(getDprRoute, async (c) => {
  const { id } = c.req.valid("param");
  const auth = c.get("auth");
  const db = getDb(c);
  const data = await loadDpr(db, r2ConfigFromEnv(c.env), auth.siteId as string, id);
  if (!data) throw new NotFoundError("DPR not found.");
  // Members can only open their own reports; don't leak others' by id.
  if (!auth.isOwner && data.createdBy?.id !== auth.userId) {
    throw new NotFoundError("DPR not found.");
  }
  return c.json({ success: true as const, data }, 200);
});

const updateDprRoute = createRoute({
  method: "patch",
  path: "/dpr/{id}",
  tags: ["DPR"],
  summary: "Update a report",
  description:
    "Permission: dpr:update. Only the report's creator or the site owner can edit it, and only while it is unlocked.",
  middleware: [requireAuth, requireSiteContext, requirePermission("dpr", "update")] as const,
  request: {
    params: dprIdParamSchema,
    body: { content: { "application/json": { schema: updateDprBodySchema } }, required: true },
  },
  responses: {
    200: {
      description: "Updated",
      content: { "application/json": { schema: apiSuccessSchema(dprSchema) } },
    },
    403: {
      description: "Permission denied",
      content: { "application/json": { schema: apiErrorSchema } },
    },
    404: { description: "Not found", content: { "application/json": { schema: apiErrorSchema } } },
    409: { description: "Conflict", content: { "application/json": { schema: apiErrorSchema } } },
  },
});

dprRoutes.openapi(updateDprRoute, async (c) => {
  const { id } = c.req.valid("param");
  const body = c.req.valid("json");
  const auth = c.get("auth");
  const db = getDb(c);
  const meta = getRequestMeta(c);
  const siteId = auth.siteId as string;

  const existing = await loadDprRow(db, siteId, id);
  if (!existing) throw new NotFoundError("DPR not found.");
  assertCanModify(auth, existing);

  const updates: Record<string, unknown> = {};
  if (body.reportDate !== undefined) updates.reportDate = body.reportDate;
  if (body.workCategory !== undefined) updates.workCategory = body.workCategory;
  if (body.location !== undefined) updates.location = body.location;
  if (body.completedWork !== undefined) updates.completedWork = body.completedWork;
  if (body.pendingWork !== undefined) updates.pendingWork = body.pendingWork;
  if (body.quantityValue !== undefined)
    updates.quantityValue = body.quantityValue != null ? String(body.quantityValue) : null;
  if (body.quantityUnit !== undefined) updates.quantityUnit = body.quantityUnit;
  if (body.remarks !== undefined) updates.remarks = body.remarks;

  await db.transaction(async (tx) => {
    if (Object.keys(updates).length > 0) {
      await tx.update(dpr).set(updates).where(eq(dpr.id, id));
    }
    await writeAudit(tx, {
      siteId,
      actorUserId: auth.userId,
      module: "dpr",
      action: "update",
      entityType: "dpr",
      entityId: id,
      before: { status: existing.status, reportDate: existing.reportDate },
      after: {
        status: existing.status,
        reportDate: body.reportDate ?? existing.reportDate,
      },
      ip: meta.ip,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });
  });

  const data = await loadDpr(db, r2ConfigFromEnv(c.env), siteId, id);
  if (!data) throw new NotFoundError("DPR not found.");
  return c.json({ success: true as const, data }, 200);
});

const approveDprRoute = createRoute({
  method: "post",
  path: "/dpr/{id}/approve",
  tags: ["DPR"],
  summary: "Lock a report",
  description:
    "Permission: dpr:approve. Locks the report (status `approved`) so the uploader can no longer edit it.",
  middleware: [requireAuth, requireSiteContext, requirePermission("dpr", "approve")] as const,
  request: { params: dprIdParamSchema },
  responses: {
    200: {
      description: "Approved",
      content: { "application/json": { schema: apiSuccessSchema(dprSchema) } },
    },
    403: {
      description: "Permission denied",
      content: { "application/json": { schema: apiErrorSchema } },
    },
    404: { description: "Not found", content: { "application/json": { schema: apiErrorSchema } } },
    409: { description: "Conflict", content: { "application/json": { schema: apiErrorSchema } } },
  },
});

dprRoutes.openapi(approveDprRoute, async (c) => {
  const { id } = c.req.valid("param");
  const auth = c.get("auth");
  const db = getDb(c);
  const meta = getRequestMeta(c);
  const siteId = auth.siteId as string;

  const existing = await loadDprRow(db, siteId, id);
  if (!existing) throw new NotFoundError("DPR not found.");
  if (existing.status === "approved") throw new ConflictError("This report is already locked.");

  await db.transaction(async (tx) => {
    await tx
      .update(dpr)
      .set({ status: "approved", approvedByUserId: auth.userId, approvedAt: new Date() })
      .where(eq(dpr.id, id));
    await writeAudit(tx, {
      siteId,
      actorUserId: auth.userId,
      module: "dpr",
      action: "approve",
      entityType: "dpr",
      entityId: id,
      before: { status: existing.status },
      after: { status: "approved" },
      ip: meta.ip,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });
  });

  const data = await loadDpr(db, r2ConfigFromEnv(c.env), siteId, id);
  if (!data) throw new NotFoundError("DPR not found.");
  return c.json({ success: true as const, data }, 200);
});

const deleteDprRoute = createRoute({
  method: "delete",
  path: "/dpr/{id}",
  tags: ["DPR"],
  summary: "Soft-delete a report",
  description: "Permission: dpr:delete.",
  middleware: [requireAuth, requireSiteContext, requirePermission("dpr", "delete")] as const,
  request: { params: dprIdParamSchema },
  responses: {
    200: {
      description: "Deleted",
      content: { "application/json": { schema: apiSuccessSchema(deleteDprResultSchema) } },
    },
    403: {
      description: "Permission denied",
      content: { "application/json": { schema: apiErrorSchema } },
    },
    404: { description: "Not found", content: { "application/json": { schema: apiErrorSchema } } },
  },
});

dprRoutes.openapi(deleteDprRoute, async (c) => {
  const { id } = c.req.valid("param");
  const auth = c.get("auth");
  const db = getDb(c);
  const meta = getRequestMeta(c);
  const siteId = auth.siteId as string;

  const existing = await loadDprRow(db, siteId, id);
  if (!existing) throw new NotFoundError("DPR not found.");
  assertCanModify(auth, existing);

  await db.transaction(async (tx) => {
    await tx.update(dpr).set({ deletedAt: new Date() }).where(eq(dpr.id, id));
    await writeAudit(tx, {
      siteId,
      actorUserId: auth.userId,
      module: "dpr",
      action: "delete",
      entityType: "dpr",
      entityId: id,
      before: { reportDate: existing.reportDate, status: existing.status },
      ip: meta.ip,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });
  });

  return c.json({ success: true as const, data: { id, deleted: true } }, 200);
});

const uploadUrlRoute = createRoute({
  method: "post",
  path: "/dpr/{id}/photos/upload-url",
  tags: ["DPR"],
  summary: "Get a presigned URL to upload a DPR photo",
  description: "Permission: dpr:update. Validates type/size, returns a short-lived R2 PUT URL.",
  middleware: [requireAuth, requireSiteContext, requirePermission("dpr", "update")] as const,
  request: {
    params: dprIdParamSchema,
    body: { content: { "application/json": { schema: dprUploadUrlBodySchema } }, required: true },
  },
  responses: {
    200: {
      description: "Signed URL",
      content: { "application/json": { schema: apiSuccessSchema(dprUploadUrlResultSchema) } },
    },
    400: {
      description: "Storage not configured / invalid file",
      content: { "application/json": { schema: apiErrorSchema } },
    },
    403: {
      description: "Permission denied",
      content: { "application/json": { schema: apiErrorSchema } },
    },
    404: { description: "Not found", content: { "application/json": { schema: apiErrorSchema } } },
  },
});

dprRoutes.openapi(uploadUrlRoute, async (c) => {
  const { id } = c.req.valid("param");
  const body = c.req.valid("json");
  const auth = c.get("auth");
  const db = getDb(c);
  const siteId = auth.siteId as string;

  const cfg = r2ConfigFromEnv(c.env);
  if (!cfg) throw new UploadError("File storage isn't configured yet. Please contact your admin.");

  const existing = await loadDprRow(db, siteId, id);
  if (!existing) throw new NotFoundError("DPR not found.");
  assertCanModify(auth, existing);

  const dot = body.fileName.lastIndexOf(".");
  const ext =
    dot >= 0
      ? body.fileName
          .slice(dot + 1)
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "")
      : "jpg";
  const objectKey = `dpr/${siteId}/${id}/${crypto.randomUUID()}.${ext || "jpg"}`;
  const expiresIn = 300;
  const uploadUrl = await presignPutUrl(cfg, objectKey, expiresIn);

  return c.json({ success: true as const, data: { uploadUrl, objectKey, expiresIn } }, 200);
});

const confirmPhotoRoute = createRoute({
  method: "post",
  path: "/dpr/{id}/photos",
  tags: ["DPR"],
  summary: "Confirm an uploaded photo (store metadata)",
  description: "Permission: dpr:update. Call after the direct upload to R2 succeeds.",
  middleware: [requireAuth, requireSiteContext, requirePermission("dpr", "update")] as const,
  request: {
    params: dprIdParamSchema,
    body: {
      content: { "application/json": { schema: confirmDprPhotoBodySchema } },
      required: true,
    },
  },
  responses: {
    201: {
      description: "Photo added",
      content: { "application/json": { schema: apiSuccessSchema(dprPhotoSchema) } },
    },
    400: {
      description: "Invalid object key",
      content: { "application/json": { schema: apiErrorSchema } },
    },
    403: {
      description: "Permission denied",
      content: { "application/json": { schema: apiErrorSchema } },
    },
    404: { description: "Not found", content: { "application/json": { schema: apiErrorSchema } } },
  },
});

dprRoutes.openapi(confirmPhotoRoute, async (c) => {
  const { id } = c.req.valid("param");
  const body = c.req.valid("json");
  const auth = c.get("auth");
  const db = getDb(c);
  const meta = getRequestMeta(c);
  const siteId = auth.siteId as string;

  const existing = await loadDprRow(db, siteId, id);
  if (!existing) throw new NotFoundError("DPR not found.");
  assertCanModify(auth, existing);

  // The key must be one we issued for this DPR (prevents attaching arbitrary objects).
  if (!body.objectKey.startsWith(`dpr/${siteId}/${id}/`)) {
    throw new ValidationError("Invalid object key for this report.");
  }

  const [photo] = await db
    .insert(dprPhotos)
    .values({
      dprId: id,
      siteId,
      objectKey: body.objectKey,
      fileName: body.fileName ?? null,
      contentType: body.contentType ?? null,
      sizeBytes: body.sizeBytes ?? null,
      uploadedByUserId: auth.userId,
    })
    .returning();
  if (!photo) throw new ConflictError("Could not save the photo. Please try again.");

  await writeAudit(db, {
    siteId,
    actorUserId: auth.userId,
    module: "dpr",
    action: "update",
    entityType: "dpr_photo",
    entityId: photo.id,
    after: { dprId: id, fileName: photo.fileName },
    ip: meta.ip,
    userAgent: meta.userAgent,
    requestId: meta.requestId,
  });

  const cfg = r2ConfigFromEnv(c.env);
  return c.json(
    {
      success: true as const,
      data: {
        id: photo.id,
        fileName: photo.fileName,
        contentType: photo.contentType,
        sizeBytes: photo.sizeBytes,
        url: cfg ? await presignGetUrl(cfg, photo.objectKey) : null,
        createdAt: photo.createdAt.toISOString(),
      },
    },
    201,
  );
});

const deletePhotoRoute = createRoute({
  method: "delete",
  path: "/dpr/{id}/photos/{photoId}",
  tags: ["DPR"],
  summary: "Remove a DPR photo",
  description: "Permission: dpr:update. Deletes metadata and the R2 object.",
  middleware: [requireAuth, requireSiteContext, requirePermission("dpr", "update")] as const,
  request: { params: dprPhotoParamSchema },
  responses: {
    200: {
      description: "Removed",
      content: { "application/json": { schema: apiSuccessSchema(deleteDprPhotoResultSchema) } },
    },
    403: {
      description: "Permission denied",
      content: { "application/json": { schema: apiErrorSchema } },
    },
    404: { description: "Not found", content: { "application/json": { schema: apiErrorSchema } } },
  },
});

dprRoutes.openapi(deletePhotoRoute, async (c) => {
  const { id, photoId } = c.req.valid("param");
  const auth = c.get("auth");
  const db = getDb(c);
  const meta = getRequestMeta(c);
  const siteId = auth.siteId as string;

  const [photo] = await db
    .select()
    .from(dprPhotos)
    .where(and(eq(dprPhotos.id, photoId), eq(dprPhotos.dprId, id), eq(dprPhotos.siteId, siteId)))
    .limit(1);
  if (!photo) throw new NotFoundError("Photo not found.");

  const parent = await loadDprRow(db, siteId, id);
  if (!parent) throw new NotFoundError("DPR not found.");
  assertCanModify(auth, parent);

  await db.delete(dprPhotos).where(eq(dprPhotos.id, photoId));

  // Best-effort object cleanup (don't fail the request if R2 delete hiccups).
  const cfg = r2ConfigFromEnv(c.env);
  if (cfg) {
    try {
      await deleteObject(cfg, photo.objectKey);
    } catch {
      // metadata is already gone; the orphaned object can be swept later
    }
  }

  await writeAudit(db, {
    siteId,
    actorUserId: auth.userId,
    module: "dpr",
    action: "update",
    entityType: "dpr_photo",
    entityId: photoId,
    before: { dprId: id, fileName: photo.fileName },
    ip: meta.ip,
    userAgent: meta.userAgent,
    requestId: meta.requestId,
  });

  return c.json({ success: true as const, data: { id: photoId, removed: true } }, 200);
});
