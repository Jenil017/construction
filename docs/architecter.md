# Architecture

This document describes the target architecture for the construction ERP system.

## High-Level Architecture

```txt
User Browser / Mobile Browser
        |
        v
Next.js Frontend on Vercel
        |
        v
Hono.js API on Cloudflare Workers
        |
        +--> Neon PostgreSQL with Drizzle ORM
        |
        +--> Cloudflare R2 for files and images
        |
        +--> Cloudflare Queues for background jobs
        |
        +--> Cloudflare Cache API for safe cached responses
```

## System Boundaries

### Frontend

The frontend handles:

- Auth screens
- Dashboard UI
- ERP module screens
- Forms and client-side validation
- Tables, filters, and pagination UI
- Signed upload URL flow
- Role-aware navigation

The frontend must not contain sensitive business authorization logic. Backend permission checks remain mandatory.

### Backend

The backend handles:

- Authentication
- Refresh token rotation
- RBAC enforcement
- Request validation
- Business rules
- Database queries
- Signed upload URL creation
- Background job creation
- API response formatting
- Structured logging
- Error handling

### Database

Neon PostgreSQL stores:

- Companies/tenants
- Users
- Roles and permissions
- Projects
- Sites
- DPR entries
- Inventory records
- Attendance
- Salary records
- Expenses
- Purchases
- Suppliers
- Files metadata
- Audit logs
- Idempotency records

### File Storage

Cloudflare R2 stores:

- DPR photos
- Bills and receipts
- Inventory proof images
- Salary/payment attachments
- Generated reports when needed

The database stores metadata and references. R2 stores file bytes.

### Background Jobs

Cloudflare Queues handle:

- PDF report generation
- Excel export generation
- Image compression
- Image enhancement jobs
- Retryable report processing
- Other long-running tasks

## Multi-Tenant Model

The ERP should support multiple companies.

Every business table should include a company or tenant identifier. Queries must always filter by company/tenant unless the endpoint is explicitly platform-level.

Recommended core hierarchy:

```txt
Company
  -> Users
  -> Roles
  -> Projects
      -> Sites
          -> DPR
          -> Attendance
          -> Inventory
          -> Expenses
          -> Purchases
```

## RBAC Architecture

RBAC is permission-based.

```txt
User
  -> Role assignments
      -> Role
          -> Module permissions
```

Permission shape:

```txt
module: inventory
action: create
scope: company/site/own
```

The backend must check permissions before every protected operation.

## Authentication Flow

1. User signs in through custom auth or OAuth.
2. Backend issues an access token and refresh token.
3. Access token is used for API calls.
4. Refresh token is rotated when used.
5. Reuse of an old refresh token should invalidate the session family.
6. Logout revokes the active refresh token.

## File Upload Flow

1. Frontend asks backend for a signed upload URL.
2. Backend validates user, permission, file type, and file size.
3. Backend creates a signed upload URL for Cloudflare R2.
4. Frontend uploads directly to R2.
5. Frontend confirms upload with backend.
6. Backend stores file metadata and links it to the business record.
7. Background jobs process compression or enhancement when required.

## Reporting Flow

Reports should not block normal API requests when generation is heavy.

1. User requests PDF or Excel export.
2. Backend validates permission and creates an export job.
3. Job is pushed to Cloudflare Queues.
4. Worker processes the job.
5. Generated file is stored in R2 if required.
6. User receives status and download link.

## Data Integrity

Use transactions for:

- Attendance approval and salary generation
- Inventory inward/outward movement
- Purchase receipt and stock update
- Expense approval and ledger update
- Report/export job creation with audit log

Use idempotency keys for:

- Payments
- Salary generation
- Inventory stock movements
- Purchase creation
- Export generation

## Audit Architecture

Audit logs should capture:

- Actor user ID
- Company/tenant ID
- Module
- Action
- Entity type
- Entity ID
- Before/after changes when practical
- IP/request metadata where safe
- Timestamp

Audit logs should not store secrets or full sensitive documents.

## Core Modules

### Dashboard

Shows company-level and site-level KPIs.

### Projects And Sites

Stores project details, site details, project timelines, current status, and responsible users.

### DPR

Tracks daily progress, photos, quantities, completed work, pending work, remarks, and approvals.

### Inventory

Tracks material inward, outward, transfer, current stock, low stock, wastage, and site-wise stock ledger.

### Attendance And Salary

Tracks worker attendance, half-day, overtime, absences, advances, salary calculation, and payment status.

### Expenses

Tracks site expenses, petty cash, receipts, approval status, and category-wise spend.

### Purchases And Suppliers

Tracks suppliers, purchase requests, purchase orders, goods received, pending material, and payment status.

### Reports

Generates PDF and Excel reports for DPR, attendance, salary, inventory, expenses, and project progress.
