import {
  moneySchema,
  monthSchema,
  optionalPaymentModeSchema,
  pastOrTodaySchema,
} from "@construction-erp/shared";
import { z } from "@hono/zod-openapi";
import { nullableText } from "../../common/validation";

export const PAYMENT_STATUSES = ["unpaid", "partial", "paid"] as const;

const personSchema = z.object({ id: z.string().uuid(), name: z.string() });

export const salaryIdParamSchema = z.object({
  id: z
    .string()
    .uuid()
    .openapi({ param: { name: "id", in: "path" } }),
});

// ─── Monthly per-worker view ─────────────────────────────────────────────────────
export const monthQuerySchema = z.object({
  month: monthSchema.openapi({ description: "The month to compute, YYYY-MM." }),
});

export const salaryWorkerRowSchema = z
  .object({
    workerId: z.string().uuid(),
    workerName: z.string(),
    category: z.string().nullable(),
    dailyWage: z.number(),
    overtimeRate: z.number().nullable(),
    presentDays: z.number(),
    halfDays: z.number(),
    payableDays: z.number(),
    overtimeHours: z.number(),
    // Money: total payable (gross), what's been handed over (paid = advances + payments),
    // and what's left (balance = gross − paid). `advances`/`payments` are the breakdown of `paid`.
    gross: z.number(),
    advances: z.number(),
    payments: z.number(),
    paid: z.number(),
    balance: z.number(),
    paymentStatus: z.enum(PAYMENT_STATUSES),
  })
  .openapi("SalaryWorkerRow");

export const salaryMonthSchema = z
  .object({
    month: z.string(),
    totals: z.object({
      workers: z.number(),
      gross: z.number(),
      advances: z.number(),
      payments: z.number(),
      paid: z.number(),
      balance: z.number(),
    }),
    workers: z.array(salaryWorkerRowSchema),
  })
  .openapi("SalaryMonth");

// ─── Per-worker detail (month-switchable) ────────────────────────────────────────
export const workerSalaryParamSchema = z.object({
  workerId: z
    .string()
    .uuid()
    .openapi({ param: { name: "workerId", in: "path" } }),
});

/** One row in the unified money ledger — an advance OR a salary payment. */
export const salaryTransactionSchema = z
  .object({
    id: z.string().uuid(),
    kind: z.enum(["advance", "payment"]),
    date: z.string(),
    amount: z.number(),
    paymentMode: z.string().nullable(),
    note: z.string().nullable(),
    createdBy: personSchema.nullable(),
    createdAt: z.string(),
  })
  .openapi("SalaryTransaction");

export const workerSalaryDetailSchema = z
  .object({
    month: z.string(),
    worker: z.object({
      id: z.string().uuid(),
      name: z.string(),
      category: z.string().nullable(),
      dailyWage: z.number(),
      overtimeRate: z.number().nullable(),
    }),
    summary: salaryWorkerRowSchema,
    transactions: z.array(salaryTransactionSchema),
  })
  .openapi("WorkerSalaryDetail");

// ─── Advances ──────────────────────────────────────────────────────────────────
export const advanceSchema = z
  .object({
    id: z.string().uuid(),
    siteId: z.string().uuid(),
    workerId: z.string().uuid(),
    workerName: z.string().nullable(),
    amount: z.number(),
    advanceDate: z.string(),
    note: z.string().nullable(),
    createdBy: personSchema.nullable(),
    createdAt: z.string(),
  })
  .openapi("WorkerAdvance");

export const listAdvancesQuerySchema = z.object({
  workerId: z.string().uuid().optional(),
  month: monthSchema.optional(),
});

export const createAdvanceBodySchema = z
  .object({
    workerId: z.string().uuid(),
    amount: moneySchema({ allowZero: false }),
    advanceDate: pastOrTodaySchema.optional(),
    note: nullableText(200),
  })
  .openapi("CreateAdvanceRequest");

// ─── Payments ────────────────────────────────────────────────────────────────────
export const paymentSchema = z
  .object({
    id: z.string().uuid(),
    siteId: z.string().uuid(),
    workerId: z.string().uuid(),
    workerName: z.string().nullable(),
    periodMonth: z.string(),
    amount: z.number(),
    paidDate: z.string(),
    paymentMode: z.string().nullable(),
    note: z.string().nullable(),
    createdBy: personSchema.nullable(),
    createdAt: z.string(),
  })
  .openapi("SalaryPayment");

export const listPaymentsQuerySchema = z.object({
  workerId: z.string().uuid().optional(),
  month: monthSchema.optional(),
});

export const createPaymentBodySchema = z
  .object({
    workerId: z.string().uuid(),
    periodMonth: monthSchema,
    amount: moneySchema({ allowZero: false }),
    paidDate: pastOrTodaySchema.optional(),
    paymentMode: optionalPaymentModeSchema.nullable(),
    note: nullableText(200),
  })
  .openapi("CreateSalaryPaymentRequest");

export const deleteResultSchema = z
  .object({ id: z.string().uuid(), deleted: z.boolean() })
  .openapi("DeleteSalaryResult");
