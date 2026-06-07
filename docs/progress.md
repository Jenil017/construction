# Progress Log

Living record of delivery progress against `docs/plan.md`. Newest phase on top.

| Phase | Status | Date |
|---|---|---|
| Phase 0 — Project Setup & Documentation | ✅ Completed | — |
| Phase 1 — Foundation | ✅ Completed | 2026-06-06 |
| Phase 2 — Authentication & RBAC | ✅ Completed | 2026-06-06 |
| Phase 3 — Company, Project, Site | ✅ Completed | 2026-06-07 |
| Refactor — Site-as-tenant model | ✅ Completed | 2026-06-07 |
| Phase 4 — DPR | ✅ Completed | 2026-06-07 |
| Phase 5 — Inventory | ⬜ Not started | — |
| Phase 6 — Attendance & Salary | ⬜ Not started | — |
| Phase 7 — Expenses, Purchases, Suppliers | ⬜ Not started | — |
| Phase 8 — Reports & Background Jobs | ⬜ Not started | — |
| Phase 9 — Performance, Security, Production | ⬜ Not started | — |

---

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
