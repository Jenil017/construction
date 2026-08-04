import {
  dateSchema,
  moneySchema,
  paginationQuerySchema,
  pastOrTodaySchema,
  searchSchema,
} from "@construction-erp/shared";
import { z } from "@hono/zod-openapi";
import { nullablePhone, nullableText, requiredText } from "../../common/validation";

/** Attendance status for a worker on a day. */
export const ATTENDANCE_STATUSES = ["present", "absent", "half_day"] as const;

const personSchema = z.object({ id: z.string().uuid(), name: z.string() });

// ─── Worker categories ─────────────────────────────────────────────────────────
export const workerCategorySchema = z
  .object({ id: z.string().uuid(), name: z.string() })
  .openapi("WorkerCategory");

export const createWorkerCategoryBodySchema = z
  .object({ name: requiredText(80) })
  .openapi("CreateWorkerCategoryRequest");

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
    categoryId: z.string().uuid().nullable(),
    /** Category name (falls back to the legacy free-text trade). */
    category: z.string().nullable(),
    trade: z.string().nullable(),
    dailyWage: z.number(),
    overtimeRate: z.number().nullable(),
    notes: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi("Worker");

const workerFields = {
  phone: nullablePhone,
  categoryId: z.string().uuid().nullable().optional(),
  trade: nullableText(80),
  overtimeRate: moneySchema().nullable().optional(),
  notes: nullableText(2000),
};

export const createWorkerBodySchema = z
  .object({
    name: requiredText(160),
    dailyWage: moneySchema(),
    ...workerFields,
  })
  .openapi("CreateWorkerRequest");

export const updateWorkerBodySchema = z
  .object({
    name: requiredText(160).optional(),
    dailyWage: moneySchema().optional(),
    ...workerFields,
  })
  .openapi("UpdateWorkerRequest");

export const listWorkersQuerySchema = paginationQuerySchema.extend({
  search: searchSchema.openapi({ description: "Match name, phone, or category." }),
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

export const listAttendanceQuerySchema = paginationQuerySchema
  .extend({
    date: dateSchema.optional().openapi({ description: "A single day (YYYY-MM-DD)." }),
    dateFrom: dateSchema.optional(),
    dateTo: dateSchema.optional(),
    workerId: z.string().uuid().optional(),
    status: z.enum(ATTENDANCE_STATUSES).optional(),
    approved: z.enum(["true", "false"]).optional(),
  })
  .refine((q) => !q.dateFrom || !q.dateTo || q.dateFrom <= q.dateTo, {
    message: "The start date must be before the end date.",
    path: ["dateTo"],
  });

const markEntrySchema = z.object({
  workerId: z.string().uuid(),
  status: z.enum(ATTENDANCE_STATUSES),
  overtimeHours: z.number().finite().nonnegative().max(24).optional(),
  note: nullableText(200),
});

export const markAttendanceBodySchema = z
  .object({
    date: pastOrTodaySchema,
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
  .object({ date: pastOrTodaySchema })
  .openapi("ApproveAttendanceRequest");

export const approveAttendanceResultSchema = z
  .object({ date: z.string(), approved: z.number() })
  .openapi("ApproveAttendanceResult");

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
