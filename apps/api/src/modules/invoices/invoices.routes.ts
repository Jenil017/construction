import { invoiceItems, invoices, sites, users } from "@construction-erp/db/schema";
import { apiErrorSchema, apiSuccessSchema, buildPaginationMeta } from "@construction-erp/shared";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import {
  type SQL,
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  gte,
  ilike,
  inArray,
  isNull,
  lte,
  max,
  or,
} from "drizzle-orm";
import { writeAudit } from "../../common/audit";
import { type DbClient, getDb } from "../../common/db";
import { ConflictError, NotFoundError } from "../../common/errors";
import { getRequestMeta } from "../../common/http/request-meta";
import { idempotency } from "../../common/idempotency";
import { requireAuth } from "../../common/middleware/require-auth";
import { requirePermission } from "../../common/middleware/require-permission";
import { requireSiteContext } from "../../common/middleware/require-site-context";
import type { Env } from "../../env";
import { renderInvoicePdf } from "./invoices.pdf";
import {
  type INVOICE_PAYMENT_STATUSES,
  type INVOICE_STATUSES,
  type INVOICE_TYPES,
  type SUPPLY_TYPES,
  cancelInvoiceBodySchema,
  createInvoiceBodySchema,
  deleteInvoiceResultSchema,
  invoiceIdParamSchema,
  invoiceSchema,
  listInvoicesQuerySchema,
  recordInvoicePaymentBodySchema,
  updateInvoiceBodySchema,
} from "./invoices.schemas";
import {
  type InvoiceType,
  type RawLine,
  type SupplyType,
  computeInvoice,
  financialYear,
  formatInvoiceNumber,
  invoiceNumberPrefix,
  round2,
} from "./invoices.service";

export const invoiceRoutes = new OpenAPIHono<Env>();

const today = () => new Date().toISOString().slice(0, 10);

type InvoiceRow = typeof invoices.$inferSelect & { createdByName: string | null };
type ItemRow = typeof invoiceItems.$inferSelect;

const headerColumns = { ...getTableColumns(invoices), createdByName: users.name };

function serializeItem(it: ItemRow) {
  return {
    id: it.id,
    materialId: it.materialId,
    description: it.description,
    hsnCode: it.hsnCode,
    quantity: Number(it.quantity),
    unit: it.unit,
    rate: Number(it.rate),
    discountAmount: Number(it.discountAmount),
    taxableValue: Number(it.taxableValue),
    gstRate: Number(it.gstRate),
    cgstAmount: Number(it.cgstAmount),
    sgstAmount: Number(it.sgstAmount),
    igstAmount: Number(it.igstAmount),
    taxAmount: Number(it.taxAmount),
    lineTotal: Number(it.lineTotal),
  };
}

function serializeInvoice(row: InvoiceRow, items: ItemRow[]) {
  return {
    id: row.id,
    siteId: row.siteId,
    invoiceType: row.invoiceType as (typeof INVOICE_TYPES)[number],
    invoiceNumber: row.invoiceNumber,
    financialYear: row.financialYear,
    invoiceDate: row.invoiceDate,
    dueDate: row.dueDate,
    supplyType: row.supplyType as (typeof SUPPLY_TYPES)[number],
    placeOfSupply: row.placeOfSupply,
    reverseCharge: row.reverseCharge,
    sellerName: row.sellerName,
    sellerGstin: row.sellerGstin,
    sellerAddress: row.sellerAddress,
    sellerState: row.sellerState,
    sellerStateCode: row.sellerStateCode,
    buyerName: row.buyerName,
    buyerGstin: row.buyerGstin,
    buyerAddress: row.buyerAddress,
    buyerState: row.buyerState,
    buyerStateCode: row.buyerStateCode,
    buyerContact: row.buyerContact,
    subTotal: Number(row.subTotal),
    discountTotal: Number(row.discountTotal),
    cgstTotal: Number(row.cgstTotal),
    sgstTotal: Number(row.sgstTotal),
    igstTotal: Number(row.igstTotal),
    taxTotal: Number(row.taxTotal),
    roundOff: Number(row.roundOff),
    grandTotal: Number(row.grandTotal),
    amountInWords: row.amountInWords,
    paymentStatus: row.paymentStatus as (typeof INVOICE_PAYMENT_STATUSES)[number],
    amountReceived: Number(row.amountReceived),
    paymentMode: row.paymentMode,
    notes: row.notes,
    status: row.status as (typeof INVOICE_STATUSES)[number],
    createdBy: row.createdByUserId
      ? { id: row.createdByUserId, name: row.createdByName ?? "—" }
      : null,
    createdAt: row.createdAt.toISOString(),
    items: items.map(serializeItem),
  };
}

async function loadItems(db: DbClient, invoiceId: string) {
  return db
    .select()
    .from(invoiceItems)
    .where(eq(invoiceItems.invoiceId, invoiceId))
    .orderBy(asc(invoiceItems.sortOrder));
}

async function loadInvoiceJoined(db: DbClient, filters: SQL[]) {
  const [row] = await db
    .select(headerColumns)
    .from(invoices)
    .leftJoin(users, eq(users.id, invoices.createdByUserId))
    .where(and(...filters))
    .limit(1);
  if (!row) return null;
  const items = await loadItems(db, row.id);
  return serializeInvoice(row as InvoiceRow, items);
}

async function loadRawInvoice(db: DbClient, siteId: string, id: string) {
  const [row] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, id), eq(invoices.siteId, siteId), isNull(invoices.deletedAt)))
    .limit(1);
  return row ?? null;
}

function derivePaymentStatus(total: number, received: number): "unpaid" | "partial" | "paid" {
  if (received <= 0) return "unpaid";
  if (received >= total) return "paid";
  return "partial";
}

/** Postgres unique-violation (used to retry invoice-number assignment on a race). */
function isUniqueViolation(err: unknown): boolean {
  const code = (err as { code?: string })?.code;
  return code === "23505" || /duplicate key|unique constraint/i.test(String(err));
}

interface SellerSnapshot {
  sellerName: string;
  sellerGstin: string | null;
  sellerAddress: string | null;
  sellerState: string | null;
  sellerStateCode: string | null;
}

/** Resolve seller fields from the request overrides, falling back to the site. */
function resolveSeller(
  body: {
    sellerName?: string | null;
    sellerGstin?: string | null;
    sellerAddress?: string | null;
    sellerState?: string | null;
    sellerStateCode?: string | null;
  },
  site: {
    name: string;
    legalName: string | null;
    gstin: string | null;
    address: string | null;
    state: string | null;
    stateCode: string | null;
  },
): SellerSnapshot {
  return {
    sellerName: body.sellerName?.trim() || site.legalName || site.name,
    sellerGstin: body.sellerGstin ?? site.gstin ?? null,
    sellerAddress: body.sellerAddress ?? site.address ?? null,
    sellerState: body.sellerState ?? site.state ?? null,
    sellerStateCode: body.sellerStateCode ?? site.stateCode ?? null,
  };
}

/** intra when seller & buyer are in the same state (or buyer state unknown); inter otherwise. */
function resolveSupplyType(
  sellerStateCode: string | null,
  buyerStateCode?: string | null,
): SupplyType {
  if (sellerStateCode && buyerStateCode && sellerStateCode !== buyerStateCode) return "inter";
  return "intra";
}

const toRawLines = (items: z.infer<typeof createInvoiceBodySchema>["items"]): RawLine[] =>
  items.map((it) => ({
    description: it.description,
    hsnCode: it.hsnCode,
    quantity: it.quantity,
    unit: it.unit,
    rate: it.rate,
    discountAmount: it.discountAmount,
    gstRate: it.gstRate,
    materialId: it.materialId,
  }));

// ─── List ─────────────────────────────────────────────────────────────────────
const listRoute = createRoute({
  method: "get",
  path: "/invoices",
  tags: ["Invoices"],
  summary: "List invoices",
  description: "Permission: invoices:view. Filter by search, type, status, payment status, dates.",
  middleware: [requireAuth, requireSiteContext, requirePermission("invoices", "view")] as const,
  request: { query: listInvoicesQuerySchema },
  responses: {
    200: {
      description: "A page of invoices",
      content: { "application/json": { schema: apiSuccessSchema(z.array(invoiceSchema)) } },
    },
    403: {
      description: "Permission denied",
      content: { "application/json": { schema: apiErrorSchema } },
    },
  },
});

invoiceRoutes.openapi(listRoute, async (c) => {
  const {
    page,
    pageSize,
    sortOrder,
    search,
    invoiceType,
    status,
    paymentStatus,
    dateFrom,
    dateTo,
  } = c.req.valid("query");
  const auth = c.get("auth");
  const db = getDb(c);
  const siteId = auth.siteId as string;

  const filters = [eq(invoices.siteId, siteId), isNull(invoices.deletedAt)];
  if (invoiceType) filters.push(eq(invoices.invoiceType, invoiceType));
  if (status) filters.push(eq(invoices.status, status));
  if (paymentStatus) filters.push(eq(invoices.paymentStatus, paymentStatus));
  if (dateFrom) filters.push(gte(invoices.invoiceDate, dateFrom));
  if (dateTo) filters.push(lte(invoices.invoiceDate, dateTo));
  if (search) {
    const pattern = `%${search}%`;
    const term = or(ilike(invoices.invoiceNumber, pattern), ilike(invoices.buyerName, pattern));
    if (term) filters.push(term);
  }
  const whereClause = and(...filters);

  const [totalRow] = await db.select({ value: count() }).from(invoices).where(whereClause);
  const total = totalRow?.value ?? 0;

  const dir = sortOrder === "asc" ? asc : desc;
  const rows = await db
    .select(headerColumns)
    .from(invoices)
    .leftJoin(users, eq(users.id, invoices.createdByUserId))
    .where(whereClause)
    .orderBy(dir(invoices.invoiceDate), dir(invoices.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  // Load all line items for the page in one query, then group by invoice.
  const ids = rows.map((r) => r.id);
  const items = ids.length
    ? await db
        .select()
        .from(invoiceItems)
        .where(inArray(invoiceItems.invoiceId, ids))
        .orderBy(asc(invoiceItems.sortOrder))
    : [];
  const byInvoice = new Map<string, ItemRow[]>();
  for (const it of items) {
    const list = byInvoice.get(it.invoiceId) ?? [];
    list.push(it);
    byInvoice.set(it.invoiceId, list);
  }

  const data = rows.map((r) => serializeInvoice(r as InvoiceRow, byInvoice.get(r.id) ?? []));
  return c.json(
    { success: true as const, data, meta: buildPaginationMeta(page, pageSize, total) },
    200,
  );
});

// ─── Create ─────────────────────────────────────────────────────────────────────
const createRouteDef = createRoute({
  method: "post",
  path: "/invoices",
  tags: ["Invoices"],
  summary: "Create an invoice",
  description:
    "Permission: invoices:create. Creates a GST tax invoice (`tax`) or a non-GST bill of supply (`bill`) with line items. A per-site, per-type, per-financial-year invoice number is assigned. Seller fields default from the site. Accepts an Idempotency-Key header.",
  middleware: [
    requireAuth,
    requireSiteContext,
    requirePermission("invoices", "create"),
    idempotency(),
  ] as const,
  request: {
    body: { content: { "application/json": { schema: createInvoiceBodySchema } }, required: true },
  },
  responses: {
    201: {
      description: "Created",
      content: { "application/json": { schema: apiSuccessSchema(invoiceSchema) } },
    },
    403: {
      description: "Permission denied",
      content: { "application/json": { schema: apiErrorSchema } },
    },
    404: {
      description: "Site not found",
      content: { "application/json": { schema: apiErrorSchema } },
    },
  },
});

invoiceRoutes.openapi(createRouteDef, async (c) => {
  const body = c.req.valid("json");
  const auth = c.get("auth");
  const db = getDb(c);
  const meta = getRequestMeta(c);
  const siteId = auth.siteId as string;

  const [site] = await db
    .select({
      name: sites.name,
      code: sites.code,
      legalName: sites.legalName,
      gstin: sites.gstin,
      address: sites.address,
      state: sites.state,
      stateCode: sites.stateCode,
    })
    .from(sites)
    .where(and(eq(sites.id, siteId), isNull(sites.deletedAt)))
    .limit(1);
  if (!site) throw new NotFoundError("Active site not found.");

  const invoiceType = body.invoiceType as InvoiceType;
  const seller = resolveSeller(body, site);
  const supplyType = resolveSupplyType(seller.sellerStateCode, body.buyerStateCode);
  const invoiceDate = body.invoiceDate ?? today();
  const fy = financialYear(invoiceDate);
  const prefix = invoiceNumberPrefix(site);
  const placeOfSupply =
    body.placeOfSupply?.trim() ||
    (invoiceType === "tax" ? body.buyerState?.trim() || seller.sellerState || null : null);

  const { lines, totals } = computeInvoice(toRawLines(body.items), { invoiceType, supplyType });
  const amtReceived = round2(body.amountReceived ?? 0);
  const paymentStatus = derivePaymentStatus(totals.grandTotal, amtReceived);

  // Assign the next sequence number, retrying on a rare numbering race.
  let createdId: string | null = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      createdId = await db.transaction(async (tx) => {
        const [agg] = await tx
          .select({ maxSeq: max(invoices.invoiceSeq) })
          .from(invoices)
          .where(
            and(
              eq(invoices.siteId, siteId),
              eq(invoices.invoiceType, invoiceType),
              eq(invoices.financialYear, fy),
            ),
          );
        const seq = Number(agg?.maxSeq ?? 0) + 1;
        const invoiceNumber = formatInvoiceNumber(prefix, fy, seq, invoiceType);

        const [row] = await tx
          .insert(invoices)
          .values({
            siteId,
            invoiceType,
            invoiceNumber,
            invoiceSeq: seq,
            financialYear: fy,
            invoiceDate,
            dueDate: body.dueDate ?? null,
            supplyType,
            placeOfSupply,
            reverseCharge: body.reverseCharge ?? false,
            sellerName: seller.sellerName,
            sellerGstin: seller.sellerGstin,
            sellerAddress: seller.sellerAddress,
            sellerState: seller.sellerState,
            sellerStateCode: seller.sellerStateCode,
            buyerName: body.buyerName.trim(),
            buyerGstin: body.buyerGstin ?? null,
            buyerAddress: body.buyerAddress ?? null,
            buyerState: body.buyerState ?? null,
            buyerStateCode: body.buyerStateCode ?? null,
            buyerContact: body.buyerContact ?? null,
            subTotal: String(totals.subTotal),
            discountTotal: String(totals.discountTotal),
            cgstTotal: String(totals.cgstTotal),
            sgstTotal: String(totals.sgstTotal),
            igstTotal: String(totals.igstTotal),
            taxTotal: String(totals.taxTotal),
            roundOff: String(totals.roundOff),
            grandTotal: String(totals.grandTotal),
            amountInWords: totals.amountInWords,
            amountReceived: String(amtReceived),
            paymentStatus,
            paymentMode: body.paymentMode ?? null,
            notes: body.notes ?? null,
            status: "issued",
            createdByUserId: auth.userId,
          })
          .returning();
        if (!row) throw new ConflictError("Could not create the invoice. Please try again.");

        await tx.insert(invoiceItems).values(
          lines.map((l, i) => ({
            siteId,
            invoiceId: row.id,
            materialId: l.materialId,
            description: l.description,
            hsnCode: l.hsnCode,
            quantity: String(l.quantity),
            unit: l.unit,
            rate: String(l.rate),
            discountAmount: String(l.discountAmount),
            taxableValue: String(l.taxableValue),
            gstRate: String(l.gstRate),
            cgstAmount: String(l.cgstAmount),
            sgstAmount: String(l.sgstAmount),
            igstAmount: String(l.igstAmount),
            taxAmount: String(l.taxAmount),
            lineTotal: String(l.lineTotal),
            sortOrder: i,
          })),
        );

        await writeAudit(tx, {
          siteId,
          actorUserId: auth.userId,
          module: "invoices",
          action: "create",
          entityType: "invoice",
          entityId: row.id,
          after: { invoiceNumber, invoiceType, status: "issued", lineCount: lines.length },
          ip: meta.ip,
          userAgent: meta.userAgent,
          requestId: meta.requestId,
        });
        return row.id;
      });
      break;
    } catch (err) {
      if (attempt < 3 && isUniqueViolation(err)) continue;
      throw err;
    }
  }

  if (!createdId) throw new ConflictError("Could not assign an invoice number. Please try again.");
  const data = await loadInvoiceJoined(db, [eq(invoices.id, createdId)]);
  if (!data) throw new NotFoundError("Invoice not found.");
  return c.json({ success: true as const, data }, 201);
});

// ─── Get ──────────────────────────────────────────────────────────────────────
const getRouteDef = createRoute({
  method: "get",
  path: "/invoices/{id}",
  tags: ["Invoices"],
  summary: "Get an invoice",
  description: "Permission: invoices:view.",
  middleware: [requireAuth, requireSiteContext, requirePermission("invoices", "view")] as const,
  request: { params: invoiceIdParamSchema },
  responses: {
    200: {
      description: "The invoice",
      content: { "application/json": { schema: apiSuccessSchema(invoiceSchema) } },
    },
    403: {
      description: "Permission denied",
      content: { "application/json": { schema: apiErrorSchema } },
    },
    404: { description: "Not found", content: { "application/json": { schema: apiErrorSchema } } },
  },
});

invoiceRoutes.openapi(getRouteDef, async (c) => {
  const { id } = c.req.valid("param");
  const auth = c.get("auth");
  const db = getDb(c);
  const siteId = auth.siteId as string;
  const data = await loadInvoiceJoined(db, [
    eq(invoices.id, id),
    eq(invoices.siteId, siteId),
    isNull(invoices.deletedAt),
  ]);
  if (!data) throw new NotFoundError("Invoice not found.");
  return c.json({ success: true as const, data }, 200);
});

// ─── Update (replaces header + line items) ──────────────────────────────────────
const updateRouteDef = createRoute({
  method: "patch",
  path: "/invoices/{id}",
  tags: ["Invoices"],
  summary: "Update an invoice",
  description:
    "Permission: invoices:update. Replaces the buyer/seller details and the full set of line items, recomputing totals. The invoice number, type, and financial year are fixed. A cancelled invoice cannot be edited.",
  middleware: [requireAuth, requireSiteContext, requirePermission("invoices", "update")] as const,
  request: {
    params: invoiceIdParamSchema,
    body: { content: { "application/json": { schema: updateInvoiceBodySchema } }, required: true },
  },
  responses: {
    200: {
      description: "Updated",
      content: { "application/json": { schema: apiSuccessSchema(invoiceSchema) } },
    },
    403: {
      description: "Permission denied",
      content: { "application/json": { schema: apiErrorSchema } },
    },
    404: { description: "Not found", content: { "application/json": { schema: apiErrorSchema } } },
    409: {
      description: "Cancelled invoice",
      content: { "application/json": { schema: apiErrorSchema } },
    },
  },
});

invoiceRoutes.openapi(updateRouteDef, async (c) => {
  const { id } = c.req.valid("param");
  const body = c.req.valid("json");
  const auth = c.get("auth");
  const db = getDb(c);
  const meta = getRequestMeta(c);
  const siteId = auth.siteId as string;

  const existing = await loadRawInvoice(db, siteId, id);
  if (!existing) throw new NotFoundError("Invoice not found.");
  if (existing.status === "cancelled") {
    throw new ConflictError("A cancelled invoice can no longer be edited.");
  }

  const invoiceType = existing.invoiceType as InvoiceType;
  const [site] = await db
    .select({
      name: sites.name,
      code: sites.code,
      legalName: sites.legalName,
      gstin: sites.gstin,
      address: sites.address,
      state: sites.state,
      stateCode: sites.stateCode,
    })
    .from(sites)
    .where(eq(sites.id, siteId))
    .limit(1);
  const seller = resolveSeller(body, {
    name: site?.name ?? existing.sellerName,
    legalName: site?.legalName ?? null,
    gstin: site?.gstin ?? null,
    address: site?.address ?? null,
    state: site?.state ?? null,
    stateCode: site?.stateCode ?? null,
  });
  const supplyType = resolveSupplyType(seller.sellerStateCode, body.buyerStateCode);
  const invoiceDate = body.invoiceDate ?? existing.invoiceDate;
  const placeOfSupply =
    body.placeOfSupply?.trim() ||
    (invoiceType === "tax" ? body.buyerState?.trim() || seller.sellerState || null : null);

  const { lines, totals } = computeInvoice(toRawLines(body.items), { invoiceType, supplyType });
  const amtReceived =
    body.amountReceived !== undefined
      ? round2(body.amountReceived)
      : Number(existing.amountReceived);
  const paymentStatus = derivePaymentStatus(totals.grandTotal, amtReceived);

  await db.transaction(async (tx) => {
    await tx
      .update(invoices)
      .set({
        invoiceDate,
        dueDate: body.dueDate ?? null,
        supplyType,
        placeOfSupply,
        reverseCharge: body.reverseCharge ?? existing.reverseCharge,
        sellerName: seller.sellerName,
        sellerGstin: seller.sellerGstin,
        sellerAddress: seller.sellerAddress,
        sellerState: seller.sellerState,
        sellerStateCode: seller.sellerStateCode,
        buyerName: body.buyerName.trim(),
        buyerGstin: body.buyerGstin ?? null,
        buyerAddress: body.buyerAddress ?? null,
        buyerState: body.buyerState ?? null,
        buyerStateCode: body.buyerStateCode ?? null,
        buyerContact: body.buyerContact ?? null,
        subTotal: String(totals.subTotal),
        discountTotal: String(totals.discountTotal),
        cgstTotal: String(totals.cgstTotal),
        sgstTotal: String(totals.sgstTotal),
        igstTotal: String(totals.igstTotal),
        taxTotal: String(totals.taxTotal),
        roundOff: String(totals.roundOff),
        grandTotal: String(totals.grandTotal),
        amountInWords: totals.amountInWords,
        amountReceived: String(amtReceived),
        paymentStatus,
        paymentMode: body.paymentMode ?? existing.paymentMode,
        notes: body.notes ?? null,
      })
      .where(eq(invoices.id, id));

    // Replace line items wholesale.
    await tx.delete(invoiceItems).where(eq(invoiceItems.invoiceId, id));
    await tx.insert(invoiceItems).values(
      lines.map((l, i) => ({
        siteId,
        invoiceId: id,
        materialId: l.materialId,
        description: l.description,
        hsnCode: l.hsnCode,
        quantity: String(l.quantity),
        unit: l.unit,
        rate: String(l.rate),
        discountAmount: String(l.discountAmount),
        taxableValue: String(l.taxableValue),
        gstRate: String(l.gstRate),
        cgstAmount: String(l.cgstAmount),
        sgstAmount: String(l.sgstAmount),
        igstAmount: String(l.igstAmount),
        taxAmount: String(l.taxAmount),
        lineTotal: String(l.lineTotal),
        sortOrder: i,
      })),
    );

    await writeAudit(tx, {
      siteId,
      actorUserId: auth.userId,
      module: "invoices",
      action: "update",
      entityType: "invoice",
      entityId: id,
      after: { invoiceNumber: existing.invoiceNumber, lineCount: lines.length },
      ip: meta.ip,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });
  });

  const data = await loadInvoiceJoined(db, [eq(invoices.id, id)]);
  if (!data) throw new NotFoundError("Invoice not found.");
  return c.json({ success: true as const, data }, 200);
});

// ─── Cancel ─────────────────────────────────────────────────────────────────────
const cancelRouteDef = createRoute({
  method: "post",
  path: "/invoices/{id}/status",
  tags: ["Invoices"],
  summary: "Cancel an invoice",
  description:
    "Permission: invoices:update. Marks the invoice cancelled. The number is retained (a cancelled invoice keeps its place in the series for gapless numbering).",
  middleware: [requireAuth, requireSiteContext, requirePermission("invoices", "update")] as const,
  request: {
    params: invoiceIdParamSchema,
    body: { content: { "application/json": { schema: cancelInvoiceBodySchema } }, required: true },
  },
  responses: {
    200: {
      description: "Cancelled",
      content: { "application/json": { schema: apiSuccessSchema(invoiceSchema) } },
    },
    403: {
      description: "Permission denied",
      content: { "application/json": { schema: apiErrorSchema } },
    },
    404: { description: "Not found", content: { "application/json": { schema: apiErrorSchema } } },
    409: {
      description: "Already cancelled",
      content: { "application/json": { schema: apiErrorSchema } },
    },
  },
});

invoiceRoutes.openapi(cancelRouteDef, async (c) => {
  const { id } = c.req.valid("param");
  const auth = c.get("auth");
  const db = getDb(c);
  const meta = getRequestMeta(c);
  const siteId = auth.siteId as string;

  const existing = await loadRawInvoice(db, siteId, id);
  if (!existing) throw new NotFoundError("Invoice not found.");
  if (existing.status === "cancelled")
    throw new ConflictError("This invoice is already cancelled.");

  await db.transaction(async (tx) => {
    await tx.update(invoices).set({ status: "cancelled" }).where(eq(invoices.id, id));
    await writeAudit(tx, {
      siteId,
      actorUserId: auth.userId,
      module: "invoices",
      action: "update",
      entityType: "invoice",
      entityId: id,
      before: { status: existing.status },
      after: { status: "cancelled", invoiceNumber: existing.invoiceNumber },
      ip: meta.ip,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });
  });

  const data = await loadInvoiceJoined(db, [eq(invoices.id, id)]);
  if (!data) throw new NotFoundError("Invoice not found.");
  return c.json({ success: true as const, data }, 200);
});

// ─── Record payment ───────────────────────────────────────────────────────────
const paymentRouteDef = createRoute({
  method: "post",
  path: "/invoices/{id}/payment",
  tags: ["Invoices"],
  summary: "Record payment against an invoice",
  description:
    "Permission: invoices:update. Updates amount received and derives the payment status.",
  middleware: [requireAuth, requireSiteContext, requirePermission("invoices", "update")] as const,
  request: {
    params: invoiceIdParamSchema,
    body: {
      content: { "application/json": { schema: recordInvoicePaymentBodySchema } },
      required: true,
    },
  },
  responses: {
    200: {
      description: "Payment recorded",
      content: { "application/json": { schema: apiSuccessSchema(invoiceSchema) } },
    },
    403: {
      description: "Permission denied",
      content: { "application/json": { schema: apiErrorSchema } },
    },
    404: { description: "Not found", content: { "application/json": { schema: apiErrorSchema } } },
  },
});

invoiceRoutes.openapi(paymentRouteDef, async (c) => {
  const { id } = c.req.valid("param");
  const { amountReceived, paymentMode } = c.req.valid("json");
  const auth = c.get("auth");
  const db = getDb(c);
  const meta = getRequestMeta(c);
  const siteId = auth.siteId as string;

  const existing = await loadRawInvoice(db, siteId, id);
  if (!existing) throw new NotFoundError("Invoice not found.");

  const received = round2(amountReceived);
  const newStatus = derivePaymentStatus(Number(existing.grandTotal), received);
  const updates: Record<string, unknown> = {
    amountReceived: String(received),
    paymentStatus: newStatus,
  };
  if (paymentMode !== undefined) updates.paymentMode = paymentMode;

  await db.transaction(async (tx) => {
    await tx.update(invoices).set(updates).where(eq(invoices.id, id));
    await writeAudit(tx, {
      siteId,
      actorUserId: auth.userId,
      module: "invoices",
      action: "update",
      entityType: "invoice",
      entityId: id,
      before: { paymentStatus: existing.paymentStatus },
      after: { paymentStatus: newStatus },
      ip: meta.ip,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });
  });

  const data = await loadInvoiceJoined(db, [eq(invoices.id, id)]);
  if (!data) throw new NotFoundError("Invoice not found.");
  return c.json({ success: true as const, data }, 200);
});

// ─── Delete ─────────────────────────────────────────────────────────────────────
const deleteRouteDef = createRoute({
  method: "delete",
  path: "/invoices/{id}",
  tags: ["Invoices"],
  summary: "Soft-delete an invoice",
  description: "Permission: invoices:delete. The sequence number is retained and never reused.",
  middleware: [requireAuth, requireSiteContext, requirePermission("invoices", "delete")] as const,
  request: { params: invoiceIdParamSchema },
  responses: {
    200: {
      description: "Deleted",
      content: { "application/json": { schema: apiSuccessSchema(deleteInvoiceResultSchema) } },
    },
    403: {
      description: "Permission denied",
      content: { "application/json": { schema: apiErrorSchema } },
    },
    404: { description: "Not found", content: { "application/json": { schema: apiErrorSchema } } },
  },
});

invoiceRoutes.openapi(deleteRouteDef, async (c) => {
  const { id } = c.req.valid("param");
  const auth = c.get("auth");
  const db = getDb(c);
  const meta = getRequestMeta(c);
  const siteId = auth.siteId as string;

  const existing = await loadRawInvoice(db, siteId, id);
  if (!existing) throw new NotFoundError("Invoice not found.");

  await db.transaction(async (tx) => {
    await tx.update(invoices).set({ deletedAt: new Date() }).where(eq(invoices.id, id));
    await writeAudit(tx, {
      siteId,
      actorUserId: auth.userId,
      module: "invoices",
      action: "delete",
      entityType: "invoice",
      entityId: id,
      before: { invoiceNumber: existing.invoiceNumber, status: existing.status },
      ip: meta.ip,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });
  });

  return c.json({ success: true as const, data: { id, deleted: true } }, 200);
});

// ─── PDF download (binary; not part of the JSON envelope) ────────────────────────
invoiceRoutes.get(
  "/invoices/:id/pdf",
  requireAuth,
  requireSiteContext,
  requirePermission("invoices", "view"),
  async (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");
    const db = getDb(c);
    const siteId = auth.siteId as string;

    const data = await loadInvoiceJoined(db, [
      eq(invoices.id, id),
      eq(invoices.siteId, siteId),
      isNull(invoices.deletedAt),
    ]);
    if (!data) throw new NotFoundError("Invoice not found.");

    const bytes = await renderInvoicePdf(data);
    const fileName = `${data.invoiceNumber.replace(/[/\\]/g, "-")}.pdf`;
    return new Response(bytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  },
);
