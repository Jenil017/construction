import { materials, siteSales, stockMovements, users } from "@construction-erp/db/schema";
import { apiErrorSchema, apiSuccessSchema, buildPaginationMeta } from "@construction-erp/shared";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { type SQL, and, asc, count, desc, eq, gte, ilike, isNull, lte, or, sql } from "drizzle-orm";
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
  type SALE_PAYMENT_STATUSES,
  type SALE_STATUSES,
  availableMaterialSchema,
  confirmSaleBodySchema,
  createSaleBodySchema,
  deleteSaleResultSchema,
  listAvailableMaterialsQuerySchema,
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
  materialId: string;
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

/** Load a live (non-deleted) material on this site — for stock math and snapshots. */
async function loadMaterial(db: DbClient, siteId: string, id: string) {
  const [row] = await db
    .select()
    .from(materials)
    .where(and(eq(materials.id, id), eq(materials.siteId, siteId), isNull(materials.deletedAt)))
    .limit(1);
  return row ?? null;
}

/**
 * Apply a sale's effect on inventory inside a transaction. `outward` decrements
 * stock (and guards against overselling); `inward` restores it when a sale is
 * cancelled or deleted. Inserts the ledger movement and updates the material's
 * cached `currentStock` together, returning the resulting balance.
 */
async function moveSaleStock(
  tx: DbClient,
  args: {
    siteId: string;
    materialId: string;
    quantity: number;
    direction: "outward" | "inward";
    userId: string;
    reference: string;
    movementDate: string;
  },
) {
  const [mat] = await tx
    .select()
    .from(materials)
    .where(
      and(
        eq(materials.id, args.materialId),
        eq(materials.siteId, args.siteId),
        isNull(materials.deletedAt),
      ),
    )
    .limit(1);
  if (!mat) throw new NotFoundError("The inventory item for this sale no longer exists.");

  const current = Number(mat.currentStock);
  const qty = round3(args.quantity);
  if (args.direction === "outward" && qty > current) {
    throw new ConflictError(`Only ${current} ${mat.unit} of ${mat.name} in stock.`);
  }
  const balanceAfter = round3(args.direction === "outward" ? current - qty : current + qty);

  await tx.insert(stockMovements).values({
    siteId: args.siteId,
    materialId: mat.id,
    type: args.direction,
    quantity: String(qty),
    balanceAfter: String(balanceAfter),
    reference: args.reference,
    movementDate: args.movementDate,
    createdByUserId: args.userId,
  });
  await tx
    .update(materials)
    .set({ currentStock: String(balanceAfter) })
    .where(eq(materials.id, mat.id));
  return balanceAfter;
}

function derivePaymentStatus(total: number, received: number): "unpaid" | "partial" | "paid" {
  if (received <= 0) return "unpaid";
  if (received >= total) return "paid";
  return "partial";
}

// ─── Available materials (dropdown source) ──────────────────────────────────────
const availableMaterialsRoute = createRoute({
  method: "get",
  path: "/selling/available-materials",
  tags: ["Selling"],
  summary: "List in-stock materials that can be sold",
  description:
    "Permission: selling:create. Returns only materials on the active site with stock on hand (currentStock > 0), for the sale item dropdown. Supports partial search on name/SKU/category.",
  middleware: [requireAuth, requireSiteContext, requirePermission("selling", "create")] as const,
  request: { query: listAvailableMaterialsQuerySchema },
  responses: {
    200: {
      description: "Sellable materials",
      content: {
        "application/json": { schema: apiSuccessSchema(z.array(availableMaterialSchema)) },
      },
    },
    403: {
      description: "Permission denied",
      content: { "application/json": { schema: apiErrorSchema } },
    },
  },
});

sellingRoutes.openapi(availableMaterialsRoute, async (c) => {
  const { search } = c.req.valid("query");
  const auth = c.get("auth");
  const db = getDb(c);
  const siteId = auth.siteId as string;

  const filters = [
    eq(materials.siteId, siteId),
    isNull(materials.deletedAt),
    sql`${materials.currentStock} > 0`,
  ];
  if (search) {
    const pattern = `%${search}%`;
    const term = or(
      ilike(materials.name, pattern),
      ilike(materials.sku, pattern),
      ilike(materials.category, pattern),
    );
    if (term) filters.push(term);
  }

  const rows = await db
    .select({
      id: materials.id,
      name: materials.name,
      sku: materials.sku,
      category: materials.category,
      unit: materials.unit,
      currentStock: materials.currentStock,
      unitCost: materials.unitCost,
    })
    .from(materials)
    .where(and(...filters))
    .orderBy(asc(materials.name))
    .limit(500);

  const data = rows.map((r) => ({
    id: r.id,
    name: r.name,
    sku: r.sku,
    category: r.category,
    unit: r.unit,
    currentStock: Number(r.currentStock),
    unitCost: r.unitCost != null ? Number(r.unitCost) : null,
  }));
  return c.json({ success: true as const, data }, 200);
});

// ─── List ─────────────────────────────────────────────────────────────────────
const listRoute = createRoute({
  method: "get",
  path: "/selling",
  tags: ["Selling"],
  summary: "List site sales",
  description: "Permission: selling:view. Filter by search, status, payment status, dates.",
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
  const { page, pageSize, sortOrder, search, status, paymentStatus, dateFrom, dateTo } =
    c.req.valid("query");
  const auth = c.get("auth");
  const db = getDb(c);
  const siteId = auth.siteId as string;

  const filters = [eq(siteSales.siteId, siteId), isNull(siteSales.deletedAt)];
  if (status) filters.push(eq(siteSales.status, status));
  if (paymentStatus) filters.push(eq(siteSales.paymentStatus, paymentStatus));
  if (dateFrom) filters.push(gte(siteSales.saleDate, dateFrom));
  if (dateTo) filters.push(lte(siteSales.saleDate, dateTo));
  if (search) {
    const pattern = `%${search}%`;
    const term = or(ilike(siteSales.itemDescription, pattern), ilike(siteSales.buyerName, pattern));
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

// ─── Create (decrements inventory) ──────────────────────────────────────────────
const createRouteDef = createRoute({
  method: "post",
  path: "/selling",
  tags: ["Selling"],
  summary: "Record a site sale",
  description:
    "Permission: selling:create. The sold item must be an in-stock inventory material; the sale is confirmed and the quantity is deducted from inventory in one transaction (an `outward` stock movement). Accepts an Idempotency-Key header for safe retries.",
  middleware: [
    requireAuth,
    requireSiteContext,
    requirePermission("selling", "create"),
    idempotency(),
  ] as const,
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
    404: {
      description: "Material not found",
      content: { "application/json": { schema: apiErrorSchema } },
    },
    409: {
      description: "Insufficient stock",
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

  const material = await loadMaterial(db, siteId, body.materialId);
  if (!material) throw new NotFoundError("That inventory item was not found on this site.");

  const qty = round3(body.quantity);
  const available = Number(material.currentStock);
  if (qty > available) {
    throw new ConflictError(`Only ${available} ${material.unit} of ${material.name} in stock.`);
  }

  const rate = round2(body.ratePerUnit);
  const total = round2(qty * rate);
  const amtReceived = round2(body.amountReceived ?? 0);
  const paymentStatus = derivePaymentStatus(total, amtReceived);
  const saleDate = body.saleDate ?? today();
  const buyerName = body.buyerName?.trim() || null;

  const created = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(siteSales)
      .values({
        siteId,
        saleDate,
        itemDescription: material.name,
        materialId: material.id,
        quantity: String(qty),
        unit: material.unit,
        ratePerUnit: String(rate),
        totalAmount: String(total),
        buyerName,
        buyerContact: body.buyerContact ?? null,
        paymentMode: body.paymentMode ?? null,
        amountReceived: String(amtReceived),
        paymentStatus,
        notes: body.notes ?? null,
        status: "confirmed",
        createdByUserId: auth.userId,
      })
      .returning();
    if (!row) throw new ConflictError("Could not record the sale. Please try again.");

    await moveSaleStock(tx, {
      siteId,
      materialId: material.id,
      quantity: qty,
      direction: "outward",
      userId: auth.userId,
      reference: buyerName ? `Sale to ${buyerName}` : "Sale",
      movementDate: saleDate,
    });

    await writeAudit(tx, {
      siteId,
      actorUserId: auth.userId,
      module: "selling",
      action: "create",
      entityType: "site_sale",
      entityId: row.id,
      after: { item: material.name, quantity: qty, status: row.status },
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

// ─── Update (item + quantity locked) ────────────────────────────────────────────
const updateRouteDef = createRoute({
  method: "patch",
  path: "/selling/{id}",
  tags: ["Selling"],
  summary: "Update a sale's details",
  description:
    "Permission: selling:update. The sold item and quantity are locked (they drive the stock movement); only date, rate, buyer, payment mode, and notes can be edited. To change what or how much was sold, cancel the sale (stock is returned) and record a new one.",
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
  if (existing.status === "cancelled") {
    throw new ConflictError("A cancelled sale can no longer be edited.");
  }

  const updates: Record<string, unknown> = {};
  if (body.saleDate !== undefined) updates.saleDate = body.saleDate;
  if (body.buyerName !== undefined) updates.buyerName = body.buyerName;
  if (body.buyerContact !== undefined) updates.buyerContact = body.buyerContact;
  if (body.paymentMode !== undefined) updates.paymentMode = body.paymentMode;
  if (body.notes !== undefined) updates.notes = body.notes;
  if (body.ratePerUnit !== undefined) {
    const newRate = round2(body.ratePerUnit);
    const newTotal = round2(Number(existing.quantity) * newRate);
    updates.ratePerUnit = String(newRate);
    updates.totalAmount = String(newTotal);
    updates.paymentStatus = derivePaymentStatus(newTotal, Number(existing.amountReceived));
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
      after: { item: existing.itemDescription },
      ip: meta.ip,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });
  });

  const data = await loadSaleJoined(db, [eq(siteSales.id, id)]);
  if (!data) throw new NotFoundError("Sale not found.");
  return c.json({ success: true as const, data }, 200);
});

// ─── Confirm / cancel (moves stock) ─────────────────────────────────────────────
const confirmRouteDef = createRoute({
  method: "post",
  path: "/selling/{id}/status",
  tags: ["Selling"],
  summary: "Confirm or cancel a sale",
  description:
    "Permission: selling:approve. Confirming a draft deducts the quantity from inventory; cancelling a confirmed sale returns it. Accepts an Idempotency-Key header for safe retries.",
  middleware: [
    requireAuth,
    requireSiteContext,
    requirePermission("selling", "approve"),
    idempotency(),
  ] as const,
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
      description: "Invalid status transition or insufficient stock",
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
  if (existing.status === status) throw new ConflictError(`This sale is already ${status}.`);
  if (existing.status === "cancelled") {
    throw new ConflictError("A cancelled sale cannot change status.");
  }

  await db.transaction(async (tx) => {
    if (status === "cancelled" && existing.status === "confirmed") {
      // Return the sold stock to inventory.
      await moveSaleStock(tx, {
        siteId,
        materialId: existing.materialId,
        quantity: Number(existing.quantity),
        direction: "inward",
        userId: auth.userId,
        reference: "Sale cancelled",
        movementDate: today(),
      });
    } else if (status === "confirmed" && existing.status === "draft") {
      // Draft → confirmed: take the stock now.
      await moveSaleStock(tx, {
        siteId,
        materialId: existing.materialId,
        quantity: Number(existing.quantity),
        direction: "outward",
        userId: auth.userId,
        reference: existing.buyerName ? `Sale to ${existing.buyerName}` : "Sale",
        movementDate: existing.saleDate,
      });
    }

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

// ─── Delete (restores stock) ────────────────────────────────────────────────────
const deleteRouteDef = createRoute({
  method: "delete",
  path: "/selling/{id}",
  tags: ["Selling"],
  summary: "Soft-delete a sale",
  description:
    "Permission: selling:delete. If the sale was confirmed, the sold quantity is returned to inventory in the same transaction.",
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
    // Only a confirmed sale has taken stock; a cancelled one already returned it.
    if (existing.status === "confirmed") {
      await moveSaleStock(tx, {
        siteId,
        materialId: existing.materialId,
        quantity: Number(existing.quantity),
        direction: "inward",
        userId: auth.userId,
        reference: "Sale deleted",
        movementDate: today(),
      });
    }
    await tx.update(siteSales).set({ deletedAt: new Date() }).where(eq(siteSales.id, id));
    await writeAudit(tx, {
      siteId,
      actorUserId: auth.userId,
      module: "selling",
      action: "delete",
      entityType: "site_sale",
      entityId: id,
      before: { item: existing.itemDescription, status: existing.status },
      ip: meta.ip,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });
  });

  return c.json({ success: true as const, data: { id, deleted: true } }, 200);
});
