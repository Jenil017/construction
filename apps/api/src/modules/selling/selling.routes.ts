import { siteSales, users } from "@construction-erp/db/schema";
import { apiErrorSchema, apiSuccessSchema, buildPaginationMeta } from "@construction-erp/shared";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { type SQL, and, asc, count, desc, eq, gte, ilike, isNull, lte, or } from "drizzle-orm";
import { writeAudit } from "../../common/audit";
import { type DbClient, getDb } from "../../common/db";
import { ConflictError, NotFoundError } from "../../common/errors";
import { getRequestMeta } from "../../common/http/request-meta";
import { requireAuth } from "../../common/middleware/require-auth";
import { requirePermission } from "../../common/middleware/require-permission";
import { requireSiteContext } from "../../common/middleware/require-site-context";
import type { Env } from "../../env";
import {
  type SALE_PAYMENT_STATUSES,
  type SALE_STATUSES,
  confirmSaleBodySchema,
  createSaleBodySchema,
  deleteSaleResultSchema,
  listSalesQuerySchema,
  recordPaymentBodySchema,
  saleIdParamSchema,
  saleSchema,
  updateSaleBodySchema,
} from "./selling.schemas";

export const sellingRoutes = new OpenAPIHono<Env>();

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const round3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;
const today = () => new Date().toISOString().slice(0, 10);

interface SaleRow {
  id: string;
  siteId: string;
  saleDate: string;
  itemDescription: string;
  materialId: string | null;
  category: string;
  quantity: string;
  unit: string;
  ratePerUnit: string;
  totalAmount: string;
  buyerName: string | null;
  buyerContact: string | null;
  paymentMode: string | null;
  paymentStatus: string;
  amountReceived: string;
  notes: string | null;
  status: string;
  createdById: string;
  createdByName: string | null;
  createdAt: Date;
}

const saleColumns = {
  id: siteSales.id,
  siteId: siteSales.siteId,
  saleDate: siteSales.saleDate,
  itemDescription: siteSales.itemDescription,
  materialId: siteSales.materialId,
  category: siteSales.category,
  quantity: siteSales.quantity,
  unit: siteSales.unit,
  ratePerUnit: siteSales.ratePerUnit,
  totalAmount: siteSales.totalAmount,
  buyerName: siteSales.buyerName,
  buyerContact: siteSales.buyerContact,
  paymentMode: siteSales.paymentMode,
  paymentStatus: siteSales.paymentStatus,
  amountReceived: siteSales.amountReceived,
  notes: siteSales.notes,
  status: siteSales.status,
  createdById: siteSales.createdByUserId,
  createdByName: users.name,
  createdAt: siteSales.createdAt,
};

function serializeSale(row: SaleRow) {
  return {
    id: row.id,
    siteId: row.siteId,
    saleDate: row.saleDate,
    itemDescription: row.itemDescription,
    materialId: row.materialId,
    category: row.category,
    quantity: Number(row.quantity),
    unit: row.unit,
    ratePerUnit: Number(row.ratePerUnit),
    totalAmount: Number(row.totalAmount),
    buyerName: row.buyerName,
    buyerContact: row.buyerContact,
    paymentMode: row.paymentMode,
    paymentStatus: row.paymentStatus as (typeof SALE_PAYMENT_STATUSES)[number],
    amountReceived: Number(row.amountReceived),
    notes: row.notes,
    status: row.status as (typeof SALE_STATUSES)[number],
    createdBy: row.createdById ? { id: row.createdById, name: row.createdByName ?? "—" } : null,
    createdAt: row.createdAt.toISOString(),
  };
}

async function loadSaleJoined(db: DbClient, filters: SQL[]) {
  const [row] = await db
    .select(saleColumns)
    .from(siteSales)
    .leftJoin(users, eq(users.id, siteSales.createdByUserId))
    .where(and(...filters))
    .limit(1);
  return row ? serializeSale(row as SaleRow) : null;
}

async function loadRawSale(db: DbClient, siteId: string, id: string) {
  const [row] = await db
    .select()
    .from(siteSales)
    .where(and(eq(siteSales.id, id), eq(siteSales.siteId, siteId), isNull(siteSales.deletedAt)))
    .limit(1);
  return row ?? null;
}

function derivePaymentStatus(total: number, received: number): "unpaid" | "partial" | "paid" {
  if (received <= 0) return "unpaid";
  if (received >= total) return "paid";
  return "partial";
}

// ─── List ─────────────────────────────────────────────────────────────────────
const listRoute = createRoute({
  method: "get",
  path: "/selling",
  tags: ["Selling"],
  summary: "List site sales",
  description:
    "Permission: selling:view. Filter by search, category, status, payment status, dates.",
  middleware: [requireAuth, requireSiteContext, requirePermission("selling", "view")] as const,
  request: { query: listSalesQuerySchema },
  responses: {
    200: {
      description: "A page of sales",
      content: { "application/json": { schema: apiSuccessSchema(z.array(saleSchema)) } },
    },
    403: {
      description: "Permission denied",
      content: { "application/json": { schema: apiErrorSchema } },
    },
  },
});

sellingRoutes.openapi(listRoute, async (c) => {
  const { page, pageSize, sortOrder, search, category, status, paymentStatus, dateFrom, dateTo } =
    c.req.valid("query");
  const auth = c.get("auth");
  const db = getDb(c);
  const siteId = auth.siteId as string;

  const filters = [eq(siteSales.siteId, siteId), isNull(siteSales.deletedAt)];
  if (category) filters.push(eq(siteSales.category, category));
  if (status) filters.push(eq(siteSales.status, status));
  if (paymentStatus) filters.push(eq(siteSales.paymentStatus, paymentStatus));
  if (dateFrom) filters.push(gte(siteSales.saleDate, dateFrom));
  if (dateTo) filters.push(lte(siteSales.saleDate, dateTo));
  if (search) {
    const pattern = `%${search}%`;
    const term = or(
      ilike(siteSales.itemDescription, pattern),
      ilike(siteSales.buyerName, pattern),
      ilike(siteSales.category, pattern),
    );
    if (term) filters.push(term);
  }
  const whereClause = and(...filters);

  const [totalRow] = await db.select({ value: count() }).from(siteSales).where(whereClause);
  const total = totalRow?.value ?? 0;

  const dir = sortOrder === "asc" ? asc : desc;
  const rows = await db
    .select(saleColumns)
    .from(siteSales)
    .leftJoin(users, eq(users.id, siteSales.createdByUserId))
    .where(whereClause)
    .orderBy(dir(siteSales.saleDate), dir(siteSales.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const data = rows.map((r) => serializeSale(r as SaleRow));
  return c.json(
    { success: true as const, data, meta: buildPaginationMeta(page, pageSize, total) },
    200,
  );
});

// ─── Create ───────────────────────────────────────────────────────────────────
const createRouteDef = createRoute({
  method: "post",
  path: "/selling",
  tags: ["Selling"],
  summary: "Record a site sale",
  description: "Permission: selling:create. Starts as 'draft' unless status='confirmed'.",
  middleware: [requireAuth, requireSiteContext, requirePermission("selling", "create")] as const,
  request: {
    body: { content: { "application/json": { schema: createSaleBodySchema } }, required: true },
  },
  responses: {
    201: {
      description: "Created",
      content: { "application/json": { schema: apiSuccessSchema(saleSchema) } },
    },
    403: {
      description: "Permission denied",
      content: { "application/json": { schema: apiErrorSchema } },
    },
  },
});

sellingRoutes.openapi(createRouteDef, async (c) => {
  const body = c.req.valid("json");
  const auth = c.get("auth");
  const db = getDb(c);
  const meta = getRequestMeta(c);
  const siteId = auth.siteId as string;

  const qty = round3(body.quantity);
  const rate = round2(body.ratePerUnit);
  const total = round2(qty * rate);

  const created = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(siteSales)
      .values({
        siteId,
        saleDate: body.saleDate ?? today(),
        itemDescription: body.itemDescription,
        materialId: body.materialId ?? null,
        category: body.category,
        quantity: String(qty),
        unit: body.unit,
        ratePerUnit: String(rate),
        totalAmount: String(total),
        buyerName: body.buyerName ?? null,
        buyerContact: body.buyerContact ?? null,
        paymentMode: body.paymentMode ?? null,
        notes: body.notes ?? null,
        status: body.status ?? "draft",
        createdByUserId: auth.userId,
      })
      .returning();
    if (!row) throw new ConflictError("Could not record the sale. Please try again.");
    await writeAudit(tx, {
      siteId,
      actorUserId: auth.userId,
      module: "selling",
      action: "create",
      entityType: "site_sale",
      entityId: row.id,
      after: { itemDescription: row.itemDescription, category: row.category, status: row.status },
      ip: meta.ip,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });
    return row.id;
  });

  const data = await loadSaleJoined(db, [eq(siteSales.id, created)]);
  if (!data) throw new NotFoundError("Sale not found.");
  return c.json({ success: true as const, data }, 201);
});

// ─── Get ──────────────────────────────────────────────────────────────────────
const getRouteDef = createRoute({
  method: "get",
  path: "/selling/{id}",
  tags: ["Selling"],
  summary: "Get a sale",
  description: "Permission: selling:view.",
  middleware: [requireAuth, requireSiteContext, requirePermission("selling", "view")] as const,
  request: { params: saleIdParamSchema },
  responses: {
    200: {
      description: "The sale",
      content: { "application/json": { schema: apiSuccessSchema(saleSchema) } },
    },
    403: {
      description: "Permission denied",
      content: { "application/json": { schema: apiErrorSchema } },
    },
    404: { description: "Not found", content: { "application/json": { schema: apiErrorSchema } } },
  },
});

sellingRoutes.openapi(getRouteDef, async (c) => {
  const { id } = c.req.valid("param");
  const auth = c.get("auth");
  const db = getDb(c);
  const siteId = auth.siteId as string;
  const data = await loadSaleJoined(db, [
    eq(siteSales.id, id),
    eq(siteSales.siteId, siteId),
    isNull(siteSales.deletedAt),
  ]);
  if (!data) throw new NotFoundError("Sale not found.");
  return c.json({ success: true as const, data }, 200);
});

// ─── Update (draft only) ──────────────────────────────────────────────────────
const updateRouteDef = createRoute({
  method: "patch",
  path: "/selling/{id}",
  tags: ["Selling"],
  summary: "Update a draft sale",
  description: "Permission: selling:update. Confirmed/cancelled sales are locked.",
  middleware: [requireAuth, requireSiteContext, requirePermission("selling", "update")] as const,
  request: {
    params: saleIdParamSchema,
    body: { content: { "application/json": { schema: updateSaleBodySchema } }, required: true },
  },
  responses: {
    200: {
      description: "Updated",
      content: { "application/json": { schema: apiSuccessSchema(saleSchema) } },
    },
    403: {
      description: "Permission denied",
      content: { "application/json": { schema: apiErrorSchema } },
    },
    404: { description: "Not found", content: { "application/json": { schema: apiErrorSchema } } },
    409: { description: "Locked", content: { "application/json": { schema: apiErrorSchema } } },
  },
});

sellingRoutes.openapi(updateRouteDef, async (c) => {
  const { id } = c.req.valid("param");
  const body = c.req.valid("json");
  const auth = c.get("auth");
  const db = getDb(c);
  const meta = getRequestMeta(c);
  const siteId = auth.siteId as string;

  const existing = await loadRawSale(db, siteId, id);
  if (!existing) throw new NotFoundError("Sale not found.");
  if (existing.status !== "draft") throw new ConflictError("Only draft sales can be edited.");

  const updates: Record<string, unknown> = {};
  if (body.saleDate !== undefined) updates.saleDate = body.saleDate;
  if (body.itemDescription !== undefined) updates.itemDescription = body.itemDescription;
  if (body.materialId !== undefined) updates.materialId = body.materialId;
  if (body.category !== undefined) updates.category = body.category;
  if (body.unit !== undefined) updates.unit = body.unit;
  if (body.buyerName !== undefined) updates.buyerName = body.buyerName;
  if (body.buyerContact !== undefined) updates.buyerContact = body.buyerContact;
  if (body.paymentMode !== undefined) updates.paymentMode = body.paymentMode;
  if (body.notes !== undefined) updates.notes = body.notes;

  const newQty = body.quantity !== undefined ? round3(body.quantity) : Number(existing.quantity);
  const newRate =
    body.ratePerUnit !== undefined ? round2(body.ratePerUnit) : Number(existing.ratePerUnit);
  if (body.quantity !== undefined) updates.quantity = String(newQty);
  if (body.ratePerUnit !== undefined) updates.ratePerUnit = String(newRate);
  if (body.quantity !== undefined || body.ratePerUnit !== undefined) {
    updates.totalAmount = String(round2(newQty * newRate));
  }

  await db.transaction(async (tx) => {
    if (Object.keys(updates).length > 0) {
      await tx.update(siteSales).set(updates).where(eq(siteSales.id, id));
    }
    await writeAudit(tx, {
      siteId,
      actorUserId: auth.userId,
      module: "selling",
      action: "update",
      entityType: "site_sale",
      entityId: id,
      after: { itemDescription: body.itemDescription ?? existing.itemDescription },
      ip: meta.ip,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });
  });

  const data = await loadSaleJoined(db, [eq(siteSales.id, id)]);
  if (!data) throw new NotFoundError("Sale not found.");
  return c.json({ success: true as const, data }, 200);
});

// ─── Confirm / cancel ─────────────────────────────────────────────────────────
const confirmRouteDef = createRoute({
  method: "post",
  path: "/selling/{id}/status",
  tags: ["Selling"],
  summary: "Confirm or cancel a sale",
  description: "Permission: selling:approve. Moves a draft to confirmed or cancelled.",
  middleware: [requireAuth, requireSiteContext, requirePermission("selling", "approve")] as const,
  request: {
    params: saleIdParamSchema,
    body: { content: { "application/json": { schema: confirmSaleBodySchema } }, required: true },
  },
  responses: {
    200: {
      description: "Status set",
      content: { "application/json": { schema: apiSuccessSchema(saleSchema) } },
    },
    403: {
      description: "Permission denied",
      content: { "application/json": { schema: apiErrorSchema } },
    },
    404: { description: "Not found", content: { "application/json": { schema: apiErrorSchema } } },
    409: {
      description: "Already confirmed/cancelled",
      content: { "application/json": { schema: apiErrorSchema } },
    },
  },
});

sellingRoutes.openapi(confirmRouteDef, async (c) => {
  const { id } = c.req.valid("param");
  const { status } = c.req.valid("json");
  const auth = c.get("auth");
  const db = getDb(c);
  const meta = getRequestMeta(c);
  const siteId = auth.siteId as string;

  const existing = await loadRawSale(db, siteId, id);
  if (!existing) throw new NotFoundError("Sale not found.");
  if (existing.status !== "draft") {
    throw new ConflictError("Only draft sales can be confirmed or cancelled.");
  }

  await db.transaction(async (tx) => {
    await tx.update(siteSales).set({ status }).where(eq(siteSales.id, id));
    await writeAudit(tx, {
      siteId,
      actorUserId: auth.userId,
      module: "selling",
      action: "approve",
      entityType: "site_sale",
      entityId: id,
      before: { status: existing.status },
      after: { status },
      ip: meta.ip,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });
  });

  const data = await loadSaleJoined(db, [eq(siteSales.id, id)]);
  if (!data) throw new NotFoundError("Sale not found.");
  return c.json({ success: true as const, data }, 200);
});

// ─── Record payment ───────────────────────────────────────────────────────────
const paymentRouteDef = createRoute({
  method: "post",
  path: "/selling/{id}/payment",
  tags: ["Selling"],
  summary: "Record payment for a sale",
  description: "Permission: selling:update. Updates amount received and derives payment status.",
  middleware: [requireAuth, requireSiteContext, requirePermission("selling", "update")] as const,
  request: {
    params: saleIdParamSchema,
    body: { content: { "application/json": { schema: recordPaymentBodySchema } }, required: true },
  },
  responses: {
    200: {
      description: "Payment recorded",
      content: { "application/json": { schema: apiSuccessSchema(saleSchema) } },
    },
    403: {
      description: "Permission denied",
      content: { "application/json": { schema: apiErrorSchema } },
    },
    404: { description: "Not found", content: { "application/json": { schema: apiErrorSchema } } },
  },
});

sellingRoutes.openapi(paymentRouteDef, async (c) => {
  const { id } = c.req.valid("param");
  const { amountReceived, paymentMode } = c.req.valid("json");
  const auth = c.get("auth");
  const db = getDb(c);
  const meta = getRequestMeta(c);
  const siteId = auth.siteId as string;

  const existing = await loadRawSale(db, siteId, id);
  if (!existing) throw new NotFoundError("Sale not found.");

  const received = round2(amountReceived);
  const total = Number(existing.totalAmount);
  const newPaymentStatus = derivePaymentStatus(total, received);

  const updates: Record<string, unknown> = {
    amountReceived: String(received),
    paymentStatus: newPaymentStatus,
  };
  if (paymentMode !== undefined) updates.paymentMode = paymentMode;

  await db.transaction(async (tx) => {
    await tx.update(siteSales).set(updates).where(eq(siteSales.id, id));
    await writeAudit(tx, {
      siteId,
      actorUserId: auth.userId,
      module: "selling",
      action: "update",
      entityType: "site_sale",
      entityId: id,
      before: { paymentStatus: existing.paymentStatus },
      after: { paymentStatus: newPaymentStatus, amountReceived: received },
      ip: meta.ip,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });
  });

  const data = await loadSaleJoined(db, [eq(siteSales.id, id)]);
  if (!data) throw new NotFoundError("Sale not found.");
  return c.json({ success: true as const, data }, 200);
});

// ─── Delete ───────────────────────────────────────────────────────────────────
const deleteRouteDef = createRoute({
  method: "delete",
  path: "/selling/{id}",
  tags: ["Selling"],
  summary: "Soft-delete a sale",
  description: "Permission: selling:delete.",
  middleware: [requireAuth, requireSiteContext, requirePermission("selling", "delete")] as const,
  request: { params: saleIdParamSchema },
  responses: {
    200: {
      description: "Deleted",
      content: { "application/json": { schema: apiSuccessSchema(deleteSaleResultSchema) } },
    },
    403: {
      description: "Permission denied",
      content: { "application/json": { schema: apiErrorSchema } },
    },
    404: { description: "Not found", content: { "application/json": { schema: apiErrorSchema } } },
  },
});

sellingRoutes.openapi(deleteRouteDef, async (c) => {
  const { id } = c.req.valid("param");
  const auth = c.get("auth");
  const db = getDb(c);
  const meta = getRequestMeta(c);
  const siteId = auth.siteId as string;

  const existing = await loadRawSale(db, siteId, id);
  if (!existing) throw new NotFoundError("Sale not found.");

  await db.transaction(async (tx) => {
    await tx.update(siteSales).set({ deletedAt: new Date() }).where(eq(siteSales.id, id));
    await writeAudit(tx, {
      siteId,
      actorUserId: auth.userId,
      module: "selling",
      action: "delete",
      entityType: "site_sale",
      entityId: id,
      before: { itemDescription: existing.itemDescription, status: existing.status },
      ip: meta.ip,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });
  });

  return c.json({ success: true as const, data: { id, deleted: true } }, 200);
});
