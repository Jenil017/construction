# Implementation Plan

This plan converts the finalized ERP stack into practical delivery phases.

> **Progress:** Phase 0 ✅ · Phase 1 ✅ (2026-06-06) · Phase 2 ✅ (2026-06-06) · Phase 3 ✅ (2026-06-07) · **Refactor: Site-as-tenant ✅ (2026-06-07)** · Phase 4 ✅ (2026-06-07) · Phase 5 ⏳ next. See `docs/progress.md` for the detailed log.
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

## Phase 4: DPR Module — ✅ Completed (2026-06-07)

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

## Phase 5: Inventory Module

Goals:

- Build material master.
- Build site-wise stock tracking.
- Build inward, outward, transfer, and wastage flows.
- Add low stock alerts.
- Add inventory audit trail.

Deliverables:

- Material schema
- Stock ledger schema
- Inventory APIs
- Inventory table screens
- Stock movement forms
- Low stock dashboard widget

## Phase 6: Attendance And Salary

Goals:

- Build worker master.
- Build attendance marking.
- Support present, absent, half-day, and overtime.
- Track advances.
- Calculate salary from approved attendance.
- Track salary payment status.

Deliverables:

- Worker schema
- Attendance schema
- Salary schema
- Attendance APIs
- Salary APIs
- Attendance and salary frontend screens

## Phase 7: Expenses, Purchases, And Suppliers

Goals:

- Build expense tracking.
- Build petty cash tracking.
- Build supplier management.
- Build purchase request and purchase order flow.
- Link received goods to inventory where required.

Deliverables:

- Expense schema
- Supplier schema
- Purchase schema
- Expense APIs
- Purchase APIs
- Supplier screens
- Expense and purchase screens

## Phase 8: Reports And Background Jobs

Goals:

- Use Cloudflare Queues for PDF generation.
- Use Cloudflare Queues for Excel exports.
- Store generated files in R2 when needed.
- Add export status tracking.
- Add retry handling.

Deliverables:

- Report job schema
- Queue producers
- Queue consumers
- PDF reports
- Excel exports
- Download links

## Phase 9: Performance, Security, And Production Readiness

Goals:

- Add rate limiting.
- Add Cloudflare Cache API where safe.
- Add idempotency handling for critical operations.
- Add retry strategies.
- Add query optimization.
- Add proper indexes.
- Review audit trails.
- Review soft deletes.
- Review API documentation.

Deliverables:

- Rate limiting middleware
- Idempotency middleware/service
- Optimized indexes
- Security review checklist
- Production deployment checklist
- Complete Swagger UI docs

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
