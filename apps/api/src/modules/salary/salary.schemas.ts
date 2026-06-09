import { paginationQuerySchema } from "@construction-erp/shared";
import { z } from "@hono/zod-openapi";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const PAYMENT_STATUSES = ["unpaid", "partial", "paid"] as const;

const personSchema = z.object({ id: z.string().uuid(), name: z.string() });

export const runIdParamSchema = z.object({
  id: z
    .string()
    .uuid()
    .openapi({ param: { name: "id", in: "path" } }),
});

export const runItemParamSchema = z.object({
  id: z
    .string()
    .uuid()
    .openapi({ param: { name: "id", in: "path" } }),
  itemId: z
    .string()
    .uuid()
    .openapi({ param: { name: "itemId", in: "path" } }),
});

export const salaryRunSchema = z
  .object({
    id: z.string().uuid(),
    siteId: z.string().uuid(),
    periodStart: z.string(),
    periodEnd: z.string(),
    totalWorkers: z.number(),
    totalGross: z.number(),
    totalAdvances: z.number(),
    totalNet: z.number(),
    generatedBy: personSchema.nullable(),
    createdAt: z.string(),
  })
  .openapi("SalaryRun");

export const salaryRunItemSchema = z
  .object({
    id: z.string().uuid(),
    runId: z.string().uuid(),
    workerId: z.string().uuid(),
    workerName: z.string(),
    presentDays: z.number(),
    halfDays: z.number(),
    payableDays: z.number(),
    overtimeHours: z.number(),
    dailyWage: z.number(),
    overtimeRate: z.number().nullable(),
    gross: z.number(),
    advanceDeducted: z.number(),
    netPayable: z.number(),
    amountPaid: z.number(),
    paymentStatus: z.enum(PAYMENT_STATUSES),
    paymentMode: z.string().nullable(),
    paidAt: z.string().nullable(),
  })
  .openapi("SalaryRunItem");

export const salaryRunDetailSchema = salaryRunSchema
  .extend({ items: z.array(salaryRunItemSchema) })
  .openapi("SalaryRunDetail");

export const listRunsQuerySchema = paginationQuerySchema;

export const generateRunBodySchema = z
  .object({
    periodStart: z.string().regex(DATE_RE),
    periodEnd: z.string().regex(DATE_RE),
  })
  .openapi("GenerateSalaryRunRequest");

export const payItemBodySchema = z
  .object({
    /** Cumulative amount paid for this payslip (0 → unpaid, ≥ net → paid). */
    amountPaid: z.number().nonnegative(),
    paymentMode: z.string().max(40).nullable().optional(),
    paidAt: z.string().regex(DATE_RE).optional(),
  })
  .openapi("PaySalaryItemRequest");

export const deleteRunResultSchema = z
  .object({ id: z.string().uuid(), deleted: z.boolean() })
  .openapi("DeleteSalaryRunResult");
