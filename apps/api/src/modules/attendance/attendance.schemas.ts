import { paginationQuerySchema } from "@construction-erp/shared";
import { z } from "@hono/zod-openapi";

/** Attendance status for a worker on a day. */
export const ATTENDANCE_STATUSES = ["present", "absent", "half_day"] as const;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const personSchema = z.object({ id: z.string().uuid(), name: z.string() });

// ─── Workers ───────────────────────────────────────────────────────────────────
export const workerIdParamSchema = z.object({
  id: z
    .string()
    .uuid()
    .openapi({ param: { name: "id", in: "path" } }),
});

export const workerSchema = z
  .object({
    id: z.string().uuid(),
    siteId: z.string().uuid(),
    name: z.string(),
    phone: z.string().nullable(),
    trade: z.string().nullable(),
    dailyWage: z.number(),
    overtimeRate: z.number().nullable(),
    notes: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi("Worker");

const workerFields = {
  phone: z.string().max(20).nullable().optional(),
  trade: z.string().max(80).nullable().optional(),
  overtimeRate: z.number().nonnegative().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
};

export const createWorkerBodySchema = z
  .object({
    name: z.string().min(1).max(160),
    dailyWage: z.number().nonnegative(),
    ...workerFields,
  })
  .openapi("CreateWorkerRequest");

export const updateWorkerBodySchema = z
  .object({
    name: z.string().min(1).max(160).optional(),
    dailyWage: z.number().nonnegative().optional(),
    ...workerFields,
  })
  .openapi("UpdateWorkerRequest");

export const listWorkersQuerySchema = paginationQuerySchema.extend({
  search: z.string().optional().openapi({ description: "Match name, phone, or trade." }),
});

// ─── Attendance ──────────────────────────────────────────────────────────────────
export const attendanceSchema = z
  .object({
    id: z.string().uuid(),
    siteId: z.string().uuid(),
    workerId: z.string().uuid(),
    workerName: z.string().nullable(),
    attendanceDate: z.string(),
    status: z.enum(ATTENDANCE_STATUSES),
    overtimeHours: z.number(),
    note: z.string().nullable(),
    approved: z.boolean(),
    approvedBy: personSchema.nullable(),
    markedBy: personSchema.nullable(),
    createdAt: z.string(),
  })
  .openapi("Attendance");

export const listAttendanceQuerySchema = paginationQuerySchema.extend({
  date: z.string().regex(DATE_RE).optional().openapi({ description: "A single day (YYYY-MM-DD)." }),
  dateFrom: z.string().regex(DATE_RE).optional(),
  dateTo: z.string().regex(DATE_RE).optional(),
  workerId: z.string().uuid().optional(),
  status: z.enum(ATTENDANCE_STATUSES).optional(),
  approved: z.enum(["true", "false"]).optional(),
});

const markEntrySchema = z.object({
  workerId: z.string().uuid(),
  status: z.enum(ATTENDANCE_STATUSES),
  overtimeHours: z.number().nonnegative().max(24).optional(),
  note: z.string().max(200).nullable().optional(),
});

export const markAttendanceBodySchema = z
  .object({
    date: z.string().regex(DATE_RE),
    entries: z.array(markEntrySchema).min(1).max(500),
  })
  .openapi("MarkAttendanceRequest");

export const markAttendanceResultSchema = z
  .object({
    date: z.string(),
    saved: z.array(attendanceSchema),
    skippedApproved: z.number(),
  })
  .openapi("MarkAttendanceResult");

export const approveAttendanceBodySchema = z
  .object({ date: z.string().regex(DATE_RE) })
  .openapi("ApproveAttendanceRequest");

export const approveAttendanceResultSchema = z
  .object({ date: z.string(), approved: z.number() })
  .openapi("ApproveAttendanceResult");

// ─── Advances ────────────────────────────────────────────────────────────────────
export const advanceIdParamSchema = z.object({
  id: z
    .string()
    .uuid()
    .openapi({ param: { name: "id", in: "path" } }),
});

export const advanceSchema = z
  .object({
    id: z.string().uuid(),
    siteId: z.string().uuid(),
    workerId: z.string().uuid(),
    workerName: z.string().nullable(),
    amount: z.number(),
    advanceDate: z.string(),
    note: z.string().nullable(),
    settled: z.boolean(),
    createdBy: personSchema.nullable(),
    createdAt: z.string(),
  })
  .openapi("WorkerAdvance");

export const listAdvancesQuerySchema = paginationQuerySchema.extend({
  workerId: z.string().uuid().optional(),
  settled: z.enum(["true", "false"]).optional(),
});

export const createAdvanceBodySchema = z
  .object({
    workerId: z.string().uuid(),
    amount: z.number().positive(),
    advanceDate: z.string().regex(DATE_RE).optional(),
    note: z.string().max(200).nullable().optional(),
  })
  .openapi("CreateAdvanceRequest");

export const deleteResultSchema = z
  .object({ id: z.string().uuid(), deleted: z.boolean() })
  .openapi("DeleteResult");

// Worker detail bundles recent attendance + outstanding advances for the drawer.
export const workerDetailSchema = workerSchema
  .extend({
    recentAttendance: z.array(attendanceSchema),
    outstandingAdvances: z.number(),
  })
  .openapi("WorkerDetail");
