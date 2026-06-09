import {
  attendance,
  dpr,
  expenses,
  materials,
  purchases,
  salaryRunItems,
  salaryRuns,
  stockMovements,
  suppliers,
  users,
  workers,
} from "@construction-erp/db/schema";
import { type SQL, and, asc, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { DbClient } from "../../common/db";
import type { ExportParams } from "./reports.schemas";

/** Hard cap on rows in a single export (a flagged truncation, never silent). */
export const MAX_EXPORT_ROWS = 5000;

export type ColumnType = "text" | "number" | "money" | "date";

export interface ReportColumn {
  key: string;
  label: string;
  type?: ColumnType;
  /** Relative column width for the PDF layout (default 1). */
  weight?: number;
}

export type ReportCell = string | number | null;

export interface ReportDataset {
  title: string;
  subtitle?: string;
  columns: ReportColumn[];
  rows: Array<Record<string, ReportCell>>;
  /** Optional totals row, keyed by column key. */
  totals?: Record<string, ReportCell>;
}

export interface DatasetContext {
  db: DbClient;
  siteId: string;
  siteName: string;
  params: ExportParams;
}

const num = (v: unknown): number => (v == null ? 0 : Number(v));
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Build the human-readable "for <site> · <period>" subtitle. */
function periodSubtitle(ctx: DatasetContext, dated: boolean): string {
  const parts = [ctx.siteName];
  if (dated) {
    const { dateFrom, dateTo } = ctx.params;
    if (dateFrom || dateTo) {
      parts.push(`${dateFrom ?? "start"} to ${dateTo ?? "today"}`);
    } else {
      parts.push("all dates");
    }
  }
  return parts.join("  ·  ");
}

/** Append a "(showing first N…)" note when a query hit the row cap. */
function withTruncationNote(subtitle: string, rowCount: number): string {
  return rowCount >= MAX_EXPORT_ROWS
    ? `${subtitle}  ·  showing first ${MAX_EXPORT_ROWS} rows`
    : subtitle;
}

// ─── DPR log ────────────────────────────────────────────────────────────────────────
async function dprLog(ctx: DatasetContext): Promise<ReportDataset> {
  const creator = alias(users, "rpt_dpr_creator");
  const filters: SQL[] = [eq(dpr.siteId, ctx.siteId), isNull(dpr.deletedAt)];
  if (ctx.params.dateFrom) filters.push(gte(dpr.reportDate, ctx.params.dateFrom));
  if (ctx.params.dateTo) filters.push(lte(dpr.reportDate, ctx.params.dateTo));

  const rows = await ctx.db
    .select({
      reportDate: dpr.reportDate,
      workCategory: dpr.workCategory,
      location: dpr.location,
      status: dpr.status,
      quantityValue: dpr.quantityValue,
      quantityUnit: dpr.quantityUnit,
      completedWork: dpr.completedWork,
      createdByName: creator.name,
    })
    .from(dpr)
    .leftJoin(creator, eq(creator.id, dpr.createdByUserId))
    .where(and(...filters))
    .orderBy(desc(dpr.reportDate), desc(dpr.createdAt))
    .limit(MAX_EXPORT_ROWS);

  return {
    title: "DPR Log",
    subtitle: withTruncationNote(periodSubtitle(ctx, true), rows.length),
    columns: [
      { key: "date", label: "Date", type: "date" },
      { key: "category", label: "Category", weight: 1.2 },
      { key: "location", label: "Location", weight: 1.2 },
      { key: "status", label: "Status" },
      { key: "qty", label: "Qty", type: "number" },
      { key: "unit", label: "Unit" },
      { key: "completed", label: "Completed Work", weight: 2.2 },
      { key: "createdBy", label: "Created By", weight: 1.2 },
    ],
    rows: rows.map((r) => ({
      date: r.reportDate,
      category: r.workCategory ?? "—",
      location: r.location ?? "—",
      status: r.status,
      qty: r.quantityValue == null ? null : num(r.quantityValue),
      unit: r.quantityUnit ?? "",
      completed: r.completedWork ?? "",
      createdBy: r.createdByName ?? "—",
    })),
  };
}

// ─── Inventory stock ─────────────────────────────────────────────────────────────────
async function inventoryStock(ctx: DatasetContext): Promise<ReportDataset> {
  const rows = await ctx.db
    .select({
      name: materials.name,
      sku: materials.sku,
      category: materials.category,
      unit: materials.unit,
      currentStock: materials.currentStock,
      reorderLevel: materials.reorderLevel,
      unitCost: materials.unitCost,
    })
    .from(materials)
    .where(and(eq(materials.siteId, ctx.siteId), isNull(materials.deletedAt)))
    .orderBy(asc(materials.name))
    .limit(MAX_EXPORT_ROWS);

  let totalValue = 0;
  const dataRows = rows.map((r) => {
    const stock = num(r.currentStock);
    const cost = r.unitCost == null ? null : num(r.unitCost);
    const value = cost == null ? null : round2(stock * cost);
    if (value != null) totalValue += value;
    const reorder = r.reorderLevel == null ? null : num(r.reorderLevel);
    const low = reorder != null && stock <= reorder;
    return {
      name: r.name,
      sku: r.sku ?? "—",
      category: r.category ?? "—",
      unit: r.unit,
      stock,
      reorder,
      cost,
      value,
      low: low ? "Yes" : "No",
    };
  });

  return {
    title: "Inventory Stock",
    subtitle: withTruncationNote(periodSubtitle(ctx, false), rows.length),
    columns: [
      { key: "name", label: "Material", weight: 1.8 },
      { key: "sku", label: "SKU" },
      { key: "category", label: "Category" },
      { key: "unit", label: "Unit" },
      { key: "stock", label: "Stock", type: "number" },
      { key: "reorder", label: "Reorder", type: "number" },
      { key: "cost", label: "Unit Cost", type: "money" },
      { key: "value", label: "Stock Value", type: "money" },
      { key: "low", label: "Low?" },
    ],
    rows: dataRows,
    totals: { name: "Total", value: round2(totalValue) },
  };
}

// ─── Stock ledger ────────────────────────────────────────────────────────────────────
async function stockLedger(ctx: DatasetContext): Promise<ReportDataset> {
  const filters: SQL[] = [eq(stockMovements.siteId, ctx.siteId)];
  if (ctx.params.dateFrom) filters.push(gte(stockMovements.movementDate, ctx.params.dateFrom));
  if (ctx.params.dateTo) filters.push(lte(stockMovements.movementDate, ctx.params.dateTo));

  const rows = await ctx.db
    .select({
      date: stockMovements.movementDate,
      material: materials.name,
      type: stockMovements.type,
      quantity: stockMovements.quantity,
      balanceAfter: stockMovements.balanceAfter,
      reference: stockMovements.reference,
    })
    .from(stockMovements)
    .leftJoin(materials, eq(materials.id, stockMovements.materialId))
    .where(and(...filters))
    .orderBy(desc(stockMovements.movementDate), desc(stockMovements.createdAt))
    .limit(MAX_EXPORT_ROWS);

  return {
    title: "Stock Ledger",
    subtitle: withTruncationNote(periodSubtitle(ctx, true), rows.length),
    columns: [
      { key: "date", label: "Date", type: "date" },
      { key: "material", label: "Material", weight: 1.8 },
      { key: "type", label: "Type" },
      { key: "quantity", label: "Quantity", type: "number" },
      { key: "balance", label: "Balance After", type: "number" },
      { key: "reference", label: "Reference", weight: 1.5 },
    ],
    rows: rows.map((r) => ({
      date: r.date,
      material: r.material ?? "—",
      type: r.type,
      quantity: num(r.quantity),
      balance: num(r.balanceAfter),
      reference: r.reference ?? "—",
    })),
  };
}

// ─── Attendance register ──────────────────────────────────────────────────────────────
async function attendanceRegister(ctx: DatasetContext): Promise<ReportDataset> {
  const filters: SQL[] = [eq(attendance.siteId, ctx.siteId), isNull(attendance.deletedAt)];
  if (ctx.params.dateFrom) filters.push(gte(attendance.attendanceDate, ctx.params.dateFrom));
  if (ctx.params.dateTo) filters.push(lte(attendance.attendanceDate, ctx.params.dateTo));

  const rows = await ctx.db
    .select({
      date: attendance.attendanceDate,
      worker: workers.name,
      trade: workers.trade,
      status: attendance.status,
      overtimeHours: attendance.overtimeHours,
      approved: attendance.approved,
    })
    .from(attendance)
    .leftJoin(workers, eq(workers.id, attendance.workerId))
    .where(and(...filters))
    .orderBy(desc(attendance.attendanceDate), asc(workers.name))
    .limit(MAX_EXPORT_ROWS);

  return {
    title: "Attendance Register",
    subtitle: withTruncationNote(periodSubtitle(ctx, true), rows.length),
    columns: [
      { key: "date", label: "Date", type: "date" },
      { key: "worker", label: "Worker", weight: 1.6 },
      { key: "trade", label: "Trade" },
      { key: "status", label: "Status" },
      { key: "ot", label: "OT Hours", type: "number" },
      { key: "approved", label: "Approved" },
    ],
    rows: rows.map((r) => ({
      date: r.date,
      worker: r.worker ?? "—",
      trade: r.trade ?? "—",
      status: r.status,
      ot: num(r.overtimeHours),
      approved: r.approved ? "Yes" : "No",
    })),
  };
}

// ─── Salary register ──────────────────────────────────────────────────────────────────
async function salaryRegister(ctx: DatasetContext): Promise<ReportDataset> {
  // An item belongs to a run; include it when the run's period overlaps the filter.
  const filters: SQL[] = [eq(salaryRunItems.siteId, ctx.siteId), isNull(salaryRuns.deletedAt)];
  if (ctx.params.dateFrom) filters.push(gte(salaryRuns.periodEnd, ctx.params.dateFrom));
  if (ctx.params.dateTo) filters.push(lte(salaryRuns.periodStart, ctx.params.dateTo));

  const rows = await ctx.db
    .select({
      periodStart: salaryRuns.periodStart,
      periodEnd: salaryRuns.periodEnd,
      worker: salaryRunItems.workerName,
      payableDays: salaryRunItems.payableDays,
      overtimeHours: salaryRunItems.overtimeHours,
      gross: salaryRunItems.gross,
      advanceDeducted: salaryRunItems.advanceDeducted,
      netPayable: salaryRunItems.netPayable,
      amountPaid: salaryRunItems.amountPaid,
      paymentStatus: salaryRunItems.paymentStatus,
    })
    .from(salaryRunItems)
    .innerJoin(salaryRuns, eq(salaryRuns.id, salaryRunItems.runId))
    .where(and(...filters))
    .orderBy(desc(salaryRuns.periodStart), asc(salaryRunItems.workerName))
    .limit(MAX_EXPORT_ROWS);

  const totals = { gross: 0, advance: 0, net: 0, paid: 0 };
  const dataRows = rows.map((r) => {
    totals.gross += num(r.gross);
    totals.advance += num(r.advanceDeducted);
    totals.net += num(r.netPayable);
    totals.paid += num(r.amountPaid);
    return {
      period: `${r.periodStart} – ${r.periodEnd}`,
      worker: r.worker,
      days: num(r.payableDays),
      ot: num(r.overtimeHours),
      gross: num(r.gross),
      advance: num(r.advanceDeducted),
      net: num(r.netPayable),
      paid: num(r.amountPaid),
      status: r.paymentStatus,
    };
  });

  return {
    title: "Salary Register",
    subtitle: withTruncationNote(periodSubtitle(ctx, true), rows.length),
    columns: [
      { key: "period", label: "Period", weight: 1.6 },
      { key: "worker", label: "Worker", weight: 1.6 },
      { key: "days", label: "Days", type: "number" },
      { key: "ot", label: "OT Hrs", type: "number" },
      { key: "gross", label: "Gross", type: "money" },
      { key: "advance", label: "Advance", type: "money" },
      { key: "net", label: "Net", type: "money" },
      { key: "paid", label: "Paid", type: "money" },
      { key: "status", label: "Status" },
    ],
    rows: dataRows,
    totals: {
      period: "Total",
      gross: round2(totals.gross),
      advance: round2(totals.advance),
      net: round2(totals.net),
      paid: round2(totals.paid),
    },
  };
}

// ─── Expense register ─────────────────────────────────────────────────────────────────
async function expenseRegister(ctx: DatasetContext): Promise<ReportDataset> {
  const filters: SQL[] = [eq(expenses.siteId, ctx.siteId), isNull(expenses.deletedAt)];
  if (ctx.params.dateFrom) filters.push(gte(expenses.expenseDate, ctx.params.dateFrom));
  if (ctx.params.dateTo) filters.push(lte(expenses.expenseDate, ctx.params.dateTo));

  const rows = await ctx.db
    .select({
      date: expenses.expenseDate,
      category: expenses.category,
      amount: expenses.amount,
      paidTo: expenses.paidTo,
      paymentMode: expenses.paymentMode,
      isPettyCash: expenses.isPettyCash,
      status: expenses.status,
    })
    .from(expenses)
    .where(and(...filters))
    .orderBy(desc(expenses.expenseDate), desc(expenses.createdAt))
    .limit(MAX_EXPORT_ROWS);

  let total = 0;
  const dataRows = rows.map((r) => {
    total += num(r.amount);
    return {
      date: r.date,
      category: r.category,
      amount: num(r.amount),
      paidTo: r.paidTo ?? "—",
      mode: r.paymentMode ?? "—",
      petty: r.isPettyCash ? "Yes" : "No",
      status: r.status,
    };
  });

  return {
    title: "Expense Register",
    subtitle: withTruncationNote(periodSubtitle(ctx, true), rows.length),
    columns: [
      { key: "date", label: "Date", type: "date" },
      { key: "category", label: "Category", weight: 1.4 },
      { key: "amount", label: "Amount", type: "money" },
      { key: "paidTo", label: "Paid To", weight: 1.4 },
      { key: "mode", label: "Mode" },
      { key: "petty", label: "Petty" },
      { key: "status", label: "Status" },
    ],
    rows: dataRows,
    totals: { date: "Total", amount: round2(total) },
  };
}

// ─── Purchase register ────────────────────────────────────────────────────────────────
async function purchaseRegister(ctx: DatasetContext): Promise<ReportDataset> {
  const filters: SQL[] = [eq(purchases.siteId, ctx.siteId), isNull(purchases.deletedAt)];
  if (ctx.params.dateFrom) filters.push(gte(purchases.orderDate, ctx.params.dateFrom));
  if (ctx.params.dateTo) filters.push(lte(purchases.orderDate, ctx.params.dateTo));

  const rows = await ctx.db
    .select({
      orderDate: purchases.orderDate,
      poNumber: purchases.poNumber,
      supplier: suppliers.name,
      status: purchases.status,
      total: purchases.total,
      amountPaid: purchases.amountPaid,
      paymentStatus: purchases.paymentStatus,
    })
    .from(purchases)
    .leftJoin(suppliers, eq(suppliers.id, purchases.supplierId))
    .where(and(...filters))
    .orderBy(desc(purchases.orderDate), desc(purchases.createdAt))
    .limit(MAX_EXPORT_ROWS);

  const totals = { total: 0, paid: 0, outstanding: 0 };
  const dataRows = rows.map((r) => {
    const total = num(r.total);
    const paid = num(r.amountPaid);
    const outstanding = round2(total - paid);
    totals.total += total;
    totals.paid += paid;
    totals.outstanding += outstanding;
    return {
      date: r.orderDate,
      po: r.poNumber ?? "—",
      supplier: r.supplier ?? "—",
      status: r.status,
      total,
      paid,
      outstanding,
      payment: r.paymentStatus,
    };
  });

  return {
    title: "Purchase Register",
    subtitle: withTruncationNote(periodSubtitle(ctx, true), rows.length),
    columns: [
      { key: "date", label: "Order Date", type: "date" },
      { key: "po", label: "PO No." },
      { key: "supplier", label: "Supplier", weight: 1.6 },
      { key: "status", label: "Status" },
      { key: "total", label: "Total", type: "money" },
      { key: "paid", label: "Paid", type: "money" },
      { key: "outstanding", label: "Outstanding", type: "money" },
      { key: "payment", label: "Payment" },
    ],
    rows: dataRows,
    totals: {
      date: "Total",
      total: round2(totals.total),
      paid: round2(totals.paid),
      outstanding: round2(totals.outstanding),
    },
  };
}

// ─── Supplier ledger ──────────────────────────────────────────────────────────────────
async function supplierLedger(ctx: DatasetContext): Promise<ReportDataset> {
  const supplierRows = await ctx.db
    .select({
      id: suppliers.id,
      name: suppliers.name,
      contactPerson: suppliers.contactPerson,
      phone: suppliers.phone,
      gstin: suppliers.gstin,
    })
    .from(suppliers)
    .where(and(eq(suppliers.siteId, ctx.siteId), isNull(suppliers.deletedAt)))
    .orderBy(asc(suppliers.name))
    .limit(MAX_EXPORT_ROWS);

  // Outstanding = Σ(total − amountPaid) over the supplier's live purchases.
  const balances = await ctx.db
    .select({
      supplierId: purchases.supplierId,
      outstanding: sql<string>`coalesce(sum(${purchases.total} - ${purchases.amountPaid}), 0)`,
    })
    .from(purchases)
    .where(and(eq(purchases.siteId, ctx.siteId), isNull(purchases.deletedAt)))
    .groupBy(purchases.supplierId);

  const byId = new Map(balances.map((b) => [b.supplierId, num(b.outstanding)]));

  let total = 0;
  const dataRows = supplierRows.map((s) => {
    const outstanding = round2(byId.get(s.id) ?? 0);
    total += outstanding;
    return {
      name: s.name,
      contact: s.contactPerson ?? "—",
      phone: s.phone ?? "—",
      gstin: s.gstin ?? "—",
      outstanding,
    };
  });

  return {
    title: "Supplier Ledger",
    subtitle: withTruncationNote(periodSubtitle(ctx, false), supplierRows.length),
    columns: [
      { key: "name", label: "Supplier", weight: 1.8 },
      { key: "contact", label: "Contact", weight: 1.4 },
      { key: "phone", label: "Phone" },
      { key: "gstin", label: "GSTIN" },
      { key: "outstanding", label: "Outstanding", type: "money" },
    ],
    rows: dataRows,
    totals: { name: "Total", outstanding: round2(total) },
  };
}

/** Registry: report type key → dataset builder. */
export const DATASET_BUILDERS: Record<string, (ctx: DatasetContext) => Promise<ReportDataset>> = {
  dpr_log: dprLog,
  inventory_stock: inventoryStock,
  stock_ledger: stockLedger,
  attendance_register: attendanceRegister,
  salary_register: salaryRegister,
  expense_register: expenseRegister,
  purchase_register: purchaseRegister,
  supplier_ledger: supplierLedger,
};
