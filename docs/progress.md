# Progress Log

Living record of delivery progress against `docs/plan.md`. Newest phase on top.

| Phase | Status | Date |
|---|---|---|
| Phase 0 — Project Setup & Documentation | ✅ Completed | — |
| Phase 1 — Foundation | ✅ Completed | 2026-06-06 |
| Phase 2 — Authentication & RBAC | ⏳ Next | — |
| Phase 3 — Company, Project, Site | ⬜ Not started | — |
| Phase 4 — DPR | ⬜ Not started | — |
| Phase 5 — Inventory | ⬜ Not started | — |
| Phase 6 — Attendance & Salary | ⬜ Not started | — |
| Phase 7 — Expenses, Purchases, Suppliers | ⬜ Not started | — |
| Phase 8 — Reports & Background Jobs | ⬜ Not started | — |
| Phase 9 — Performance, Security, Production | ⬜ Not started | — |

---

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
