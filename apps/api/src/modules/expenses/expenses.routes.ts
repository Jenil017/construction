import { expenses, users } from "@construction-erp/db/schema";
import { apiErrorSchema, apiSuccessSchema, buildPaginationMeta } from "@construction-erp/shared";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { type SQL, and, asc, count, desc, eq, gte, ilike, isNull, lte, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { writeAudit } from "../../common/audit";
import { type DbClient, getDb } from "../../common/db";
import { ConflictError, NotFoundError } from "../../common/errors";
import { getRequestMeta } from "../../common/http/request-meta";
import { requireAuth } from "../../common/middleware/require-auth";
import { requirePermission } from "../../common/middleware/require-permission";
import { requireSiteContext } from "../../common/middleware/require-site-context";
import type { Env } from "../../env";
import {
  type EXPENSE_STATUSES,
  createExpenseBodySchema,
  deleteExpenseResultSchema,
  expenseIdParamSchema,
  expenseSchema,
  listExpensesQuerySchema,
  setExpenseStatusBodySchema,
  updateExpenseBodySchema,
} from "./expenses.schemas";

export const expenseRoutes = new OpenAPIHono<Env>();

const creator = alias(users, "exp_creator");
const approver = alias(users, "exp_approver");

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const today = () => new Date().toISOString().slice(0, 10);

interface ExpenseRow {
  id: string;
  siteId: string;
  expenseDate: string;
  category: string;
  amount: string;
  description: string | null;
  paidTo: string | null;
  paymentMode: string | null;
  isPettyCash: boolean;
  status: string;
  approvedById: string | null;
  approvedByName: string | null;
  createdById: string;
  createdByName: string | null;
  createdAt: Date;
}

const expenseColumns = {
  id: expenses.id,
  siteId: expenses.siteId,
  expenseDate: expenses.expenseDate,
  category: expenses.category,
  amount: expenses.amount,
  description: expenses.description,
  paidTo: expenses.paidTo,
  paymentMode: expenses.paymentMode,
  isPettyCash: expenses.isPettyCash,
  status: expenses.status,
  approvedById: expenses.approvedByUserId,
  approvedByName: approver.name,
  createdById: expenses.createdByUserId,
  createdByName: creator.name,
  createdAt: expenses.createdAt,
};

function serializeExpense(row: ExpenseRow) {
  return {
    id: row.id,
    siteId: row.siteId,
    expenseDate: row.expenseDate,
    category: row.category,
    amount: Number(row.amount),
    description: row.description,
    paidTo: row.paidTo,
    paymentMode: row.paymentMode,
    isPettyCash: row.isPettyCash,
    status: row.status as (typeof EXPENSE_STATUSES)[number],
    approvedBy: row.approvedById ? { id: row.approvedById, name: row.approvedByName ?? "—" } : null,
    createdBy: row.createdById ? { id: row.createdById, name: row.createdByName ?? "—" } : null,
    createdAt: row.createdAt.toISOString(),
  };
}

async function loadExpenseJoined(db: DbClient, filters: SQL[]) {
  const [row] = await db
    .select(expenseColumns)
    .from(expenses)
    .leftJoin(creator, eq(creator.id, expenses.createdByUserId))
    .leftJoin(approver, eq(approver.id, expenses.approvedByUserId))
    .where(and(...filters))
    .limit(1);
  return row ? serializeExpense(row as ExpenseRow) : null;
}

async function loadRawExpense(db: DbClient, siteId: string, id: string) {
  const [row] = await db
    .select()
    .from(expenses)
    .where(and(eq(expenses.id, id), eq(expenses.siteId, siteId), isNull(expenses.deletedAt)))
    .limit(1);
  return row ?? null;
}

// ─── List ────────────────────────────────────────────────────────────────────────
const listRoute = createRoute({
  method: "get",
  path: "/expenses",
  tags: ["Expenses"],
  summary: "List expenses for the active site",
  description: "Permission: expenses:view. Filter by search, category, status, petty cash, dates.",
  middleware: [requireAuth, requireSiteContext, requirePermission("expenses", "view")] as const,
  request: { query: listExpensesQuerySchema },
  responses: {
    200: {
      description: "A page of expenses",
      content: { "application/json": { schema: apiSuccessSchema(z.array(expenseSchema)) } },
    },
    403: {
      description: "Permission denied",
      content: { "application/json": { schema: apiErrorSchema } },
    },
  },
});

expenseRoutes.openapi(listRoute, async (c) => {
  const { page, pageSize, sortOrder, search, category, status, pettyCash, dateFrom, dateTo } =
    c.req.valid("query");
  const auth = c.get("auth");
  const db = getDb(c);
  const siteId = auth.siteId as string;

  const filters = [eq(expenses.siteId, siteId), isNull(expenses.deletedAt)];
  if (category) filters.push(eq(expenses.category, category));
  if (status) filters.push(eq(expenses.status, status));
  if (pettyCash) filters.push(eq(expenses.isPettyCash, pettyCash === "true"));
  if (dateFrom) filters.push(gte(expenses.expenseDate, dateFrom));
  if (dateTo) filters.push(lte(expenses.expenseDate, dateTo));
  if (search) {
    const pattern = `%${search}%`;
    const term = or(
      ilike(expenses.description, pattern),
      ilike(expenses.paidTo, pattern),
      ilike(expenses.category, pattern),
    );
    if (term) filters.push(term);
  }
  const whereClause = and(...filters);

  const [totalRow] = await db.select({ value: count() }).from(expenses).where(whereClause);
  const total = totalRow?.value ?? 0;

  const dir = sortOrder === "asc" ? asc : desc;
  const rows = await db
    .select(expenseColumns)
    .from(expenses)
    .leftJoin(creator, eq(creator.id, expenses.createdByUserId))
    .leftJoin(approver, eq(approver.id, expenses.approvedByUserId))
    .where(whereClause)
    .orderBy(dir(expenses.expenseDate), dir(expenses.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const data = rows.map((r) => serializeExpense(r as ExpenseRow));
  return c.json(
    { success: true as const, data, meta: buildPaginationMeta(page, pageSize, total) },
    200,
  );
});

// ─── Create ──────────────────────────────────────────────────────────────────────
const createRouteDef = createRoute({
  method: "post",
  path: "/expenses",
  tags: ["Expenses"],
  summary: "Record an expense",
  description: "Permission: expenses:create. Starts in 'pending' until approved.",
  middleware: [requireAuth, requireSiteContext, requirePermission("expenses", "create")] as const,
  request: {
    body: { content: { "application/json": { schema: createExpenseBodySchema } }, required: true },
  },
  responses: {
    201: {
      description: "Created",
      content: { "application/json": { schema: apiSuccessSchema(expenseSchema) } },
    },
    403: {
      description: "Permission denied",
      content: { "application/json": { schema: apiErrorSchema } },
    },
  },
});

expenseRoutes.openapi(createRouteDef, async (c) => {
  const body = c.req.valid("json");
  const auth = c.get("auth");
  const db = getDb(c);
  const meta = getRequestMeta(c);
  const siteId = auth.siteId as string;

  const created = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(expenses)
      .values({
        siteId,
        expenseDate: body.expenseDate ?? today(),
        category: body.category,
        amount: String(round2(body.amount)),
        description: body.description ?? null,
        paidTo: body.paidTo ?? null,
        paymentMode: body.paymentMode ?? null,
        isPettyCash: body.isPettyCash ?? false,
        createdByUserId: auth.userId,
      })
      .returning();
    if (!row) throw new ConflictError("Could not record the expense. Please try again.");
    await writeAudit(tx, {
      siteId,
      actorUserId: auth.userId,
      module: "expenses",
      action: "create",
      entityType: "expense",
      entityId: row.id,
      // No amount/paidTo in the audit trail (sensitive payment data).
      after: { category: row.category, date: row.expenseDate, status: row.status },
      ip: meta.ip,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });
    return row.id;
  });

  const data = await loadExpenseJoined(db, [eq(expenses.id, created)]);
  if (!data) throw new NotFoundError("Expense not found.");
  return c.json({ success: true as const, data }, 201);
});

// ─── Get ─────────────────────────────────────────────────────────────────────────
const getRouteDef = createRoute({
  method: "get",
  path: "/expenses/{id}",
  tags: ["Expenses"],
  summary: "Get an expense",
  description: "Permission: expenses:view.",
  middleware: [requireAuth, requireSiteContext, requirePermission("expenses", "view")] as const,
  request: { params: expenseIdParamSchema },
  responses: {
    200: {
      description: "The expense",
      content: { "application/json": { schema: apiSuccessSchema(expenseSchema) } },
    },
    403: {
      description: "Permission denied",
      content: { "application/json": { schema: apiErrorSchema } },
    },
    404: { description: "Not found", content: { "application/json": { schema: apiErrorSchema } } },
  },
});

expenseRoutes.openapi(getRouteDef, async (c) => {
  const { id } = c.req.valid("param");
  const auth = c.get("auth");
  const db = getDb(c);
  const siteId = auth.siteId as string;
  const data = await loadExpenseJoined(db, [
    eq(expenses.id, id),
    eq(expenses.siteId, siteId),
    isNull(expenses.deletedAt),
  ]);
  if (!data) throw new NotFoundError("Expense not found.");
  return c.json({ success: true as const, data }, 200);
});

// ─── Update (pending only) ───────────────────────────────────────────────────────
const updateRouteDef = createRoute({
  method: "patch",
  path: "/expenses/{id}",
  tags: ["Expenses"],
  summary: "Update a pending expense",
  description: "Permission: expenses:update. Approved/rejected expenses are locked.",
  middleware: [requireAuth, requireSiteContext, requirePermission("expenses", "update")] as const,
  request: {
    params: expenseIdParamSchema,
    body: { content: { "application/json": { schema: updateExpenseBodySchema } }, required: true },
  },
  responses: {
    200: {
      description: "Updated",
      content: { "application/json": { schema: apiSuccessSchema(expenseSchema) } },
    },
    403: {
      description: "Permission denied",
      content: { "application/json": { schema: apiErrorSchema } },
    },
    404: { description: "Not found", content: { "application/json": { schema: apiErrorSchema } } },
    409: {
      description: "Locked (not pending)",
      content: { "application/json": { schema: apiErrorSchema } },
    },
  },
});

expenseRoutes.openapi(updateRouteDef, async (c) => {
  const { id } = c.req.valid("param");
  const body = c.req.valid("json");
  const auth = c.get("auth");
  const db = getDb(c);
  const meta = getRequestMeta(c);
  const siteId = auth.siteId as string;

  const existing = await loadRawExpense(db, siteId, id);
  if (!existing) throw new NotFoundError("Expense not found.");
  if (existing.status !== "pending") {
    throw new ConflictError("Only pending expenses can be edited.");
  }

  const updates: Record<string, unknown> = {};
  if (body.expenseDate !== undefined) updates.expenseDate = body.expenseDate;
  if (body.category !== undefined) updates.category = body.category;
  if (body.amount !== undefined) updates.amount = String(round2(body.amount));
  if (body.description !== undefined) updates.description = body.description;
  if (body.paidTo !== undefined) updates.paidTo = body.paidTo;
  if (body.paymentMode !== undefined) updates.paymentMode = body.paymentMode;
  if (body.isPettyCash !== undefined) updates.isPettyCash = body.isPettyCash;

  await db.transaction(async (tx) => {
    if (Object.keys(updates).length > 0) {
      await tx.update(expenses).set(updates).where(eq(expenses.id, id));
    }
    await writeAudit(tx, {
      siteId,
      actorUserId: auth.userId,
      module: "expenses",
      action: "update",
      entityType: "expense",
      entityId: id,
      after: { category: body.category ?? existing.category },
      ip: meta.ip,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });
  });

  const data = await loadExpenseJoined(db, [eq(expenses.id, id)]);
  if (!data) throw new NotFoundError("Expense not found.");
  return c.json({ success: true as const, data }, 200);
});

// ─── Approve / reject ──────────────────────────────────────────────────────────────
const setStatusRoute = createRoute({
  method: "post",
  path: "/expenses/{id}/status",
  tags: ["Expenses"],
  summary: "Approve or reject an expense",
  description: "Permission: expenses:approve.",
  middleware: [requireAuth, requireSiteContext, requirePermission("expenses", "approve")] as const,
  request: {
    params: expenseIdParamSchema,
    body: {
      content: { "application/json": { schema: setExpenseStatusBodySchema } },
      required: true,
    },
  },
  responses: {
    200: {
      description: "Status set",
      content: { "application/json": { schema: apiSuccessSchema(expenseSchema) } },
    },
    403: {
      description: "Permission denied",
      content: { "application/json": { schema: apiErrorSchema } },
    },
    404: { description: "Not found", content: { "application/json": { schema: apiErrorSchema } } },
  },
});

expenseRoutes.openapi(setStatusRoute, async (c) => {
  const { id } = c.req.valid("param");
  const { status } = c.req.valid("json");
  const auth = c.get("auth");
  const db = getDb(c);
  const meta = getRequestMeta(c);
  const siteId = auth.siteId as string;

  const existing = await loadRawExpense(db, siteId, id);
  if (!existing) throw new NotFoundError("Expense not found.");

  await db.transaction(async (tx) => {
    await tx
      .update(expenses)
      .set({ status, approvedByUserId: auth.userId, approvedAt: new Date() })
      .where(eq(expenses.id, id));
    await writeAudit(tx, {
      siteId,
      actorUserId: auth.userId,
      module: "expenses",
      action: "approve",
      entityType: "expense",
      entityId: id,
      before: { status: existing.status },
      after: { status },
      ip: meta.ip,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });
  });

  const data = await loadExpenseJoined(db, [eq(expenses.id, id)]);
  if (!data) throw new NotFoundError("Expense not found.");
  return c.json({ success: true as const, data }, 200);
});

// ─── Delete ────────────────────────────────────────────────────────────────────────
const deleteRouteDef = createRoute({
  method: "delete",
  path: "/expenses/{id}",
  tags: ["Expenses"],
  summary: "Soft-delete an expense",
  description: "Permission: expenses:delete.",
  middleware: [requireAuth, requireSiteContext, requirePermission("expenses", "delete")] as const,
  request: { params: expenseIdParamSchema },
  responses: {
    200: {
      description: "Deleted",
      content: { "application/json": { schema: apiSuccessSchema(deleteExpenseResultSchema) } },
    },
    403: {
      description: "Permission denied",
      content: { "application/json": { schema: apiErrorSchema } },
    },
    404: { description: "Not found", content: { "application/json": { schema: apiErrorSchema } } },
  },
});

expenseRoutes.openapi(deleteRouteDef, async (c) => {
  const { id } = c.req.valid("param");
  const auth = c.get("auth");
  const db = getDb(c);
  const meta = getRequestMeta(c);
  const siteId = auth.siteId as string;

  const existing = await loadRawExpense(db, siteId, id);
  if (!existing) throw new NotFoundError("Expense not found.");

  await db.transaction(async (tx) => {
    await tx.update(expenses).set({ deletedAt: new Date() }).where(eq(expenses.id, id));
    await writeAudit(tx, {
      siteId,
      actorUserId: auth.userId,
      module: "expenses",
      action: "delete",
      entityType: "expense",
      entityId: id,
      before: { category: existing.category, status: existing.status },
      ip: meta.ip,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });
  });

  return c.json({ success: true as const, data: { id, deleted: true } }, 200);
});
