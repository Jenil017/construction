# Progress Log

Living record of delivery progress against `docs/plan.md`. Newest phase on top.

| Phase | Status | Date |
|---|---|---|
| Phase 0 — Project Setup & Documentation | ✅ Completed | — |
| Phase 1 — Foundation | ✅ Completed | 2026-06-06 |
| Phase 2 — Authentication & RBAC | ✅ Completed | 2026-06-06 |
| Phase 3 — Company, Project, Site | ⏳ Next | — |
| Phase 4 — DPR | ⬜ Not started | — |
| Phase 5 — Inventory | ⬜ Not started | — |
| Phase 6 — Attendance & Salary | ⬜ Not started | — |
| Phase 7 — Expenses, Purchases, Suppliers | ⬜ Not started | — |
| Phase 8 — Reports & Background Jobs | ⬜ Not started | — |
| Phase 9 — Performance, Security, Production | ⬜ Not started | — |

---

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
