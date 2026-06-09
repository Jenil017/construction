# Security & Production Readiness

Phase 9 deliverable. This is the security-review checklist and the production
deployment checklist for the construction ERP. It reflects what is implemented today
and flags the gaps that remain (each with where it lives / what unblocks it).

> Cross-cutting design lives in `docs/architecter.md`; per-phase decisions in
> `docs/progress.md`. This file is the consolidated hardening reference.

## Security review checklist

### Authentication
- [x] Custom email/password auth; no public signup (owner provisions members).
- [x] Short-lived access JWT (15 min, HS256, secret `JWT_SECRET`) carrying only `sub`.
- [x] Opaque refresh tokens — DB is source of truth, only the SHA-256 hash stored.
- [x] Refresh-token **rotation on use**; replay of a rotated token triggers
      **family-wide revocation** (`REFRESH_TOKEN_REUSED`).
- [x] Logout revokes the active refresh token.
- [x] PBKDF2 password hashing via Web Crypto (no native bindings on Workers).
- [ ] Token storage is `localStorage` (XSS-exposed). Acceptable for MVP; consider
      httpOnly-cookie or BFF hardening — tracked follow-up.

### Authorization / multi-tenancy
- [x] Permission-based RBAC: every protected route gated by `requirePermission(module, action)`.
- [x] **Site = tenant boundary**; `requireSiteContext` enforces `X-Site-Id`, 403
      `SITE_ACCESS_REVOKED` if the site isn't accessible.
- [x] Every business query filters by `auth.siteId`; cross-site isolation verified by
      per-phase smoke tests.
- [x] Owner short-circuit only on sites they own; the frontend is never the security boundary.
- [x] Reports require `reports:export` **and** `view` on the source module (no exporting
      data you can't see).

### Input handling & data integrity
- [x] Zod validation on params/query/body for every endpoint; `VALIDATION_ERROR` on failure.
- [x] No raw SQL fragments / arbitrary field names; pagination + explicit filters only.
- [x] Transactions for the critical multi-table ops (attendance→salary, inventory
      movement, purchase receipt→stock, expense approval, export-job+audit).
- [x] **Idempotency keys** for payments, salary generation, stock movements, purchase
      creation, and export generation (`common/idempotency` + `idempotency_keys`;
      `Idempotency-Key` header; replay returns the stored response, payload mismatch →
      `IDEMPOTENCY_CONFLICT`). Frontend auto-sends a per-call key on those mutations.
- [x] Soft deletes + audit trail on business records.
- [ ] Idempotency rows have no TTL/cleanup job yet, and a crash between the business
      commit and the response-store leaves a stuck `in_progress` row — tracked follow-ups
      (a cron sweep + folding the claim into the business tx).

### Files
- [x] Uploads use R2 presigned PUT (bytes never proxy through the Worker); type/size
      validated before signing; object-key prefix checked on confirm.
- [x] Report files are written server-side to R2 (`putObject`) and downloaded via a
      short-lived presigned GET with an attachment disposition.
- [ ] R2 bucket **CORS** must be set for browser PUT/GET (dashboard step — see below).

### Abuse / rate limiting
- [x] Tight in-isolate limiter on `login` (10/min) and `refresh` (30/min).
- [x] Baseline global per-IP limiter (600/min) as a blunt DoS guard.
- [ ] In-isolate limiters are **per-isolate**, not a hard cross-fleet limit. Prod should
      back them with **KV or a Durable Object** (rate-limit binding) — tracked follow-up.

### Logging / audit
- [x] Pino structured logs (request id, route, status, duration, error code).
- [x] Audit trail **never** stores secrets or sensitive salary/payment amounts (audit
      `after` carries IDs/status/counts only).
- [x] Errors expose only friendly messages; codes/stacks stay in logs.

### Caching
- [x] Cloudflare **Cache API** used only for stable, non-tenant reference data
      (`/reports/types` via `edgeCache`, after auth). Salary/attendance/expense/auth/
      permission responses are **never** cached.

### Indexes / query review
- [x] Tenant (`site_id`), date, status, and FK columns indexed on every business table;
      joins used over N+1. Composite indexes where lists filter on multiple columns
      (e.g. `(site_id, status)`, `(site_id, expense_date)`).
- [x] Idempotency lookups covered by the `(site_id, idempotency_key)` unique index.
- [x] Partial unique indexes enforce one-live-row invariants (material SKU, attendance
      per worker/day, one salary run per period).

## Production deployment checklist

### Backend (Cloudflare Workers)
- [ ] Set secrets via `wrangler secret put`: `DATABASE_URL`, `JWT_SECRET`,
      `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`. (Locally these live in
      gitignored `apps/api/.dev.vars`.)
- [ ] `R2_ACCOUNT_ID` / `R2_BUCKET` vars set in `wrangler.jsonc` (done for the dev bucket).
- [ ] **Cloudflare Queues**: requires a **paid Workers plan**. Create the queue:
      `wrangler queues create construction-erp-exports`. Without it, exports fall back to
      in-isolate `waitUntil` processing.
- [ ] R2 bucket **CORS** policy allowing browser `GET`/`PUT` from the web origin
      (localhost + the Vercel domain) — dashboard step (the Object-R&W token can't set it).
- [ ] (Recommended) Bind **KV** or a **Durable Object** for cross-isolate rate limiting.
- [ ] `wrangler deploy`; confirm `/health` and `/docs` (Swagger) respond.

### Database (Neon)
- [ ] Apply migrations: `pnpm db:migrate` (through `0006`).
- [ ] Seed the first owner: `pnpm db:seed`; change the seeded password after first login.
- [ ] Use a dedicated Neon branch per environment (dev vs production).

### Frontend (Vercel)
- [ ] `NEXT_PUBLIC_API_URL` → the deployed Workers API origin.
- [ ] `pnpm build` passes; deploy. Confirm login + a site-scoped flow end to end.

### Post-deploy verification
- [ ] Login → switch site → a write in each module.
- [ ] Generate a report export → download (confirms Queues + R2 + presigned GET).
- [ ] Replay a payment with the same `Idempotency-Key` → single effect.
- [ ] Confirm cross-site isolation with a second site.
- [ ] Review audit logs contain no secrets/amounts.

## Known follow-ups (post-MVP)

- KV/Durable-Object rate limiting (hard, cross-isolate).
- Idempotency-key TTL/cleanup sweep + folding the claim into the business transaction.
- httpOnly-cookie / BFF token storage (reduce XSS exposure).
- True `.xlsx` exports and image compression/enhancement queue jobs.
- Site-to-site inventory transfers; ownership transfer + "last owner" guard.
- R2 bucket CORS automation.
