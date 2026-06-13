import { paginationQuerySchema } from "@construction-erp/shared";
import type { RbacModule } from "@construction-erp/shared";
import { z } from "@hono/zod-openapi";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Output formats an export can be generated in. */
export const EXPORT_FORMATS = ["csv", "pdf"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

/** Export job lifecycle states (see `export_jobs`). */
export const EXPORT_STATUSES = ["queued", "processing", "completed", "failed"] as const;
export type ExportStatus = (typeof EXPORT_STATUSES)[number];

/**
 * Catalog of report datasets. Each entry maps to a builder in `reports.datasets.ts`.
 * `module` is the source module — generating it requires `view` on that module
 * (on top of `reports:export`), so a user can't export data they can't see.
 * `dateRange` says whether the date-range filter applies.
 */
export interface ReportTypeDef {
  key: string;
  label: string;
  module: RbacModule;
  dateRange: boolean;
  description: string;
}

export const REPORT_TYPES: ReportTypeDef[] = [
  {
    key: "dpr_log",
    label: "DPR log",
    module: "dpr",
    dateRange: true,
    description:
      "Daily progress reports over a date range. PDF lays out one report per page with its site photos; CSV is the plain table.",
  },
  {
    key: "inventory_stock",
    label: "Inventory stock",
    module: "inventory",
    dateRange: false,
    description: "Current stock snapshot with values and low-stock flags.",
  },
  {
    key: "stock_ledger",
    label: "Stock ledger",
    module: "inventory",
    dateRange: true,
    description: "Material inward/outward/wastage movements over a date range.",
  },
  {
    key: "attendance_register",
    label: "Attendance register",
    module: "attendance",
    dateRange: true,
    description: "Worker attendance over a date range.",
  },
  {
    key: "salary_register",
    label: "Salary register",
    module: "salary",
    dateRange: true,
    description: "Per-worker pay from attendance, advances, and payments over a date range.",
  },
  {
    key: "expense_register",
    label: "Expense register",
    module: "expenses",
    dateRange: true,
    description: "Site expenses and petty cash over a date range.",
  },
  {
    key: "sales_register",
    label: "Sales register",
    module: "selling",
    dateRange: true,
    description: "Items sold from inventory with amounts received and outstanding.",
  },
  {
    key: "purchase_register",
    label: "Purchase register",
    module: "purchases",
    dateRange: true,
    description: "Purchase orders and payment status over a date range.",
  },
  {
    key: "supplier_ledger",
    label: "Supplier ledger",
    module: "suppliers",
    dateRange: false,
    description: "Suppliers with outstanding payable balances.",
  },
];

export const REPORT_TYPE_KEYS = REPORT_TYPES.map((t) => t.key) as [string, ...string[]];

export function findReportType(key: string): ReportTypeDef | undefined {
  return REPORT_TYPES.find((t) => t.key === key);
}

// ─── Zod schemas ──────────────────────────────────────────────────────────────────

export const exportParamsSchema = z
  .object({
    dateFrom: z.string().regex(DATE_RE).optional(),
    dateTo: z.string().regex(DATE_RE).optional(),
  })
  .openapi("ExportParams");

export type ExportParams = z.infer<typeof exportParamsSchema>;

export const createExportBodySchema = z
  .object({
    reportType: z.enum(REPORT_TYPE_KEYS).openapi({ example: "expense_register" }),
    format: z.enum(EXPORT_FORMATS).openapi({ example: "csv" }),
    params: exportParamsSchema.optional(),
  })
  .openapi("CreateExportRequest");

export const exportJobIdParamSchema = z.object({
  id: z
    .string()
    .uuid()
    .openapi({ param: { name: "id", in: "path" } }),
});

export const listExportsQuerySchema = paginationQuerySchema.extend({
  status: z.enum(EXPORT_STATUSES).optional(),
  reportType: z.enum(REPORT_TYPE_KEYS).optional(),
});

export const exportJobSchema = z
  .object({
    id: z.string().uuid(),
    siteId: z.string().uuid(),
    reportType: z.string(),
    reportLabel: z.string(),
    format: z.enum(EXPORT_FORMATS),
    status: z.enum(EXPORT_STATUSES),
    params: exportParamsSchema.nullable(),
    fileName: z.string().nullable(),
    fileSize: z.number().nullable(),
    rowCount: z.number().nullable(),
    errorMessage: z.string().nullable(),
    attempts: z.number(),
    requestedBy: z.object({ id: z.string().uuid(), name: z.string() }).nullable(),
    completedAt: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi("ExportJob");

export const reportTypeSchema = z
  .object({
    key: z.string(),
    label: z.string(),
    module: z.string(),
    dateRange: z.boolean(),
    description: z.string(),
  })
  .openapi("ReportType");

export const downloadLinkSchema = z
  .object({ url: z.string().url(), fileName: z.string() })
  .openapi("ExportDownloadLink");

export const deleteExportResultSchema = z
  .object({ id: z.string().uuid(), deleted: z.boolean() })
  .openapi("DeleteExportResult");
