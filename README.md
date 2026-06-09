# Construction ERP

Multi-tenant ERP for contractors and builders — site tracking, DPR, inventory, attendance & salary, expenses, purchases, and reports in one role-based platform. See [`docs/`](./docs) for product, architecture, and engineering specs, and [`CLAUDE.md`](./CLAUDE.md) for the working conventions.

## Stack

- **Web** (`apps/web`) — Next.js 15 (App Router), TypeScript, Tailwind v4, shadcn/ui, TanStack Query/Table, React Hook Form + Zod. Hosted on Vercel.
- **API** (`apps/api`) — Hono on Cloudflare Workers, OpenAPI + Swagger UI, Pino. Hosted on Cloudflare.
- **DB** (`packages/db`) — Neon Postgres + Drizzle ORM/Kit.
- **Shared** (`packages/shared`) — response envelope, error codes, RBAC constants + role templates, pagination, isomorphic crypto.
- Monorepo: pnpm workspaces + Turborepo. Lint/format: Biome.

## Status

Phases 1–8 are complete: Foundation, Auth & RBAC, the Site-as-tenant model, and the operational modules — DPR, Inventory, Attendance & Salary, Expenses, Purchases/Suppliers, and **Reports** (queue-backed PDF/CSV exports via Cloudflare Queues + R2). Auth is custom email/password (JWT access + rotating refresh tokens with reuse detection) and permission-based, per-site RBAC; the first owner is created by `pnpm db:seed`, then provisions per-site members from the in-app **Settings** screens. Phase 9 (performance, security, production hardening) is next. See [`docs/progress.md`](./docs/progress.md).

## Prerequisites

- Node `>= 20` (see `.nvmrc`)
- pnpm `10.x` (`corepack enable` or install globally)

## Setup

```bash
pnpm install

# Local env files
cp apps/web/.env.example apps/web/.env
cp apps/api/.dev.vars.example apps/api/.dev.vars   # fill in DATABASE_URL, JWT_SECRET
cp packages/db/.env.example packages/db/.env       # DATABASE_URL + SEED_* for Drizzle CLI / seed

# Create the schema and the first admin
pnpm db:migrate
pnpm db:seed    # prints the seeded admin email/password (change after first login)
```

## Common commands

```bash
pnpm dev            # run web + api together (Turborepo)
pnpm --filter @construction-erp/web dev     # web only  -> http://localhost:3000
pnpm --filter @construction-erp/api dev     # api only  -> http://localhost:8787  (/docs for Swagger)

pnpm build          # build all
pnpm typecheck      # tsc across the workspace
pnpm check          # Biome lint + format (auto-fix)
pnpm lint           # Biome check (no writes)

pnpm db:generate    # generate a migration from the Drizzle schema (offline)
pnpm db:migrate     # apply migrations (needs DATABASE_URL)
pnpm db:seed        # seed first company + admin + default roles (idempotent)
pnpm db:studio      # Drizzle Studio
```

## Layout

```
apps/
  web/   Next.js frontend
  api/   Hono API on Cloudflare Workers
packages/
  shared/             cross-app contracts (response envelope, error codes, RBAC + role templates, pagination, crypto)
  db/                 Drizzle schema, client, migrations, seed
  typescript-config/  shared tsconfig bases
docs/                 product + engineering specs (source of truth)
```
