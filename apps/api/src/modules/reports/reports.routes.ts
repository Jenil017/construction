import { exportJobs, users } from "@construction-erp/db/schema";
import { apiErrorSchema, apiSuccessSchema, buildPaginationMeta } from "@construction-erp/shared";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { type SQL, and, asc, count, desc, eq, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { writeAudit } from "../../common/audit";
import { edgeCache } from "../../common/cache";
import { type DbClient, getDb } from "../../common/db";
import { ConflictError, ExportError, NotFoundError } from "../../common/errors";
import { getRequestMeta } from "../../common/http/request-meta";
import { idempotency } from "../../common/idempotency";
import { requireAuth } from "../../common/middleware/require-auth";
import { requirePermission } from "../../common/middleware/require-permission";
import { requireSiteContext } from "../../common/middleware/require-site-context";
import { deleteObject, presignGetUrl, r2ConfigFromEnv } from "../../common/r2";
import { hasPermission } from "../../common/rbac";
import type { Env } from "../../env";
import {
  type ExportFormat,
  type ExportStatus,
  REPORT_TYPES,
  createExportBodySchema,
  deleteExportResultSchema,
  downloadLinkSchema,
  exportJobIdParamSchema,
  exportJobSchema,
  findReportType,
  listExportsQuerySchema,
  reportTypeSchema,
} from "./reports.schemas";
import { processExportMessage } from "./reports.service";

export const reportRoutes = new OpenAPIHono<Env>();

const requester = alias(users, "rpt_requester");
const today = () => new Date().toISOString().slice(0, 10);

const jobColumns = {
  id: exportJobs.id,
  siteId: exportJobs.siteId,
  reportType: exportJobs.reportType,
  format: exportJobs.format,
  status: exportJobs.status,
  params: exportJobs.params,
  fileName: exportJobs.fileName,
  fileSize: exportJobs.fileSize,
  rowCount: exportJobs.rowCount,
  errorMessage: exportJobs.errorMessage,
  attempts: exportJobs.attempts,
  requestedById: exportJobs.requestedByUserId,
  requestedByName: requester.name,
  completedAt: exportJobs.completedAt,
  createdAt: exportJobs.createdAt,
};

type JobRow = {
  id: string;
  siteId: string;
  reportType: string;
  format: string;
  status: string;
  params: unknown;
  fileName: string | null;
  fileSize: number | null;
  rowCount: number | null;
  errorMessage: string | null;
  attempts: number;
  requestedById: string;
  requestedByName: string | null;
  completedAt: Date | null;
  createdAt: Date;
};

function serializeJob(row: JobRow) {
  return {
    id: row.id,
    siteId: row.siteId,
    reportType: row.reportType,
    reportLabel: findReportType(row.reportType)?.label ?? row.reportType,
    format: row.format as ExportFormat,
    status: row.status as ExportStatus,
    params: (row.params as { dateFrom?: string; dateTo?: string } | null) ?? null,
    fileName: row.fileName,
    fileSize: row.fileSize,
    rowCount: row.rowCount,
    errorMessage: row.errorMessage,
    attempts: row.attempts,
    requestedBy: row.requestedById
      ? { id: row.requestedById, name: row.requestedByName ?? "—" }
      : null,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

async function loadJobJoined(db: DbClient, filters: SQL[]) {
  const [row] = await db
    .select(jobColumns)
    .from(exportJobs)
    .leftJoin(requester, eq(requester.id, exportJobs.requestedByUserId))
    .where(and(...filters))
    .limit(1);
  return row ? serializeJob(row as JobRow) : null;
}

async function loadRawJob(db: DbClient, siteId: string, id: string) {
  const [row] = await db
    .select()
    .from(exportJobs)
    .where(and(eq(exportJobs.id, id), eq(exportJobs.siteId, siteId), isNull(exportJobs.deletedAt)))
    .limit(1);
  return row ?? null;
}

// ─── Report type catalog ─────────────────────────────────────────────────────────────
const typesRoute = createRoute({
  method: "get",
  path: "/reports/types",
  tags: ["Reports"],
  summary: "List available report types",
  description: "Permission: reports:view. The catalog of datasets that can be exported.",
  middleware: [
    requireAuth,
    requireSiteContext,
    requirePermission("reports", "view"),
    edgeCache(3600),
  ] as const,
  responses: {
    200: {
      description: "Report type catalog",
      content: { "application/json": { schema: apiSuccessSchema(z.array(reportTypeSchema)) } },
    },
    403: {
      description: "Permission denied",
      content: { "application/json": { schema: apiErrorSchema } },
    },
  },
});

reportRoutes.openapi(typesRoute, async (c) => {
  // Static, non-tenant reference data → safe to edge-cache via the edgeCache mw.
  return c.json({ success: true as const, data: REPORT_TYPES }, 200);
});

// ─── List export jobs ──────────────────────────────────────────────────────────────
const listRoute = createRoute({
  method: "get",
  path: "/reports/exports",
  tags: ["Reports"],
  summary: "List export jobs for the active site",
  description: "Permission: reports:view. Filter by status and report type.",
  middleware: [requireAuth, requireSiteContext, requirePermission("reports", "view")] as const,
  request: { query: listExportsQuerySchema },
  responses: {
    200: {
      description: "A page of export jobs",
      content: { "application/json": { schema: apiSuccessSchema(z.array(exportJobSchema)) } },
    },
    403: {
      description: "Permission denied",
      content: { "application/json": { schema: apiErrorSchema } },
    },
  },
});

reportRoutes.openapi(listRoute, async (c) => {
  const { page, pageSize, sortOrder, status, reportType } = c.req.valid("query");
  const auth = c.get("auth");
  const db = getDb(c);
  const siteId = auth.siteId as string;

  const filters = [eq(exportJobs.siteId, siteId), isNull(exportJobs.deletedAt)];
  if (status) filters.push(eq(exportJobs.status, status));
  if (reportType) filters.push(eq(exportJobs.reportType, reportType));
  const whereClause = and(...filters);

  const [totalRow] = await db.select({ value: count() }).from(exportJobs).where(whereClause);
  const total = totalRow?.value ?? 0;

  const dir = sortOrder === "asc" ? asc : desc;
  const rows = await db
    .select(jobColumns)
    .from(exportJobs)
    .leftJoin(requester, eq(requester.id, exportJobs.requestedByUserId))
    .where(whereClause)
    .orderBy(dir(exportJobs.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const data = rows.map((r) => serializeJob(r as JobRow));
  return c.json(
    { success: true as const, data, meta: buildPaginationMeta(page, pageSize, total) },
    200,
  );
});

// ─── Create export job ─────────────────────────────────────────────────────────────
const createRouteDef = createRoute({
  method: "post",
  path: "/reports/exports",
  tags: ["Reports"],
  summary: "Request a report export (PDF/CSV)",
  description:
    "Permission: reports:export (plus view on the source module). Records the job and queues background generation; poll the job for status, then download when completed. Accepts an Idempotency-Key header for safe retries.",
  middleware: [
    requireAuth,
    requireSiteContext,
    requirePermission("reports", "export"),
    idempotency(),
  ] as const,
  request: {
    body: { content: { "application/json": { schema: createExportBodySchema } }, required: true },
  },
  responses: {
    201: {
      description: "Export job queued",
      content: { "application/json": { schema: apiSuccessSchema(exportJobSchema) } },
    },
    403: {
      description: "Permission denied",
      content: { "application/json": { schema: apiErrorSchema } },
    },
  },
});

reportRoutes.openapi(createRouteDef, async (c) => {
  const body = c.req.valid("json");
  const auth = c.get("auth");
  const db = getDb(c);
  const meta = getRequestMeta(c);
  const siteId = auth.siteId as string;

  const type = findReportType(body.reportType);
  if (!type) throw new NotFoundError("This report type is not available.");
  // Don't let someone export data they can't view: require view on the source module.
  if (!auth.isOwner && !hasPermission(auth.permissions, type.module, "view")) {
    throw new ExportError(`You do not have permission to view ${type.module}.`, 403);
  }

  const fileName = `${body.reportType}-${today().replace(/-/g, "")}.${body.format}`;

  const created = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(exportJobs)
      .values({
        siteId,
        reportType: body.reportType,
        format: body.format,
        status: "queued",
        params: body.params ?? {},
        fileName,
        correlationId: meta.requestId,
        requestedByUserId: auth.userId,
      })
      .returning();
    if (!row) throw new ExportError("Could not start the export. Please try again.");
    // Critical op per docs/architecter.md: export job creation + audit in one tx.
    await writeAudit(tx, {
      siteId,
      actorUserId: auth.userId,
      module: "reports",
      action: "export",
      entityType: "export_job",
      entityId: row.id,
      after: { reportType: row.reportType, format: row.format },
      ip: meta.ip,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });
    return row.id;
  });

  // Enqueue background generation. Falls back to in-isolate processing (kept alive
  // by waitUntil) when no queue binding is configured (e.g. local without Queues).
  const queue = c.env.EXPORT_QUEUE;
  if (queue) {
    await queue.send({ jobId: created, siteId });
  } else {
    c.executionCtx.waitUntil(processExportMessage(c.env, created, { allowRetry: false }));
  }

  const data = await loadJobJoined(db, [eq(exportJobs.id, created)]);
  if (!data) throw new NotFoundError("Export job not found.");
  return c.json({ success: true as const, data }, 201);
});

// ─── Get export job ────────────────────────────────────────────────────────────────
const getRouteDef = createRoute({
  method: "get",
  path: "/reports/exports/{id}",
  tags: ["Reports"],
  summary: "Get an export job's status",
  description: "Permission: reports:view.",
  middleware: [requireAuth, requireSiteContext, requirePermission("reports", "view")] as const,
  request: { params: exportJobIdParamSchema },
  responses: {
    200: {
      description: "The export job",
      content: { "application/json": { schema: apiSuccessSchema(exportJobSchema) } },
    },
    403: {
      description: "Permission denied",
      content: { "application/json": { schema: apiErrorSchema } },
    },
    404: { description: "Not found", content: { "application/json": { schema: apiErrorSchema } } },
  },
});

reportRoutes.openapi(getRouteDef, async (c) => {
  const { id } = c.req.valid("param");
  const auth = c.get("auth");
  const db = getDb(c);
  const siteId = auth.siteId as string;
  const data = await loadJobJoined(db, [
    eq(exportJobs.id, id),
    eq(exportJobs.siteId, siteId),
    isNull(exportJobs.deletedAt),
  ]);
  if (!data) throw new NotFoundError("Export job not found.");
  return c.json({ success: true as const, data }, 200);
});

// ─── Download a completed export ─────────────────────────────────────────────────────
const downloadRoute = createRoute({
  method: "get",
  path: "/reports/exports/{id}/download",
  tags: ["Reports"],
  summary: "Get a short-lived download link for a completed export",
  description: "Permission: reports:view. Returns a presigned R2 URL (valid ~5 minutes).",
  middleware: [requireAuth, requireSiteContext, requirePermission("reports", "view")] as const,
  request: { params: exportJobIdParamSchema },
  responses: {
    200: {
      description: "Download link",
      content: { "application/json": { schema: apiSuccessSchema(downloadLinkSchema) } },
    },
    403: {
      description: "Permission denied",
      content: { "application/json": { schema: apiErrorSchema } },
    },
    404: { description: "Not found", content: { "application/json": { schema: apiErrorSchema } } },
    409: { description: "Not ready", content: { "application/json": { schema: apiErrorSchema } } },
  },
});

reportRoutes.openapi(downloadRoute, async (c) => {
  const { id } = c.req.valid("param");
  const auth = c.get("auth");
  const db = getDb(c);
  const siteId = auth.siteId as string;

  const job = await loadRawJob(db, siteId, id);
  if (!job) throw new NotFoundError("Export job not found.");
  if (job.status !== "completed" || !job.objectKey) {
    throw new ConflictError("This export isn't ready to download yet.");
  }
  const cfg = r2ConfigFromEnv(c.env);
  if (!cfg) throw new ExportError("File storage isn't configured yet. Please contact your admin.");

  const fileName = job.fileName ?? `${job.reportType}.${job.format}`;
  const url = await presignGetUrl(cfg, job.objectKey, 300, {
    contentDisposition: `attachment; filename="${fileName}"`,
  });
  return c.json({ success: true as const, data: { url, fileName } }, 200);
});

// ─── Delete an export job ────────────────────────────────────────────────────────────
const deleteRouteDef = createRoute({
  method: "delete",
  path: "/reports/exports/{id}",
  tags: ["Reports"],
  summary: "Delete an export job",
  description: "Permission: reports:delete. Soft-deletes the row and removes the R2 file.",
  middleware: [requireAuth, requireSiteContext, requirePermission("reports", "delete")] as const,
  request: { params: exportJobIdParamSchema },
  responses: {
    200: {
      description: "Deleted",
      content: { "application/json": { schema: apiSuccessSchema(deleteExportResultSchema) } },
    },
    403: {
      description: "Permission denied",
      content: { "application/json": { schema: apiErrorSchema } },
    },
    404: { description: "Not found", content: { "application/json": { schema: apiErrorSchema } } },
  },
});

reportRoutes.openapi(deleteRouteDef, async (c) => {
  const { id } = c.req.valid("param");
  const auth = c.get("auth");
  const db = getDb(c);
  const meta = getRequestMeta(c);
  const siteId = auth.siteId as string;

  const job = await loadRawJob(db, siteId, id);
  if (!job) throw new NotFoundError("Export job not found.");

  await db.transaction(async (tx) => {
    await tx.update(exportJobs).set({ deletedAt: new Date() }).where(eq(exportJobs.id, id));
    await writeAudit(tx, {
      siteId,
      actorUserId: auth.userId,
      module: "reports",
      action: "delete",
      entityType: "export_job",
      entityId: id,
      before: { reportType: job.reportType, status: job.status },
      ip: meta.ip,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });
  });

  // Best-effort: remove the stored file (don't fail the request if R2 is unreachable).
  const cfg = r2ConfigFromEnv(c.env);
  if (cfg && job.objectKey) {
    c.executionCtx.waitUntil(deleteObject(cfg, job.objectKey).catch(() => {}));
  }

  return c.json({ success: true as const, data: { id, deleted: true } }, 200);
});
