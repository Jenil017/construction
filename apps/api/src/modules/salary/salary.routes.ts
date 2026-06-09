import {
  attendance,
  salaryRunItems,
  salaryRuns,
  users,
  workerAdvances,
  workers,
} from "@construction-erp/db/schema";
import { apiErrorSchema, apiSuccessSchema, buildPaginationMeta } from "@construction-erp/shared";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { and, asc, count, desc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { writeAudit } from "../../common/audit";
import { type DbClient, getDb } from "../../common/db";
import { ConflictError, NotFoundError, ValidationError } from "../../common/errors";
import { getRequestMeta } from "../../common/http/request-meta";
import { idempotency } from "../../common/idempotency";
import { requireAuth } from "../../common/middleware/require-auth";
import { requirePermission } from "../../common/middleware/require-permission";
import { requireSiteContext } from "../../common/middleware/require-site-context";
import type { Env } from "../../env";
import {
  type PAYMENT_STATUSES,
  deleteRunResultSchema,
  generateRunBodySchema,
  listRunsQuerySchema,
  payItemBodySchema,
  runIdParamSchema,
  runItemParamSchema,
  salaryRunDetailSchema,
  salaryRunItemSchema,
  salaryRunSchema,
} from "./salary.schemas";

export const salaryRoutes = new OpenAPIHono<Env>();

const generator = alias(users, "salary_generator");

/** Round money to 2 decimals to avoid float artifacts. */
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const today = () => new Date().toISOString().slice(0, 10);

interface RunRow {
  id: string;
  siteId: string;
  periodStart: string;
  periodEnd: string;
  totalWorkers: number;
  totalGross: string;
  totalAdvances: string;
  totalNet: string;
  generatedById: string;
  generatedByName: string | null;
  createdAt: Date;
}

const runColumns = {
  id: salaryRuns.id,
  siteId: salaryRuns.siteId,
  periodStart: salaryRuns.periodStart,
  periodEnd: salaryRuns.periodEnd,
  totalWorkers: salaryRuns.totalWorkers,
  totalGross: salaryRuns.totalGross,
  totalAdvances: salaryRuns.totalAdvances,
  totalNet: salaryRuns.totalNet,
  generatedById: salaryRuns.generatedByUserId,
  generatedByName: generator.name,
  createdAt: salaryRuns.createdAt,
};

function serializeRun(row: RunRow) {
  return {
    id: row.id,
    siteId: row.siteId,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    totalWorkers: row.totalWorkers,
    totalGross: Number(row.totalGross),
    totalAdvances: Number(row.totalAdvances),
    totalNet: Number(row.totalNet),
    generatedBy: row.generatedById
      ? { id: row.generatedById, name: row.generatedByName ?? "—" }
      : null,
    createdAt: row.createdAt.toISOString(),
  };
}

interface ItemRow {
  id: string;
  runId: string;
  workerId: string;
  workerName: string;
  presentDays: number;
  halfDays: number;
  payableDays: string;
  overtimeHours: string;
  dailyWage: string;
  overtimeRate: string | null;
  gross: string;
  advanceDeducted: string;
  netPayable: string;
  amountPaid: string;
  paymentStatus: string;
  paymentMode: string | null;
  paidAt: Date | null;
}

function serializeItem(row: ItemRow) {
  return {
    id: row.id,
    runId: row.runId,
    workerId: row.workerId,
    workerName: row.workerName,
    presentDays: row.presentDays,
    halfDays: row.halfDays,
    payableDays: Number(row.payableDays),
    overtimeHours: Number(row.overtimeHours),
    dailyWage: Number(row.dailyWage),
    overtimeRate: row.overtimeRate != null ? Number(row.overtimeRate) : null,
    gross: Number(row.gross),
    advanceDeducted: Number(row.advanceDeducted),
    netPayable: Number(row.netPayable),
    amountPaid: Number(row.amountPaid),
    paymentStatus: row.paymentStatus as (typeof PAYMENT_STATUSES)[number],
    paymentMode: row.paymentMode,
    paidAt: row.paidAt ? row.paidAt.toISOString() : null,
  };
}

async function loadRunRow(db: DbClient, siteId: string, id: string) {
  const [row] = await db
    .select(runColumns)
    .from(salaryRuns)
    .leftJoin(generator, eq(generator.id, salaryRuns.generatedByUserId))
    .where(and(eq(salaryRuns.id, id), eq(salaryRuns.siteId, siteId), isNull(salaryRuns.deletedAt)))
    .limit(1);
  return row ?? null;
}

// ─── List runs ───────────────────────────────────────────────────────────────────
const listRunsRoute = createRoute({
  method: "get",
  path: "/salary/runs",
  tags: ["Salary"],
  summary: "List salary runs for the active site",
  description: "Permission: salary:view. Site-scoped, newest period first.",
  middleware: [requireAuth, requireSiteContext, requirePermission("salary", "view")] as const,
  request: { query: listRunsQuerySchema },
  responses: {
    200: {
      description: "A page of salary runs",
      content: { "application/json": { schema: apiSuccessSchema(z.array(salaryRunSchema)) } },
    },
    403: {
      description: "Permission denied",
      content: { "application/json": { schema: apiErrorSchema } },
    },
  },
});

salaryRoutes.openapi(listRunsRoute, async (c) => {
  const { page, pageSize, sortOrder } = c.req.valid("query");
  const auth = c.get("auth");
  const db = getDb(c);
  const siteId = auth.siteId as string;

  const whereClause = and(eq(salaryRuns.siteId, siteId), isNull(salaryRuns.deletedAt));
  const [totalRow] = await db.select({ value: count() }).from(salaryRuns).where(whereClause);
  const total = totalRow?.value ?? 0;

  const dir = sortOrder === "asc" ? asc : desc;
  const rows = await db
    .select(runColumns)
    .from(salaryRuns)
    .leftJoin(generator, eq(generator.id, salaryRuns.generatedByUserId))
    .where(whereClause)
    .orderBy(dir(salaryRuns.periodStart), dir(salaryRuns.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const data = rows.map((r) => serializeRun(r as RunRow));
  return c.json(
    { success: true as const, data, meta: buildPaginationMeta(page, pageSize, total) },
    200,
  );
});

// ─── Generate run ──────────────────────────────────────────────────────────────────
const generateRunRoute = createRoute({
  method: "post",
  path: "/salary/runs",
  tags: ["Salary"],
  summary: "Generate a salary run for a period",
  description:
    "Permission: salary:create. Computes pay for every worker with APPROVED attendance in the period and settles their advances — all in one transaction. One run per (site, period). Accepts an Idempotency-Key header for safe retries.",
  middleware: [
    requireAuth,
    requireSiteContext,
    requirePermission("salary", "create"),
    idempotency(),
  ] as const,
  request: {
    body: { content: { "application/json": { schema: generateRunBodySchema } }, required: true },
  },
  responses: {
    201: {
      description: "Run generated",
      content: { "application/json": { schema: apiSuccessSchema(salaryRunDetailSchema) } },
    },
    400: {
      description: "Invalid period",
      content: { "application/json": { schema: apiErrorSchema } },
    },
    403: {
      description: "Permission denied",
      content: { "application/json": { schema: apiErrorSchema } },
    },
    409: {
      description: "Conflict (run exists / no approved attendance)",
      content: { "application/json": { schema: apiErrorSchema } },
    },
  },
});

salaryRoutes.openapi(generateRunRoute, async (c) => {
  const { periodStart, periodEnd } = c.req.valid("json");
  const auth = c.get("auth");
  const db = getDb(c);
  const meta = getRequestMeta(c);
  const siteId = auth.siteId as string;

  if (periodStart > periodEnd) {
    throw new ValidationError("The start date must be on or before the end date.", {
      fields: { periodStart: "Must be on or before the end date." },
    });
  }

  // Idempotency guard: one live run per (site, period).
  const [dupe] = await db
    .select({ id: salaryRuns.id })
    .from(salaryRuns)
    .where(
      and(
        eq(salaryRuns.siteId, siteId),
        eq(salaryRuns.periodStart, periodStart),
        eq(salaryRuns.periodEnd, periodEnd),
        isNull(salaryRuns.deletedAt),
      ),
    )
    .limit(1);
  if (dupe) {
    throw new ConflictError(
      "A salary run already exists for this period. Delete it first to regenerate.",
    );
  }

  // Pull approved attendance in the period and group by worker.
  const rows = await db
    .select({
      workerId: attendance.workerId,
      status: attendance.status,
      overtimeHours: attendance.overtimeHours,
    })
    .from(attendance)
    .where(
      and(
        eq(attendance.siteId, siteId),
        eq(attendance.approved, true),
        isNull(attendance.deletedAt),
        gte(attendance.attendanceDate, periodStart),
        lte(attendance.attendanceDate, periodEnd),
      ),
    );

  if (rows.length === 0) {
    throw new ConflictError(
      "No approved attendance in this period. Approve attendance before generating salary.",
    );
  }

  interface Agg {
    presentDays: number;
    halfDays: number;
    overtimeHours: number;
  }
  const byWorker = new Map<string, Agg>();
  for (const r of rows) {
    const agg = byWorker.get(r.workerId) ?? { presentDays: 0, halfDays: 0, overtimeHours: 0 };
    if (r.status === "present") agg.presentDays += 1;
    else if (r.status === "half_day") agg.halfDays += 1;
    agg.overtimeHours += Number(r.overtimeHours);
    byWorker.set(r.workerId, agg);
  }

  const workerIds = [...byWorker.keys()];
  const workerRows = await db
    .select()
    .from(workers)
    .where(and(eq(workers.siteId, siteId), inArray(workers.id, workerIds)));
  const workerById = new Map(workerRows.map((w) => [w.id, w]));

  const result = await db.transaction(async (tx) => {
    const [run] = await tx
      .insert(salaryRuns)
      .values({ siteId, periodStart, periodEnd, generatedByUserId: auth.userId })
      .returning();
    if (!run) throw new ConflictError("Could not generate the salary run. Please try again.");

    let totalGross = 0;
    let totalAdvances = 0;
    let totalNet = 0;
    let totalWorkers = 0;

    for (const workerId of workerIds) {
      const worker = workerById.get(workerId);
      if (!worker) continue; // FK guarantees presence; defensive.
      const agg = byWorker.get(workerId) as Agg;

      const dailyWage = Number(worker.dailyWage);
      const overtimeRate = worker.overtimeRate != null ? Number(worker.overtimeRate) : 0;
      const payableDays = agg.presentDays + 0.5 * agg.halfDays;
      const gross = round2(payableDays * dailyWage + agg.overtimeHours * overtimeRate);

      // Settle every unsettled advance dated on/before the period end.
      const advances = await tx
        .select({ id: workerAdvances.id, amount: workerAdvances.amount })
        .from(workerAdvances)
        .where(
          and(
            eq(workerAdvances.siteId, siteId),
            eq(workerAdvances.workerId, workerId),
            isNull(workerAdvances.settledInRunId),
            isNull(workerAdvances.deletedAt),
            lte(workerAdvances.advanceDate, periodEnd),
          ),
        );
      const advanceDeducted = round2(advances.reduce((s, a) => s + Number(a.amount), 0));
      const netPayable = round2(gross - advanceDeducted);

      await tx.insert(salaryRunItems).values({
        siteId,
        runId: run.id,
        workerId,
        workerName: worker.name,
        presentDays: agg.presentDays,
        halfDays: agg.halfDays,
        payableDays: String(payableDays),
        overtimeHours: String(round2(agg.overtimeHours)),
        dailyWage: String(dailyWage),
        overtimeRate: worker.overtimeRate ?? null,
        gross: String(gross),
        advanceDeducted: String(advanceDeducted),
        netPayable: String(netPayable),
        paymentStatus: netPayable <= 0 ? "paid" : "unpaid",
      });

      if (advances.length > 0) {
        await tx
          .update(workerAdvances)
          .set({ settledInRunId: run.id })
          .where(
            inArray(
              workerAdvances.id,
              advances.map((a) => a.id),
            ),
          );
      }

      totalGross += gross;
      totalAdvances += advanceDeducted;
      totalNet += netPayable;
      totalWorkers += 1;
    }

    await tx
      .update(salaryRuns)
      .set({
        totalWorkers,
        totalGross: String(round2(totalGross)),
        totalAdvances: String(round2(totalAdvances)),
        totalNet: String(round2(totalNet)),
      })
      .where(eq(salaryRuns.id, run.id));

    await writeAudit(tx, {
      siteId,
      actorUserId: auth.userId,
      module: "salary",
      action: "create",
      entityType: "salary_run",
      entityId: run.id,
      // No amounts in the audit trail (sensitive salary data — see docs/architecter.md).
      after: { periodStart, periodEnd, totalWorkers },
      ip: meta.ip,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });

    return run.id;
  });

  const run = await loadRunRow(db, siteId, result);
  if (!run) throw new NotFoundError("Salary run not found.");
  const items = await db
    .select()
    .from(salaryRunItems)
    .where(eq(salaryRunItems.runId, result))
    .orderBy(asc(salaryRunItems.workerName));

  return c.json(
    {
      success: true as const,
      data: {
        ...serializeRun(run as RunRow),
        items: items.map((i) => serializeItem(i as ItemRow)),
      },
    },
    201,
  );
});

// ─── Get run detail ────────────────────────────────────────────────────────────────
const getRunRoute = createRoute({
  method: "get",
  path: "/salary/runs/{id}",
  tags: ["Salary"],
  summary: "Get a salary run with its payslips",
  description: "Permission: salary:view.",
  middleware: [requireAuth, requireSiteContext, requirePermission("salary", "view")] as const,
  request: { params: runIdParamSchema },
  responses: {
    200: {
      description: "The salary run",
      content: { "application/json": { schema: apiSuccessSchema(salaryRunDetailSchema) } },
    },
    403: {
      description: "Permission denied",
      content: { "application/json": { schema: apiErrorSchema } },
    },
    404: { description: "Not found", content: { "application/json": { schema: apiErrorSchema } } },
  },
});

salaryRoutes.openapi(getRunRoute, async (c) => {
  const { id } = c.req.valid("param");
  const auth = c.get("auth");
  const db = getDb(c);
  const siteId = auth.siteId as string;

  const run = await loadRunRow(db, siteId, id);
  if (!run) throw new NotFoundError("Salary run not found.");
  const items = await db
    .select()
    .from(salaryRunItems)
    .where(eq(salaryRunItems.runId, id))
    .orderBy(asc(salaryRunItems.workerName));

  return c.json(
    {
      success: true as const,
      data: {
        ...serializeRun(run as RunRow),
        items: items.map((i) => serializeItem(i as ItemRow)),
      },
    },
    200,
  );
});

// ─── Delete (discard) run ───────────────────────────────────────────────────────────
const deleteRunRoute = createRoute({
  method: "delete",
  path: "/salary/runs/{id}",
  tags: ["Salary"],
  summary: "Discard a salary run",
  description:
    "Permission: salary:delete. Returns its settled advances to the unsettled pool so the period can be regenerated.",
  middleware: [requireAuth, requireSiteContext, requirePermission("salary", "delete")] as const,
  request: { params: runIdParamSchema },
  responses: {
    200: {
      description: "Discarded",
      content: { "application/json": { schema: apiSuccessSchema(deleteRunResultSchema) } },
    },
    403: {
      description: "Permission denied",
      content: { "application/json": { schema: apiErrorSchema } },
    },
    404: { description: "Not found", content: { "application/json": { schema: apiErrorSchema } } },
  },
});

salaryRoutes.openapi(deleteRunRoute, async (c) => {
  const { id } = c.req.valid("param");
  const auth = c.get("auth");
  const db = getDb(c);
  const meta = getRequestMeta(c);
  const siteId = auth.siteId as string;

  const run = await loadRunRow(db, siteId, id);
  if (!run) throw new NotFoundError("Salary run not found.");

  await db.transaction(async (tx) => {
    // Release this run's advances back to the unsettled pool.
    await tx
      .update(workerAdvances)
      .set({ settledInRunId: null })
      .where(and(eq(workerAdvances.siteId, siteId), eq(workerAdvances.settledInRunId, id)));
    await tx.update(salaryRuns).set({ deletedAt: new Date() }).where(eq(salaryRuns.id, id));
    await writeAudit(tx, {
      siteId,
      actorUserId: auth.userId,
      module: "salary",
      action: "delete",
      entityType: "salary_run",
      entityId: id,
      after: { periodStart: run.periodStart, periodEnd: run.periodEnd },
      ip: meta.ip,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });
  });

  return c.json({ success: true as const, data: { id, deleted: true } }, 200);
});

// ─── Record payment for a payslip ──────────────────────────────────────────────────
const payItemRoute = createRoute({
  method: "post",
  path: "/salary/runs/{id}/items/{itemId}/pay",
  tags: ["Salary"],
  summary: "Record payment against a payslip",
  description:
    "Permission: salary:update. Sets the cumulative amount paid; status becomes paid/partial/unpaid accordingly. Accepts an Idempotency-Key header for safe retries.",
  middleware: [
    requireAuth,
    requireSiteContext,
    requirePermission("salary", "update"),
    idempotency(),
  ] as const,
  request: {
    params: runItemParamSchema,
    body: { content: { "application/json": { schema: payItemBodySchema } }, required: true },
  },
  responses: {
    200: {
      description: "Payment recorded",
      content: { "application/json": { schema: apiSuccessSchema(salaryRunItemSchema) } },
    },
    400: {
      description: "Amount exceeds net payable",
      content: { "application/json": { schema: apiErrorSchema } },
    },
    403: {
      description: "Permission denied",
      content: { "application/json": { schema: apiErrorSchema } },
    },
    404: { description: "Not found", content: { "application/json": { schema: apiErrorSchema } } },
  },
});

salaryRoutes.openapi(payItemRoute, async (c) => {
  const { id, itemId } = c.req.valid("param");
  const body = c.req.valid("json");
  const auth = c.get("auth");
  const db = getDb(c);
  const meta = getRequestMeta(c);
  const siteId = auth.siteId as string;

  const run = await loadRunRow(db, siteId, id);
  if (!run) throw new NotFoundError("Salary run not found.");

  const [item] = await db
    .select()
    .from(salaryRunItems)
    .where(
      and(
        eq(salaryRunItems.id, itemId),
        eq(salaryRunItems.runId, id),
        eq(salaryRunItems.siteId, siteId),
      ),
    )
    .limit(1);
  if (!item) throw new NotFoundError("Payslip not found.");

  const net = Number(item.netPayable);
  const effectiveNet = Math.max(net, 0);
  const amountPaid = round2(body.amountPaid);
  if (amountPaid > effectiveNet) {
    throw new ValidationError("The amount paid cannot exceed the net payable.", {
      fields: { amountPaid: "Cannot exceed the net payable." },
    });
  }

  const status: (typeof PAYMENT_STATUSES)[number] =
    amountPaid <= 0
      ? effectiveNet <= 0
        ? "paid"
        : "unpaid"
      : amountPaid >= effectiveNet
        ? "paid"
        : "partial";
  const paidAt = status === "unpaid" ? null : new Date(body.paidAt ?? today());

  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(salaryRunItems)
      .set({
        amountPaid: String(amountPaid),
        paymentStatus: status,
        paymentMode: body.paymentMode ?? null,
        paidAt,
      })
      .where(eq(salaryRunItems.id, itemId))
      .returning();
    await writeAudit(tx, {
      siteId,
      actorUserId: auth.userId,
      module: "salary",
      action: "update",
      entityType: "salary_run_item",
      entityId: itemId,
      // No amounts (sensitive payment data) — record only the status transition.
      after: { paymentStatus: status, paymentMode: body.paymentMode ?? null },
      ip: meta.ip,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });
    return row;
  });

  return c.json({ success: true as const, data: serializeItem(updated as ItemRow) }, 200);
});
