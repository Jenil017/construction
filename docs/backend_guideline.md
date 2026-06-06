# Backend Guidelines

The backend must be built with Hono.js, TypeScript, Cloudflare Workers, Neon PostgreSQL, Drizzle ORM, Cloudflare R2, Cloudflare Queues, Pino, and Swagger UI.

## Backend Principles

- Keep the backend modular by business domain.
- Validate every request before business logic runs.
- Return one standardized response structure from every endpoint.
- Use custom error classes for all expected failures.
- Use RBAC checks before reading or mutating protected data.
- Log structured events with Pino.
- Keep database access behind repositories or service functions.
- Use transactions for multi-step critical operations.
- Use idempotency keys for critical create/payment/export operations.
- Prefer signed upload URLs for files instead of proxying file bytes through the API.

## Suggested Module Structure

Each backend module should keep routing, validation, service logic, and database access separate.

```txt
src/
  app.ts
  env.ts
  db/
    client.ts
    schema/
    migrations/
  common/
    errors/
    logger/
    responses/
    validation/
    pagination/
    auth/
    rbac/
    idempotency/
  modules/
    auth/
    users/
    roles/
    companies/
    sites/
    projects/
    inventory/
    dpr/
    attendance/
    salary/
    expenses/
    purchases/
    suppliers/
    reports/
    files/
```

## API Response Structure

Every successful response must use this shape:

```json
{
  "success": true,
  "data": {},
  "meta": {}
}
```

Every error response must use this shape:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Please check the submitted data.",
    "details": {}
  }
}
```

## Authentication

Use a custom authentication system with:

- OAuth support
- JWT access tokens
- Refresh tokens
- Refresh token rotation
- Secure token storage strategy
- Token revocation support
- Session/device tracking where required

Access tokens should be short-lived. Refresh tokens should be rotated on use and invalidated when reuse is detected.

## RBAC

RBAC must be based on module permissions, not only role names.

A permission should include:

- Module name
- Action
- Scope

Example actions:

- view
- create
- update
- delete
- approve
- export

Example modules:

- projects
- sites
- inventory
- dpr
- attendance
- salary
- expenses
- purchases
- reports
- users
- roles

Every protected endpoint must check permission before executing business logic.

## Validation

Use typed schemas for:

- Route params
- Query params
- Request body
- Response body where practical

Zod should be used where shared frontend/backend validation is useful. Never trust raw input from the client.

## Pagination

List endpoints must support consistent pagination.

Recommended query parameters:

```txt
page=1
pageSize=20
sortBy=createdAt
sortOrder=desc
```

Response metadata:

```json
{
  "page": 1,
  "pageSize": 20,
  "total": 100,
  "totalPages": 5
}
```

## Search And Filtering

Search and filters must use URL query parameters.

Example:

```txt
/api/inventory?siteId=site_123&search=cement&status=low_stock&page=1&pageSize=20
```

Keep filters explicit. Avoid accepting arbitrary SQL fragments or unsafe field names.

## Database Guidelines

Use Neon PostgreSQL with Drizzle ORM and Drizzle migrations.

Required practices:

- Use proper indexes for tenant, site, date, status, and foreign key columns.
- Use proper SQL joins instead of repeated N+1 queries.
- Use transactions for operations that update multiple tables.
- Use soft deletes for business records.
- Use audit trails for create, update, delete, approve, reject, login, and export actions.
- Store timestamps consistently.
- Keep tenant/company isolation enforced in every query.

## File Uploads

Use Cloudflare R2 for file storage.

Flow:

1. Client requests a signed upload URL.
2. Backend checks RBAC and validates file metadata.
3. Backend returns a signed upload URL.
4. Client uploads directly to R2.
5. Backend records file metadata after upload confirmation.

Images must be compressed during upload processing where practical. Image enhancement for viewing or downloading should be handled by a media service or background job when needed.

## Queues And Background Jobs

Use Cloudflare Queues for:

- PDF generation
- Excel exports
- Background reports
- Image processing
- Retryable non-blocking jobs

Queue jobs must include:

- Job type
- Tenant/company ID
- User ID
- Payload
- Retry count
- Correlation ID

## Rate Limiting

Apply rate limits to:

- Login
- Token refresh
- OTP or OAuth callback paths where applicable
- File upload URL creation
- Export generation
- Public endpoints

Return a clear user-friendly message when a limit is reached.

## Caching

Use Cloudflare Cache API only for safe cacheable responses.

Do not cache:

- User-specific confidential data
- Salary data
- Attendance data
- Expense data
- Auth responses
- Permission responses

Cache only stable or low-risk reference data after confirming tenant safety.

## Logging

Use Pino for structured logging.

Log:

- Request ID
- Correlation ID
- User ID when available
- Company/tenant ID when available
- Route
- Status code
- Duration
- Error code

Never log:

- Passwords
- Access tokens
- Refresh tokens
- Full personal documents
- Sensitive salary/payment data

## Swagger UI

Every API module must be documented with Swagger UI.

Document:

- Endpoint purpose
- Auth requirements
- Required permissions
- Request schema
- Response schema
- Error codes
- Pagination and filters
