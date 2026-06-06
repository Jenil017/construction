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

1. **Multi-tenancy.** Every business table carries a company/tenant id. *Every* query must filter by tenant unless the endpoint is explicitly platform-level. Hierarchy: `Company → Projects → Sites → {DPR, Attendance, Inventory, Expenses, Purchases}`.
2. **Permission-based RBAC (not role-name checks).** A permission is `{ module, action, scope }` where action ∈ `view|create|update|delete|approve|export` and scope ∈ `company|site|own`. The backend must check permission before *every* protected operation. The frontend hides disallowed nav/buttons but is **never** the security boundary — backend checks are always mandatory.
3. **Files never proxy through the API.** Uploads use R2 signed URLs: client requests URL → backend validates RBAC + file type/size → client uploads directly to R2 → client confirms → backend stores metadata. DB holds metadata/references; R2 holds bytes.

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

Custom email/password auth (no OAuth, no public signup — decided with the product owner). The first company + admin + default roles come from `pnpm db:seed`; the admin provisions everyone else via the Users module with module-wise permissions.

- **Tokens:** sign-in issues a short-lived JWT **access token** (15 min, HS256 via `hono/jwt`, secret `JWT_SECRET`) + an opaque **refresh token**. The DB (`refresh_tokens`) is the refresh token's source of truth — only its SHA-256 hash is stored. Refresh tokens **rotate on use**; replaying a rotated token triggers **family-wide revocation** (`REFRESH_TOKEN_REUSED`). Logout revokes the active token. The web client keeps both tokens in `localStorage`; `apiFetch` attaches the Bearer header and does a single-flight refresh on `TOKEN_EXPIRED`.
- **Passwords:** PBKDF2 via Web Crypto in `packages/shared/src/crypto` (`hashPassword`/`verifyPassword`) — isomorphic (Workers/Node/browser), shared by the API and the seed. Never bcrypt/argon2 (no Workers bindings).
- **RBAC:** permission = `{ module, action, scope }`. Roles bundle permissions (`role_permissions`); users hold roles (`user_roles`). Default templates live in `packages/shared/src/rbac/role-templates.ts` (Owner = all). On each protected request, `requireAuth` loads the user's flattened permissions from the DB (one indexed join) and sets `c.var.auth`; `requirePermission(module, action)` gates the route. Scope (`site`/`own`) row-filtering is stored now but enforced from Phase 3+ once sites exist.
- **Protecting a route:** add middleware to the OpenAPI route definition —
  `createRoute({ ..., middleware: [requireAuth, requirePermission("users", "create")] as const })`.
  Read the principal in the handler via `c.get("auth")` (`{ userId, companyId, email, name, roles, permissions }`). Always filter queries by `auth.companyId`.
- **DB access in handlers:** `getDb(c)` (lazy, per-request Neon Pool). Multi-table writes use `db.transaction(...)`; service helpers accept `DbClient` so they compose inside a tx. Audit mutations with `writeAudit(db, {...})` (never log passwords/tokens).
- **Rate limiting:** best-effort in-isolate limiter on login/refresh today; KV/Durable-Object-backed limiting is Phase 9. OAuth callbacks/signed-URL/export limits land with those phases.
- **Frontend:** `AuthProvider`/`useAuth` (`apps/web/src/lib/auth`) expose `user`, `login`, `logout`, and `can(module, action)`; `AuthGuard` protects the app shell; nav and action buttons are permission-filtered (the backend is still the security boundary).

## Build order

Follow `docs/plan.md` phases in order — each builds on the last:
**Phase 1 Foundation — DONE** (pnpm + Turborepo monorepo, both apps, DB/Drizzle, Pino logging, response/error infra, `/health`, Swagger UI) → **2 Auth & RBAC — DONE** (custom email/password auth, JWT access + rotating refresh tokens with reuse detection, permission-based RBAC, seeded admin, Users/Roles APIs + admin UI) → 3 Company/Project/Site → 4 DPR → 5 Inventory → 6 Attendance & Salary → 7 Expenses/Purchases/Suppliers → 8 Reports & Queues → 9 Perf/Security/Production. Per-phase verification: TS typecheck, tests where practical, API route tests for key endpoints, migration verification, Swagger check, manual smoke test of the main flow.

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
packages/shared             response envelope, ERROR_CODES, RBAC constants + role templates, pagination, isomorphic crypto (PBKDF2/token hashing) — used by BOTH apps
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
