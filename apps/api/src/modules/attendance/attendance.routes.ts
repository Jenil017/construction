import {
  attendance,
  users,
  workerAdvances,
  workerCategories,
  workers,
} from "@construction-erp/db/schema";
import { apiErrorSchema, apiSuccessSchema, buildPaginationMeta } from "@construction-erp/shared";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import {
  type SQL,
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  lte,
  or,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { writeAudit } from "../../common/audit";
import { type DbClient, getDb } from "../../common/db";
import { ConflictError, NotFoundError, ValidationError } from "../../common/errors";
import { getRequestMeta } from "../../common/http/request-meta";
import { requireAuth } from "../../common/middleware/require-auth";
import { requirePermission } from "../../common/middleware/require-permission";
import { requireSiteContext } from "../../common/middleware/require-site-context";
import type { Env } from "../../env";
import {
  type ATTENDANCE_STATUSES,
  approveAttendanceBodySchema,
  approveAttendanceResultSchema,
  attendanceSchema,
  createWorkerBodySchema,
  createWorkerCategoryBodySchema,
  deleteResultSchema,
  listAttendanceQuerySchema,
  listWorkersQuerySchema,
  markAttendanceBodySchema,
  markAttendanceResultSchema,
  updateWorkerBodySchema,
  workerCategorySchema,
  workerDetailSchema,
  workerIdParamSchema,
  workerSchema,
} from "./attendance.schemas";

export const attendanceRoutes = new OpenAPIHono<Env>();

// User-table aliases for the "marked by" / "approved by" joins.
const markedBy = alias(users, "att_marked_by");
const approvedBy = alias(users, "att_approved_by");

/** Round to 2 decimals (hours / money) to avoid float artifacts. */
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
/** Today as YYYY-MM-DD. */
const today = () => new Date().toISOString().slice(0, 10);

// â”€â”€â”€ Workers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
interface WorkerRow {
  id: string;
  siteId: string;
  name: string;
  phone: string | null;
  categoryId: string | null;
  categoryName: string | null;
  trade: string | null;
  dailyWage: string;
  overtimeRate: string | null;
  notes: string | null;
  createdAt: Date;
}

const workerColumns = {
  id: workers.id,
  siteId: workers.siteId,
  name: workers.name,
  phone: workers.phone,
  categoryId: workers.categoryId,
  categoryName: workerCategories.name,
  trade: workers.trade,
  dailyWage: workers.dailyWage,
  overtimeRate: workers.overtimeRate,
  notes: workers.notes,
  createdAt: workers.createdAt,
};

function serializeWorker(row: WorkerRow) {
  return {
    id: row.id,
    siteId: row.siteId,
    name: row.name,
    phone: row.phone,
    categoryId: row.categoryId,
    // Category name; falls back to the legacy free-text trade for older workers.
    category: row.categoryName ?? row.trade ?? null,
    trade: row.trade,
    dailyWage: Number(row.dailyWage),
    overtimeRate: row.overtimeRate != null ? Number(row.overtimeRate) : null,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Raw worker row (for guards / FK checks), scoped to the site. */
async function loadWorkerRow(db: DbClient, siteId: string, id: string) {
  const [row] = await db
    .select()
    .from(workers)
    .where(and(eq(workers.id, id), eq(workers.siteId, siteId), isNull(workers.deletedAt)))
    .limit(1);
  return row ?? null;
}

/** Serialized worker (with category name) for responses. */
async function loadWorkerJoined(db: DbClient, siteId: string, id: string) {
  const [row] = await db
    .select(workerColumns)
    .from(workers)
    .leftJoin(workerCategories, eq(workerCategories.id, workers.categoryId))
    .where(and(eq(workers.id, id), eq(workers.siteId, siteId), isNull(workers.deletedAt)))
    .limit(1);
  return row ? serializeWorker(row as WorkerRow) : null;
}

/** Reject a category that isn't a live category on this site. */
async function assertSiteCategory(db: DbClient, siteId: string, categoryId: string) {
  const [row] = await db
    .select({ id: workerCategories.id })
    .from(workerCategories)
    .where(
      and(
        eq(workerCategories.id, categoryId),
        eq(workerCategories.siteId, siteId),
        isNull(workerCategories.deletedAt),
      ),
    )
    .limit(1);
  if (!row) {
    throw new ValidationError("That category is not on this site.", {
      fields: { categoryId: "Unknown category." },
    });
  }
}

const listWorkersRoute = createRoute({
  method: "get",
  path: "/attendance/workers",
  tags: ["Attendance"],
  summary: "List workers for the active site",
  description: "Permission: attendance:view. Site-scoped. Filter by search (name/phone/trade).",
  middleware: [requireAuth, requireSiteContext, requirePermission("attendance", "view")] as const,
  request: { query: listWorkersQuerySchema },
  responses: {
    200: {
      description: "A page of workers",
      content: { "application/json": { schema: apiSuccessSchema(z.array(workerSchema)) } },
    },
    403: {
      description: "Permission denied",
      content: { "application/json": { schema: apiErrorSchema } },
    },
  },
});

attendanceRoutes.openapi(listWorkersRoute, async (c) => {
  const { page, pageSize, sortOrder, search } = c.req.valid("query");
  const auth = c.get("auth");
  const db = getDb(c);
  const siteId = auth.siteId as string;

  const filters = [eq(workers.siteId, siteId), isNull(workers.deletedAt)];
  if (search) {
    const pattern = `%${search}%`;
    const term = or(
      ilike(workers.name, pattern),
      ilike(workers.phone, pattern),
      ilike(workers.trade, pattern),
    );
    if (term) filters.push(term);
  }
  const whereClause = and(...filters);

  const [totalRow] = await db.select({ value: count() }).from(workers).where(whereClause);
  const total = totalRow?.value ?? 0;

  const order = sortOrder === "desc" ? desc(workers.name) : asc(workers.name);
  const rows = await db
    .select(workerColumns)
    .from(workers)
    .leftJoin(workerCategories, eq(workerCategories.id, workers.categoryId))
    .where(whereClause)
    .orderBy(order)
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const data = rows.map((r) => serializeWorker(r as WorkerRow));
  return c.json(
    { success: true as const, data, meta: buildPaginationMeta(page, pageSize, total) },
    200,
  );
});

const createWorkerRoute = createRoute({
  method: "post",
  path: "/attendance/workers",
  tags: ["Attendance"],
  summary: "Add a worker to the master",
  description: "Permission: attendance:create.",
  middleware: [requireAuth, requireSiteContext, requirePermission("attendance", "create")] as const,
  request: {
    body: { content: { "application/json": { schema: createWorkerBodySchema } }, required: true },
  },
  responses: {
    201: {
      description: "Created",
      content: { "application/json": { schema: apiSuccessSchema(workerSchema) } },
    },
    403: {
      description: "Permission denied",
      content: { "application/json": { schema: apiErrorSchema } },
    },
  },
});

attendanceRoutes.openapi(createWorkerRoute, async (c) => {
  const body = c.req.valid("json");
  const auth = c.get("auth");
  const db = getDb(c);
  const meta = getRequestMeta(c);
  const siteId = auth.siteId as string;

  if (body.categoryId) await assertSiteCategory(db, siteId, body.categoryId);

  const createdId = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(workers)
      .values({
        siteId,
        name: body.name,
        phone: body.phone ?? null,
        categoryId: body.categoryId ?? null,
        trade: body.trade ?? null,
        dailyWage: String(round2(body.dailyWage)),
        overtimeRate: body.overtimeRate != null ? String(round2(body.overtimeRate)) : null,
        notes: body.notes ?? null,
      })
      .returning();
    if (!row) throw new ConflictError("Could not add the worker. Please try again.");
    await writeAudit(tx, {
      siteId,
      actorUserId: auth.userId,
      module: "attendance",
      action: "create",
      entityType: "worker",
      entityId: row.id,
      after: { name: row.name },
      ip: meta.ip,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });
    return row.id;
  });

  const data = await loadWorkerJoined(db, siteId, createdId);
  if (!data) throw new NotFoundError("Worker not found.");
  return c.json({ success: true as const, data }, 201);
});

const getWorkerRoute = createRoute({
  method: "get",
  path: "/attendance/workers/{id}",
  tags: ["Attendance"],
  summary: "Get a worker with recent attendance and outstanding advances",
  description: "Permission: attendance:view.",
  middleware: [requireAuth, requireSiteContext, requirePermission("attendance", "view")] as const,
  request: { params: workerIdParamSchema },
  responses: {
    200: {
      description: "The worker",
      content: { "application/json": { schema: apiSuccessSchema(workerDetailSchema) } },
    },
    403: {
      description: "Permission denied",
      content: { "application/json": { schema: apiErrorSchema } },
    },
    404: { description: "Not found", content: { "application/json": { schema: apiErrorSchema } } },
  },
});

attendanceRoutes.openapi(getWorkerRoute, async (c) => {
  const { id } = c.req.valid("param");
  const auth = c.get("auth");
  const db = getDb(c);
  const siteId = auth.siteId as string;

  const worker = await loadWorkerJoined(db, siteId, id);
  if (!worker) throw new NotFoundError("Worker not found.");

  const recentAttendance = await loadAttendanceRows(
    db,
    [eq(attendance.siteId, siteId), eq(attendance.workerId, id), isNull(attendance.deletedAt)],
    20,
  );

  const [adv] = await db
    .select({ total: sql<string>`coalesce(sum(${workerAdvances.amount}), 0)` })
    .from(workerAdvances)
    .where(
      and(
        eq(workerAdvances.siteId, siteId),
        eq(workerAdvances.workerId, id),
        isNull(workerAdvances.settledInRunId),
        isNull(workerAdvances.deletedAt),
      ),
    );

  return c.json(
    {
      success: true as const,
      data: {
        ...worker,
        recentAttendance,
        outstandingAdvances: Number(adv?.total ?? 0),
      },
    },
    200,
  );
});

const updateWorkerRoute = createRoute({
  method: "patch",
  path: "/attendance/workers/{id}",
  tags: ["Attendance"],
  summary: "Update a worker's master fields",
  description: "Permission: attendance:update. Rate changes apply to future salary runs only.",
  middleware: [requireAuth, requireSiteContext, requirePermission("attendance", "update")] as const,
  request: {
    params: workerIdParamSchema,
    body: { content: { "application/json": { schema: updateWorkerBodySchema } }, required: true },
  },
  responses: {
    200: {
      description: "Updated",
      content: { "application/json": { schema: apiSuccessSchema(workerSchema) } },
    },
    403: {
      description: "Permission denied",
      content: { "application/json": { schema: apiErrorSchema } },
    },
    404: { description: "Not found", content: { "application/json": { schema: apiErrorSchema } } },
  },
});

attendanceRoutes.openapi(updateWorkerRoute, async (c) => {
  const { id } = c.req.valid("param");
  const body = c.req.valid("json");
  const auth = c.get("auth");
  const db = getDb(c);
  const meta = getRequestMeta(c);
  const siteId = auth.siteId as string;

  const existing = await loadWorkerRow(db, siteId, id);
  if (!existing) throw new NotFoundError("Worker not found.");

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.phone !== undefined) updates.phone = body.phone;
  if (body.categoryId !== undefined) {
    if (body.categoryId) await assertSiteCategory(db, siteId, body.categoryId);
    updates.categoryId = body.categoryId;
  }
  if (body.trade !== undefined) updates.trade = body.trade;
  if (body.notes !== undefined) updates.notes = body.notes;
  if (body.dailyWage !== undefined) updates.dailyWage = String(round2(body.dailyWage));
  if (body.overtimeRate !== undefined)
    updates.overtimeRate = body.overtimeRate != null ? String(round2(body.overtimeRate)) : null;

  await db.transaction(async (tx) => {
    if (Object.keys(updates).length > 0) {
      await tx.update(workers).set(updates).where(eq(workers.id, id));
    }
    await writeAudit(tx, {
      siteId,
      actorUserId: auth.userId,
      module: "attendance",
      action: "update",
      entityType: "worker",
      entityId: id,
      before: { name: existing.name },
      after: { name: body.name ?? existing.name },
      ip: meta.ip,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });
  });

  const data = await loadWorkerJoined(db, siteId, id);
  if (!data) throw new NotFoundError("Worker not found.");
  return c.json({ success: true as const, data }, 200);
});

const deleteWorkerRoute = createRoute({
  method: "delete",
  path: "/attendance/workers/{id}",
  tags: ["Attendance"],
  summary: "Soft-delete (retire) a worker",
  description: "Permission: attendance:delete. Past attendance and salary are retained.",
  middleware: [requireAuth, requireSiteContext, requirePermission("attendance", "delete")] as const,
  request: { params: workerIdParamSchema },
  responses: {
    200: {
      description: "Deleted",
      content: { "application/json": { schema: apiSuccessSchema(deleteResultSchema) } },
    },
    403: {
      description: "Permission denied",
      content: { "application/json": { schema: apiErrorSchema } },
    },
    404: { description: "Not found", content: { "application/json": { schema: apiErrorSchema } } },
  },
});

attendanceRoutes.openapi(deleteWorkerRoute, async (c) => {
  const { id } = c.req.valid("param");
  const auth = c.get("auth");
  const db = getDb(c);
  const meta = getRequestMeta(c);
  const siteId = auth.siteId as string;

  const existing = await loadWorkerRow(db, siteId, id);
  if (!existing) throw new NotFoundError("Worker not found.");

  await db.transaction(async (tx) => {
    await tx.update(workers).set({ deletedAt: new Date() }).where(eq(workers.id, id));
    await writeAudit(tx, {
      siteId,
      actorUserId: auth.userId,
      module: "attendance",
      action: "delete",
      entityType: "worker",
      entityId: id,
      before: { name: existing.name },
      ip: meta.ip,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });
  });

  return c.json({ success: true as const, data: { id, deleted: true } }, 200);
});

// â”€â”€â”€ Worker categories â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const listCategoriesRoute = createRoute({
  method: "get",
  path: "/attendance/categories",
  tags: ["Attendance"],
  summary: "List worker categories for the active site",
  description: "Permission: attendance:view. The options behind the worker category dropdown.",
  middleware: [requireAuth, requireSiteContext, requirePermission("attendance", "view")] as const,
  responses: {
    200: {
      description: "Categories",
      content: { "application/json": { schema: apiSuccessSchema(z.array(workerCategorySchema)) } },
    },
    403: {
      description: "Permission denied",
      content: { "application/json": { schema: apiErrorSchema } },
    },
  },
});

attendanceRoutes.openapi(listCategoriesRoute, async (c) => {
  const auth = c.get("auth");
  const db = getDb(c);
  const siteId = auth.siteId as string;
  const rows = await db
    .select({ id: workerCategories.id, name: workerCategories.name })
    .from(workerCategories)
    .where(and(eq(workerCategories.siteId, siteId), isNull(workerCategories.deletedAt)))
    .orderBy(asc(workerCategories.name));
  return c.json({ success: true as const, data: rows }, 200);
});

const createCategoryRoute = createRoute({
  method: "post",
  path: "/attendance/categories",
  tags: ["Attendance"],
  summary: "Add a worker category",
  description:
    "Permission: attendance:create. Adds a category to this site's list (idempotent on name).",
  middleware: [requireAuth, requireSiteContext, requirePermission("attendance", "create")] as const,
  request: {
    body: {
      content: { "application/json": { schema: createWorkerCategoryBodySchema } },
      required: true,
    },
  },
  responses: {
    201: {
      description: "Created",
      content: { "application/json": { schema: apiSuccessSchema(workerCategorySchema) } },
    },
    403: {
      description: "Permission denied",
      content: { "application/json": { schema: apiErrorSchema } },
    },
  },
});

attendanceRoutes.openapi(createCategoryRoute, async (c) => {
  const body = c.req.valid("json");
  const auth = c.get("auth");
  const db = getDb(c);
  const siteId = auth.siteId as string;
  const name = body.name.trim();

  // If the category already exists on this site (case-insensitive), return it.
  const [existing] = await db
    .select({ id: workerCategories.id, name: workerCategories.name })
    .from(workerCategories)
    .where(
      and(
        eq(workerCategories.siteId, siteId),
        ilike(workerCategories.name, name),
        isNull(workerCategories.deletedAt),
      ),
    )
    .limit(1);
  if (existing) return c.json({ success: true as const, data: existing }, 201);

  const [row] = await db
    .insert(workerCategories)
    .values({ siteId, name })
    .returning({ id: workerCategories.id, name: workerCategories.name });
  if (!row) throw new ConflictError("Could not add the category. Please try again.");
  return c.json({ success: true as const, data: row }, 201);
});

// â”€â”€â”€ Attendance â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
interface AttendanceRow {
  id: string;
  siteId: string;
  workerId: string;
  workerName: string | null;
  attendanceDate: string;
  status: string;
  overtimeHours: string;
  note: string | null;
  approved: boolean;
  approvedById: string | null;
  approvedByName: string | null;
  markedById: string;
  markedByName: string | null;
  createdAt: Date;
}

const attendanceColumns = {
  id: attendance.id,
  siteId: attendance.siteId,
  workerId: attendance.workerId,
  workerName: workers.name,
  attendanceDate: attendance.attendanceDate,
  status: attendance.status,
  overtimeHours: attendance.overtimeHours,
  note: attendance.note,
  approved: attendance.approved,
  approvedById: attendance.approvedByUserId,
  approvedByName: approvedBy.name,
  markedById: attendance.markedByUserId,
  markedByName: markedBy.name,
  createdAt: attendance.createdAt,
};

function serializeAttendance(row: AttendanceRow) {
  return {
    id: row.id,
    siteId: row.siteId,
    workerId: row.workerId,
    workerName: row.workerName ?? null,
    attendanceDate: row.attendanceDate,
    status: row.status as (typeof ATTENDANCE_STATUSES)[number],
    overtimeHours: Number(row.overtimeHours),
    note: row.note,
    approved: row.approved,
    approvedBy: row.approvedById
      ? { id: row.approvedById, name: row.approvedByName ?? "â€”" }
      : null,
    markedBy: row.markedById ? { id: row.markedById, name: row.markedByName ?? "â€”" } : null,
    createdAt: row.createdAt.toISOString(),
  };
}

async function loadAttendanceRows(db: DbClient, filters: SQL[], limit: number, offset = 0) {
  const rows = await db
    .select(attendanceColumns)
    .from(attendance)
    .innerJoin(workers, eq(workers.id, attendance.workerId))
    .leftJoin(markedBy, eq(markedBy.id, attendance.markedByUserId))
    .leftJoin(approvedBy, eq(approvedBy.id, attendance.approvedByUserId))
    .where(and(...filters))
    .orderBy(desc(attendance.attendanceDate), asc(workers.name))
    .limit(limit)
    .offset(offset);
  return rows.map((r) => serializeAttendance(r as AttendanceRow));
}

const listAttendanceRoute = createRoute({
  method: "get",
  path: "/attendance",
  tags: ["Attendance"],
  summary: "List attendance for the active site",
  description: "Permission: attendance:view. Filter by date, date range, worker, status, approved.",
  middleware: [requireAuth, requireSiteContext, requirePermission("attendance", "view")] as const,
  request: { query: listAttendanceQuerySchema },
  responses: {
    200: {
      description: "A page of attendance records",
      content: { "application/json": { schema: apiSuccessSchema(z.array(attendanceSchema)) } },
    },
    403: {
      description: "Permission denied",
      content: { "application/json": { schema: apiErrorSchema } },
    },
  },
});

attendanceRoutes.openapi(listAttendanceRoute, async (c) => {
  const { page, pageSize, date, dateFrom, dateTo, workerId, status, approved } =
    c.req.valid("query");
  const auth = c.get("auth");
  const db = getDb(c);
  const siteId = auth.siteId as string;

  const filters = [eq(attendance.siteId, siteId), isNull(attendance.deletedAt)];
  if (date) filters.push(eq(attendance.attendanceDate, date));
  if (dateFrom) filters.push(gte(attendance.attendanceDate, dateFrom));
  if (dateTo) filters.push(lte(attendance.attendanceDate, dateTo));
  if (workerId) filters.push(eq(attendance.workerId, workerId));
  if (status) filters.push(eq(attendance.status, status));
  if (approved) filters.push(eq(attendance.approved, approved === "true"));
  const whereClause = and(...filters);

  const [totalRow] = await db.select({ value: count() }).from(attendance).where(whereClause);
  const total = totalRow?.value ?? 0;

  const data = await loadAttendanceRows(db, filters, pageSize, (page - 1) * pageSize);
  return c.json(
    { success: true as const, data, meta: buildPaginationMeta(page, pageSize, total) },
    200,
  );
});

const markAttendanceRoute = createRoute({
  method: "post",
  path: "/attendance",
  tags: ["Attendance"],
  summary: "Mark attendance for one day (bulk)",
  description:
    "Permission: attendance:create. Upserts one record per worker for the date; already-approved records are left untouched (skippedApproved).",
  middleware: [requireAuth, requireSiteContext, requirePermission("attendance", "create")] as const,
  request: {
    body: { content: { "application/json": { schema: markAttendanceBodySchema } }, required: true },
  },
  responses: {
    200: {
      description: "Marked",
      content: { "application/json": { schema: apiSuccessSchema(markAttendanceResultSchema) } },
    },
    400: {
      description: "Unknown worker(s)",
      content: { "application/json": { schema: apiErrorSchema } },
    },
    403: {
      description: "Permission denied",
      content: { "application/json": { schema: apiErrorSchema } },
    },
  },
});

attendanceRoutes.openapi(markAttendanceRoute, async (c) => {
  const body = c.req.valid("json");
  const auth = c.get("auth");
  const db = getDb(c);
  const meta = getRequestMeta(c);
  const siteId = auth.siteId as string;

  const workerIds = [...new Set(body.entries.map((e) => e.workerId))];
  const valid = await db
    .select({ id: workers.id })
    .from(workers)
    .where(
      and(eq(workers.siteId, siteId), inArray(workers.id, workerIds), isNull(workers.deletedAt)),
    );
  const validSet = new Set(valid.map((w) => w.id));
  const unknown = workerIds.filter((id) => !validSet.has(id));
  if (unknown.length > 0) {
    throw new ValidationError("Some workers are not on this site.", {
      fields: { entries: "Contains worker(s) not on this site." },
    });
  }

  let skippedApproved = 0;
  const savedIds: string[] = [];

  await db.transaction(async (tx) => {
    for (const e of body.entries) {
      const [existing] = await tx
        .select({ id: attendance.id, approved: attendance.approved })
        .from(attendance)
        .where(
          and(
            eq(attendance.siteId, siteId),
            eq(attendance.workerId, e.workerId),
            eq(attendance.attendanceDate, body.date),
            isNull(attendance.deletedAt),
          ),
        )
        .limit(1);

      const overtime = String(round2(e.overtimeHours ?? 0));
      if (existing) {
        if (existing.approved) {
          skippedApproved += 1;
          continue;
        }
        await tx
          .update(attendance)
          .set({
            status: e.status,
            overtimeHours: overtime,
            note: e.note ?? null,
            markedByUserId: auth.userId,
          })
          .where(eq(attendance.id, existing.id));
        savedIds.push(existing.id);
      } else {
        const [row] = await tx
          .insert(attendance)
          .values({
            siteId,
            workerId: e.workerId,
            attendanceDate: body.date,
            status: e.status,
            overtimeHours: overtime,
            note: e.note ?? null,
            markedByUserId: auth.userId,
          })
          .returning({ id: attendance.id });
        if (row) savedIds.push(row.id);
      }
    }

    await writeAudit(tx, {
      siteId,
      actorUserId: auth.userId,
      module: "attendance",
      action: "create",
      entityType: "attendance_day",
      entityId: null,
      after: { date: body.date, saved: savedIds.length, skippedApproved },
      ip: meta.ip,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });
  });

  const saved =
    savedIds.length > 0
      ? await loadAttendanceRows(db, [inArray(attendance.id, savedIds)], savedIds.length)
      : [];

  return c.json({ success: true as const, data: { date: body.date, saved, skippedApproved } }, 200);
});

const approveAttendanceRoute = createRoute({
  method: "post",
  path: "/attendance/approve",
  tags: ["Attendance"],
  summary: "Approve all marked attendance for a day",
  description:
    "Permission: attendance:approve. Locks the day's records so salary can be generated.",
  middleware: [
    requireAuth,
    requireSiteContext,
    requirePermission("attendance", "approve"),
  ] as const,
  request: {
    body: {
      content: { "application/json": { schema: approveAttendanceBodySchema } },
      required: true,
    },
  },
  responses: {
    200: {
      description: "Approved",
      content: { "application/json": { schema: apiSuccessSchema(approveAttendanceResultSchema) } },
    },
    403: {
      description: "Permission denied",
      content: { "application/json": { schema: apiErrorSchema } },
    },
  },
});

attendanceRoutes.openapi(approveAttendanceRoute, async (c) => {
  const { date } = c.req.valid("json");
  const auth = c.get("auth");
  const db = getDb(c);
  const meta = getRequestMeta(c);
  const siteId = auth.siteId as string;

  const approvedCount = await db.transaction(async (tx) => {
    const updated = await tx
      .update(attendance)
      .set({ approved: true, approvedByUserId: auth.userId, approvedAt: new Date() })
      .where(
        and(
          eq(attendance.siteId, siteId),
          eq(attendance.attendanceDate, date),
          eq(attendance.approved, false),
          isNull(attendance.deletedAt),
        ),
      )
      .returning({ id: attendance.id });

    await writeAudit(tx, {
      siteId,
      actorUserId: auth.userId,
      module: "attendance",
      action: "approve",
      entityType: "attendance_day",
      entityId: null,
      after: { date, approved: updated.length },
      ip: meta.ip,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });
    return updated.length;
  });

  return c.json({ success: true as const, data: { date, approved: approvedCount } }, 200);
});
