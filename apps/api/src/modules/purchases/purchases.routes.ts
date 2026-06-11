import {
  materials,
  purchaseItems,
  purchases,
  stockMovements,
  users,
} from "@construction-erp/db/schema";
import { apiErrorSchema, apiSuccessSchema, buildPaginationMeta } from "@construction-erp/shared";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import {
  type SQL,
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  lte,
  or,
} from "drizzle-orm";
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
  type PURCHASE_PAYMENT_STATUSES,
  type PURCHASE_STATUSES,
  createPurchaseBodySchema,
  deletePurchaseResultSchema,
  listPurchasesQuerySchema,
  payPurchaseBodySchema,
  purchaseDetailSchema,
  purchaseIdParamSchema,
  purchaseSchema,
  receivePurchaseBodySchema,
  updatePurchaseBodySchema,
} from "./purchases.schemas";

export const purchaseRoutes = new OpenAPIHono<Env>();

const creator = alias(users, "po_creator");

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const round3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;
const today = () => new Date().toISOString().slice(0, 10);

interface PurchaseRow {
  id: string;
  siteId: string;
  sellerName: string | null;
  poNumber: string | null;
  orderDate: string;
  expectedDate: string | null;
  status: string;
  notes: string | null;
  total: string;
  taxAmount: string;
  amountPaid: string;
  paymentStatus: string;
  paymentMode: string | null;
  createdById: string;
  createdByName: string | null;
  createdAt: Date;
}

const purchaseColumns = {
  id: purchases.id,
  siteId: purchases.siteId,
  sellerName: purchases.sellerName,
  poNumber: purchases.poNumber,
  orderDate: purchases.orderDate,
  expectedDate: purchases.expectedDate,
  status: purchases.status,
  notes: purchases.notes,
  total: purchases.total,
  taxAmount: purchases.taxAmount,
  amountPaid: purchases.amountPaid,
  paymentStatus: purchases.paymentStatus,
  paymentMode: purchases.paymentMode,
  createdById: purchases.createdByUserId,
  createdByName: creator.name,
  createdAt: purchases.createdAt,
};

function serializePurchase(row: PurchaseRow) {
  return {
    id: row.id,
    siteId: row.siteId,
    sellerName: row.sellerName,
    poNumber: row.poNumber,
    orderDate: row.orderDate,
    expectedDate: row.expectedDate,
    status: row.status as (typeof PURCHASE_STATUSES)[number],
    notes: row.notes,
    total: Number(row.total),
    taxAmount: Number(row.taxAmount ?? 0),
    amountPaid: Number(row.amountPaid),
    paymentStatus: row.paymentStatus as (typeof PURCHASE_PAYMENT_STATUSES)[number],
    paymentMode: row.paymentMode,
    createdBy: row.createdById ? { id: row.createdById, name: row.createdByName ?? "—" } : null,
    createdAt: row.createdAt.toISOString(),
  };
}

interface ItemRow {
  id: string;
  purchaseId: string;
  materialId: string | null;
  materialName: string | null;
  description: string;
  quantity: string;
  unit: string | null;
  rate: string;
  amount: string;
  receivedQty: string;
}

function serializeItem(row: ItemRow) {
  const quantity = Number(row.quantity);
  const received = Number(row.receivedQty);
  return {
    id: row.id,
    purchaseId: row.purchaseId,
    materialId: row.materialId,
    materialName: row.materialName ?? null,
    description: row.description,
    quantity,
    unit: row.unit,
    rate: Number(row.rate),
    amount: Number(row.amount),
    receivedQty: received,
    pending: round3(quantity - received),
  };
}

async function loadPurchaseRow(db: DbClient, siteId: string, id: string) {
  const [row] = await db
    .select()
    .from(purchases)
    .where(and(eq(purchases.id, id), eq(purchases.siteId, siteId), isNull(purchases.deletedAt)))
    .limit(1);
  return row ?? null;
}

async function loadPurchaseJoined(db: DbClient, filters: SQL[]) {
  const [row] = await db
    .select(purchaseColumns)
    .from(purchases)
    .leftJoin(creator, eq(creator.id, purchases.createdByUserId))
    .where(and(...filters))
    .limit(1);
  return row ? serializePurchase(row as PurchaseRow) : null;
}

async function loadItems(db: DbClient, purchaseId: string) {
  const rows = await db
    .select({
      id: purchaseItems.id,
      purchaseId: purchaseItems.purchaseId,
      materialId: purchaseItems.materialId,
      materialName: materials.name,
      description: purchaseItems.description,
      quantity: purchaseItems.quantity,
      unit: purchaseItems.unit,
      rate: purchaseItems.rate,
      amount: purchaseItems.amount,
      receivedQty: purchaseItems.receivedQty,
    })
    .from(purchaseItems)
    .leftJoin(materials, eq(materials.id, purchaseItems.materialId))
    .where(eq(purchaseItems.purchaseId, purchaseId))
    .orderBy(asc(purchaseItems.createdAt));
  return rows.map((r) => serializeItem(r as ItemRow));
}

/** Reject material ids that aren't live materials on this site. */
async function assertSiteMaterials(db: DbClient, siteId: string, ids: string[]) {
  if (ids.length === 0) return;
  const found = await db
    .select({ id: materials.id })
    .from(materials)
    .where(
      and(eq(materials.siteId, siteId), inArray(materials.id, ids), isNull(materials.deletedAt)),
    );
  const ok = new Set(found.map((m) => m.id));
  if (ids.some((id) => !ok.has(id))) {
    throw new ValidationError("A line references a material that is not on this site.", {
      fields: { items: "Contains an unknown material." },
    });
  }
}

// ─── List ────────────────────────────────────────────────────────────────────────
const listRoute = createRoute({
  method: "get",
  path: "/purchases",
  tags: ["Purchases"],
  summary: "List purchases for the active site",
  description: "Permission: purchases:view. Filter by search, status, payment status, dates.",
  middleware: [requireAuth, requireSiteContext, requirePermission("purchases", "view")] as const,
  request: { query: listPurchasesQuerySchema },
  responses: {
    200: {
      description: "A page of purchases",
      content: { "application/json": { schema: apiSuccessSchema(z.array(purchaseSchema)) } },
    },
    403: {
      description: "Permission denied",
      content: { "application/json": { schema: apiErrorSchema } },
    },
  },
});

purchaseRoutes.openapi(listRoute, async (c) => {
  const { page, pageSize, sortOrder, search, status, paymentStatus, dateFrom, dateTo } =
    c.req.valid("query");
  const auth = c.get("auth");
  const db = getDb(c);
  const siteId = auth.siteId as string;

  const filters = [eq(purchases.siteId, siteId), isNull(purchases.deletedAt)];
  if (status) filters.push(eq(purchases.status, status));
  if (paymentStatus) filters.push(eq(purchases.paymentStatus, paymentStatus));
  if (dateFrom) filters.push(gte(purchases.orderDate, dateFrom));
  if (dateTo) filters.push(lte(purchases.orderDate, dateTo));
  if (search) {
    const pattern = `%${search}%`;
    const term = or(
      ilike(purchases.poNumber, pattern),
      ilike(purchases.sellerName, pattern),
      ilike(purchases.notes, pattern),
    );
    if (term) filters.push(term);
  }
  const whereClause = and(...filters);

  const [totalRow] = await db.select({ value: count() }).from(purchases).where(whereClause);
  const total = totalRow?.value ?? 0;

  const dir = sortOrder === "asc" ? asc : desc;
  const rows = await db
    .select(purchaseColumns)
    .from(purchases)
    .leftJoin(creator, eq(creator.id, purchases.createdByUserId))
    .where(whereClause)
    .orderBy(dir(purchases.orderDate), dir(purchases.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const data = rows.map((r) => serializePurchase(r as PurchaseRow));
  return c.json(
    { success: true as const, data, meta: buildPaginationMeta(page, pageSize, total) },
    200,
  );
});

// ─── Create ──────────────────────────────────────────────────────────────────────
const createRouteDef = createRoute({
  method: "post",
  path: "/purchases",
  tags: ["Purchases"],
  summary: "Create a purchase (with line items)",
  description:
    "Permission: purchases:create. Lines may link a material so receiving inwards stock. Accepts an Idempotency-Key header for safe retries.",
  middleware: [
    requireAuth,
    requireSiteContext,
    requirePermission("purchases", "create"),
    idempotency(),
  ] as const,
  request: {
    body: { content: { "application/json": { schema: createPurchaseBodySchema } }, required: true },
  },
  responses: {
    201: {
      description: "Created",
      content: { "application/json": { schema: apiSuccessSchema(purchaseDetailSchema) } },
    },
    400: {
      description: "Invalid line / material",
      content: { "application/json": { schema: apiErrorSchema } },
    },
    403: {
      description: "Permission denied",
      content: { "application/json": { schema: apiErrorSchema } },
    },
  },
});

purchaseRoutes.openapi(createRouteDef, async (c) => {
  const body = c.req.valid("json");
  const auth = c.get("auth");
  const db = getDb(c);
  const meta = getRequestMeta(c);
  const siteId = auth.siteId as string;

  const materialIds = body.items
    .map((i) => i.materialId)
    .filter((id): id is string => typeof id === "string");
  await assertSiteMaterials(db, siteId, materialIds);

  const lines = body.items.map((i) => {
    const quantity = round3(i.quantity);
    const rate = round2(i.rate);
    return {
      materialId: i.materialId ?? null,
      description: i.description,
      quantity: String(quantity),
      unit: i.unit ?? null,
      rate: String(rate),
      amount: String(round2(quantity * rate)),
    };
  });
  const subtotal = round2(lines.reduce((s, l) => s + Number(l.amount), 0));
  const taxAmt = round2(body.taxAmount ?? 0);
  const total = round2(subtotal + taxAmt);
  const amtPaid = round2(body.amountPaid ?? 0);
  const paymentStatus: "unpaid" | "partial" | "paid" =
    amtPaid <= 0 ? "unpaid" : amtPaid >= total ? "paid" : "partial";

  const id = await db.transaction(async (tx) => {
    const [po] = await tx
      .insert(purchases)
      .values({
        siteId,
        sellerName: body.sellerName,
        poNumber: body.poNumber ?? null,
        orderDate: body.orderDate ?? today(),
        expectedDate: null,
        status: "received",
        notes: body.notes ?? null,
        total: String(total),
        taxAmount: String(taxAmt),
        amountPaid: String(amtPaid),
        paymentStatus,
        paymentMode: body.paymentMode ?? null,
        createdByUserId: auth.userId,
      })
      .returning();
    if (!po) throw new ConflictError("Could not create the purchase. Please try again.");

    // Items are fully received on entry — mark receivedQty = quantity
    await tx
      .insert(purchaseItems)
      .values(lines.map((l) => ({ ...l, siteId, purchaseId: po.id, receivedQty: l.quantity })));

    // Auto-inward stock for every material-linked line
    for (const line of lines) {
      if (!line.materialId) continue;
      const [mat] = await tx
        .select()
        .from(materials)
        .where(
          and(
            eq(materials.id, line.materialId),
            eq(materials.siteId, siteId),
            isNull(materials.deletedAt),
          ),
        )
        .limit(1);
      if (!mat) continue;
      const qty = Number(line.quantity);
      const balanceAfter = round3(Number(mat.currentStock) + qty);
      await tx.insert(stockMovements).values({
        siteId,
        materialId: mat.id,
        type: "inward",
        quantity: line.quantity,
        balanceAfter: String(balanceAfter),
        unitCost: line.rate,
        reference: body.poNumber ? `PO ${body.poNumber}` : "Purchase",
        movementDate: body.orderDate ?? today(),
        createdByUserId: auth.userId,
      });
      await tx
        .update(materials)
        .set({ currentStock: String(balanceAfter), unitCost: line.rate })
        .where(eq(materials.id, mat.id));
    }

    await writeAudit(tx, {
      siteId,
      actorUserId: auth.userId,
      module: "purchases",
      action: "create",
      entityType: "purchase",
      entityId: po.id,
      after: { sellerName: body.sellerName, status: "received", lines: lines.length },
      ip: meta.ip,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });
    return po.id;
  });

  const header = await loadPurchaseJoined(db, [eq(purchases.id, id)]);
  if (!header) throw new NotFoundError("Purchase not found.");
  const items = await loadItems(db, id);
  return c.json({ success: true as const, data: { ...header, items } }, 201);
});

// ─── Get detail ────────────────────────────────────────────────────────────────────
const getRouteDef = createRoute({
  method: "get",
  path: "/purchases/{id}",
  tags: ["Purchases"],
  summary: "Get a purchase with its line items",
  description: "Permission: purchases:view.",
  middleware: [requireAuth, requireSiteContext, requirePermission("purchases", "view")] as const,
  request: { params: purchaseIdParamSchema },
  responses: {
    200: {
      description: "The purchase",
      content: { "application/json": { schema: apiSuccessSchema(purchaseDetailSchema) } },
    },
    403: {
      description: "Permission denied",
      content: { "application/json": { schema: apiErrorSchema } },
    },
    404: { description: "Not found", content: { "application/json": { schema: apiErrorSchema } } },
  },
});

purchaseRoutes.openapi(getRouteDef, async (c) => {
  const { id } = c.req.valid("param");
  const auth = c.get("auth");
  const db = getDb(c);
  const siteId = auth.siteId as string;

  const header = await loadPurchaseJoined(db, [
    eq(purchases.id, id),
    eq(purchases.siteId, siteId),
    isNull(purchases.deletedAt),
  ]);
  if (!header) throw new NotFoundError("Purchase not found.");
  const items = await loadItems(db, id);
  return c.json({ success: true as const, data: { ...header, items } }, 200);
});

// ─── Update (header + items while draft) ─────────────────────────────────────────────
const updateRouteDef = createRoute({
  method: "patch",
  path: "/purchases/{id}",
  tags: ["Purchases"],
  summary: "Update a purchase",
  description:
    "Permission: purchases:update. Line items can be changed only while the purchase is a draft.",
  middleware: [requireAuth, requireSiteContext, requirePermission("purchases", "update")] as const,
  request: {
    params: purchaseIdParamSchema,
    body: { content: { "application/json": { schema: updatePurchaseBodySchema } }, required: true },
  },
  responses: {
    200: {
      description: "Updated",
      content: { "application/json": { schema: apiSuccessSchema(purchaseDetailSchema) } },
    },
    400: {
      description: "Invalid line / material",
      content: { "application/json": { schema: apiErrorSchema } },
    },
    403: {
      description: "Permission denied",
      content: { "application/json": { schema: apiErrorSchema } },
    },
    404: { description: "Not found", content: { "application/json": { schema: apiErrorSchema } } },
    409: {
      description: "Items locked (not a draft)",
      content: { "application/json": { schema: apiErrorSchema } },
    },
  },
});

purchaseRoutes.openapi(updateRouteDef, async (c) => {
  const { id } = c.req.valid("param");
  const body = c.req.valid("json");
  const auth = c.get("auth");
  const db = getDb(c);
  const meta = getRequestMeta(c);
  const siteId = auth.siteId as string;

  const existing = await loadPurchaseRow(db, siteId, id);
  if (!existing) throw new NotFoundError("Purchase not found.");

  if (body.items && existing.status !== "draft") {
    throw new ConflictError("Line items can only be changed while the purchase is a draft.");
  }

  let newLines:
    | {
        materialId: string | null;
        description: string;
        quantity: string;
        unit: string | null;
        rate: string;
        amount: string;
      }[]
    | null = null;
  if (body.items) {
    const ids = body.items
      .map((i) => i.materialId)
      .filter((x): x is string => typeof x === "string");
    await assertSiteMaterials(db, siteId, ids);
    newLines = body.items.map((i) => {
      const quantity = round3(i.quantity);
      const rate = round2(i.rate);
      return {
        materialId: i.materialId ?? null,
        description: i.description,
        quantity: String(quantity),
        unit: i.unit ?? null,
        rate: String(rate),
        amount: String(round2(quantity * rate)),
      };
    });
  }

  const updates: Record<string, unknown> = {};
  if (body.sellerName !== undefined) updates.sellerName = body.sellerName;
  if (body.poNumber !== undefined) updates.poNumber = body.poNumber;
  if (body.orderDate !== undefined) updates.orderDate = body.orderDate;
  if (body.expectedDate !== undefined) updates.expectedDate = body.expectedDate;
  if (body.notes !== undefined) updates.notes = body.notes;
  if (body.status !== undefined) updates.status = body.status;
  if (body.paymentMode !== undefined) updates.paymentMode = body.paymentMode;
  if (body.taxAmount !== undefined) {
    updates.taxAmount = String(round2(body.taxAmount));
  }
  if (newLines) {
    const subtotal = round2(newLines.reduce((s, l) => s + Number(l.amount), 0));
    const taxAmt =
      body.taxAmount !== undefined ? round2(body.taxAmount) : Number(existing.taxAmount ?? 0);
    updates.total = String(round2(subtotal + taxAmt));
  } else if (body.taxAmount !== undefined) {
    const subtotal = round2(Number(existing.total) - Number(existing.taxAmount ?? 0));
    updates.total = String(round2(subtotal + round2(body.taxAmount)));
  }

  await db.transaction(async (tx) => {
    if (newLines) {
      await tx.delete(purchaseItems).where(eq(purchaseItems.purchaseId, id));
      await tx
        .insert(purchaseItems)
        .values(newLines.map((l) => ({ ...l, siteId, purchaseId: id })));
    }
    if (Object.keys(updates).length > 0) {
      await tx.update(purchases).set(updates).where(eq(purchases.id, id));
    }
    await writeAudit(tx, {
      siteId,
      actorUserId: auth.userId,
      module: "purchases",
      action: "update",
      entityType: "purchase",
      entityId: id,
      before: { status: existing.status },
      after: { status: body.status ?? existing.status, itemsReplaced: !!newLines },
      ip: meta.ip,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });
  });

  const header = await loadPurchaseJoined(db, [eq(purchases.id, id)]);
  if (!header) throw new NotFoundError("Purchase not found.");
  const items = await loadItems(db, id);
  return c.json({ success: true as const, data: { ...header, items } }, 200);
});

// ─── Receive goods (→ inventory inward) ──────────────────────────────────────────────
const receiveRoute = createRoute({
  method: "post",
  path: "/purchases/{id}/receive",
  tags: ["Purchases"],
  summary: "Receive goods against a purchase",
  description:
    "Permission: purchases:update. Sets received quantities (only increases) and inwards material-linked lines into inventory in one transaction. Accepts an Idempotency-Key header for safe retries.",
  middleware: [
    requireAuth,
    requireSiteContext,
    requirePermission("purchases", "update"),
    idempotency(),
  ] as const,
  request: {
    params: purchaseIdParamSchema,
    body: {
      content: { "application/json": { schema: receivePurchaseBodySchema } },
      required: true,
    },
  },
  responses: {
    200: {
      description: "Received",
      content: { "application/json": { schema: apiSuccessSchema(purchaseDetailSchema) } },
    },
    403: {
      description: "Permission denied",
      content: { "application/json": { schema: apiErrorSchema } },
    },
    404: { description: "Not found", content: { "application/json": { schema: apiErrorSchema } } },
    409: {
      description: "Cancelled purchase",
      content: { "application/json": { schema: apiErrorSchema } },
    },
  },
});

purchaseRoutes.openapi(receiveRoute, async (c) => {
  const { id } = c.req.valid("param");
  const body = c.req.valid("json");
  const auth = c.get("auth");
  const db = getDb(c);
  const meta = getRequestMeta(c);
  const siteId = auth.siteId as string;

  const po = await loadPurchaseRow(db, siteId, id);
  if (!po) throw new NotFoundError("Purchase not found.");
  if (po.status === "cancelled") throw new ConflictError("This purchase is cancelled.");

  const items = await db.select().from(purchaseItems).where(eq(purchaseItems.purchaseId, id));
  const requested = new Map(body.items.map((i) => [i.itemId, round3(i.receivedQty)]));

  await db.transaction(async (tx) => {
    let movements = 0;
    for (const item of items) {
      const req = requested.get(item.id);
      if (req === undefined) continue;
      const quantity = Number(item.quantity);
      const current = Number(item.receivedQty);
      const next = Math.min(Math.max(req, current), quantity);
      const delta = round3(next - current);
      if (delta <= 0) continue;

      await tx
        .update(purchaseItems)
        .set({ receivedQty: String(next) })
        .where(eq(purchaseItems.id, item.id));

      if (item.materialId) {
        const [mat] = await tx
          .select()
          .from(materials)
          .where(
            and(
              eq(materials.id, item.materialId),
              eq(materials.siteId, siteId),
              isNull(materials.deletedAt),
            ),
          )
          .limit(1);
        if (mat) {
          const balanceAfter = round3(Number(mat.currentStock) + delta);
          await tx.insert(stockMovements).values({
            siteId,
            materialId: mat.id,
            type: "inward",
            quantity: String(delta),
            balanceAfter: String(balanceAfter),
            unitCost: item.rate,
            reference: po.poNumber ? `PO ${po.poNumber}` : "Purchase receipt",
            movementDate: today(),
            createdByUserId: auth.userId,
          });
          await tx
            .update(materials)
            .set({ currentStock: String(balanceAfter), unitCost: item.rate })
            .where(eq(materials.id, mat.id));
          movements += 1;
        }
      }
    }

    const fresh = await tx.select().from(purchaseItems).where(eq(purchaseItems.purchaseId, id));
    const anyReceived = fresh.some((i) => Number(i.receivedQty) > 0);
    const allReceived = fresh.every((i) => Number(i.receivedQty) >= Number(i.quantity));
    const status = allReceived
      ? "received"
      : anyReceived
        ? "partially_received"
        : po.status === "draft"
          ? "ordered"
          : po.status;
    await tx.update(purchases).set({ status }).where(eq(purchases.id, id));

    await writeAudit(tx, {
      siteId,
      actorUserId: auth.userId,
      module: "purchases",
      action: "update",
      entityType: "purchase_receipt",
      entityId: id,
      after: { status, stockMovements: movements },
      ip: meta.ip,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });
  });

  const header = await loadPurchaseJoined(db, [eq(purchases.id, id)]);
  if (!header) throw new NotFoundError("Purchase not found.");
  const result = await loadItems(db, id);
  return c.json({ success: true as const, data: { ...header, items: result } }, 200);
});

// ─── Record seller payment ─────────────────────────────────────────────────────────
const payRoute = createRoute({
  method: "post",
  path: "/purchases/{id}/pay",
  tags: ["Purchases"],
  summary: "Record a seller payment",
  description:
    "Permission: purchases:update. Sets the cumulative amount paid; status becomes paid/partial/unpaid. Accepts an Idempotency-Key header for safe retries.",
  middleware: [
    requireAuth,
    requireSiteContext,
    requirePermission("purchases", "update"),
    idempotency(),
  ] as const,
  request: {
    params: purchaseIdParamSchema,
    body: { content: { "application/json": { schema: payPurchaseBodySchema } }, required: true },
  },
  responses: {
    200: {
      description: "Payment recorded",
      content: { "application/json": { schema: apiSuccessSchema(purchaseSchema) } },
    },
    400: {
      description: "Amount exceeds total",
      content: { "application/json": { schema: apiErrorSchema } },
    },
    403: {
      description: "Permission denied",
      content: { "application/json": { schema: apiErrorSchema } },
    },
    404: { description: "Not found", content: { "application/json": { schema: apiErrorSchema } } },
  },
});

purchaseRoutes.openapi(payRoute, async (c) => {
  const { id } = c.req.valid("param");
  const body = c.req.valid("json");
  const auth = c.get("auth");
  const db = getDb(c);
  const meta = getRequestMeta(c);
  const siteId = auth.siteId as string;

  const po = await loadPurchaseRow(db, siteId, id);
  if (!po) throw new NotFoundError("Purchase not found.");

  const total = Number(po.total);
  const amountPaid = round2(body.amountPaid);
  if (amountPaid > total) {
    throw new ValidationError("The amount paid cannot exceed the purchase total.", {
      fields: { amountPaid: "Cannot exceed the total." },
    });
  }
  const paymentStatus: (typeof PURCHASE_PAYMENT_STATUSES)[number] =
    amountPaid <= 0 ? "unpaid" : amountPaid >= total ? "paid" : "partial";

  await db.transaction(async (tx) => {
    await tx
      .update(purchases)
      .set({ amountPaid: String(amountPaid), paymentStatus, paymentMode: body.paymentMode ?? null })
      .where(eq(purchases.id, id));
    await writeAudit(tx, {
      siteId,
      actorUserId: auth.userId,
      module: "purchases",
      action: "update",
      entityType: "purchase_payment",
      entityId: id,
      after: { paymentStatus, paymentMode: body.paymentMode ?? null },
      ip: meta.ip,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });
  });

  const header = await loadPurchaseJoined(db, [eq(purchases.id, id)]);
  if (!header) throw new NotFoundError("Purchase not found.");
  return c.json({ success: true as const, data: header }, 200);
});

// ─── Delete ────────────────────────────────────────────────────────────────────────
const deleteRouteDef = createRoute({
  method: "delete",
  path: "/purchases/{id}",
  tags: ["Purchases"],
  summary: "Soft-delete a purchase",
  description:
    "Permission: purchases:delete. Blocked once goods have been received (inventory was updated).",
  middleware: [requireAuth, requireSiteContext, requirePermission("purchases", "delete")] as const,
  request: { params: purchaseIdParamSchema },
  responses: {
    200: {
      description: "Deleted",
      content: { "application/json": { schema: apiSuccessSchema(deletePurchaseResultSchema) } },
    },
    403: {
      description: "Permission denied",
      content: { "application/json": { schema: apiErrorSchema } },
    },
    404: { description: "Not found", content: { "application/json": { schema: apiErrorSchema } } },
    409: {
      description: "Goods already received",
      content: { "application/json": { schema: apiErrorSchema } },
    },
  },
});

purchaseRoutes.openapi(deleteRouteDef, async (c) => {
  const { id } = c.req.valid("param");
  const auth = c.get("auth");
  const db = getDb(c);
  const meta = getRequestMeta(c);
  const siteId = auth.siteId as string;

  const existing = await loadPurchaseRow(db, siteId, id);
  if (!existing) throw new NotFoundError("Purchase not found.");

  await db.transaction(async (tx) => {
    await tx.update(purchases).set({ deletedAt: new Date() }).where(eq(purchases.id, id));
    await writeAudit(tx, {
      siteId,
      actorUserId: auth.userId,
      module: "purchases",
      action: "delete",
      entityType: "purchase",
      entityId: id,
      before: { status: existing.status },
      ip: meta.ip,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });
  });

  return c.json({ success: true as const, data: { id, deleted: true } }, 200);
});
