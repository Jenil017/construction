import {
  dateSchema,
  moneySchema,
  optionalPaymentModeSchema,
  optionalText,
  paginationQuerySchema,
  pastOrTodaySchema,
  searchSchema,
} from "@construction-erp/shared";
import { z } from "@hono/zod-openapi";
import { nullableText, requiredText } from "../../common/validation";

export const EXPENSE_STATUSES = ["pending", "approved", "rejected"] as const;

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

export const listExpensesQuerySchema = paginationQuerySchema
  .extend({
    search: searchSchema.openapi({ description: "Match description, paidTo, or category." }),
    category: optionalText(80),
    status: z.enum(EXPENSE_STATUSES).optional(),
    pettyCash: z.enum(["true", "false"]).optional(),
    dateFrom: dateSchema.optional(),
    dateTo: dateSchema.optional(),
  })
  .refine((q) => !q.dateFrom || !q.dateTo || q.dateFrom <= q.dateTo, {
    message: "The start date must be before the end date.",
    path: ["dateTo"],
  });

const expenseFields = {
  description: nullableText(300),
  paidTo: nullableText(160),
  paymentMode: optionalPaymentModeSchema.nullable(),
  isPettyCash: z.boolean().optional(),
};

export const createExpenseBodySchema = z
  .object({
    expenseDate: pastOrTodaySchema.optional(),
    category: requiredText(80),
    amount: moneySchema({ allowZero: false }),
    ...expenseFields,
  })
  .openapi("CreateExpenseRequest");

export const updateExpenseBodySchema = z
  .object({
    expenseDate: pastOrTodaySchema.optional(),
    category: requiredText(80).optional(),
    amount: moneySchema({ allowZero: false }).optional(),
    ...expenseFields,
  })
  .openapi("UpdateExpenseRequest");

export const setExpenseStatusBodySchema = z
  .object({ status: z.enum(["approved", "rejected"]) })
  .openapi("SetExpenseStatusRequest");

export const deleteExpenseResultSchema = z
  .object({ id: z.string().uuid(), deleted: z.boolean() })
  .openapi("DeleteExpenseResult");
