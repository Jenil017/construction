# Progress Log

Living record of delivery progress against `docs/plan.md`. Newest phase on top.

## Post-MVP — Attendance ↔ Salary split + worker categories ✅ (2026-06-13)

Re-split the Attendance and Salary modules with the product owner so **all money
(salary + advances) lives in Salary**, **Attendance is just workers + the daysheet**, and
workers get a **per-site category dropdown** (replacing free-text "trade"). Migration `0011`
(additive — 2 tables, 1 column).

### Decisions made (with the product owner)
- **Keep the daily daysheet** in Attendance (it feeds salary's day count). Attendance is now
  two tabs — *Daysheet* + *Workers* — the **Advances tab is gone**.
- **Salary is a per-worker monthly view** (a month picker → every worker with days, gross,
  advances, net, paid, balance), **replacing the batch "salary run" screen**. Advances are
  **given and tracked here**, deducted from the month they're dated in.
- **Per-site worker categories**: a new `worker_categories` list powers the worker form's
  category dropdown, with an inline **"+ add category"** that persists to the DB. The old
  `trade` column is kept as a read fallback for pre-existing workers.
- **Salary days are counted from all marked attendance in the month** (approval is no longer
  required for the computed view — the approval gate still exists in the daysheet).

### Delivered
- **DB** (`packages/db`, migration `0011`): `worker_categories` (per-site, unique name);
  `workers.category_id` FK (+ index); `salary_payments` (per worker, per `YYYY-MM`, what was
  actually paid out). The legacy `salary_runs`/`salary_run_items` tables are **retained**
  (the Reports salary dataset still reads them) but no longer written.
- **API** — Attendance: `GET/POST /attendance/categories`; worker create/update/list/detail
  carry `categoryId` + a resolved `category` name; the `/attendance/advances` routes were
  **removed** (moved to Salary). Salary **rewritten**: `GET /salary/monthly?month=`
  (computes days/gross/advances/net/paid/balance per worker), `GET/POST/DELETE
  /salary/advances`, `GET/POST/DELETE /salary/payments` (advance + payment creation are
  idempotent). The old `/salary/runs*` routes were removed. **RBAC change:** advances now
  need `salary` permission (were `attendance`).
- **Web** — Attendance page: Advances tab removed; Workers table shows Category / Mobile /
  Daily wage / OT. Worker form: category **dropdown + inline add**. Salary page rebuilt as a
  month picker + per-worker table + totals, with a **worker detail modal** (breakdown +
  advances/payments history + *Give advance* / *Record payment* in-modal). Deleted the
  `generate-run`, `run-detail`, `pay-item`, and `advance-form` modals.

### Verification
- `pnpm typecheck` (5 pkgs), `pnpm build` (web `/salary` + `/attendance` compile; API wrangler
  dry-run) — **all pass**. Biome clean on the changed files. `pnpm db:generate` → `0011`
  (additive; reviewed).
- **Pending owner authorization** (DB-migration gate): apply `0011` to Neon
  (`pnpm db:migrate`) and smoke-test (add a category → add a worker with it → mark a few days
  → open Salary for the month → give an advance and a payment → balances update).

### Follow-ups
- ✅ **Resolved (2026-06-13):** the Reports **Salary register** was repointed to the new
  model (computes per-worker days/gross/advances/net/paid/balance from `attendance` +
  `worker_advances` + `salary_payments` over the date range), the **Attendance register**
  now shows `category` instead of the legacy `trade`, and a new **Sales register**
  (`sales_register`, from `site_sales`) was added — previously sales had no report at all.
  `salary_runs`/`salary_run_items` are now referenced by **no** code (kept as empty tables).
- `worker_advances.settled_in_run_id` is now unused (advances deduct by date); harmless,
  left in place.
- The `/reports/types` list is edge-cached for 1h, so a newly added report type can take up
  to an hour to appear on a deployed worker (immediate locally).

## Post-MVP — Record detail modals (tap-a-row) ✅ (2026-06-12)

Made data-table rows **open a full record detail modal** on click — the immediate ask
being the Selling table (a sale's full info + a **Total / Received / Outstanding**
payment breakdown), with the same pattern applied to Expenses. Mobile-first for the
planned PWA: a **card list on phones, a clickable table on ≥md**, both opening the same
modal (the existing `Modal` already renders as a bottom sheet on small screens).

### Decisions made
- **Reusable detail primitives** (`components/ui/detail.tsx`): `StatTiles` (headline
  figures, 2-up on phones / 3-up on ≥sm), `DetailRows` (a label→value definition list that
  wraps on mobile, with `hideEmpty` to drop blank rows), and `formatINR` (Indian-format
  rupees, e.g. ₹3,00,000). These standardise every record modal so the remaining tables are
  quick to roll out.
- **Mirror the existing purchases pattern** (it already had row→detail): phones get a
  `<ul>` of tappable cards (`md:hidden`), desktop gets a `cursor-pointer` table
  (`hidden md:block`); both call the same `setDetail(row)`. Row actions moved **into** the
  modal (no more inline action column doing the work) but a desktop "View" affordance stays.
- **Selling detail** shows status + payment badges, the Total/Received/Outstanding tiles
  (Outstanding tinted red when > 0 — directly answers "₹50,000 remaining, where?"), all
  fields, notes, and permission-gated **Record payment / Edit / Delete** (delete returns
  stock). Driven entirely off the list row — no extra fetch.
- **Expense detail** surfaces a prominent amount, all fields, and the **Approve / Reject**
  workflow (the `useSetExpenseStatus` hook existed but had **no UI** before now), plus
  Edit / Delete — permission-gated (`expenses:approve|update|delete`).

### Delivered
- **Web** (`apps/web`): `components/ui/detail.tsx`; `selling/sale-detail-modal.tsx` +
  `expenses/expense-detail-modal.tsx`; `selling/page.tsx` and `expenses/page.tsx` rebuilt
  with the card-list/clickable-table + detail-modal pattern.

### Verification
- `pnpm typecheck` (5 pkgs) — **pass**. `pnpm build` (`/selling`, `/expenses` compile) —
  **pass**. Biome — the 5 changed/added files are clean.

### Follow-ups
- Detail modals already exist for purchases / salary / inventory / DPR. **Still without a
  row→detail modal:** suppliers, workers, sites, settings→users, attendance — easy to roll
  out next on the same `detail.tsx` primitives.

## Post-MVP — Selling ↔ Inventory integration ✅ (2026-06-12)

The Selling module (added post-Phase-9) was a standalone register: it recorded a sale
as **free text** (typed item name + a free-text "category") and **never touched
inventory** — you could "sell" stock you did not have. This change ties selling
strictly to the inventory master so a sale can only ever be an in-stock item, and a
confirmed sale moves stock. Migration `0010`.

### Decisions made (with the product owner)
- **Strictly inventory-only sales.** `site_sales.materialId` is now **required** (FK to
  `materials`); the free-text item field and the whole **`category`** concept are gone.
  You can only sell what exists in inventory with stock on hand. `itemDescription`/`unit`
  are now **server-set snapshots** of the material's name/unit at sale time (kept for a
  readable record if the material is later renamed/deleted).
- **One smart searchable dropdown.** The sale form replaces the typed item + category with
  a single portaled `Combobox` sourced from a new `GET /selling/available-materials`
  endpoint that returns **only materials with `currentStock > 0`**. The user types a
  partial name/SKU to filter; picking an item auto-fills the unit (read-only), shows the
  available quantity, and surfaces the last unit cost as a **hint** next to the rate (the
  selling rate stays manually entered — cost ≠ sale price).
- **Stock moves with the sale, in one transaction.** Creating a sale writes an `outward`
  `stock_movement` and decrements `materials.currentStock` together with the sale insert
  (same pattern as purchases' goods-receipt inward), guarded by an **`Idempotency-Key`**.
  Overselling is rejected (`Only N <unit> of <item> in stock.`) both in the form (live,
  Save disabled) and on the server (authoritative).
- **Cancel/delete restores stock.** Cancelling a confirmed sale (or deleting it) writes a
  reversing `inward` movement and bumps `currentStock` back, in the same transaction.
  Soft-delete + the status guard make double-restores impossible (a deleted/cancelled row
  is filtered out / blocked on the second call).
- **Item + quantity lock after creation.** They drive the stock movement, so the update
  endpoint only edits date, rate, buyer, payment mode, and notes. To change what/how much
  was sold, cancel (stock returns) and record a new sale.

### Delivered
- **DB** (`packages/db`): `site_sales` — `material_id` → `NOT NULL`, dropped `category`,
  added `site_sales_material_idx`; doc comment rewritten. Migration
  `0010_brief_robin_chapel.sql` (with a guarded `DELETE … WHERE material_id IS NULL` to
  clear pre-feature free-text rows before the constraint is enforced).
- **API** (`apps/api/src/modules/selling`): new `GET /selling/available-materials`
  (`selling:create`, stock > 0, partial search); `POST /selling` now validates the
  material + stock and decrements inventory transactionally (idempotent); `POST
  /selling/{id}/status` and `DELETE /selling/{id}` restore stock; `PATCH` restricted to
  the editable fields; `category` removed from schemas/serialization.
- **Web** (`apps/web`): `useAvailableMaterials` hook; `sale-form-modal` rebuilt around the
  `Combobox` (auto unit, stock cap, cost hint, over-stock guard); `category` removed from
  the hooks/list page/table; create + delete invalidate the `inventory` query cache so
  stock widgets refresh.

### Verification
- `pnpm typecheck` (5 pkgs) — **pass**. `pnpm build` (Next 15 routes incl. `/selling` +
  API wrangler dry-run) — **pass**. Biome — the 7 changed feature files are clean
  (`npx biome check` on them passes); note a **pre-existing** `useExhaustiveDependencies`
  error in `purchases/purchase-detail-modal.tsx` (untouched here) still fails repo-wide
  `pnpm check`.
- `pnpm db:generate` → `0010`; SQL reviewed (drop column, set-not-null with the delete
  guard, add index).
- **Pending owner authorization** (the DB-migration gate): applying `0010` to Neon
  (`pnpm db:migrate`) and the live `wrangler dev` smoke (create a sale → stock drops +
  an `outward` movement appears; oversell → 409; cancel/delete → stock restored). Not run
  without sign-off.

### Follow-ups
- Pre-existing Biome error in `purchase-detail-modal.tsx` is unrelated to this work and
  left as-is.
- No "selling" report type yet (Phase 8 export pipeline); a sales report can be added later.

## Phase 9 — Performance, Security & Production Readiness ✅ (2026-06-09)

The hardening phase. Centerpiece is the **idempotency middleware/service** (mandated by
docs/architecter.md and deferred since Phase 5), plus an edge-cache for safe reference
reads, a baseline global rate limit, an index/audit/soft-delete review, and the
**security + production deployment checklists** (`docs/security.md`). Migration `0006`.

### Decisions made
- **Idempotency via an `Idempotency-Key` header + an `idempotency_keys` table**, scoped
  per site (the tenant key). First request claims a row (`in_progress`) by racing on the
  `(site_id, key)` unique index (`onConflictDoNothing`); on success the response
  (status + JSON body) is stored (`completed`). A replay with the **same payload** returns
  the stored response verbatim (`Idempotent-Replay: true`); a replay with a **different
  payload or user** → `IDEMPOTENCY_CONFLICT`; a replay **while in progress** → conflict
  ("retry shortly"). If the handler throws, the claim is released so a genuine retry can
  proceed. `requestHash` is `sha256(method + path + body)`.
- **Backward-compatible (enforce-when-present).** No key header → the middleware is a
  no-op, so existing/other clients aren't broken. The web client opts in: `apiFetch` gains
  an `idempotent` flag that generates a per-call key (stable across the internal
  token-refresh retry), wired into the 7 critical mutations. Applied server-side to
  **salary generate, salary pay, inventory movement, purchase create/receive/pay, and
  report export** — exactly the docs/architecter.md "use idempotency keys for…" set.
- **Cloudflare Cache API only for stable, non-tenant data.** New `edgeCache` middleware
  (placed AFTER auth so it never bypasses a permission check) applied to `/reports/types`
  only. Tenant/financial/auth responses are explicitly never cached.
- **Rate limiting.** Kept the tight in-isolate login (10/min) / refresh (30/min) limits and
  added a baseline global per-IP limiter (600/min) as a blunt DoS guard. Documented that a
  hard cross-isolate limit needs **KV or a Durable Object** (post-MVP follow-up).
- **Index / audit / soft-delete review** (written up in `docs/security.md`): tenant/date/
  status/FK + composite + partial-unique indexes confirmed across modules; audit rows carry
  no secrets/amounts; business records soft-deleted (ledgers intentionally immutable).
- **Idempotency rows have no TTL/cleanup yet** and the claim isn't folded into the business
  transaction (a crash between commit and response-store leaves a stuck `in_progress` row).
  Documented as follow-ups — acceptable for MVP.

### Delivered
- **DB** (`packages/db`): `idempotency_keys` (site + user, key, method/path, requestHash,
  status, statusCode, responseBody jsonb; `(site_id, idempotency_key)` unique + created
  index). Migration `0006_remarkable_grandmaster.sql` (additive: 1 table, 2 FKs, 2 indexes).
- **API** (`apps/api`): `common/idempotency` (the middleware/service); `common/cache`
  (`edgeCache`); a baseline global `rateLimit` in `app.ts`; the 7 critical routes gated by
  `idempotency()` with the `Idempotency-Key` header documented in their Swagger descriptions.
- **Web** (`apps/web`): `apiFetch` `idempotent`/`idempotencyKey` options (per-call key,
  stable across the refresh-retry) wired into the salary/inventory/purchase/report mutations.
- **Docs**: `docs/security.md` — the security review checklist + the production deployment
  checklist + the known post-MVP follow-ups.

### Verification
- `pnpm typecheck` (4 pkgs), `pnpm check` (Biome, 188 files), `pnpm build` (Next 14 routes +
  API wrangler dry-run, queue handler + pdf-lib bundled) — **all pass**.
- `pnpm db:generate` → `0006`; SQL reviewed (1 table, FKs, the `(site_id, key)` unique +
  created index).
- **Pending owner authorization** (the production-DB-migration gate): applying `0006` to
  Neon (`pnpm db:migrate`) and the live `wrangler dev` smoke (create with a key → replay the
  same key returns the stored response with `Idempotent-Replay: true`; changed payload →
  `IDEMPOTENCY_CONFLICT`; `/reports/types` second hit served from cache). Not run without
  sign-off.

### Notes / follow-ups (tracked in `docs/security.md`)
- KV/Durable-Object rate limiting (hard, cross-isolate).
- Idempotency-key TTL/cleanup sweep + folding the claim into the business transaction.
- httpOnly-cookie / BFF token storage (reduce XSS exposure of `localStorage` tokens).
- True `.xlsx` exports, image compression/enhancement jobs, site-to-site transfers.
- **MVP is feature-complete** — all 9 phases delivered.

## Phase 8 — Reports & Background Jobs ✅ (2026-06-09)

A generic, queue-backed report export pipeline covering every operational module. A
request records an `export_jobs` row + enqueues it to **Cloudflare Queues**; the queue
**consumer** generates the file off the request path, stores it in **R2**, and flips the
job status; the client polls and downloads via a short-lived presigned URL. Migration
`0005`. This also satisfies the export deliverables deferred from Phases 4–7.

### Decisions made
- **One generic export framework, not per-module endpoints.** A dataset *builder* per
  report type returns `{ title, subtitle, columns, rows, totals }`; two renderers
  (CSV, PDF) consume that shape. Adding a report = one builder + one catalog entry.
  Eight report types ship: `dpr_log`, `inventory_stock`, `stock_ledger`,
  `attendance_register`, `salary_register`, `expense_register`, `purchase_register`,
  `supplier_ledger` — one+ per module, exposed via `GET /reports/types`.
- **Queues with a graceful fallback.** The Worker is both producer (`EXPORT_QUEUE`
  binding) and consumer (`queue` handler). When the binding is absent (e.g. local dev
  without Queues, or before the paid plan / `wrangler queues create`), the producer
  falls back to in-isolate processing via `executionCtx.waitUntil` — so exports work in
  every environment and Queues are used when available. **Prod needs a paid Workers
  plan** + `wrangler queues create construction-erp-exports` (documented in `wrangler.jsonc`).
- **Formats: PDF (pdf-lib) + CSV.** `pdf-lib` is pure-JS and bundles for Workers (dry-run
  upload 1.96 MiB / 427 KiB gzip). CSV (UTF-8 with a BOM, RFC-escaped) is the
  spreadsheet-friendly "Excel" export and opens natively in Excel; **true `.xlsx` is a
  future enhancement.** PDF tables are A4-landscape, paginated, with totals + page
  numbers; pdf-lib's standard fonts are WinAnsi-only, so the renderer maps `₹`→`Rs` and
  drops non-Latin glyphs to `?` — **non-Latin text (e.g. Gujarati names) should be
  exported as CSV**, which preserves UTF-8.
- **Files stored in R2 from the Worker.** Added `putObject` to `common/r2` — the one case
  where bytes flow through the Worker (background generation), distinct from the
  presigned-PUT browser-upload flow. Download uses a presigned **GET** with a
  `response-content-disposition: attachment` override (valid ~5 min) so the browser saves
  with a friendly filename. Object key `exports/{siteId}/{jobId}.{ext}`.
- **Status + retries.** Lifecycle `queued → processing → completed | failed`, with an
  `attempts` counter. The consumer `retry()`s a transient failure under the cap
  (`max_retries: 3`) and records a user-facing `errorMessage` + `ack()`s a permanent
  failure (no infinite redelivery, no dead-letter queue needed). Job creation + its audit
  row are written in **one transaction** (the docs/architecter.md "export job + audit log"
  critical op). Audit carries only `{ reportType, format }` — never row data.
- **Permission model.** Generation is gated by `reports:export` **and** `view` on the
  source module (so a user can't export data they can't see); the owner bypasses both.
  Listing/status/download need `reports:view`; deletion needs `reports:delete`. A 5000-row
  cap per export is **flagged** in the report subtitle (no silent truncation).
- **Row cap is flagged, not silent**, per the "no silent failures" rule.

### Delivered
- **DB** (`packages/db`): `export_jobs` (site-scoped; reportType, format, status, params
  jsonb, fileName, objectKey, fileSize, rowCount, errorMessage, attempts, correlationId,
  requestedBy, completedAt; site / site+status / requestedBy / created indexes). Migration
  `0005_cool_stature.sql` (additive: 1 table, 2 FKs, 4 indexes).
- **API** (`apps/api`): `common/r2` gains `putObject` + a content-disposition override on
  `presignGetUrl`; new `ExportError` (`EXPORT_FAILED`). `modules/reports` — datasets
  (`reports.datasets.ts`), renderers (`reports.render.ts`), the job service
  (`reports.service.ts` → `runExportJob` / `processExportMessage`), and routes:
  `GET /reports/types`, `GET/POST /reports/exports`, `GET /reports/exports/{id}`,
  `GET /reports/exports/{id}/download`, `DELETE /reports/exports/{id}` (6 endpoints under
  the **Reports** tag, all site-scoped + `requirePermission("reports", …)`). Queue plumbing
  in `src/queue/` (`types.ts`, `consumer.ts`); the Worker entry now exports
  `{ fetch, queue }`. New binding `EXPORT_QUEUE` (optional). New dep `pdf-lib`.
- **Web** (`apps/web`): `use-reports` hook (types/list/create/delete + a presigned-download
  helper; the list **polls every 2.5 s while any job is running**). Real **Reports** screen
  replacing the placeholder — a generate panel (report picker + CSV/PDF + optional date
  range, shown only for date-ranged reports) and a status-tracked job table with live
  badges, row/size, and a Download action; permission-gated (export/delete).

### Verification
- `pnpm typecheck` (4 pkgs), `pnpm check` (Biome, 185 files), `pnpm build` (Next 14 routes
  incl. real `/reports` 3.18 kB; **API wrangler dry-run bundles `pdf-lib` + the `queue`
  handler, 1.96 MiB / 427 KiB gzip, `EXPORT_QUEUE` binding recognized**) — **all pass**.
- `pnpm db:generate` → `0005`; SQL reviewed (1 table, FKs, all 4 indexes).
- **Offline renderer check passed** (ran the real `renderCsv`/`renderPdf` over a dataset
  with money/number/date columns, a `₹` sign, an embedded quote+comma, and Gujarati text):
  CSV has the UTF-8 BOM, escapes quotes/commas, preserves Gujarati; PDF emits valid `%PDF-`
  bytes; the `₹`/Gujarati sanitizer never throws; empty datasets still render valid files.
- **Pending owner authorization (same gate as every prior migration):** applying
  `0005` to Neon (`pnpm db:migrate`) and the live `wrangler dev` smoke test (login →
  create export → poll to completed → download). Not run here to avoid touching the live DB
  without sign-off.

### Notes / follow-ups
- **Prod Queues need a paid Workers plan** + `wrangler queues create construction-erp-exports`;
  set R2 secrets via `wrangler secret put`. Until then the `waitUntil` fallback runs exports.
- **True `.xlsx`** (vs CSV) and **image compression/enhancement jobs** (docs/architecter.md
  lists them under Queues) are future enhancements — the queue + job-status scaffolding is
  in place to host them.
- **Idempotency keys** for export generation → Phase 9 (with the middleware); today a fresh
  job row per request + the delta-free read-only generation make double-submits harmless.
- **DPR PDF / Inventory / Attendance / Salary / Expense / Purchase exports** deferred from
  Phases 4–7 are delivered here as report types.
- `read_write` grants `reports:export`/`delete`; split the level model later if a site needs
  e.g. "view reports but not export".


| Phase | Status | Date |
|---|---|---|
| Phase 0 — Project Setup & Documentation | ✅ Completed | — |
| Phase 1 — Foundation | ✅ Completed | 2026-06-06 |
| Phase 2 — Authentication & RBAC | ✅ Completed | 2026-06-06 |
| Phase 3 — Company, Project, Site | ✅ Completed | 2026-06-07 |
| Refactor — Site-as-tenant model | ✅ Completed | 2026-06-07 |
| Phase 4 — DPR | ✅ Completed | 2026-06-07 |
| Phase 5 — Inventory | ✅ Completed | 2026-06-09 |
| Phase 6 — Attendance & Salary | ✅ Completed | 2026-06-09 |
| Phase 7 — Expenses, Purchases, Suppliers | ✅ Completed | 2026-06-09 |
| Phase 8 — Reports & Background Jobs | ✅ Completed | 2026-06-09 |
| Phase 9 — Performance, Security, Production | ✅ Completed | 2026-06-09 |

---

## Phase 7 — Expenses, Purchases & Suppliers ✅ (2026-06-09)

Three modules in one phase — a supplier master, a site expense register with an approval workflow, and a purchase-order flow whose goods receipt feeds inventory. Site-scoped end to end, following the established module patterns (transactional multi-table writes + `writeAudit`, soft deletes, standard envelope, TanStack-Query web layer). Migration `0004`.

### Decisions made
- **Site-scoped suppliers** (each site manages its own vendor list, consistent with the site-as-tenant model). Deletion is blocked while any non-deleted purchase references the supplier.
- **Expenses**: workflow `pending` → `approved` | `rejected` (approval gated by `expenses:approve` — the docs/architecter.md "expense approval → ledger" op; the audit trail is the ledger for MVP). Only **pending** expenses can be edited; `paidTo`/`paymentMode`/`isPettyCash` capture the PRD fields. **Receipt image uploads are deferred** — they reuse the DPR R2 presigned-URL flow once bucket CORS is configured (the same blocker noted for DPR photos).
- **Single `purchases` entity for the PR→PO→GRN flow** via a status workflow (`draft` → `ordered` → `partially_received` → `received`, or `cancelled`) with line items in `purchase_items`, instead of separate request/order/receipt tables (MVP simplification).
- **Goods receipt → inventory is the critical transaction** (docs/architecter.md "purchase receipt → stock update"): receiving a material-linked line inserts an `inward` `stock_movement` and bumps the material's `current_stock` (and last `unit_cost`) in the **same transaction** that records the received quantity and recomputes the PO status. Receipts are **delta-based** (received only increases, capped at the ordered qty) so repeated calls never double-add stock; "pending material" = ordered − received. A received/partially-received PO can't be deleted (inventory was already updated).
- **Supplier payment status** per purchase (`unpaid` → `partial` → `paid`) via a cumulative `amountPaid`; a supplier's outstanding balance is `Σ(total − amountPaid)` over its live purchases.
- **Audit carries no amounts** — expense/purchase/payment audit `after` records category/status/counts only, never amounts or paidTo (sensitive payment data per docs/architecter.md).
- **Idempotency** for purchase creation/payments deferred to Phase 9 (with the middleware); the delta-based receive is inherently safe against double-application.

### Delivered
- **DB** (`packages/db`): `suppliers` (name, contact, phone, email, GSTIN, address; site + site/name indexes), `expenses` (date, category, amount, paidTo, paymentMode, pettyCash, approval; site/date/category/status indexes), `purchases` (supplier FK, PO number, dates, status, totals, payment status; site/status/supplier/date indexes), `purchase_items` (optional material FK, qty/unit/rate/amount, receivedQty; purchase/site/material indexes). Migration `0004_gifted_nuke.sql` (additive: 4 tables, FKs, indexes).
- **API** (`apps/api`): `modules/suppliers` (CRUD + outstanding detail — 5 endpoints, `suppliers:*`), `modules/expenses` (CRUD + approve/reject — 6 endpoints, `expenses:*`), `modules/purchases` (CRUD + receive + pay — 7 endpoints, `purchases:*`). 18 endpoints total, all site-scoped, audited, paginated/filterable; receive + pay + approval are transactional. Mounted in `app.ts`; Swagger tags **Suppliers**/**Expenses**/**Purchases**. No new env.
- **Web** (`apps/web`): `use-suppliers` / `use-expenses` / `use-purchases` hooks (receive invalidates the `["inventory"]` cache too). Real **Suppliers** screen (CRUD), **Expenses** screen (table + status/search filters, inline approve/reject, petty-cash badge), **Purchases** screen (list + status filter, new-purchase modal with dynamic line items + material picker + live total, and a detail modal that places the order, **receives goods**, records supplier payment, and cancels/deletes). **Dashboard "Today Expenses" and "Pending Payments" KPIs are now live** — with Phase 5/6, four of the eight dashboard KPIs read real per-site data.

### Verification
- `pnpm typecheck` (5 pkgs), `pnpm check` (Biome, 175 files), `pnpm build` (Next 16 routes incl. real `/suppliers` 2.82 kB + `/expenses` 3.79 kB + `/purchases` 5.89 kB + live `/dashboard`, + wrangler dry-run) — **all pass**.
- `pnpm db:generate` → `0004`; SQL reviewed (4 tables, FKs, all indexes). **Applied to Neon via `pnpm db:migrate` (owner-authorized 2026-06-09).**
- **API smoke (wrangler dev): 26/26 passed** — create supplier (detail outstanding 0); create expense → pending → approve → **edit approved blocked (409)** → second expense rejected; create a 2-line PO (cement 100×₹50 linked to a material + ₹500 labour) → total ₹5500, status ordered; **receive 40 → partially_received and material stock 0→40 with an inward ledger movement of 40**; supplier outstanding ₹5500; receive the rest → received, stock →100; pay ₹2000 → partial (outstanding ₹3500), overpay → 400, pay ₹5500 → paid; delete received PO → 409; delete supplier with purchases → 409; missing `X-Site-Id` → 400; supplier invisible from another site (cross-site isolation). (Expenses + the test material were cleaned up; the received PO and its supplier are retained — a received PO can't be deleted — and are tagged `ZZ7` in the dev DB.)
- Swagger `/openapi.json` exposes all 9 Phase 7 paths (18 operations) under the **Suppliers**/**Expenses**/**Purchases** tags.

### Notes / follow-ups
- **Expense receipt uploads** → reuse the DPR R2 presigned-URL flow once the bucket CORS policy is set (the DPR-photos browser-upload blocker).
- **Excel/PDF exports** (expense report, purchase/GRN, supplier ledger) → Phase 8 (Cloudflare Queues).
- **Idempotency keys** for purchase creation / payments → Phase 9.
- **Partial-receipt corrections** (reducing an already-received qty) are intentionally disallowed (would need a reversing outward movement) — add later if needed.
- `read_write` grants approve/delete on these modules; split the level model later if a site needs e.g. "record expenses but not approve" or "raise POs but not pay".

## Phase 6 — Attendance & Salary ✅ (2026-06-09)

Worker master, daily attendance with an approval gate, an advances ledger, and payroll generation — end to end and site-scoped, following the Inventory/DPR module patterns throughout (site-scoped tables, `requireAuth + requireSiteContext + requirePermission(…)`, standard envelope, transactional multi-table writes + `writeAudit`, soft deletes, TanStack-Query web layer).

### Decisions made
- **Wage model = daily wage + hourly overtime** (per docs/prd.md): each worker has `dailyWage` and an optional `overtimeRate` (₹/hr). A day is `present` (1.0), `half_day` (0.5), or `absent` (0.0); gross = payableDays·dailyWage + overtimeHours·overtimeRate. Rates are **snapshotted onto `salary_run_items`** at generation, so changing a worker's rate never alters an already-generated run.
- **Salary is generated only from APPROVED attendance** (the docs/architecter.md "attendance approval → salary generation" critical op). Attendance has a per-day approval (`approved` flag + approver/at); `POST /attendance/approve {date}` locks the day. Generation reads only approved rows in the period — generating with none returns `CONFLICT` ("Approve attendance first.").
- **Bulk daysheet marking.** `POST /attendance` upserts one record per (worker, date) for a whole crew in one call (the mobile flow). Already-approved records are left untouched and reported as `skippedApproved`. A partial unique index `(site_id, worker_id, attendance_date) WHERE deleted_at IS NULL` enforces one live record per worker/day.
- **Advances under the `attendance` module** (recorded in the field by the same actors who mark attendance; consumed by salary). A run settles every **unsettled** advance dated on/before its period end, stamping `settled_in_run_id` so an advance is never deducted twice; discarding a run clears the stamp, returning advances to the unsettled pool. `settled_in_run_id` is a deliberate **soft reference (no FK)** to avoid a cyclic dependency with `salary_runs`.
- **Idempotency deferred to Phase 9** (same precedent as Inventory — no middleware yet). Instead, a partial unique index `(site_id, period_start, period_end) WHERE deleted_at IS NULL` + a service-layer pre-check guard one live run per site+period (`CONFLICT` on a duplicate generate). Runs are **soft-deletable** so a period can be regenerated after attendance changes.
- **Audit trail carries no amounts.** Per docs/architecter.md (never log sensitive salary/payment data), advance/salary/payment audit `after` records only IDs, counts, dates, and status transitions — never wages, advances, or paid amounts.
- **Payment status per payslip** (`unpaid` → `partial` → `paid`), set by a cumulative `amountPaid` on `POST /salary/runs/{id}/items/{itemId}/pay`; a net ≤ 0 payslip (advances exceeded gross) is auto-marked `paid`.

### Delivered
- **DB** (`packages/db`): 5 tables — `workers` (name, phone, trade, `daily_wage`, `overtime_rate`, notes; site + site/name indexes), `attendance` (status, `overtime_hours`, approval, marked-by; site/site+date/worker/status indexes + the per-worker/day partial unique), `worker_advances` (amount, date, `settled_in_run_id`; site/worker/date/run indexes), `salary_runs` (period, denormalized totals; site index + period partial unique), `salary_run_items` (snapshotted wages + payslip math + payment status; run/site/worker indexes). Migration `0003_premium_forgotten_one.sql` (additive: 5 tables, FKs, indexes).
- **API** (`apps/api`): `modules/attendance` — workers CRUD (`GET/POST /attendance/workers`, `GET/PATCH/DELETE /attendance/workers/{id}`), attendance (`GET /attendance`, `POST /attendance` bulk mark, `POST /attendance/approve`), advances (`GET/POST /attendance/advances`, `DELETE /attendance/advances/{id}`) — 11 endpoints under `attendance:*`. `modules/salary` — `GET/POST /salary/runs`, `GET/DELETE /salary/runs/{id}`, `POST /salary/runs/{id}/items/{itemId}/pay` — 5 endpoints under `salary:*`. All site-scoped, audited, paginated/filterable; generation/payment/approval are transactional. Mounted in `app.ts`; documented under the **Attendance** and **Salary** Swagger tags. No new env.
- **Web** (`apps/web`): `use-attendance` + `use-salary` hooks (`["attendance"]` / `["salary"]` keys; generate/delete-run also invalidate attendance since they settle advances). Real **Attendance** screen with a **Daysheet** tab (date picker, per-worker P/½/A segmented control + OT input, "mark all present", live present/half/absent/unmarked counts, save + approve-day, approved rows locked), a **Workers** tab (master CRUD), and an **Advances** tab (ledger + record/delete, settled badge). Real **Salary** screen (runs list, generate-run modal defaulting to the current month, run-detail modal with the payslip table + per-worker payment recording + discard-run). **Dashboard "Today Attendance" KPI is now live** (`TodayAttendanceCard` → workers present today, links to Attendance).

### Verification
- `pnpm typecheck` (5 pkgs), `pnpm check` (Biome, 153 files), `pnpm build` (Next 16 routes incl. real `/attendance` 5.6 kB + `/salary` 3.9 kB + live `/dashboard`, + wrangler dry-run) — **all pass**.
- `pnpm db:generate` → `0003`; SQL reviewed (5 tables, FKs, all indexes, both partial uniques). **Applied to Neon via `pnpm db:migrate` (owner-authorized 2026-06-09).**
- **API smoke (wrangler dev): 30/30 passed** — owner creates worker A (wage 600, OT 75) + B (wage 500); bulk-mark A present +2h OT and B half_day; generate **before** approval → 409 ("approve first"); approve day → 2 approved; re-marking an approved row is skipped (`skippedApproved`); record a ₹200 advance (unsettled); generate run → **A gross 750 (600 + 2·75), −200 advance, net 550; B 0.5 day → gross 250; run totals gross 1000 / net 800**; the advance is now settled and a settled advance can't be deleted (409); pay B ₹100 → partial, pay A ₹550 → paid, overpay beyond net → 400; duplicate generate for the same period → 409; missing `X-Site-Id` → 400; the smoke workers are invisible from another site (cross-site isolation); discarding the run returns the advance to the unsettled pool. (Test entities cleaned up afterward.)
- Swagger `/openapi.json` exposes all 9 Phase 6 paths (16 operations) under the **Attendance**/**Salary** tags.

### Notes / follow-ups
- **Attendance Excel / Salary report** export → Phase 8 (Cloudflare Queues), like the deferred DPR PDF.
- **Idempotency keys** for salary generation / payments → Phase 9 (with the middleware/service); today guarded by the period unique index + submit-guard.
- **Mid-period wage changes**: a run uses each worker's rate at generation time for the whole period (snapshotted on the item). Per-day wage snapshots are a future enhancement if needed.
- **Partial advance carry-forward**: a run deducts the full unsettled advance balance (net may go ≤ 0, auto-`paid`); splitting a large advance across multiple runs is a future enhancement.
- `read_write` still grants approve/export/delete on `attendance`/`salary`; split the level model later if a site needs e.g. "mark but not approve" or "generate but not pay".

## Phase 5 — Inventory ✅ (2026-06-09)

Site-wise material master + an append-only stock ledger, end to end and site-scoped (the second operational module on the site-as-tenant model). Follows the DPR module's patterns throughout (site-scoped tables, `requireAuth + requireSiteContext + requirePermission("inventory", …)`, standard envelope, transactional multi-table writes + `writeAudit`, soft-deleted master, TanStack-Query web layer).

### Decisions made (with the owner)
- **Scope: transfers deferred.** Movement types this phase are `inward` (+), `outward` (−), `wastage` (−), and `adjustment` (stock-take → sets the counted value). Site-to-site **transfers** were deferred to a focused follow-up because a transfer crosses the tenant boundary, which the single-active-site `X-Site-Id` model doesn't accommodate cleanly.
- **Idempotency deferred to Phase 9.** CLAUDE.md mandates idempotency keys for stock movements, but the middleware/service is itself a Phase 9 deliverable and no infra exists yet. For now movements rely on the frontend submit-guard; the idempotency-key layer lands with the rest of Phase 9. (Documented as a follow-up, not silently skipped.)
- **`currentStock` is a denormalized cached balance**, only ever changed inside the create-movement transaction (insert ledger row + update material + audit, in one tx — the docs/architecter.md "inventory inward/outward" critical op). `balanceAfter` snapshots stock on every ledger row so each row is self-describing. The master **update** endpoint never touches `currentStock`.
- **Ledger is immutable** — no edit/delete on movements; corrections are made with a new `adjustment`. The master is soft-deleted; its ledger is retained.
- **Negative stock is blocked**: `outward`/`wastage` beyond available stock returns `CONFLICT` ("Only X {unit} in stock."). Quantities are rounded to the ledger's 3-decimal scale to avoid float artifacts.
- **SKU is optional, unique per site** among non-deleted rows (partial unique index + a service-layer check for a friendly `CONFLICT`). **Supplier** is a free-text `supplierRef` for now — a supplier FK lands in Phase 7.
- **Opening stock**: material create accepts an optional `openingStock`; if > 0 the create tx also inserts one opening `adjustment` movement so the ledger and `currentStock` stay consistent.

### Delivered
- **DB** (`packages/db`): `materials` (name, sku, category, unit, denormalized `current_stock`, `reorder_level`, `unit_cost`, `supplier_ref`, notes; site/site+name/category indexes + partial unique on `(site_id, sku)`) + `stock_movements` (type, quantity, `balance_after`, unit_cost, reference, note, movement_date, created_by; site/material/type/date indexes; append-only, no soft delete). Migration `0002_talented_moonstone.sql` (additive: 2 tables, FKs, indexes).
- **API** (`apps/api`): `modules/inventory` — `GET/POST /inventory/materials`, `GET/PATCH/DELETE /inventory/materials/{id}`, `GET/POST /inventory/movements` (7 endpoints). All site-scoped + `requirePermission("inventory", …)`, audited, paginated/filterable (materials: search/category/`status=low_stock`; movements: materialId/type/dateFrom/dateTo/reference). Mounted in `app.ts`; documented under the **Inventory** Swagger tag. No new env.
- **Web** (`apps/web`): `use-inventory` hooks (materials list/detail/create/update/delete + movements list/create, shared `["inventory"]` key); real **Inventory** screen replacing the placeholder (search + low-stock filter, mobile cards / desktop table, low-stock badge, row → detail); material create/edit modal; material detail modal (stock summary, master fields, recent-movements list, Record-movement/Edit/Delete); movement form modal (type selector, quantity-or-counted-stock, live "stock after" preview, submit-guarded). **Dashboard "Low Stock Items" KPI is now live** (`LowStockCard` → count of low-stock materials, links to Inventory).

### Verification
- `pnpm typecheck` (5 pkgs), `pnpm check` (Biome, 132 files), `pnpm build` (Next 16 routes incl. real `/inventory` 5.99 kB + live `/dashboard`, + wrangler dry-run) — all pass.
- `pnpm db:generate` → `0002`; SQL reviewed (2 tables, FKs, all indexes, partial unique on sku) → applied to Neon via `pnpm db:migrate`.
- **API smoke (wrangler dev): 24/24 passed** — owner creates a material with opening stock (currentStock=100, not low at reorder 20); duplicate SKU → 409; inward +50→150, outward −30→120, wastage −5→115; outward 1000 → 409 (insufficient); adjustment → exact count 10 with magnitude |10−115|=105; `status=low_stock` surfaces it once below reorder; ledger has 5 rows with correct `balanceAfter`; detail returns 5 recent movements; cross-site isolation (Vesu material invisible from Ahmedabad → 404, Ahmedabad has 0 materials); missing `X-Site-Id` → 400; **member RBAC** — owner provisions a fresh member (read on Vesu, read+write on Mota), member can view on Vesu but create → 403, create on Mota → 201.
- Swagger `/docs` shows the **Inventory** tag with all 7 endpoints + schemas.

### Notes / follow-ups
- **Site-to-site stock transfers** — deferred (cross-tenant; needs a destination-site access check + a linked ledger pair in one tx).
- **Idempotency keys** for stock movements → Phase 9 (with the idempotency middleware/service).
- **Supplier FK** for `materials.supplier_ref` / inward `reference` → Phase 7 (Suppliers).
- **Inventory Excel/PDF export** → Phase 8 (Cloudflare Queues), like the deferred DPR PDF.
- `read_write` still grants approve/export/delete on `inventory` (no approval flow here, so harmless); split the level model later if a module needs finer grants.

## Phase 4 — DPR ✅ (2026-06-07)

Daily Progress Report module, end to end and site-scoped (the first operational module on the new site-as-tenant model). Includes the R2 direct-upload photo flow.

### Decisions made
- **Photos via R2 presigned URLs** (per docs/architecter.md — files never proxy through the Worker). Flow: client asks for a presigned PUT (`/dpr/{id}/photos/upload-url`, validates type/size + RBAC) → uploads **directly to R2** → confirms metadata (`POST /dpr/{id}/photos`). Display uses short-lived presigned GET URLs. Signing uses `aws4fetch` (Web-Crypto SigV4, Workers-friendly) against the R2 S3 API; account id/bucket are vars, the S3 key/secret are secrets.
- **R2 provisioned** by the owner: bucket `construction`, account `718e3f9a2c031cde8a52fa9cc16b696f`. The S3 API token + bucket CORS are an owner setup step (see follow-ups) — the API degrades gracefully (upload-url returns `UPLOAD_FAILED`) until they're in place, so the rest of DPR works without them.
- **Workflow:** `draft → submitted → approved`. Creation can draft or submit; `approve` is a separate action gated by `dpr:approve`; approved reports are locked from edits (409). With the two-level access model, `read_write` expands to include `approve`/`export`/`delete` — so a read-write member can approve (revisit if finer control is needed).
- **Object key** `dpr/{siteId}/{dprId}/{uuid}.{ext}`; confirm validates the key prefix so a member can't attach arbitrary objects. `siteId` is denormalized on `dpr_photos` for tenant safety.
- Mobile-first entry: the photo input uses `capture="environment"` for quick camera upload; the report form is a single sheet.

### Delivered
- **DB** (`packages/db`): `dpr` (date, work category, location, completed/pending work, quantity value+unit, remarks, status, created-by, approved-by/at; site/date/status/created-by indexes) + `dpr_photos` (object key + metadata). Migration `0001_hesitant_hex.sql` (additive).
- **API** (`apps/api`): `common/r2` (presign PUT/GET, delete via `aws4fetch`); DPR module — `GET/POST /dpr`, `GET/PATCH/DELETE /dpr/{id}`, `POST /dpr/{id}/approve`, `POST /dpr/{id}/photos/upload-url`, `POST /dpr/{id}/photos`, `DELETE /dpr/{id}/photos/{photoId}`. All site-scoped (`requireSiteContext` + `requirePermission("dpr", …)`), audited, soft-deleted, paginated/filterable (status/date/search). New env: `R2_ACCOUNT_ID`/`R2_BUCKET` (vars) + `R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY` (secrets).
- **Web** (`apps/web`): `use-dpr` hooks (list/detail/create/update/approve/delete + photo upload/delete); DPR list page (search + date + status filters, row → detail); create/edit form modal; detail modal with photo grid, camera/file upload, delete, and approve. Nav DPR item now active.

### Verification
- `pnpm typecheck` (5 pkgs), `pnpm check` (Biome, 122 files), `pnpm build` (Next 16 routes incl. real `/dpr`, + wrangler dry-run) — all pass.
- `pnpm db:generate` → `0001`; applied to Neon via `pnpm db:migrate`.
- **API smoke (wrangler dev): 13/13 passed** — owner create/list/get/approve; quantity round-trips as a number; approved report rejects edits (409); cross-site isolation (a Vesu report is invisible from Mota); partner read-only on Vesu is blocked from create (403) but can view; partner read-write on Mota can create **and** approve.
- **R2 provisioned + live photo flow verified (2026-06-07):** owner created an R2 S3 API token (Object R&W) and `R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY` are in `apps/api/.dev.vars`. Server-side presign self-test (PUT/GET/DELETE) passed, and the **full API photo round-trip passed 8/8** — `upload-url` → direct PUT to R2 → confirm → detail returns a presigned GET URL that serves the bytes → delete. (Before keys were set, `upload-url` returned `UPLOAD_FAILED` as designed.)

### Notes / follow-ups
- **Browser uploads need a bucket CORS policy.** The API photo path is verified server-side, but a browser PUT from the web app is blocked until the `construction` bucket has a CORS rule allowing `GET`/`PUT` from the web origin (`http://localhost:3000`, plus the Vercel domain in prod). This must be set in the Cloudflare dashboard — the Object-R&W S3 token returns 403 for `PutBucketCors`, so it can't be done programmatically with that token.
- For prod: set `R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY` via `wrangler secret put` (they're in `.dev.vars` for local only).
- **DPR PDF export** (a Phase 4 plan deliverable) is deferred to **Phase 8** (Cloudflare Queues) — no background-job infra yet.
- `read_write` grants approve/export/delete; if a site needs "submit but not approve", split the level model later.

## Refactor — Site-as-tenant model ✅ (2026-06-07)

Product-owner decision: **remove the Company and Project concepts entirely and make the Site the top-level tenant boundary.** One owner holds many sites; each user gets per-site, per-module access; selecting a site scopes all data to that site (no cross-site leakage); multi-site users switch sites from the top bar. This supersedes the Phase 3 hierarchy below.

### Decisions made (with the owner)
- **Per-user, per-site grants — no role library.** Dropped `roles`/`role_permissions`/`user_roles` and the Roles admin module. A user's access on a site is stored as one `access_level` per module (`site_member_permissions`).
- **Two access levels:** `read` (→ `view`) and `read_write` (→ `view,create,update,delete,approve,export`). The `{module,action}` engine is unchanged; the level expands to actions at load time (`ACTIONS_FOR_LEVEL`), so `requirePermission(module, action)` call sites stay as-is. The `scope` dimension was removed (site is implicit).
- **Owner model:** `users.is_owner` is the global capability to create/manage sites; `sites.owner_user_id` is the site creator, who has **implicit full access** to that site (`requirePermission` short-circuits on `auth.isOwner`).
- **Active site via `X-Site-Id` header** (not the JWT) so switching is instant and the token stays minimal. `requireAuth` validates membership/ownership and loads that site's permissions; `requireSiteContext` enforces a site on site-scoped routes (400 if absent, **403 `SITE_ACCESS_REVOKED`** if the sent site is no longer accessible); `requireOwner` gates site creation.
- **Users module is now per active site:** lists/creates/updates/removes **members** of the current site. Create is link-or-create (existing email → added to the site; new email → user created with the given password). Removing a member revokes their access to that site only, not their account.
- **Destructive dev reset** (approved): schema rebuilt from scratch (migration `0000`), re-seeded.

### Delivered
- **DB** (`packages/db`): dropped `companies`, `projects`, `roles`, `role_permissions`, `user_roles`, `site_assignments`. `users` drops `company_id`, adds `is_owner`. `sites` drops `company_id`/`project_id`, adds `owner_user_id` (code now globally unique). New `site_members` + `site_member_permissions` (`site_access_level` enum). `audit_logs` `company_id`→nullable `site_id`; `refresh_tokens` drops `company_id`. Single fresh migration `0000_superb_major_mapleleaf.sql` (6 tables). Seed creates owner `admin@demo.test` + sites Vesu/Ahmedabad/Mota Varacha + member `partner@demo.test` (read on Vesu, read+write on Mota Varacha).
- **API** (`apps/api`): JWT carries only `sub`; new `loadUserSiteAccess`/`loadUserSites` (`common/rbac`); rewritten `requireAuth` + new `requireSiteContext`/`requireOwner` middleware; owner short-circuit in `requirePermission`; audit keyed on `siteId`. `/auth/login`+`/auth/me` return `{ id, email, name, isAppOwner, sites[] }` (each site with role + expanded permissions). Sites module: account-level list of owned sites + member counts, owner-only create/update/delete. Users module: site-scoped member CRUD with per-module levels. Removed companies/projects/roles modules.
- **Web** (`apps/web`): `siteStore` (localStorage `erp.activeSiteId`); `apiFetch` injects `X-Site-Id` and reloads on `SITE_ACCESS_REVOKED`; `AuthContext` gains `activeSite` + `switchSite()` (clears the query cache) and a site-aware `can()`; `SiteSwitcher` in the top bar; nav drops Projects/Company/Roles, Sites is owner-only under Settings. Sites page = owner site management (no project field); Users page = per-site **Members** with a Read/Read & Write access grid + presets (Read-only / Site Manager / Partner).

### Verification
- `pnpm typecheck` (5 pkgs), `pnpm check` (Biome, 113 files), `pnpm build` (Next 14 routes + wrangler dry-run) — all pass.
- `pnpm db:generate` → fresh `0000`; destructive reset (drop+recreate public schema) → `pnpm db:migrate` → `pnpm db:seed` all succeeded against Neon.
- **End-to-end API smoke (wrangler dev): 19/19 passed** — owner has 3 owned sites; site-scoped route 400s without `X-Site-Id`; partner read-only on Vesu (has `inventory:view`, lacks `inventory:create`) and read+write on Mota Varacha; partner blocked from the users module (403) and from creating sites (403); bogus `X-Site-Id` → 403 `SITE_ACCESS_REVOKED`; owner-created member on Ahmedabad is **not** visible from Vesu (cross-site isolation).

### Notes / follow-ups
- `SITE_ACCESS_REVOKED` handling on the web is a full reload (drops the stale site, refetches `/auth/me`); a softer in-place re-pick is a future polish.
- `approve`/`export`/`delete` are folded into `read_write` for now; split into finer grants if a module later needs e.g. "approve but not create" (revisit when DPR/Reports land).
- Member management requires the `users` module granted on a site; only the owner has it implicitly. Ownership transfer (`sites.owner_user_id`) and a "last owner" guard are not yet exposed — add if multiple owners per deployment become a thing.
- The earlier Phase 3 section below is retained for history but is **superseded** by this refactor.

## Phase 3 — Company, Project & Site ✅ (2026-06-07)

The tenant hierarchy (Company → Projects → Sites) plus user-to-site assignment, end to end across backend and frontend. Sites are the unit DPR/attendance/inventory/expenses attach to from Phase 4, so this phase unblocks the operational modules.

### Decisions made
- **Hierarchy:** Company → Projects → Sites. A site belongs to exactly one project; both carry a denormalized `companyId` so every query stays tenant-scoped with one filter.
- **User assignment lives at the *site* level** (`site_assignments`), not the project. Sites are what the operational modules attach to, so site-level membership is what `site`/`own` scope filtering will consume in Phase 4+. Project-level membership is derivable (assigned to any site under a project) and was not modelled separately.
- **Scope enforcement deferred (correctly):** Phase 2 noted scope row-filtering "wires in from Phase 3 once sites exist." Phase 3 delivers the *assignment data*; the *enforcement* has nothing to filter yet (DPR/attendance/etc. are Phase 4+), so the helpers that resolve a user's assigned site ids get wired into those modules as they land.
- **Codes are optional and unique per company** for both projects and sites (Postgres treats NULL codes as distinct, so multiple un-coded rows are fine). Uniqueness is enforced both by a DB unique index and a service-layer check for a friendly `CONFLICT` message.
- **Data-integrity guard:** a project with active (non-deleted) sites cannot be deleted — the API returns `CONFLICT` asking to remove/reassign sites first.
- **Company profile** is editable in-app (name; slug is the immutable tenant key, status read-only) via `GET/PATCH /company` under `companies` permissions (owner-only by default templates).
- **UI built without new deps** — added a small styled native `Select` primitive; reused the existing `Modal`/`Table`/`Badge` and the controlled-form pattern from the Users module.

### Delivered
- **DB** (`packages/db`): `projects`, `sites` (FK → project), `site_assignments` (user↔site, unique per pair, cascade on user/site delete) with tenant/project/status indexes. Migration `0002_new_serpent_society.sql` (additive: 3 new tables, FKs, indexes — no changes to existing tables).
- **API** (`apps/api`): modules `companies` (GET/PATCH `/company`), `projects` (list/create/get/update/delete + per-page site counts), `sites` (list/create/get/update/delete, `?projectId=` filter, member assignment folded into create/update body in one transaction). All tenant-scoped, audited, soft-deleted, paginated/filterable, and documented in Swagger (new tags Company/Projects/Sites). 11 new endpoints.
- **Web** (`apps/web`): `use-projects`/`use-sites`/`use-company` TanStack Query hooks; real **Projects** and **Sites** table screens (search, status/project filters, create/edit modals, permission-gated actions); **Company** settings screen; `Select` UI primitive; nav gains a Company item (Settings group).

### Verification
- `pnpm typecheck` (5 pkgs), `pnpm check` (Biome, 133 files), `pnpm build` (Next 19 routes incl. `/projects`, `/sites`, `/settings/company` + wrangler dry-run) — all pass. (A stale `apps/web/.next` cache produced spurious `PageNotFoundError`s for unrelated routes; clearing `.next` resolved it.)
- `pnpm db:generate` produced `0002`; SQL reviewed (correct tables/FKs/indexes).
- **Migration `0002` applied to Neon (2026-06-07).** `projects`, `sites`, `site_assignments` confirmed present (0 rows each). `GET /projects` then returned an empty page (HTTP 200) instead of 500 — confirming the schema + tenant-scoped queries run end to end against Neon. (An earlier 500 on `/projects` was simply the unapplied migration: the table didn't exist yet. Auth/permission passed; the handler threw on the missing relation.)

### Notes / follow-ups
- Migration applied; lists render empty because the DB has 0 projects/sites so far (expected — nothing created yet). Remaining manual smoke test (with data): create project → create site under it (assign users) → list/filter → edit → delete (and confirm a project with active sites refuses deletion).
- Scope (`site`/`own`) **enforcement** lands with Phase 4 — the `site_assignments` rows created here are the source data; add an "assigned site ids for user" resolver in `common/rbac` and filter DPR/attendance/etc. queries by it.
- Future polish: project/site **detail** pages with an audit timeline (list screens cover create/edit/delete for now); server-side pagination UI (hooks request `pageSize=100`, matching the Users/Roles screens).

## Phase 2 — Authentication & RBAC ✅ (2026-06-06)

Custom auth + permission-based RBAC, end to end across backend and frontend. This phase gates every later module (`requireAuth` + `requirePermission` + tenant context).

### Decisions made
- **No OAuth, no public signup.** A **seed script** creates the first company + admin + default roles; the admin provisions users via the Users module with module-wise permissions. (Confirmed with product owner.)
- **Tokens:** access token (15 min, HS256 via `hono/jwt`) in localStorage; **refresh token is the DB source of truth** — opaque, stored as SHA-256 hash, rotated on use, **family-wide revocation on reuse**. Client keeps the refresh token in localStorage and calls `/auth/refresh`.
- **Password hashing:** PBKDF2 via Web Crypto (`packages/shared/src/crypto`) — runs in Workers, Node (seed), and the browser; no native bindings (bcrypt/argon2 unavailable on Workers).
- **Permissions resolved from the DB per request** (one indexed join) → small access token, fresh permissions. Caching deferred to Phase 9.
- **Email is globally unique** (one user → one company).
- **Rate limiting** on login/refresh is a best-effort in-isolate limiter; KV/Durable-Object-backed limiting is Phase 9.
- **Frontend palette** finalized (navy `#121358` sidebar, teal `#36ADA3` accent, `#2F578A` primary, slate base) in `apps/web/src/app/globals.css` `@theme`.
- **UI built without new deps** — custom `Modal`/`UserMenu`, plain checkboxes/table, no radix dialog/sonner.

### Delivered
- **DB** (`packages/db`): `users`, `roles`, `role_permissions`, `user_roles`, `refresh_tokens` (+ indexes), migration `0001_goofy_darkhawk.sql`. Fixed `_shared` `updatedAt.$onUpdate` to return a `Date` (drizzle maps the set value; an inlined `sql\`now()\`` there breaks). Idempotent `seed.ts` (+ `pnpm db:seed`, `tsx`).
- **shared** (`packages/shared`): `crypto/` (PBKDF2 hash/verify, opaque token + SHA-256), `rbac/role-templates.ts` (9 default roles incl. Owner = all 90 perms).
- **API** (`apps/api`): common `auth/` (jwt, refresh-token service), `rbac/` (loadUserAccess, hasPermission), `requireAuth` + `requirePermission` middleware, `audit/`, `rate-limit/`, `getDb`. Modules: `auth` (login/refresh/logout/me), `users` (CRUD + role assignment, owner-safety + self-lockout guards), `roles` (CRUD + `/roles/catalog`). 16 endpoints in Swagger + Bearer security scheme.
- **Web** (`apps/web`): token store, auth-aware `apiFetch` (single-flight refresh on `TOKEN_EXPIRED`), `AuthProvider`/`useAuth`/`can`, `/login`, `AuthGuard` route protection, permission-filtered nav + Settings group + user menu/logout, Users & Roles admin screens (permission matrix), module placeholders for Phase 3+ routes.

### Verification
- `pnpm typecheck` (4 pkgs), `pnpm check` (Biome), `pnpm build` (Next 18 routes + wrangler dry-run) — all pass.
- Migration applied to Neon; `pnpm db:seed` creates `Demo Construction Co` + `admin@demo.test` + 9 roles (idempotent — re-run skips).
- `wrangler dev` + curl flow verified: login (owner, 90 perms) → `/auth/me` → `GET /users`/`/roles`/`/roles/catalog` → bad login `INVALID_CREDENTIALS` → create Site Manager → duplicate email `CONFLICT` → login as Site Manager (16 scoped perms) → blocked `GET /users` + role create → `PERMISSION_DENIED` → **refresh rotates**, **replay old → `REFRESH_TOKEN_REUSED` + family revoked** (newer token also dead), logout → refresh `AUTHENTICATION_REQUIRED`, rate limit trips after the window.
- Web `next start` serves `/login`, `/dashboard`, `/settings/users`, `/settings/roles` (200); login page renders.

### Notes / follow-ups
- A **bug found + fixed during testing**: family-wide reuse revocation was inside the rotation transaction, so throwing rolled it back; moved the family-kill outside the tx so it commits.
- Browser-interactive UI flow (login → create user/role → re-login as restricted user) recommended as a manual smoke (`pnpm dev`); validated here via API curl + build/render.
- Seeded admin password lives in gitignored `packages/db/.env` (`SEED_ADMIN_PASSWORD`). Change after first login.
- Phase 9 follow-ups: KV/DO rate limiting, permission caching, XSS-hardened token storage. Scope-level (site/own) row filtering wires in from Phase 3 once sites exist.

## Phase 1 — Foundation ✅ (2026-06-06)

Scaffolded a pnpm + Turborepo monorepo with both apps and shared packages. Stack matches `docs/tech.md`.

### Decisions made
- **Monorepo:** pnpm workspaces + Turborepo.
- **Lint/format:** Biome (no ESLint/Prettier). Pinned to 1.x (config schema differs in 2.x).
- **Internal packages consumed as TypeScript source** (no build step) — `main` → `src/index.ts`; API bundles via esbuild, web via `transpilePackages`.
- **DB driver:** `drizzle-orm/neon-serverless` with `Pool` (WebSocket), not the HTTP driver — needed for interactive transactions. camelCase → snake_case via Drizzle `casing`.
- **Logging:** Pino writes through a `console.log` destination so it bundles for Workers (no Node stream transports). `nodejs_compat` flag enabled (Pino + Neon driver).
- **API:** `@hono/zod-openapi` + `@hono/swagger-ui`; global `AppError` → standard error envelope; Zod `defaultHook` → `VALIDATION_ERROR`.

### Delivered
- `apps/web` — Next.js 15 (App Router), Tailwind v4, shadcn/ui, TanStack Query/Table, RHF+Zod. App shell (responsive nav over MVP modules), KPI dashboard, typed API client + `useHealth` hook.
- `apps/api` — Hono on Cloudflare Workers. `/health`, OpenAPI doc + Swagger UI at `/docs`, requestId + Pino + CORS middleware, error/response infra.
- `packages/shared` — response envelope, `ERROR_CODES`, RBAC constants (`{module, action, scope}`), pagination contract.
- `packages/db` — Drizzle + Neon client; `companies` + `audit_logs` tables with `primaryId`/`timestamps`/`softDelete` conventions; initial migration `0000_plain_silverclaw.sql`.
- `packages/typescript-config` — shared tsconfig bases.
- Root: pnpm workspace, `turbo.json`, `biome.json`, `.gitignore`/`.gitattributes`, README. Git initialized (`main`).

### Verification
- `pnpm install`, `pnpm typecheck` (5 pkgs), `pnpm lint` (Biome) — all pass.
- `pnpm build` — Next build + wrangler dry-run bundle (Pino bundles for Workers) pass.
- `wrangler dev` + `curl /health` — returns standard success envelope; `/openapi.json` generated; unknown route returns standard error envelope.
- **Neon DB connected and migrated** — `companies` + `audit_logs` confirmed present in `public`; snake_case columns + uuid PK + timestamptz verified.

### Notes / follow-ups
- `.claude/` is gitignored and untracked (kept local).
- Local secrets live in gitignored `apps/api/.dev.vars`, `packages/db/.env`, `apps/web/.env`.
- `wrangler` pinned to v3 (a v4 upgrade is available, not required).
- Recommended later: a separate Neon **dev branch** so local dev doesn't point at `production`.
