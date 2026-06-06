# Construction ERP

Multi-tenant ERP for contractors and builders — site tracking, DPR, inventory, attendance & salary, expenses, purchases, and reports in one role-based platform. See [`docs/`](./docs) for product, architecture, and engineering specs, and [`CLAUDE.md`](./CLAUDE.md) for the working conventions.

## Stack

- **Web** (`apps/web`) — Next.js 15 (App Router), TypeScript, Tailwind v4, shadcn/ui, TanStack Query/Table, React Hook Form + Zod. Hosted on Vercel.
- **API** (`apps/api`) — Hono on Cloudflare Workers, OpenAPI + Swagger UI, Pino. Hosted on Cloudflare.
- **DB** (`packages/db`) — Neon Postgres + Drizzle ORM/Kit.
- **Shared** (`packages/shared`) — response envelope, error codes, RBAC + pagination contracts.
- Monorepo: pnpm workspaces + Turborepo. Lint/format: Biome.

## Prerequisites

- Node `>= 20` (see `.nvmrc`)
- pnpm `10.x` (`corepack enable` or install globally)

## Setup

```bash
pnpm install

# Local env files
cp apps/web/.env.example apps/web/.env
cp apps/api/.dev.vars.example apps/api/.dev.vars   # fill in DATABASE_URL, JWT_SECRET
cp packages/db/.env.example packages/db/.env       # DATABASE_URL for Drizzle CLI
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
pnpm db:studio      # Drizzle Studio
```

## Layout

```
apps/
  web/   Next.js frontend
  api/   Hono API on Cloudflare Workers
packages/
  shared/             cross-app contracts (response envelope, error codes, RBAC, pagination)
  db/                 Drizzle schema, client, migrations
  typescript-config/  shared tsconfig bases
docs/                 product + engineering specs (source of truth)
```
