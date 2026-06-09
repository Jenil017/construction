# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.


- `docs/prd.md` — product scope, target users, MVP modules, RBAC roles, success criteria
- `docs/tech.md` — **finalized** tech stack (do not substitute libraries without being asked)
- `docs/architecter.md` — system boundaries, multi-tenant model, auth/upload/reporting flows, data-integrity rules
- `docs/backend_guideline.md` — backend module layout, API contracts, RBAC, pagination, DB rules
- `docs/frontend_guideline.md` — frontend patterns, screen structure, data fetching, mobile rules
- `docs/errors.md` — error classes, stable error codes, user-facing message style
- `docs/plan.md` — the phased delivery order (Phase 1 → 9)

## What this is

A multi-tenant construction ERP for contractors/builders (initial market: Gujarat). It replaces scattered registers, Excel, and WhatsApp follow-ups with one role-based platform covering: Dashboard, Projects/Sites, DPR (Daily Progress Report), Inventory, Attendance & Salary, Expenses, Purchases/Suppliers, and Reports.

## Architecture (the big picture)

Split deployment — frontend and backend are separate apps on separate hosts:

```
Browser/Mobile → Next.js (Vercel) → Hono.js API (Cloudflare Workers)
                                          ├─ Neon PostgreSQL (Drizzle ORM)
                                          ├─ Cloudflare R2 (files/images)
                                          ├─ Cloudflare Queues (PDF/Excel/image jobs)
                                          └─ Cloudflare Cache API (safe reads only)
```

Three cross-cutting concerns shape almost every feature and span multiple files — internalize them before writing code:

1. **Multi-tenancy (Site = tenant boundary).** Every business table carries a `siteId`. *Every* query must filter by the active site unless the endpoint is explicitly account-level (auth/site list/site create). Hierarchy: `Site → {members, DPR, Attendance, Inventory, Expenses, Purchases, ...}`. An **owner** (`users.is_owner`) holds many sites (`sites.owner_user_id`); the active site is chosen by the client via the **`X-Site-Id` header**. *(Company and Project were removed on 2026-06-07 — see `docs/progress.md`.)*
2. **Permission-based RBAC (not role-name checks).** A permission is `{ module, action }` (action ∈ `view|create|update|delete|approve|export`). Access is **per-user, per-site**: each `(member, module)` stores one `access_level` (`read` → `view`; `read_write` → all actions), expanded to permissions at load time. The **site owner** has implicit full access to sites they own. The backend must check permission before *every* protected operation; the frontend hides disallowed nav/buttons but is **never** the security boundary.
3. **Files never proxy through the API.** Uploads use R2 signed URLs: client requests URL → backend validates RBAC + file type/size → client uploads directly to R2 → client confirms → backend stores metadata. DB holds metadata/references; R2 holds bytes. Implemented in `apps/api/src/common/r2` (presigned PUT/GET via `aws4fetch`); DPR photos (`dpr_photos`) are the first consumer. R2 config: `R2_ACCOUNT_ID`/`R2_BUCKET` (vars) + `R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY` (secrets); the bucket needs a CORS policy allowing browser `PUT`/`GET`.

## Backend conventions (Hono on Workers)

- **Module layout** (`docs/backend_guideline.md`): `src/modules/<domain>/` with routing, validation, service logic, and DB access kept separate. Shared concerns live in `src/common/` (`errors/ logger/ responses/ validation/ pagination/ auth/ rbac/ idempotency/`). DB schema/migrations in `src/db/`.
- **Standard response envelope — use on every endpoint, no exceptions:**
  - Success: `{ "success": true, "data": {}, "meta": {} }`
  - Error: `{ "success": false, "error": { "code", "message", "details" } }`
- **Errors:** throw custom error classes (`AppError`, `ValidationError`, `AuthorizationError`, `NotFoundError`, `ConflictError`, `RateLimitError`, `IdempotencyError`, `UploadError`, `QueueJobError`, `DatabaseError`). Codes are a **stable, fixed set** (e.g. `VALIDATION_ERROR`, `PERMISSION_DENIED`, `REFRESH_TOKEN_REUSED`, `IDEMPOTENCY_CONFLICT`, `RATE_LIMITED`) — see `docs/errors.md`. The visible `message` must be user-friendly and actionable; internal codes/stack traces stay in logs only.
- **Validation:** Zod schemas for params, query, body (and response where practical). Never trust raw client input. Share schemas with the frontend where useful.
- **Transactions are required** for multi-table critical ops: attendance approval → salary generation, inventory inward/outward, purchase receipt → stock update, expense approval → ledger, export job + audit log.
- **Idempotency keys are required** for: payments, salary generation, inventory stock movements, purchase creation, export generation. Same key + different payload → `IDEMPOTENCY_CONFLICT`.
- **Soft deletes + audit trails** on business records. Audit log captures actor, tenant, module, action, entity type/id, before/after, request metadata, timestamp — never secrets or sensitive salary/payment data.
- **Pagination/filtering via URL query params:** `page, pageSize, sortBy, sortOrder` + explicit filters (e.g. `?siteId=...&search=cement&status=low_stock`). Never accept raw SQL fragments or arbitrary field names. Meta returns `{ page, pageSize, total, totalPages }`.
- **Background jobs (Cloudflare Queues)** for PDF/Excel/image work — never block request handlers on heavy generation. Job payload includes type, tenant id, user id, payload, retry count, correlation id.
- **Caching:** Cloudflare Cache API only for stable reference data after confirming tenant safety. Never cache salary, attendance, expense, auth, or permission responses.
- **Logging:** Pino structured logs with request id, correlation id, user/tenant id, route, status, duration, error code. Never log passwords, tokens, OAuth secrets, or sensitive salary/payment data.
- **Indexes** on tenant, site, date, status, and FK columns; use joins, not N+1.
- Every module is documented in **Swagger UI** (auth, required permission, request/response schema, error codes, pagination/filters).

## Frontend conventions (Next.js)

- **Mobile-first** — primary users are site managers/supervisors on low-end phones and weak networks. DPR, attendance, and expense entry must be fast; DPR photos need quick camera upload.
- **Table-first ERP screens.** Each module follows: list (table + filters + search + sort + actions) → create form/drawer → detail with audit timeline → edit → export (when permitted). Table state maps to URL query params.
- **TanStack Query** owns all server state; **TanStack Table** for lists. Don't fetch protected ERP data inside deeply nested components — use module hooks (`useProjects`, `useInventoryItems`, `useDprEntries`, …).
- **React Hook Form + Zod** for forms: disable submit while saving, prevent duplicate submit, show field-level errors.
- **shadcn/ui + Tailwind**; no business logic inside presentational components.
- Show backend user-friendly messages near the relevant field/action; never surface raw error codes or stack traces.

## Auth flow (Phase 2 — implemented)

Custom email/password auth (no OAuth, no public signup — decided with the product owner). The first **owner** (`admin@demo.test`) + sample sites + a sample member come from `pnpm db:seed`; the owner provisions everyone else per-site via the Users module with module-wise read/read-write access.

- **Tokens:** sign-in issues a short-lived JWT **access token** (15 min, HS256 via `hono/jwt`, secret `JWT_SECRET`; carries only `sub`) + an opaque **refresh token**. The DB (`refresh_tokens`) is the refresh token's source of truth — only its SHA-256 hash is stored. Refresh tokens **rotate on use**; replaying a rotated token triggers **family-wide revocation** (`REFRESH_TOKEN_REUSED`). Logout revokes the active token. The web client keeps both tokens in `localStorage` (+ the active `erp.activeSiteId`); `apiFetch` attaches the Bearer header and `X-Site-Id`, and does a single-flight refresh on `TOKEN_EXPIRED`.
- **Passwords:** PBKDF2 via Web Crypto in `packages/shared/src/crypto` (`hashPassword`/`verifyPassword`) — isomorphic (Workers/Node/browser), shared by the API and the seed. Never bcrypt/argon2 (no Workers bindings).
- **RBAC (per-site):** permission = `{ module, action }`. There is **no role library** — a user's access on a site is `site_members` → `site_member_permissions` (`access_level` per module). `requireAuth` reads `X-Site-Id`, resolves the user's access via `loadUserSiteAccess` (owner → implicit full; member → levels expanded by `ACTIONS_FOR_LEVEL`), and sets `c.var.auth`. `requirePermission(module, action)` gates the route and short-circuits for the site owner. `loadUserSites` powers the `/auth/me` + login `sites[]` (for the switcher).
- **Protecting a route:**
  - **Site-scoped** (most routes): `middleware: [requireAuth, requireSiteContext, requirePermission("users", "create")] as const`. `requireSiteContext` → 400 if no `X-Site-Id`, 403 `SITE_ACCESS_REVOKED` if the sent site isn't accessible. Always filter queries by `auth.siteId`.
  - **Account-level:** `requireAuth` only (e.g. `/auth/me`, `GET /sites`). Site **creation** uses `[requireAuth, requireOwner]` (owner-only).
  - Read the principal via `c.get("auth")` (`{ userId, siteId, email, name, isOwner, isAppOwner, permissions }`).
- **DB access in handlers:** `getDb(c)` (lazy, per-request Neon Pool). Multi-table writes use `db.transaction(...)`; service helpers accept `DbClient` so they compose inside a tx. Audit mutations with `writeAudit(db, {...})` (never log passwords/tokens).
- **Rate limiting:** best-effort in-isolate limiter on login/refresh today; KV/Durable-Object-backed limiting is Phase 9. OAuth callbacks/signed-URL/export limits land with those phases.
- **Frontend:** `AuthProvider`/`useAuth` (`apps/web/src/lib/auth`) expose `user` (`{ …, isAppOwner, sites[] }`), `activeSite`, `login`, `logout`, `switchSite(id)`, and a site-aware `can(module, action)` (owner → always true). `SiteSwitcher` (top bar) sets `erp.activeSiteId` and clears the query cache on switch. `AuthGuard` protects the app shell; nav/buttons are permission-filtered and Sites is owner-only (the backend is still the security boundary).

## Build order

Follow `docs/plan.md` phases in order — each builds on the last:
**Phase 1 Foundation — DONE** (pnpm + Turborepo monorepo, both apps, DB/Drizzle, Pino logging, response/error infra, `/health`, Swagger UI) → **2 Auth & RBAC — DONE** (custom email/password auth, JWT access + rotating refresh tokens with reuse detection, permission-based RBAC, seeded admin, Users/Roles APIs + admin UI) → **3 Company/Project/Site — DONE, then refactored** to **Site-as-tenant** (2026-06-07): Company & Project removed; Site is the top-level boundary with per-user, per-site read/read-write access + a site switcher; `sites`/`users` (per-site members) APIs + table-first UI; schema rebuilt as migration `0000` → **4 DPR — DONE** (site-scoped Daily Progress Reports with draft→submitted→approved workflow + R2 presigned-URL photo uploads via `aws4fetch`; migration `0001`) → **5 Inventory — DONE** (site-scoped material master `materials` + immutable `stock_movements` ledger; inward/outward/wastage/adjustment update a denormalized `current_stock` in one transaction; low-stock alerts + live dashboard widget; migration `0002`. Transfers + idempotency deferred — see `docs/progress.md`) → **6 Attendance & Salary — DONE** (site-scoped `workers` master, `attendance` with a per-day approval gate, a `worker_advances` ledger, and payroll `salary_runs` + `salary_run_items` generated transactionally from approved attendance with snapshotted wages + advance settlement + per-payslip payment status; bulk daysheet marking; live "Today Attendance" widget; migration `0003`. Idempotency → Phase 9, exports → Phase 8) → **7 Expenses/Purchases/Suppliers — DONE** (site-scoped `suppliers` master, `expenses` with a pending→approved/rejected workflow + petty cash, and a `purchases` + `purchase_items` PO flow whose goods receipt inwards material-linked lines into `stock_movements` in one transaction — the "purchase receipt → stock update" critical op; supplier payment status; live "Today Expenses" + "Pending Payments" widgets; migration `0004`. Receipt uploads → R2/CORS, exports → Phase 8, idempotency → Phase 9) → **8 Reports & Queues — DONE** (generic queue-backed export pipeline: an `export_jobs` row + **Cloudflare Queue** producer → a `queue` consumer generates the file off the request path, stores it in **R2** via `putObject`, and flips status `queued→processing→completed|failed` with an `attempts` retry counter; the Worker now exports `{ fetch, queue }` and the producer falls back to `executionCtx.waitUntil` when no `EXPORT_QUEUE` binding exists. PDF via `pdf-lib`, "Excel" via UTF-8 CSV; 8 report types across all modules — `GET /reports/types`, `GET/POST /reports/exports`, `GET /reports/exports/{id}[/download]`, `DELETE`; download = a presigned R2 GET with attachment disposition. Migration `0005`; **prod Queues need a paid Workers plan** + `wrangler queues create construction-erp-exports`. True `.xlsx`, image jobs, and idempotency keys deferred) → **9 Perf/Security/Production — DONE** (idempotency middleware/service — `Idempotency-Key` header → `idempotency_keys` table (migration `0006`); applied to payments, salary generation, stock movements, purchase create/receive, and export generation — replay returns the stored response, payload mismatch → `IDEMPOTENCY_CONFLICT`; the web `apiFetch` auto-sends a per-call key on those mutations. Cloudflare **Cache API** via `edgeCache` mw on the non-tenant `/reports/types` only. Baseline global per-IP **rate limit** on top of the login/refresh limits. Index/audit/soft-delete review + a **security review & production deployment checklist** in `docs/security.md`. KV/DO rate limiting, an idempotency TTL sweep, and httpOnly token storage are documented post-MVP follow-ups). Per-phase verification: TS typecheck, tests where practical, API route tests for key endpoints, migration verification, Swagger check, manual smoke test of the main flow.

## After every feature or phase (definition of done)

Run this checklist **after each feature is working and after each phase completes** — do not consider work finished until it's done:

1. **Verify it works.** `pnpm typecheck` → `pnpm check` (Biome) → `pnpm build`. For DB changes: `pnpm db:generate` and apply/verify the migration. For API changes: smoke-test the endpoints (`wrangler dev` + `curl`, or Swagger at `/docs`). Report results honestly — if something fails or was skipped, say so.
2. **Update the progress docs.** This is required, not optional:
   - `docs/progress.md` — prepend an entry under the relevant phase (newest on top): decisions made, what was delivered, verification results, follow-ups. Convert relative dates to absolute.
   - `docs/plan.md` — flip the phase/feature status marker (⬜ → ⏳ → ✅ with date) and update the progress banner near the top.
3. **Update guidance docs if anything changed** — `CLAUDE.md` (commands, structure, conventions, new module patterns) and `README.md`. Keep them accurate; stale instructions are worse than none.
4. **Check repo hygiene** — secrets stay only in gitignored files (`.dev.vars`, `.env`); nothing sensitive staged. `.claude/` stays untracked.
5. **Commit only when the user asks.** Don't auto-commit; summarize what changed and offer to commit.

## Use skills proactively

Invoke a relevant skill **whenever it fits the task, even if the user didn't mention it** — don't wait to be told. Match the work to the skill:

- **`hono`** — any backend route/middleware/validation/streaming work, or debugging Hono behavior.
- **`wrangler`** — Workers dev/deploy, and provisioning/binding R2, Queues, KV, D1, secrets.
- **`tailwind`**, **`responsive-design`**, **`frontend-design`** — building or styling any UI, layout, or component (mobile-first ERP screens).
- **`vercel-react-best-practices`** — whenever writing, reviewing, or refactoring React/Next.js for performance and correctness.
- **`debugger`** — investigating errors, crashes, stack traces, or "not working" reports.
- **`claude-api`** — before any work involving Claude/Anthropic APIs, models, or pricing (read it first, don't answer from memory).

If multiple apply, use them together. Prefer the skill's guidance over guessing.

## Monorepo layout

pnpm workspaces + Turborepo. Internal packages are consumed as **TypeScript source** (no build step) — their `main` points at `src/index.ts`, so the API bundles them via esbuild and the web app via `transpilePackages`.

```
apps/web    Next.js 15 (App Router, Tailwind v4, shadcn/ui, TanStack Query) — Vercel
apps/api    Hono on Cloudflare Workers (@hono/zod-openapi + Swagger UI, Pino) — entry src/index.ts
packages/shared             response envelope, ERROR_CODES, RBAC constants (modules/actions/access-levels + level→actions expansion), pagination, isomorphic crypto (PBKDF2/token hashing) — used by BOTH apps
packages/db                 Drizzle schema + Neon client + idempotent seed (src/seed.ts); tables added per phase to src/schema/
packages/typescript-config  shared tsconfig bases (base / nextjs / workers)
```

Implementation specifics worth knowing before extending:
- **DB driver:** `drizzle-orm/neon-serverless` with `Pool` (WebSocket), not the HTTP driver — chosen because the ERP needs interactive transactions. Schema uses camelCase fields → snake_case columns via Drizzle `casing: "snake_case"`. Spread `primaryId` / `timestamps` / `softDelete` from `packages/db/src/schema/_shared.ts` into every table.
- **API errors:** throw an `AppError` subclass (`apps/api/src/common/errors/`); the global `onError` handler maps it to the standard envelope. The OpenAPI `defaultHook` converts Zod validation failures into `VALIDATION_ERROR` with field details. New modules go under `src/modules/<domain>/` and mount via `app.route()` in `app.ts`.
- **Logging:** Pino writes through a console.log destination so it bundles for Workers (no Node stream transports). Use `c.get("logger")`, never `console.*`.
- **Secrets:** API reads `DATABASE_URL` / `JWT_SECRET` from `.dev.vars` locally (gitignored, see `.dev.vars.example`) and `wrangler secret put` in prod. `compatibility_flags: ["nodejs_compat"]` is required (Pino + Neon driver).

## Commands

```bash
pnpm install                                   # first-time setup
pnpm dev                                        # web + api together (Turborepo)
pnpm --filter @construction-erp/api dev         # API only  -> http://localhost:8787  (Swagger at /docs)
pnpm --filter @construction-erp/web dev         # web only  -> http://localhost:3000
pnpm typecheck                                  # tsc across all packages
pnpm check                                      # Biome lint + format (auto-fix); `pnpm lint` = check only
pnpm build                                      # next build + wrangler dry-run bundle
pnpm db:generate                                # generate a migration from schema (offline, no DB)
pnpm db:migrate                                 # apply migrations (needs DATABASE_URL)
pnpm db:seed                                     # seed first company + admin + default roles (idempotent; needs DATABASE_URL)
```

To verify the API runtime: `wrangler dev` then `curl localhost:8787/health` (returns the success envelope; no DB needed). Lint/format is **Biome** (`biome.json`) — there is no ESLint/Prettier.

Relevant installed skills: **`hono`**, **`wrangler`**, **`tailwind`**, **`responsive-design`**, **`frontend-design`**, **`vercel-react-best-practices`**, **`debugger`**.
