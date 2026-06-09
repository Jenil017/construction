import { attendance, users, workerAdvances, workers } from "@construction-erp/db/schema";
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
  advanceIdParamSchema,
  advanceSchema,
  approveAttendanceBodySchema,
  approveAttendanceResultSchema,
  attendanceSchema,
  createAdvanceBodySchema,
  createWorkerBodySchema,
  deleteResultSchema,
  listAdvancesQuerySchema,
  listAttendanceQuerySchema,
  listWorkersQuerySchema,
  markAttendanceBodySchema,
  markAttendanceResultSchema,
  updateWorkerBodySchema,
  workerDetailSchema,
  workerIdParamSchema,
  workerSchema,
} from "./attendance.schemas";

export const attendanceRoutes = new OpenAPIHono<Env>();

// User-table aliases for the "marked by" / "approved by" / advance-creator joins.
const markedBy = alias(users, "att_marked_by");
const approvedBy = alias(users, "att_approved_by");
const advCreator = alias(users, "adv_creator");

/** Round to 2 decimals (hours / money) to avoid float artifacts. */
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
/** Today as YYYY-MM-DD. */
const today = () => new Date().toISOString().slice(0, 10);

// ─── Workers ───────────────────────────────────────────────────────────────────
interface WorkerRow {
  id: string;
  siteId: string;
  name: string;
  phone: string | null;
  trade: string | null;
  dailyWage: string;
  overtimeRate: string | null;
  notes: string | null;
  createdAt: Date;
}

function serializeWorker(row: WorkerRow) {
  return {
    id: row.id,
    siteId: row.siteId,
    name: row.name,
    phone: row.phone,
    trade: row.trade,
    dailyWage: Number(row.dailyWage),
    overtimeRate: row.overtimeRate != null ? Number(row.overtimeRate) : null,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
  };
}

async function loadWorkerRow(db: DbClient, siteId: string, id: string) {
  const [row] = await db
    .select()
    .from(workers)
    .where(and(eq(workers.id, id), eq(workers.siteId, siteId), isNull(workers.deletedAt)))
    .limit(1);
  return row ?? null;
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
    .select()
    .from(workers)
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

  const created = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(workers)
      .values({
        siteId,
        name: body.name,
        phone: body.phone ?? null,
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
      after: { name: row.name, trade: row.trade },
      ip: meta.ip,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });
    return row;
  });

  return c.json({ success: true as const, data: serializeWorker(created as WorkerRow) }, 201);
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

  const row = await loadWorkerRow(db, siteId, id);
  if (!row) throw new NotFoundError("Worker not found.");

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
        ...serializeWorker(row as WorkerRow),
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
      before: { name: existing.name, trade: existing.trade },
      after: { name: body.name ?? existing.name },
      ip: meta.ip,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });
  });

  const row = await loadWorkerRow(db, siteId, id);
  if (!row) throw new NotFoundError("Worker not found.");
  return c.json({ success: true as const, data: serializeWorker(row as WorkerRow) }, 200);
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

// ─── Attendance ──────────────────────────────────────────────────────────────────
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
    approvedBy: row.approvedById ? { id: row.approvedById, name: row.approvedByName ?? "—" } : null,
    markedBy: row.markedById ? { id: row.markedById, name: row.markedByName ?? "—" } : null,
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

// ─── Advances ────────────────────────────────────────────────────────────────────
interface AdvanceRow {
  id: string;
  siteId: string;
  workerId: string;
  workerName: string | null;
  amount: string;
  advanceDate: string;
  note: string | null;
  settledInRunId: string | null;
  createdById: string;
  createdByName: string | null;
  createdAt: Date;
}

function serializeAdvance(row: AdvanceRow) {
  return {
    id: row.id,
    siteId: row.siteId,
    workerId: row.workerId,
    workerName: row.workerName ?? null,
    amount: Number(row.amount),
    advanceDate: row.advanceDate,
    note: row.note,
    settled: row.settledInRunId != null,
    createdBy: row.createdById ? { id: row.createdById, name: row.createdByName ?? "—" } : null,
    createdAt: row.createdAt.toISOString(),
  };
}

const advanceColumns = {
  id: workerAdvances.id,
  siteId: workerAdvances.siteId,
  workerId: workerAdvances.workerId,
  workerName: workers.name,
  amount: workerAdvances.amount,
  advanceDate: workerAdvances.advanceDate,
  note: workerAdvances.note,
  settledInRunId: workerAdvances.settledInRunId,
  createdById: workerAdvances.createdByUserId,
  createdByName: advCreator.name,
  createdAt: workerAdvances.createdAt,
};

const listAdvancesRoute = createRoute({
  method: "get",
  path: "/attendance/advances",
  tags: ["Attendance"],
  summary: "List worker advances for the active site",
  description: "Permission: attendance:view. Filter by worker and settled status.",
  middleware: [requireAuth, requireSiteContext, requirePermission("attendance", "view")] as const,
  request: { query: listAdvancesQuerySchema },
  responses: {
    200: {
      description: "A page of advances",
      content: { "application/json": { schema: apiSuccessSchema(z.array(advanceSchema)) } },
    },
    403: {
      description: "Permission denied",
      content: { "application/json": { schema: apiErrorSchema } },
    },
  },
});

attendanceRoutes.openapi(listAdvancesRoute, async (c) => {
  const { page, pageSize, workerId, settled } = c.req.valid("query");
  const auth = c.get("auth");
  const db = getDb(c);
  const siteId = auth.siteId as string;

  const filters = [eq(workerAdvances.siteId, siteId), isNull(workerAdvances.deletedAt)];
  if (workerId) filters.push(eq(workerAdvances.workerId, workerId));
  if (settled === "true") filters.push(sql`${workerAdvances.settledInRunId} IS NOT NULL`);
  if (settled === "false") filters.push(isNull(workerAdvances.settledInRunId));
  const whereClause = and(...filters);

  const [totalRow] = await db.select({ value: count() }).from(workerAdvances).where(whereClause);
  const total = totalRow?.value ?? 0;

  const rows = await db
    .select(advanceColumns)
    .from(workerAdvances)
    .innerJoin(workers, eq(workers.id, workerAdvances.workerId))
    .leftJoin(advCreator, eq(advCreator.id, workerAdvances.createdByUserId))
    .where(whereClause)
    .orderBy(desc(workerAdvances.advanceDate), desc(workerAdvances.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const data = rows.map((r) => serializeAdvance(r as AdvanceRow));
  return c.json(
    { success: true as const, data, meta: buildPaginationMeta(page, pageSize, total) },
    200,
  );
});

const createAdvanceRoute = createRoute({
  method: "post",
  path: "/attendance/advances",
  tags: ["Attendance"],
  summary: "Record a worker advance",
  description: "Permission: attendance:create. Deducted from net pay at the next salary run.",
  middleware: [requireAuth, requireSiteContext, requirePermission("attendance", "create")] as const,
  request: {
    body: { content: { "application/json": { schema: createAdvanceBodySchema } }, required: true },
  },
  responses: {
    201: {
      description: "Created",
      content: { "application/json": { schema: apiSuccessSchema(advanceSchema) } },
    },
    403: {
      description: "Permission denied",
      content: { "application/json": { schema: apiErrorSchema } },
    },
    404: {
      description: "Worker not found",
      content: { "application/json": { schema: apiErrorSchema } },
    },
  },
});

attendanceRoutes.openapi(createAdvanceRoute, async (c) => {
  const body = c.req.valid("json");
  const auth = c.get("auth");
  const db = getDb(c);
  const meta = getRequestMeta(c);
  const siteId = auth.siteId as string;

  const worker = await loadWorkerRow(db, siteId, body.workerId);
  if (!worker) throw new NotFoundError("Worker not found.");

  const created = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(workerAdvances)
      .values({
        siteId,
        workerId: body.workerId,
        amount: String(round2(body.amount)),
        advanceDate: body.advanceDate ?? today(),
        note: body.note ?? null,
        createdByUserId: auth.userId,
      })
      .returning();
    if (!row) throw new ConflictError("Could not record the advance. Please try again.");
    await writeAudit(tx, {
      siteId,
      actorUserId: auth.userId,
      module: "attendance",
      action: "create",
      entityType: "worker_advance",
      entityId: row.id,
      // No amount in the audit trail (sensitive payment data — see docs/architecter.md).
      after: { workerId: body.workerId, advanceDate: row.advanceDate },
      ip: meta.ip,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });
    return row;
  });

  return c.json(
    {
      success: true as const,
      data: serializeAdvance({
        ...(created as unknown as AdvanceRow),
        workerName: worker.name,
        createdById: auth.userId,
        createdByName: auth.name,
      }),
    },
    201,
  );
});

const deleteAdvanceRoute = createRoute({
  method: "delete",
  path: "/attendance/advances/{id}",
  tags: ["Attendance"],
  summary: "Delete an unsettled advance",
  description:
    "Permission: attendance:delete. A settled advance (already in a salary run) cannot be deleted.",
  middleware: [requireAuth, requireSiteContext, requirePermission("attendance", "delete")] as const,
  request: { params: advanceIdParamSchema },
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
    409: {
      description: "Already settled",
      content: { "application/json": { schema: apiErrorSchema } },
    },
  },
});

attendanceRoutes.openapi(deleteAdvanceRoute, async (c) => {
  const { id } = c.req.valid("param");
  const auth = c.get("auth");
  const db = getDb(c);
  const meta = getRequestMeta(c);
  const siteId = auth.siteId as string;

  const [existing] = await db
    .select()
    .from(workerAdvances)
    .where(
      and(
        eq(workerAdvances.id, id),
        eq(workerAdvances.siteId, siteId),
        isNull(workerAdvances.deletedAt),
      ),
    )
    .limit(1);
  if (!existing) throw new NotFoundError("Advance not found.");
  if (existing.settledInRunId) {
    throw new ConflictError(
      "This advance was already settled in a salary run and cannot be deleted.",
    );
  }

  await db.transaction(async (tx) => {
    await tx.update(workerAdvances).set({ deletedAt: new Date() }).where(eq(workerAdvances.id, id));
    await writeAudit(tx, {
      siteId,
      actorUserId: auth.userId,
      module: "attendance",
      action: "delete",
      entityType: "worker_advance",
      entityId: id,
      after: { workerId: existing.workerId },
      ip: meta.ip,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });
  });

  return c.json({ success: true as const, data: { id, deleted: true } }, 200);
});
