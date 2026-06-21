# Implementation Plan

This plan converts the finalized ERP stack into practical delivery phases.

> **Progress:** Phase 0 ✅ · Phase 1 ✅ (2026-06-06) · Phase 2 ✅ (2026-06-06) · Phase 3 ✅ (2026-06-07) · **Refactor: Site-as-tenant ✅ (2026-06-07)** · Phase 4 ✅ (2026-06-07) · Phase 5 ✅ (2026-06-09) · Phase 6 ✅ (2026-06-09) · Phase 7 ✅ (2026-06-09) · Phase 8 ✅ (2026-06-09) · Phase 9 ✅ (2026-06-09) — **all phases complete**. Post-MVP: **Selling module ↔ Inventory integration ✅ (2026-06-12)** (sales are now strictly in-stock inventory items; a sale moves stock; migration `0010`); **Attendance ↔ Salary re-split ✅ (2026-06-13)** (Attendance = workers + daysheet with per-site category dropdown; Salary = per-worker monthly view owning all advances + payments; migration `0011`); **Invoices module ✅ (2026-06-21)** (GST tax invoice with intra-state CGST+SGST / inter-state IGST **and** non-GST bill of supply, per-site/per-FY gapless numbering, downloadable PDF via `pdf-lib`; new `invoices` RBAC module + seller GSTIN on sites; migration `0013`; verified 23/23 via Playwright). See `docs/progress.md` for the detailed log.
>
> **Model change (2026-06-07):** Company and Project were removed. **Site is now the top-level tenant boundary** — an owner holds many sites, each user has per-site, per-module access (read / read+write), and data is scoped to the active site (chosen via an `X-Site-Id` header / site switcher). References to "Company" / "Project" / company-wide "roles" in the phases below are superseded by the site model; treat `siteId` as the tenant key for Phase 4+.

## Phase 0: Project Setup And Documentation — ✅ Completed

Goals:

- Finalize product scope.
- Finalize tech stack.
- Define coding guidelines.
- Define architecture.
- Define API response and error standards.

Deliverables:

- `docs/prd.md`
- `docs/tech.md`
- `docs/architecter.md`
- `docs/backend_guideline.md`
- `docs/frontend_guideline.md`
- `docs/errors.md`
- Initial repository structure

## Phase 1: Foundation — ✅ Completed (2026-06-06)

Goals:

- Set up Next.js frontend with TypeScript.
- Set up Tailwind CSS and shadcn/ui.
- Set up Hono.js backend with TypeScript.
- Set up Cloudflare Workers deployment config.
- Set up Neon PostgreSQL.
- Set up Drizzle ORM and migrations.
- Set up Pino structured logging.
- Set up standardized API responses.
- Set up custom error classes.

Deliverables:

- Frontend app shell
- Backend app entrypoint
- Database connection
- Health check endpoint
- Swagger UI base setup
- Shared coding conventions

## Phase 2: Authentication And RBAC — ✅ Completed (2026-06-06)

Goals:

- Build custom authentication system.
- Add OAuth support.
- Add JWT access tokens.
- Add refresh tokens.
- Add refresh token rotation.
- Add role and permission tables.
- Enforce RBAC on protected endpoints.
- Add role-aware frontend navigation.

Deliverables:

- Login flow
- Logout flow
- Token refresh flow
- User management
- Role management
- Module permission checks

## Phase 3: Company, Project, And Site Setup — ✅ Completed (2026-06-07)

Goals:

- Create company/tenant model. ✅ (company profile `GET/PATCH /company`)
- Create projects module. ✅
- Create sites module. ✅
- Assign users to projects/sites. ✅ (site-level via `site_assignments`)
- Add table-first frontend screens. ✅

Deliverables:

- Company schema ✅ (from Phase 1; profile API added)
- Project schema ✅ (`projects`)
- Site schema ✅ (`sites` + `site_assignments`)
- Project and site APIs ✅ (+ company profile API)
- Project and site frontend screens ✅ (+ company settings screen)

Note: `site`/`own` scope **enforcement** uses the `site_assignments` data delivered here but is wired into the operational modules from Phase 4 onward (nothing to row-filter until DPR/attendance exist). Migration `0002` applied to Neon on 2026-06-07.

## Phase 4: DPR Module — ✅ Completed (2026-06-07); reshaped 2026-06-13

**Post-MVP reshape (2026-06-13, migration `0012`):** the **draft** stage was removed — reports
are **submitted** on creation. The uploader (or site owner) can **edit data + photos until the
owner locks it** (the "approve" action, now labelled **Lock**); locked reports are read-only.
Members see **only their own** reports; the owner sees all. See `docs/progress.md`.

Goals:

- Build Daily Progress Report module. ✅ (site-scoped CRUD + approval)
- Support photos through signed upload URLs. ✅ (R2 presigned PUT/GET via aws4fetch; verified end-to-end via the API — browser uploads need a bucket CORS policy set in the dashboard)
- Store DPR file metadata in database. ✅ (`dpr_photos`)
- Support mobile-friendly DPR entry. ✅ (single sheet; camera capture input)
- Add DPR list, detail, create, and edit screens. ✅

Deliverables:

- DPR schema ✅ (`dpr` + `dpr_photos`, migration `0001`)
- DPR APIs ✅ (list/create/get/update/delete/approve + photo upload-url/confirm/delete)
- DPR frontend screens ✅ (list + filters, create/edit modal, detail modal with photos)
- DPR photo upload flow ✅ (presigned direct-to-R2; verified 8/8 via the API — browser PUT needs bucket CORS)
- DPR report export job ⏳ deferred to **Phase 8** (needs Cloudflare Queues)

## Phase 5: Inventory Module — ✅ Completed (2026-06-09)

Goals:

- Build material master. ✅ (`materials`, site-scoped, soft-deleted; SKU unique per site)
- Build site-wise stock tracking. ✅ (denormalized `current_stock` + immutable `stock_movements` ledger, updated in one transaction)
- Build inward, outward, transfer, and wastage flows. ✅ inward / outward / wastage / adjustment — ⏳ **transfer deferred** (cross-site; see follow-ups)
- Add low stock alerts. ✅ (`reorder_level` → `lowStock` flag + `status=low_stock` filter + live dashboard widget)
- Add inventory audit trail. ✅ (every create/update/delete + each movement audited via `writeAudit`)

Deliverables:

- Material schema ✅ (`materials`, migration `0002`)
- Stock ledger schema ✅ (`stock_movements`, append-only with `balance_after`)
- Inventory APIs ✅ (materials CRUD + movements list/create — 7 endpoints, transactional stock update, negative-stock guard)
- Inventory table screens ✅ (list + search + low-stock filter, detail modal with ledger)
- Stock movement forms ✅ (type selector + quantity/counted-stock, live "stock after" preview)
- Low stock dashboard widget ✅ (`LowStockCard`)

Note: **transfers** and **idempotency keys** for movements are deferred (transfers → cross-tenant follow-up; idempotency → Phase 9 with the middleware/service). Inventory Excel/PDF export → Phase 8 (Queues). Migration `0002` applied to Neon on 2026-06-09.

## Phase 6: Attendance And Salary — ✅ Completed (2026-06-09)

Goals:

- Build worker master. ✅ (`workers`, site-scoped, soft-deleted)
- Build attendance marking. ✅ (bulk daysheet upsert, one record per worker/day)
- Support present, absent, half-day, and overtime. ✅ (status + `overtime_hours`)
- Track advances. ✅ (`worker_advances` ledger, settled at salary time)
- Calculate salary from approved attendance. ✅ (transactional run from approved rows; rates snapshotted)
- Track salary payment status. ✅ (`unpaid`/`partial`/`paid` per payslip)

Deliverables:

- Worker schema ✅ (`workers`, migration `0003`)
- Attendance schema ✅ (`attendance` + approval gate)
- Salary schema ✅ (`salary_runs` + `salary_run_items`; advances in `worker_advances`)
- Attendance APIs ✅ (workers CRUD + bulk mark + approve + advances — 11 endpoints)
- Salary APIs ✅ (generate/list/detail/discard run + record payment — 5 endpoints)
- Attendance and salary frontend screens ✅ (Daysheet/Workers/Advances tabs; runs list + payslip detail; live "Today Attendance" dashboard widget)

Note: **idempotency keys** (salary generation/payments) and **Attendance Excel / Salary report** exports are deferred (Phase 9 and Phase 8 respectively), like the Inventory/DPR follow-ups. Migration `0003` applied to Neon on 2026-06-09; API smoke test passed 30/30 (see `docs/progress.md`).

## Phase 7: Expenses, Purchases, And Suppliers — ✅ Completed (2026-06-09)

Goals:

- Build expense tracking. ✅ (`expenses`, site-scoped, pending→approved/rejected)
- Build petty cash tracking. ✅ (`isPettyCash` flag + filter)
- Build supplier management. ✅ (`suppliers` master CRUD + outstanding balance)
- Build purchase request and purchase order flow. ✅ (single `purchases` entity: draft→ordered→partially_received→received)
- Link received goods to inventory where required. ✅ (goods receipt inwards material-linked lines into `stock_movements` in one transaction)

Deliverables:

- Expense schema ✅ (`expenses`, migration `0004`)
- Supplier schema ✅ (`suppliers`)
- Purchase schema ✅ (`purchases` + `purchase_items`)
- Expense APIs ✅ (CRUD + approve/reject — 6 endpoints)
- Purchase APIs ✅ (CRUD + receive + pay — 7 endpoints; + suppliers CRUD — 5 endpoints)
- Supplier screens ✅
- Expense and purchase screens ✅ (+ live "Today Expenses" & "Pending Payments" dashboard widgets)

Note: **expense receipt uploads** (reuse the DPR R2 flow once bucket CORS is set), **exports** (Phase 8), and **idempotency keys** for purchase creation/payments (Phase 9) are deferred. Migration `0004` applied to Neon on 2026-06-09; API smoke test passed 26/26 (see `docs/progress.md`).

## Phase 8: Reports And Background Jobs — ✅ Completed (2026-06-09)

Goals:

- Use Cloudflare Queues for PDF generation. ✅ (queue producer + consumer; `pdf-lib`)
- Use Cloudflare Queues for Excel exports. ✅ (CSV — spreadsheet-friendly; true `.xlsx` is a follow-up)
- Store generated files in R2 when needed. ✅ (`putObject`; key `exports/{siteId}/{jobId}.{ext}`)
- Add export status tracking. ✅ (`queued → processing → completed | failed`; live polling)
- Add retry handling. ✅ (`attempts` + queue `retry()` under `max_retries`; permanent failures recorded)

Deliverables:

- Report job schema ✅ (`export_jobs`, migration `0005`)
- Queue producers ✅ (`EXPORT_QUEUE` binding + `waitUntil` fallback when unbound)
- Queue consumers ✅ (`src/queue/consumer.ts`; Worker exports `{ fetch, queue }`)
- PDF reports ✅ (paginated A4-landscape tables with totals via `pdf-lib`) — **`dpr_log` PDF reshaped 2026-06-13** to a page-per-report layout with **site photos embedded from R2** (see `docs/progress.md`)
- Excel exports ✅ (UTF-8 CSV with BOM; 8 report types across all modules)
- Download links ✅ (short-lived presigned R2 GET with attachment disposition)

Eight report types (`GET /reports/types`): `dpr_log`, `inventory_stock`, `stock_ledger`,
`attendance_register`, `salary_register`, `expense_register`, `purchase_register`,
`supplier_ledger` — one+ per operational module, delivering the exports deferred from
Phases 4–7. Note: prod Queues need a paid Workers plan; migration `0005` apply to Neon +
the live smoke test are pending owner authorization. See `docs/progress.md`.

## Phase 9: Performance, Security, And Production Readiness — ✅ Completed (2026-06-09)

Goals:

- Add rate limiting. ✅ (login/refresh limits + a baseline global per-IP limiter; KV/DO upgrade documented)
- Add Cloudflare Cache API where safe. ✅ (`edgeCache` mw on the non-tenant `/reports/types`)
- Add idempotency handling for critical operations. ✅ (`Idempotency-Key` → `idempotency_keys`)
- Add retry strategies. ✅ (queue retries from Phase 8 + idempotent retries here)
- Add query optimization. ✅ (joins over N+1; reviewed in docs/security.md)
- Add proper indexes. ✅ (tenant/date/status/FK + composite + partial uniques; reviewed)
- Review audit trails. ✅ (no secrets/amounts — confirmed in the security review)
- Review soft deletes. ✅ (business records soft-deleted; immutable ledgers documented)
- Review API documentation. ✅ (Swagger covers all modules; Idempotency-Key noted on critical routes)

Deliverables:

- Rate limiting middleware ✅ (`common/rate-limit`, applied globally + on auth)
- Idempotency middleware/service ✅ (`common/idempotency` + `idempotency_keys`, migration `0006`)
- Optimized indexes ✅ (reviewed; idempotency unique index added)
- Security review checklist ✅ (`docs/security.md`)
- Production deployment checklist ✅ (`docs/security.md`)
- Complete Swagger UI docs ✅ (all 12 modules; critical routes document the Idempotency-Key header)

Idempotency is enforced on payments, salary generation, stock movements, purchase
creation/receipt, and export generation; the web client auto-sends a per-call key on
those mutations. Remaining hardening (KV/DO rate limiting, idempotency TTL sweep,
httpOnly token storage) is captured as post-MVP follow-ups in `docs/security.md`.

## Verification Standards

Every phase should include:

- TypeScript typecheck
- Unit tests where practical
- API route tests for important endpoints
- Manual smoke test for main user flow
- Database migration verification
- Swagger UI verification

## MVP Completion Definition

The MVP is complete when:

- Auth and RBAC work end to end.
- Owner can create projects and sites.
- Site manager can submit DPR.
- Store manager can track inventory.
- Supervisor can mark attendance.
- Accountant can calculate salary and track expenses.
- Owner can view dashboard and export reports.
- All protected APIs validate input and enforce permissions.
- Core UI works on desktop and mobile.
