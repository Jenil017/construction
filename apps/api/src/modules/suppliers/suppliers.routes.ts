import { purchases, suppliers } from "@construction-erp/db/schema";
import { apiErrorSchema, apiSuccessSchema, buildPaginationMeta } from "@construction-erp/shared";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { and, asc, count, desc, eq, ilike, isNull, ne, or, sql } from "drizzle-orm";
import { writeAudit } from "../../common/audit";
import { type DbClient, getDb } from "../../common/db";
import { ConflictError, NotFoundError } from "../../common/errors";
import { getRequestMeta } from "../../common/http/request-meta";
import { requireAuth } from "../../common/middleware/require-auth";
import { requirePermission } from "../../common/middleware/require-permission";
import { requireSiteContext } from "../../common/middleware/require-site-context";
import type { Env } from "../../env";
import {
  createSupplierBodySchema,
  deleteSupplierResultSchema,
  listSuppliersQuerySchema,
  supplierDetailSchema,
  supplierIdParamSchema,
  supplierSchema,
  updateSupplierBodySchema,
} from "./suppliers.schemas";

export const supplierRoutes = new OpenAPIHono<Env>();

interface SupplierRow {
  id: string;
  siteId: string;
  name: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  address: string | null;
  notes: string | null;
  createdAt: Date;
}

function serializeSupplier(row: SupplierRow) {
  return {
    id: row.id,
    siteId: row.siteId,
    name: row.name,
    contactPerson: row.contactPerson,
    phone: row.phone,
    email: row.email,
    gstin: row.gstin,
    address: row.address,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
  };
}

async function loadSupplierRow(db: DbClient, siteId: string, id: string) {
  const [row] = await db
    .select()
    .from(suppliers)
    .where(and(eq(suppliers.id, id), eq(suppliers.siteId, siteId), isNull(suppliers.deletedAt)))
    .limit(1);
  return row ?? null;
}

// ─── List ────────────────────────────────────────────────────────────────────────
const listRoute = createRoute({
  method: "get",
  path: "/suppliers",
  tags: ["Suppliers"],
  summary: "List suppliers for the active site",
  description: "Permission: suppliers:view. Site-scoped. Filter by search.",
  middleware: [requireAuth, requireSiteContext, requirePermission("suppliers", "view")] as const,
  request: { query: listSuppliersQuerySchema },
  responses: {
    200: {
      description: "A page of suppliers",
      content: { "application/json": { schema: apiSuccessSchema(z.array(supplierSchema)) } },
    },
    403: {
      description: "Permission denied",
      content: { "application/json": { schema: apiErrorSchema } },
    },
  },
});

supplierRoutes.openapi(listRoute, async (c) => {
  const { page, pageSize, sortOrder, search } = c.req.valid("query");
  const auth = c.get("auth");
  const db = getDb(c);
  const siteId = auth.siteId as string;

  const filters = [eq(suppliers.siteId, siteId), isNull(suppliers.deletedAt)];
  if (search) {
    const pattern = `%${search}%`;
    const term = or(
      ilike(suppliers.name, pattern),
      ilike(suppliers.contactPerson, pattern),
      ilike(suppliers.phone, pattern),
      ilike(suppliers.gstin, pattern),
    );
    if (term) filters.push(term);
  }
  const whereClause = and(...filters);

  const [totalRow] = await db.select({ value: count() }).from(suppliers).where(whereClause);
  const total = totalRow?.value ?? 0;

  const order = sortOrder === "desc" ? desc(suppliers.name) : asc(suppliers.name);
  const rows = await db
    .select()
    .from(suppliers)
    .where(whereClause)
    .orderBy(order)
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const data = rows.map((r) => serializeSupplier(r as SupplierRow));
  return c.json(
    { success: true as const, data, meta: buildPaginationMeta(page, pageSize, total) },
    200,
  );
});

// ─── Create ──────────────────────────────────────────────────────────────────────
const createRouteDef = createRoute({
  method: "post",
  path: "/suppliers",
  tags: ["Suppliers"],
  summary: "Add a supplier",
  description: "Permission: suppliers:create.",
  middleware: [requireAuth, requireSiteContext, requirePermission("suppliers", "create")] as const,
  request: {
    body: { content: { "application/json": { schema: createSupplierBodySchema } }, required: true },
  },
  responses: {
    201: {
      description: "Created",
      content: { "application/json": { schema: apiSuccessSchema(supplierSchema) } },
    },
    403: {
      description: "Permission denied",
      content: { "application/json": { schema: apiErrorSchema } },
    },
  },
});

supplierRoutes.openapi(createRouteDef, async (c) => {
  const body = c.req.valid("json");
  const auth = c.get("auth");
  const db = getDb(c);
  const meta = getRequestMeta(c);
  const siteId = auth.siteId as string;

  const created = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(suppliers)
      .values({
        siteId,
        name: body.name,
        contactPerson: body.contactPerson ?? null,
        phone: body.phone ?? null,
        email: body.email ?? null,
        gstin: body.gstin ?? null,
        address: body.address ?? null,
        notes: body.notes ?? null,
      })
      .returning();
    if (!row) throw new ConflictError("Could not add the supplier. Please try again.");
    await writeAudit(tx, {
      siteId,
      actorUserId: auth.userId,
      module: "suppliers",
      action: "create",
      entityType: "supplier",
      entityId: row.id,
      after: { name: row.name },
      ip: meta.ip,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });
    return row;
  });

  return c.json({ success: true as const, data: serializeSupplier(created as SupplierRow) }, 201);
});

// ─── Get (with outstanding) ────────────────────────────────────────────────────────
const getRouteDef = createRoute({
  method: "get",
  path: "/suppliers/{id}",
  tags: ["Suppliers"],
  summary: "Get a supplier with its outstanding balance",
  description: "Permission: suppliers:view.",
  middleware: [requireAuth, requireSiteContext, requirePermission("suppliers", "view")] as const,
  request: { params: supplierIdParamSchema },
  responses: {
    200: {
      description: "The supplier",
      content: { "application/json": { schema: apiSuccessSchema(supplierDetailSchema) } },
    },
    403: {
      description: "Permission denied",
      content: { "application/json": { schema: apiErrorSchema } },
    },
    404: { description: "Not found", content: { "application/json": { schema: apiErrorSchema } } },
  },
});

supplierRoutes.openapi(getRouteDef, async (c) => {
  const { id } = c.req.valid("param");
  const auth = c.get("auth");
  const db = getDb(c);
  const siteId = auth.siteId as string;

  const row = await loadSupplierRow(db, siteId, id);
  if (!row) throw new NotFoundError("Supplier not found.");

  const [agg] = await db
    .select({
      outstanding: sql<string>`coalesce(sum(${purchases.total} - ${purchases.amountPaid}), 0)`,
      purchaseCount: count(),
    })
    .from(purchases)
    .where(
      and(
        eq(purchases.siteId, siteId),
        eq(purchases.supplierId, id),
        isNull(purchases.deletedAt),
        ne(purchases.status, "cancelled"),
      ),
    );

  return c.json(
    {
      success: true as const,
      data: {
        ...serializeSupplier(row as SupplierRow),
        outstanding: Number(agg?.outstanding ?? 0),
        purchaseCount: agg?.purchaseCount ?? 0,
      },
    },
    200,
  );
});

// ─── Update ────────────────────────────────────────────────────────────────────────
const updateRouteDef = createRoute({
  method: "patch",
  path: "/suppliers/{id}",
  tags: ["Suppliers"],
  summary: "Update a supplier",
  description: "Permission: suppliers:update.",
  middleware: [requireAuth, requireSiteContext, requirePermission("suppliers", "update")] as const,
  request: {
    params: supplierIdParamSchema,
    body: { content: { "application/json": { schema: updateSupplierBodySchema } }, required: true },
  },
  responses: {
    200: {
      description: "Updated",
      content: { "application/json": { schema: apiSuccessSchema(supplierSchema) } },
    },
    403: {
      description: "Permission denied",
      content: { "application/json": { schema: apiErrorSchema } },
    },
    404: { description: "Not found", content: { "application/json": { schema: apiErrorSchema } } },
  },
});

supplierRoutes.openapi(updateRouteDef, async (c) => {
  const { id } = c.req.valid("param");
  const body = c.req.valid("json");
  const auth = c.get("auth");
  const db = getDb(c);
  const meta = getRequestMeta(c);
  const siteId = auth.siteId as string;

  const existing = await loadSupplierRow(db, siteId, id);
  if (!existing) throw new NotFoundError("Supplier not found.");

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.contactPerson !== undefined) updates.contactPerson = body.contactPerson;
  if (body.phone !== undefined) updates.phone = body.phone;
  if (body.email !== undefined) updates.email = body.email;
  if (body.gstin !== undefined) updates.gstin = body.gstin;
  if (body.address !== undefined) updates.address = body.address;
  if (body.notes !== undefined) updates.notes = body.notes;

  await db.transaction(async (tx) => {
    if (Object.keys(updates).length > 0) {
      await tx.update(suppliers).set(updates).where(eq(suppliers.id, id));
    }
    await writeAudit(tx, {
      siteId,
      actorUserId: auth.userId,
      module: "suppliers",
      action: "update",
      entityType: "supplier",
      entityId: id,
      before: { name: existing.name },
      after: { name: body.name ?? existing.name },
      ip: meta.ip,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });
  });

  const row = await loadSupplierRow(db, siteId, id);
  if (!row) throw new NotFoundError("Supplier not found.");
  return c.json({ success: true as const, data: serializeSupplier(row as SupplierRow) }, 200);
});

// ─── Delete ────────────────────────────────────────────────────────────────────────
const deleteRouteDef = createRoute({
  method: "delete",
  path: "/suppliers/{id}",
  tags: ["Suppliers"],
  summary: "Soft-delete a supplier",
  description: "Permission: suppliers:delete. Blocked if active purchases reference it.",
  middleware: [requireAuth, requireSiteContext, requirePermission("suppliers", "delete")] as const,
  request: { params: supplierIdParamSchema },
  responses: {
    200: {
      description: "Deleted",
      content: { "application/json": { schema: apiSuccessSchema(deleteSupplierResultSchema) } },
    },
    403: {
      description: "Permission denied",
      content: { "application/json": { schema: apiErrorSchema } },
    },
    404: { description: "Not found", content: { "application/json": { schema: apiErrorSchema } } },
    409: {
      description: "Has active purchases",
      content: { "application/json": { schema: apiErrorSchema } },
    },
  },
});

supplierRoutes.openapi(deleteRouteDef, async (c) => {
  const { id } = c.req.valid("param");
  const auth = c.get("auth");
  const db = getDb(c);
  const meta = getRequestMeta(c);
  const siteId = auth.siteId as string;

  const existing = await loadSupplierRow(db, siteId, id);
  if (!existing) throw new NotFoundError("Supplier not found.");

  const [usage] = await db
    .select({ value: count() })
    .from(purchases)
    .where(and(eq(purchases.supplierId, id), isNull(purchases.deletedAt)))
    .limit(1);
  if ((usage?.value ?? 0) > 0) {
    throw new ConflictError("This supplier has purchases. Remove or reassign them first.");
  }

  await db.transaction(async (tx) => {
    await tx.update(suppliers).set({ deletedAt: new Date() }).where(eq(suppliers.id, id));
    await writeAudit(tx, {
      siteId,
      actorUserId: auth.userId,
      module: "suppliers",
      action: "delete",
      entityType: "supplier",
      entityId: id,
      before: { name: existing.name },
      ip: meta.ip,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });
  });

  return c.json({ success: true as const, data: { id, deleted: true } }, 200);
});
