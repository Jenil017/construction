import { paginationQuerySchema } from "@construction-erp/shared";
import { z } from "@hono/zod-openapi";

export const EXPENSE_STATUSES = ["pending", "approved", "rejected"] as const;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const personSchema = z.object({ id: z.string().uuid(), name: z.string() });

export const expenseIdParamSchema = z.object({
  id: z
    .string()
    .uuid()
    .openapi({ param: { name: "id", in: "path" } }),
});

export const expenseSchema = z
  .object({
    id: z.string().uuid(),
    siteId: z.string().uuid(),
    expenseDate: z.string(),
    category: z.string(),
    amount: z.number(),
    description: z.string().nullable(),
    paidTo: z.string().nullable(),
    paymentMode: z.string().nullable(),
    isPettyCash: z.boolean(),
    status: z.enum(EXPENSE_STATUSES),
    approvedBy: personSchema.nullable(),
    createdBy: personSchema.nullable(),
    createdAt: z.string(),
  })
  .openapi("Expense");

export const listExpensesQuerySchema = paginationQuerySchema.extend({
  search: z.string().optional().openapi({ description: "Match description, paidTo, or category." }),
  category: z.string().optional(),
  status: z.enum(EXPENSE_STATUSES).optional(),
  pettyCash: z.enum(["true", "false"]).optional(),
  dateFrom: z.string().regex(DATE_RE).optional(),
  dateTo: z.string().regex(DATE_RE).optional(),
});

const expenseFields = {
  description: z.string().max(300).nullable().optional(),
  paidTo: z.string().max(160).nullable().optional(),
  paymentMode: z.string().max(40).nullable().optional(),
  isPettyCash: z.boolean().optional(),
};

export const createExpenseBodySchema = z
  .object({
    expenseDate: z.string().regex(DATE_RE).optional(),
    category: z.string().min(1).max(80),
    amount: z.number().positive(),
    ...expenseFields,
  })
  .openapi("CreateExpenseRequest");

export const updateExpenseBodySchema = z
  .object({
    expenseDate: z.string().regex(DATE_RE).optional(),
    category: z.string().min(1).max(80).optional(),
    amount: z.number().positive().optional(),
    ...expenseFields,
  })
  .openapi("UpdateExpenseRequest");

export const setExpenseStatusBodySchema = z
  .object({ status: z.enum(["approved", "rejected"]) })
  .openapi("SetExpenseStatusRequest");

export const deleteExpenseResultSchema = z
  .object({ id: z.string().uuid(), deleted: z.boolean() })
  .openapi("DeleteExpenseResult");
