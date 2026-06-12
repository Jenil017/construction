import {
  attendance,
  salaryPayments,
  users,
  workerAdvances,
  workerCategories,
  workers,
} from "@construction-erp/db/schema";
import { apiErrorSchema, apiSuccessSchema } from "@construction-erp/shared";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { and, asc, desc, eq, gte, isNull, lte } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { writeAudit } from "../../common/audit";
import { type DbClient, getDb } from "../../common/db";
import { ConflictError, NotFoundError } from "../../common/errors";
import { getRequestMeta } from "../../common/http/request-meta";
import { idempotency } from "../../common/idempotency";
import { requireAuth } from "../../common/middleware/require-auth";
import { requirePermission } from "../../common/middleware/require-permission";
import { requireSiteContext } from "../../common/middleware/require-site-context";
import type { Env } from "../../env";
import {
  type PAYMENT_STATUSES,
  advanceSchema,
  createAdvanceBodySchema,
  createPaymentBodySchema,
  deleteResultSchema,
  listAdvancesQuerySchema,
  listPaymentsQuerySchema,
  monthQuerySchema,
  paymentSchema,
  salaryIdParamSchema,
  salaryMonthSchema,
} from "./salary.schemas";

export const salaryRoutes = new OpenAPIHono<Env>();

const advCreator = alias(users, "adv_creator");
const payCreator = alias(users, "pay_creator");

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const today = () => new Date().toISOString().slice(0, 10);

/** First and last day (YYYY-MM-DD) of a "YYYY-MM" month. */
function monthBounds(month: string) {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  // Date.UTC(y, m, 0) → day 0 of the *next* month = the last day of month m.
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { monthStart: `${month}-01`, monthEnd: `${month}-${String(lastDay).padStart(2, "0")}` };
}

function derivePaymentStatus(net: number, paid: number): (typeof PAYMENT_STATUSES)[number] {
  if (net <= 0) return "paid"; // nothing payable
  if (paid <= 0) return "unpaid";
  if (paid >= net) return "paid";
  return "partial";
}

/** Load a live worker on this site (for FK checks on advances/payments). */
async function loadWorker(db: DbClient, siteId: string, id: string) {
  const [row] = await db
    .select({ id: workers.id, name: workers.name })
    .from(workers)
    .where(and(eq(workers.id, id), eq(workers.siteId, siteId), isNull(workers.deletedAt)))
    .limit(1);
  return row ?? null;
}

// ─── Monthly per-worker view ─────────────────────────────────────────────────────
const monthlyRoute = createRoute({
  method: "get",
  path: "/salary/monthly",
  tags: ["Salary"],
  summary: "Per-worker salary for a month",
  description:
    "Permission: salary:view. For the given month, returns every worker with days worked (from attendance), gross (days × wage + overtime), advances taken, net payable, amount paid, and balance.",
  middleware: [requireAuth, requireSiteContext, requirePermission("salary", "view")] as const,
  request: { query: monthQuerySchema },
  responses: {
    200: {
      description: "Monthly salary",
      content: { "application/json": { schema: apiSuccessSchema(salaryMonthSchema) } },
    },
    403: {
      description: "Permission denied",
      content: { "application/json": { schema: apiErrorSchema } },
    },
  },
});

salaryRoutes.openapi(monthlyRoute, async (c) => {
  const { month } = c.req.valid("query");
  const auth = c.get("auth");
  const db = getDb(c);
  const siteId = auth.siteId as string;
  const { monthStart, monthEnd } = monthBounds(month);

  const workerRows = await db
    .select({
      id: workers.id,
      name: workers.name,
      category: workerCategories.name,
      trade: workers.trade,
      dailyWage: workers.dailyWage,
      overtimeRate: workers.overtimeRate,
    })
    .from(workers)
    .leftJoin(workerCategories, eq(workerCategories.id, workers.categoryId))
    .where(and(eq(workers.siteId, siteId), isNull(workers.deletedAt)))
    .orderBy(asc(workers.name));

  // Attendance in the month (all marked records count — approval is not required here).
  const attRows = await db
    .select({
      workerId: attendance.workerId,
      status: attendance.status,
      overtimeHours: attendance.overtimeHours,
    })
    .from(attendance)
    .where(
      and(
        eq(attendance.siteId, siteId),
        isNull(attendance.deletedAt),
        gte(attendance.attendanceDate, monthStart),
        lte(attendance.attendanceDate, monthEnd),
      ),
    );
  const att = new Map<string, { present: number; half: number; ot: number }>();
  for (const r of attRows) {
    const a = att.get(r.workerId) ?? { present: 0, half: 0, ot: 0 };
    if (r.status === "present") a.present += 1;
    else if (r.status === "half_day") a.half += 1;
    a.ot += Number(r.overtimeHours);
    att.set(r.workerId, a);
  }

  // Advances dated within the month, summed per worker.
  const advRows = await db
    .select({ workerId: workerAdvances.workerId, amount: workerAdvances.amount })
    .from(workerAdvances)
    .where(
      and(
        eq(workerAdvances.siteId, siteId),
        isNull(workerAdvances.deletedAt),
        gte(workerAdvances.advanceDate, monthStart),
        lte(workerAdvances.advanceDate, monthEnd),
      ),
    );
  const advByWorker = new Map<string, number>();
  for (const r of advRows) {
    advByWorker.set(r.workerId, (advByWorker.get(r.workerId) ?? 0) + Number(r.amount));
  }

  // Payments applied to the month, summed per worker.
  const payRows = await db
    .select({ workerId: salaryPayments.workerId, amount: salaryPayments.amount })
    .from(salaryPayments)
    .where(
      and(
        eq(salaryPayments.siteId, siteId),
        isNull(salaryPayments.deletedAt),
        eq(salaryPayments.periodMonth, month),
      ),
    );
  const paidByWorker = new Map<string, number>();
  for (const r of payRows) {
    paidByWorker.set(r.workerId, (paidByWorker.get(r.workerId) ?? 0) + Number(r.amount));
  }

  const totals = { workers: 0, gross: 0, advances: 0, netPayable: 0, paid: 0, balance: 0 };
  const rows = workerRows.map((w) => {
    const a = att.get(w.id) ?? { present: 0, half: 0, ot: 0 };
    const dailyWage = Number(w.dailyWage);
    const overtimeRate = w.overtimeRate != null ? Number(w.overtimeRate) : null;
    const payableDays = a.present + 0.5 * a.half;
    const gross = round2(payableDays * dailyWage + a.ot * (overtimeRate ?? 0));
    const advances = round2(advByWorker.get(w.id) ?? 0);
    const netPayable = round2(gross - advances);
    const paid = round2(paidByWorker.get(w.id) ?? 0);
    const balance = round2(netPayable - paid);

    totals.workers += 1;
    totals.gross += gross;
    totals.advances += advances;
    totals.netPayable += netPayable;
    totals.paid += paid;
    totals.balance += balance;

    return {
      workerId: w.id,
      workerName: w.name,
      category: w.category ?? w.trade ?? null,
      dailyWage,
      overtimeRate,
      presentDays: a.present,
      halfDays: a.half,
      payableDays,
      overtimeHours: round2(a.ot),
      gross,
      advances,
      netPayable,
      paid,
      balance,
      paymentStatus: derivePaymentStatus(netPayable, paid),
    };
  });

  return c.json(
    {
      success: true as const,
      data: {
        month,
        totals: {
          workers: totals.workers,
          gross: round2(totals.gross),
          advances: round2(totals.advances),
          netPayable: round2(totals.netPayable),
          paid: round2(totals.paid),
          balance: round2(totals.balance),
        },
        workers: rows,
      },
    },
    200,
  );
});

// ─── Advances ──────────────────────────────────────────────────────────────────
interface AdvanceRow {
  id: string;
  siteId: string;
  workerId: string;
  workerName: string | null;
  amount: string;
  advanceDate: string;
  note: string | null;
  createdById: string;
  createdByName: string | null;
  createdAt: Date;
}

const advanceColumns = {
  id: workerAdvances.id,
  siteId: workerAdvances.siteId,
  workerId: workerAdvances.workerId,
  workerName: workers.name,
  amount: workerAdvances.amount,
  advanceDate: workerAdvances.advanceDate,
  note: workerAdvances.note,
  createdById: workerAdvances.createdByUserId,
  createdByName: advCreator.name,
  createdAt: workerAdvances.createdAt,
};

function serializeAdvance(row: AdvanceRow) {
  return {
    id: row.id,
    siteId: row.siteId,
    workerId: row.workerId,
    workerName: row.workerName ?? null,
    amount: Number(row.amount),
    advanceDate: row.advanceDate,
    note: row.note,
    createdBy: row.createdById ? { id: row.createdById, name: row.createdByName ?? "—" } : null,
    createdAt: row.createdAt.toISOString(),
  };
}

const listAdvancesRoute = createRoute({
  method: "get",
  path: "/salary/advances",
  tags: ["Salary"],
  summary: "List worker advances",
  description: "Permission: salary:view. Filter by worker and/or month (YYYY-MM).",
  middleware: [requireAuth, requireSiteContext, requirePermission("salary", "view")] as const,
  request: { query: listAdvancesQuerySchema },
  responses: {
    200: {
      description: "Advances",
      content: { "application/json": { schema: apiSuccessSchema(z.array(advanceSchema)) } },
    },
    403: {
      description: "Permission denied",
      content: { "application/json": { schema: apiErrorSchema } },
    },
  },
});

salaryRoutes.openapi(listAdvancesRoute, async (c) => {
  const { workerId, month } = c.req.valid("query");
  const auth = c.get("auth");
  const db = getDb(c);
  const siteId = auth.siteId as string;

  const filters = [eq(workerAdvances.siteId, siteId), isNull(workerAdvances.deletedAt)];
  if (workerId) filters.push(eq(workerAdvances.workerId, workerId));
  if (month) {
    const { monthStart, monthEnd } = monthBounds(month);
    filters.push(gte(workerAdvances.advanceDate, monthStart));
    filters.push(lte(workerAdvances.advanceDate, monthEnd));
  }

  const rows = await db
    .select(advanceColumns)
    .from(workerAdvances)
    .innerJoin(workers, eq(workers.id, workerAdvances.workerId))
    .leftJoin(advCreator, eq(advCreator.id, workerAdvances.createdByUserId))
    .where(and(...filters))
    .orderBy(desc(workerAdvances.advanceDate), desc(workerAdvances.createdAt));

  return c.json(
    { success: true as const, data: rows.map((r) => serializeAdvance(r as AdvanceRow)) },
    200,
  );
});

const createAdvanceRoute = createRoute({
  method: "post",
  path: "/salary/advances",
  tags: ["Salary"],
  summary: "Give a worker an advance",
  description:
    "Permission: salary:create. The advance is deducted from the worker's net pay for the month it is dated in. Accepts an Idempotency-Key header for safe retries.",
  middleware: [
    requireAuth,
    requireSiteContext,
    requirePermission("salary", "create"),
    idempotency(),
  ] as const,
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

salaryRoutes.openapi(createAdvanceRoute, async (c) => {
  const body = c.req.valid("json");
  const auth = c.get("auth");
  const db = getDb(c);
  const meta = getRequestMeta(c);
  const siteId = auth.siteId as string;

  const worker = await loadWorker(db, siteId, body.workerId);
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
      module: "salary",
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
  path: "/salary/advances/{id}",
  tags: ["Salary"],
  summary: "Delete an advance",
  description: "Permission: salary:delete.",
  middleware: [requireAuth, requireSiteContext, requirePermission("salary", "delete")] as const,
  request: { params: salaryIdParamSchema },
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

salaryRoutes.openapi(deleteAdvanceRoute, async (c) => {
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

  await db.transaction(async (tx) => {
    await tx.update(workerAdvances).set({ deletedAt: new Date() }).where(eq(workerAdvances.id, id));
    await writeAudit(tx, {
      siteId,
      actorUserId: auth.userId,
      module: "salary",
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

// ─── Payments ────────────────────────────────────────────────────────────────────
interface PaymentRow {
  id: string;
  siteId: string;
  workerId: string;
  workerName: string | null;
  periodMonth: string;
  amount: string;
  paidDate: string;
  paymentMode: string | null;
  note: string | null;
  createdById: string;
  createdByName: string | null;
  createdAt: Date;
}

const paymentColumns = {
  id: salaryPayments.id,
  siteId: salaryPayments.siteId,
  workerId: salaryPayments.workerId,
  workerName: workers.name,
  periodMonth: salaryPayments.periodMonth,
  amount: salaryPayments.amount,
  paidDate: salaryPayments.paidDate,
  paymentMode: salaryPayments.paymentMode,
  note: salaryPayments.note,
  createdById: salaryPayments.createdByUserId,
  createdByName: payCreator.name,
  createdAt: salaryPayments.createdAt,
};

function serializePayment(row: PaymentRow) {
  return {
    id: row.id,
    siteId: row.siteId,
    workerId: row.workerId,
    workerName: row.workerName ?? null,
    periodMonth: row.periodMonth,
    amount: Number(row.amount),
    paidDate: row.paidDate,
    paymentMode: row.paymentMode,
    note: row.note,
    createdBy: row.createdById ? { id: row.createdById, name: row.createdByName ?? "—" } : null,
    createdAt: row.createdAt.toISOString(),
  };
}

const listPaymentsRoute = createRoute({
  method: "get",
  path: "/salary/payments",
  tags: ["Salary"],
  summary: "List salary payments",
  description: "Permission: salary:view. Filter by worker and/or month (YYYY-MM).",
  middleware: [requireAuth, requireSiteContext, requirePermission("salary", "view")] as const,
  request: { query: listPaymentsQuerySchema },
  responses: {
    200: {
      description: "Payments",
      content: { "application/json": { schema: apiSuccessSchema(z.array(paymentSchema)) } },
    },
    403: {
      description: "Permission denied",
      content: { "application/json": { schema: apiErrorSchema } },
    },
  },
});

salaryRoutes.openapi(listPaymentsRoute, async (c) => {
  const { workerId, month } = c.req.valid("query");
  const auth = c.get("auth");
  const db = getDb(c);
  const siteId = auth.siteId as string;

  const filters = [eq(salaryPayments.siteId, siteId), isNull(salaryPayments.deletedAt)];
  if (workerId) filters.push(eq(salaryPayments.workerId, workerId));
  if (month) filters.push(eq(salaryPayments.periodMonth, month));

  const rows = await db
    .select(paymentColumns)
    .from(salaryPayments)
    .innerJoin(workers, eq(workers.id, salaryPayments.workerId))
    .leftJoin(payCreator, eq(payCreator.id, salaryPayments.createdByUserId))
    .where(and(...filters))
    .orderBy(desc(salaryPayments.paidDate), desc(salaryPayments.createdAt));

  return c.json(
    { success: true as const, data: rows.map((r) => serializePayment(r as PaymentRow)) },
    200,
  );
});

const createPaymentRoute = createRoute({
  method: "post",
  path: "/salary/payments",
  tags: ["Salary"],
  summary: "Record a salary payment to a worker",
  description:
    "Permission: salary:update. Records an amount paid to the worker against a month's net salary. Accepts an Idempotency-Key header for safe retries.",
  middleware: [
    requireAuth,
    requireSiteContext,
    requirePermission("salary", "update"),
    idempotency(),
  ] as const,
  request: {
    body: { content: { "application/json": { schema: createPaymentBodySchema } }, required: true },
  },
  responses: {
    201: {
      description: "Recorded",
      content: { "application/json": { schema: apiSuccessSchema(paymentSchema) } },
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

salaryRoutes.openapi(createPaymentRoute, async (c) => {
  const body = c.req.valid("json");
  const auth = c.get("auth");
  const db = getDb(c);
  const meta = getRequestMeta(c);
  const siteId = auth.siteId as string;

  const worker = await loadWorker(db, siteId, body.workerId);
  if (!worker) throw new NotFoundError("Worker not found.");

  const created = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(salaryPayments)
      .values({
        siteId,
        workerId: body.workerId,
        periodMonth: body.periodMonth,
        amount: String(round2(body.amount)),
        paidDate: body.paidDate ?? today(),
        paymentMode: body.paymentMode ?? null,
        note: body.note ?? null,
        createdByUserId: auth.userId,
      })
      .returning();
    if (!row) throw new ConflictError("Could not record the payment. Please try again.");
    await writeAudit(tx, {
      siteId,
      actorUserId: auth.userId,
      module: "salary",
      action: "update",
      entityType: "salary_payment",
      entityId: row.id,
      // No amount in the audit trail (sensitive payment data — see docs/architecter.md).
      after: { workerId: body.workerId, periodMonth: body.periodMonth },
      ip: meta.ip,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });
    return row;
  });

  return c.json(
    {
      success: true as const,
      data: serializePayment({
        ...(created as unknown as PaymentRow),
        workerName: worker.name,
        createdById: auth.userId,
        createdByName: auth.name,
      }),
    },
    201,
  );
});

const deletePaymentRoute = createRoute({
  method: "delete",
  path: "/salary/payments/{id}",
  tags: ["Salary"],
  summary: "Delete a salary payment",
  description: "Permission: salary:delete.",
  middleware: [requireAuth, requireSiteContext, requirePermission("salary", "delete")] as const,
  request: { params: salaryIdParamSchema },
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

salaryRoutes.openapi(deletePaymentRoute, async (c) => {
  const { id } = c.req.valid("param");
  const auth = c.get("auth");
  const db = getDb(c);
  const meta = getRequestMeta(c);
  const siteId = auth.siteId as string;

  const [existing] = await db
    .select()
    .from(salaryPayments)
    .where(
      and(
        eq(salaryPayments.id, id),
        eq(salaryPayments.siteId, siteId),
        isNull(salaryPayments.deletedAt),
      ),
    )
    .limit(1);
  if (!existing) throw new NotFoundError("Payment not found.");

  await db.transaction(async (tx) => {
    await tx.update(salaryPayments).set({ deletedAt: new Date() }).where(eq(salaryPayments.id, id));
    await writeAudit(tx, {
      siteId,
      actorUserId: auth.userId,
      module: "salary",
      action: "delete",
      entityType: "salary_payment",
      entityId: id,
      after: { workerId: existing.workerId, periodMonth: existing.periodMonth },
      ip: meta.ip,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });
  });

  return c.json({ success: true as const, data: { id, deleted: true } }, 200);
});
