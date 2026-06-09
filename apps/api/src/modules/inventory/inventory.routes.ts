import { materials, stockMovements, users } from "@construction-erp/db/schema";
import { apiErrorSchema, apiSuccessSchema, buildPaginationMeta } from "@construction-erp/shared";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { and, asc, count, desc, eq, gte, ilike, isNull, lte, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { writeAudit } from "../../common/audit";
import { type DbClient, getDb } from "../../common/db";
import { ConflictError, NotFoundError, ValidationError } from "../../common/errors";
import { getRequestMeta } from "../../common/http/request-meta";
import { requireAuth } from "../../common/middleware/require-auth";
import { requirePermission } from "../../common/middleware/require-permission";
import { requireSiteContext } from "../../common/middleware/require-site-context";
import type { Env } from "../../env";
import {
  type MOVEMENT_TYPES,
  createMaterialBodySchema,
  createMovementBodySchema,
  deleteMaterialResultSchema,
  listMaterialsQuerySchema,
  listMovementsQuerySchema,
  materialDetailSchema,
  materialIdParamSchema,
  materialSchema,
  stockMovementSchema,
  updateMaterialBodySchema,
} from "./inventory.schemas";

export const inventoryRoutes = new OpenAPIHono<Env>();

const creator = alias(users, "creator");

/** Round to the ledger's 3-decimal scale to avoid float artifacts. */
const round3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;

/** Today as YYYY-MM-DD (movement default / backdate fallback). */
const today = () => new Date().toISOString().slice(0, 10);

interface MaterialRow {
  id: string;
  siteId: string;
  name: string;
  sku: string | null;
  category: string | null;
  unit: string;
  currentStock: string;
  reorderLevel: string | null;
  unitCost: string | null;
  supplierRef: string | null;
  notes: string | null;
  createdAt: Date;
}

function serializeMaterial(row: MaterialRow) {
  const stock = Number(row.currentStock);
  const reorder = row.reorderLevel != null ? Number(row.reorderLevel) : null;
  return {
    id: row.id,
    siteId: row.siteId,
    name: row.name,
    sku: row.sku,
    category: row.category,
    unit: row.unit,
    currentStock: stock,
    reorderLevel: reorder,
    unitCost: row.unitCost != null ? Number(row.unitCost) : null,
    supplierRef: row.supplierRef,
    notes: row.notes,
    lowStock: reorder != null && stock <= reorder,
    createdAt: row.createdAt.toISOString(),
  };
}

const movementColumns = {
  id: stockMovements.id,
  siteId: stockMovements.siteId,
  materialId: stockMovements.materialId,
  materialName: materials.name,
  type: stockMovements.type,
  quantity: stockMovements.quantity,
  balanceAfter: stockMovements.balanceAfter,
  unitCost: stockMovements.unitCost,
  reference: stockMovements.reference,
  note: stockMovements.note,
  movementDate: stockMovements.movementDate,
  createdById: stockMovements.createdByUserId,
  createdByName: creator.name,
  createdAt: stockMovements.createdAt,
};

interface MovementRow {
  id: string;
  siteId: string;
  materialId: string;
  materialName: string | null;
  type: string;
  quantity: string;
  balanceAfter: string;
  unitCost: string | null;
  reference: string | null;
  note: string | null;
  movementDate: string;
  createdById: string;
  createdByName: string | null;
  createdAt: Date;
}

function serializeMovement(row: MovementRow) {
  return {
    id: row.id,
    siteId: row.siteId,
    materialId: row.materialId,
    materialName: row.materialName ?? null,
    type: row.type as (typeof MOVEMENT_TYPES)[number],
    quantity: Number(row.quantity),
    balanceAfter: Number(row.balanceAfter),
    unitCost: row.unitCost != null ? Number(row.unitCost) : null,
    reference: row.reference,
    note: row.note,
    movementDate: row.movementDate,
    createdBy: row.createdById ? { id: row.createdById, name: row.createdByName ?? "—" } : null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Load the raw material row (for guards / stock math), scoped to the site. */
async function loadMaterialRow(db: DbClient, siteId: string, id: string) {
  const [row] = await db
    .select()
    .from(materials)
    .where(and(eq(materials.id, id), eq(materials.siteId, siteId), isNull(materials.deletedAt)))
    .limit(1);
  return row ?? null;
}

/** A material's most recent movements (newest first), with the actor's name. */
async function loadRecentMovements(db: DbClient, materialId: string, limit = 20) {
  const rows = await db
    .select(movementColumns)
    .from(stockMovements)
    .innerJoin(materials, eq(materials.id, stockMovements.materialId))
    .leftJoin(creator, eq(creator.id, stockMovements.createdByUserId))
    .where(eq(stockMovements.materialId, materialId))
    .orderBy(desc(stockMovements.movementDate), desc(stockMovements.createdAt))
    .limit(limit);
  return rows.map((r) => serializeMovement(r as MovementRow));
}

/** Reject a SKU already used by another (non-deleted) material on the site. */
async function assertSkuFree(db: DbClient, siteId: string, sku: string, excludeId?: string) {
  const dupes = await db
    .select({ id: materials.id })
    .from(materials)
    .where(and(eq(materials.siteId, siteId), eq(materials.sku, sku), isNull(materials.deletedAt)))
    .limit(2);
  if (dupes.some((d) => d.id !== excludeId)) {
    throw new ConflictError("Another material already uses that SKU.");
  }
}

function materialSortColumn(sortBy?: string) {
  switch (sortBy) {
    case "currentStock":
      return materials.currentStock;
    case "createdAt":
      return materials.createdAt;
    default:
      return materials.name;
  }
}

// ─── List materials ──────────────────────────────────────────────────────────
const listMaterialsRoute = createRoute({
  method: "get",
  path: "/inventory/materials",
  tags: ["Inventory"],
  summary: "List materials for the active site",
  description:
    "Permission: inventory:view. Site-scoped (X-Site-Id). Filter by search, category, status=low_stock.",
  middleware: [requireAuth, requireSiteContext, requirePermission("inventory", "view")] as const,
  request: { query: listMaterialsQuerySchema },
  responses: {
    200: {
      description: "A page of materials",
      content: { "application/json": { schema: apiSuccessSchema(z.array(materialSchema)) } },
    },
    401: {
      description: "Not authenticated",
      content: { "application/json": { schema: apiErrorSchema } },
    },
    403: {
      description: "Permission denied",
      content: { "application/json": { schema: apiErrorSchema } },
    },
  },
});

inventoryRoutes.openapi(listMaterialsRoute, async (c) => {
  const { page, pageSize, sortBy, sortOrder, search, category, status } = c.req.valid("query");
  const auth = c.get("auth");
  const db = getDb(c);
  const siteId = auth.siteId as string;

  const filters = [eq(materials.siteId, siteId), isNull(materials.deletedAt)];
  if (category) filters.push(eq(materials.category, category));
  if (status === "low_stock") {
    filters.push(sql`${materials.reorderLevel} IS NOT NULL`);
    filters.push(sql`${materials.currentStock} <= ${materials.reorderLevel}`);
  }
  if (search) {
    const pattern = `%${search}%`;
    const term = or(
      ilike(materials.name, pattern),
      ilike(materials.sku, pattern),
      ilike(materials.category, pattern),
    );
    if (term) filters.push(term);
  }
  const whereClause = and(...filters);
  const orderBy =
    sortOrder === "asc" ? asc(materialSortColumn(sortBy)) : desc(materialSortColumn(sortBy));

  const [totalRow] = await db.select({ value: count() }).from(materials).where(whereClause);
  const total = totalRow?.value ?? 0;

  const rows = await db
    .select()
    .from(materials)
    .where(whereClause)
    .orderBy(orderBy)
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const data = rows.map((row) => serializeMaterial(row as MaterialRow));
  return c.json(
    { success: true as const, data, meta: buildPaginationMeta(page, pageSize, total) },
    200,
  );
});

// ─── Create material ─────────────────────────────────────────────────────────
const createMaterialRoute = createRoute({
  method: "post",
  path: "/inventory/materials",
  tags: ["Inventory"],
  summary: "Add a material to the master",
  description: "Permission: inventory:create. Optional openingStock records an opening movement.",
  middleware: [requireAuth, requireSiteContext, requirePermission("inventory", "create")] as const,
  request: {
    body: { content: { "application/json": { schema: createMaterialBodySchema } }, required: true },
  },
  responses: {
    201: {
      description: "Created",
      content: { "application/json": { schema: apiSuccessSchema(materialSchema) } },
    },
    403: {
      description: "Permission denied",
      content: { "application/json": { schema: apiErrorSchema } },
    },
    409: {
      description: "Conflict (duplicate SKU)",
      content: { "application/json": { schema: apiErrorSchema } },
    },
  },
});

inventoryRoutes.openapi(createMaterialRoute, async (c) => {
  const body = c.req.valid("json");
  const auth = c.get("auth");
  const db = getDb(c);
  const meta = getRequestMeta(c);
  const siteId = auth.siteId as string;

  const sku = body.sku?.trim() || null;
  if (sku) await assertSkuFree(db, siteId, sku);
  const opening = body.openingStock != null ? round3(body.openingStock) : 0;

  const created = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(materials)
      .values({
        siteId,
        name: body.name,
        sku,
        category: body.category ?? null,
        unit: body.unit,
        currentStock: String(opening),
        reorderLevel: body.reorderLevel != null ? String(body.reorderLevel) : null,
        unitCost: body.unitCost != null ? String(body.unitCost) : null,
        supplierRef: body.supplierRef ?? null,
        notes: body.notes ?? null,
      })
      .returning();
    if (!row) throw new ConflictError("Could not create the material. Please try again.");

    if (opening > 0) {
      await tx.insert(stockMovements).values({
        siteId,
        materialId: row.id,
        type: "adjustment",
        quantity: String(opening),
        balanceAfter: String(opening),
        reference: "Opening stock",
        movementDate: today(),
        createdByUserId: auth.userId,
      });
    }

    await writeAudit(tx, {
      siteId,
      actorUserId: auth.userId,
      module: "inventory",
      action: "create",
      entityType: "material",
      entityId: row.id,
      after: { name: row.name, sku: row.sku, unit: row.unit, openingStock: opening },
      ip: meta.ip,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });
    return row;
  });

  return c.json({ success: true as const, data: serializeMaterial(created as MaterialRow) }, 201);
});

// ─── Get material (with recent movements) ──────────────────────────────────────
const getMaterialRoute = createRoute({
  method: "get",
  path: "/inventory/materials/{id}",
  tags: ["Inventory"],
  summary: "Get a material with its recent movements",
  description: "Permission: inventory:view.",
  middleware: [requireAuth, requireSiteContext, requirePermission("inventory", "view")] as const,
  request: { params: materialIdParamSchema },
  responses: {
    200: {
      description: "The material",
      content: { "application/json": { schema: apiSuccessSchema(materialDetailSchema) } },
    },
    403: {
      description: "Permission denied",
      content: { "application/json": { schema: apiErrorSchema } },
    },
    404: { description: "Not found", content: { "application/json": { schema: apiErrorSchema } } },
  },
});

inventoryRoutes.openapi(getMaterialRoute, async (c) => {
  const { id } = c.req.valid("param");
  const auth = c.get("auth");
  const db = getDb(c);
  const row = await loadMaterialRow(db, auth.siteId as string, id);
  if (!row) throw new NotFoundError("Material not found.");
  const recentMovements = await loadRecentMovements(db, id);
  return c.json(
    { success: true as const, data: { ...serializeMaterial(row as MaterialRow), recentMovements } },
    200,
  );
});

// ─── Update material (master fields only) ──────────────────────────────────────
const updateMaterialRoute = createRoute({
  method: "patch",
  path: "/inventory/materials/{id}",
  tags: ["Inventory"],
  summary: "Update a material's master fields",
  description: "Permission: inventory:update. Stock changes only through movements, never here.",
  middleware: [requireAuth, requireSiteContext, requirePermission("inventory", "update")] as const,
  request: {
    params: materialIdParamSchema,
    body: { content: { "application/json": { schema: updateMaterialBodySchema } }, required: true },
  },
  responses: {
    200: {
      description: "Updated",
      content: { "application/json": { schema: apiSuccessSchema(materialSchema) } },
    },
    403: {
      description: "Permission denied",
      content: { "application/json": { schema: apiErrorSchema } },
    },
    404: { description: "Not found", content: { "application/json": { schema: apiErrorSchema } } },
    409: {
      description: "Conflict (duplicate SKU)",
      content: { "application/json": { schema: apiErrorSchema } },
    },
  },
});

inventoryRoutes.openapi(updateMaterialRoute, async (c) => {
  const { id } = c.req.valid("param");
  const body = c.req.valid("json");
  const auth = c.get("auth");
  const db = getDb(c);
  const meta = getRequestMeta(c);
  const siteId = auth.siteId as string;

  const existing = await loadMaterialRow(db, siteId, id);
  if (!existing) throw new NotFoundError("Material not found.");

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.unit !== undefined) updates.unit = body.unit;
  if (body.category !== undefined) updates.category = body.category;
  if (body.supplierRef !== undefined) updates.supplierRef = body.supplierRef;
  if (body.notes !== undefined) updates.notes = body.notes;
  if (body.reorderLevel !== undefined)
    updates.reorderLevel = body.reorderLevel != null ? String(body.reorderLevel) : null;
  if (body.unitCost !== undefined)
    updates.unitCost = body.unitCost != null ? String(body.unitCost) : null;
  if (body.sku !== undefined) {
    const sku = body.sku?.trim() || null;
    if (sku) await assertSkuFree(db, siteId, sku, id);
    updates.sku = sku;
  }

  await db.transaction(async (tx) => {
    if (Object.keys(updates).length > 0) {
      await tx.update(materials).set(updates).where(eq(materials.id, id));
    }
    await writeAudit(tx, {
      siteId,
      actorUserId: auth.userId,
      module: "inventory",
      action: "update",
      entityType: "material",
      entityId: id,
      before: { name: existing.name, sku: existing.sku, reorderLevel: existing.reorderLevel },
      after: { name: body.name ?? existing.name },
      ip: meta.ip,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });
  });

  const row = await loadMaterialRow(db, siteId, id);
  if (!row) throw new NotFoundError("Material not found.");
  return c.json({ success: true as const, data: serializeMaterial(row as MaterialRow) }, 200);
});

// ─── Soft-delete material ──────────────────────────────────────────────────────
const deleteMaterialRoute = createRoute({
  method: "delete",
  path: "/inventory/materials/{id}",
  tags: ["Inventory"],
  summary: "Soft-delete a material",
  description: "Permission: inventory:delete. The stock ledger is retained.",
  middleware: [requireAuth, requireSiteContext, requirePermission("inventory", "delete")] as const,
  request: { params: materialIdParamSchema },
  responses: {
    200: {
      description: "Deleted",
      content: { "application/json": { schema: apiSuccessSchema(deleteMaterialResultSchema) } },
    },
    403: {
      description: "Permission denied",
      content: { "application/json": { schema: apiErrorSchema } },
    },
    404: { description: "Not found", content: { "application/json": { schema: apiErrorSchema } } },
  },
});

inventoryRoutes.openapi(deleteMaterialRoute, async (c) => {
  const { id } = c.req.valid("param");
  const auth = c.get("auth");
  const db = getDb(c);
  const meta = getRequestMeta(c);
  const siteId = auth.siteId as string;

  const existing = await loadMaterialRow(db, siteId, id);
  if (!existing) throw new NotFoundError("Material not found.");

  await db.transaction(async (tx) => {
    await tx.update(materials).set({ deletedAt: new Date() }).where(eq(materials.id, id));
    await writeAudit(tx, {
      siteId,
      actorUserId: auth.userId,
      module: "inventory",
      action: "delete",
      entityType: "material",
      entityId: id,
      before: { name: existing.name, currentStock: existing.currentStock },
      ip: meta.ip,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });
  });

  return c.json({ success: true as const, data: { id, deleted: true } }, 200);
});

// ─── List movements (ledger) ───────────────────────────────────────────────────
const listMovementsRoute = createRoute({
  method: "get",
  path: "/inventory/movements",
  tags: ["Inventory"],
  summary: "List stock movements for the active site",
  description: "Permission: inventory:view. Filter by materialId, type, date range, reference.",
  middleware: [requireAuth, requireSiteContext, requirePermission("inventory", "view")] as const,
  request: { query: listMovementsQuerySchema },
  responses: {
    200: {
      description: "A page of movements",
      content: { "application/json": { schema: apiSuccessSchema(z.array(stockMovementSchema)) } },
    },
    403: {
      description: "Permission denied",
      content: { "application/json": { schema: apiErrorSchema } },
    },
  },
});

inventoryRoutes.openapi(listMovementsRoute, async (c) => {
  const { page, pageSize, sortOrder, materialId, type, dateFrom, dateTo, search } =
    c.req.valid("query");
  const auth = c.get("auth");
  const db = getDb(c);
  const siteId = auth.siteId as string;

  const filters = [eq(stockMovements.siteId, siteId)];
  if (materialId) filters.push(eq(stockMovements.materialId, materialId));
  if (type) filters.push(eq(stockMovements.type, type));
  if (dateFrom) filters.push(gte(stockMovements.movementDate, dateFrom));
  if (dateTo) filters.push(lte(stockMovements.movementDate, dateTo));
  if (search) filters.push(ilike(stockMovements.reference, `%${search}%`));
  const whereClause = and(...filters);

  const [totalRow] = await db.select({ value: count() }).from(stockMovements).where(whereClause);
  const total = totalRow?.value ?? 0;

  const orderDir = sortOrder === "asc" ? asc : desc;
  const rows = await db
    .select(movementColumns)
    .from(stockMovements)
    .innerJoin(materials, eq(materials.id, stockMovements.materialId))
    .leftJoin(creator, eq(creator.id, stockMovements.createdByUserId))
    .where(whereClause)
    .orderBy(orderDir(stockMovements.movementDate), orderDir(stockMovements.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const data = rows.map((r) => serializeMovement(r as MovementRow));
  return c.json(
    { success: true as const, data, meta: buildPaginationMeta(page, pageSize, total) },
    200,
  );
});

// ─── Create movement (transactional stock update) ──────────────────────────────
const createMovementRoute = createRoute({
  method: "post",
  path: "/inventory/movements",
  tags: ["Inventory"],
  summary: "Record a stock movement",
  description:
    "Permission: inventory:create. inward/outward/wastage take a positive quantity; adjustment takes newStock. Updates the material's stock in one transaction.",
  middleware: [requireAuth, requireSiteContext, requirePermission("inventory", "create")] as const,
  request: {
    body: { content: { "application/json": { schema: createMovementBodySchema } }, required: true },
  },
  responses: {
    201: {
      description: "Movement recorded",
      content: { "application/json": { schema: apiSuccessSchema(stockMovementSchema) } },
    },
    400: {
      description: "Invalid movement",
      content: { "application/json": { schema: apiErrorSchema } },
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
      description: "Conflict (insufficient stock)",
      content: { "application/json": { schema: apiErrorSchema } },
    },
  },
});

inventoryRoutes.openapi(createMovementRoute, async (c) => {
  const body = c.req.valid("json");
  const auth = c.get("auth");
  const db = getDb(c);
  const meta = getRequestMeta(c);
  const siteId = auth.siteId as string;

  const material = await loadMaterialRow(db, siteId, body.materialId);
  if (!material) throw new NotFoundError("Material not found.");

  const current = Number(material.currentStock);
  let quantity: number;
  let balanceAfter: number;

  if (body.type === "adjustment") {
    if (body.newStock === undefined) {
      throw new ValidationError("Enter the counted stock for an adjustment.", {
        fields: { newStock: "Required for an adjustment." },
      });
    }
    balanceAfter = round3(body.newStock);
    quantity = round3(Math.abs(balanceAfter - current));
  } else {
    if (body.quantity === undefined) {
      throw new ValidationError("Enter a quantity.", { fields: { quantity: "Required." } });
    }
    quantity = round3(body.quantity);
    if (body.type === "inward") {
      balanceAfter = round3(current + quantity);
    } else {
      // outward | wastage — can't take out more than is in stock.
      if (quantity > current) {
        throw new ConflictError(`Only ${current} ${material.unit} in stock.`);
      }
      balanceAfter = round3(current - quantity);
    }
  }

  const movementDate = body.movementDate ?? today();

  const created = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(stockMovements)
      .values({
        siteId,
        materialId: material.id,
        type: body.type,
        quantity: String(quantity),
        balanceAfter: String(balanceAfter),
        unitCost: body.unitCost != null ? String(body.unitCost) : null,
        reference: body.reference ?? null,
        note: body.note ?? null,
        movementDate,
        createdByUserId: auth.userId,
      })
      .returning();
    if (!row) throw new ConflictError("Could not record the movement. Please try again.");

    const materialUpdates: Record<string, unknown> = { currentStock: String(balanceAfter) };
    // Keep the master's last-known cost fresh on a priced inward.
    if (body.type === "inward" && body.unitCost != null) {
      materialUpdates.unitCost = String(body.unitCost);
    }
    await tx.update(materials).set(materialUpdates).where(eq(materials.id, material.id));

    await writeAudit(tx, {
      siteId,
      actorUserId: auth.userId,
      module: "inventory",
      action: "create",
      entityType: "stock_movement",
      entityId: row.id,
      after: {
        materialId: material.id,
        type: body.type,
        quantity,
        balanceAfter,
      },
      ip: meta.ip,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });
    return row;
  });

  return c.json(
    {
      success: true as const,
      data: serializeMovement({
        ...(created as unknown as MovementRow),
        materialName: material.name,
        createdById: auth.userId,
        createdByName: auth.name,
      }),
    },
    201,
  );
});
