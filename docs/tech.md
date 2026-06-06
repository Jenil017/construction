# Construction ERP Tech Stack

This document is the finalized technical source of truth for the construction ERP system.

## Product Context

The product is a construction ERP for contractors and builders, focused on replacing scattered registers, Excel files, WhatsApp follow-ups, and disconnected tools with one controlled platform.

Core modules include:

- Inventory management
- Daily Progress Report (DPR)
- Worker attendance and salary
- Site and project progress
- Planning vs actual progress
- Expenses and petty cash
- Purchase, supplier, and payment tracking
- Role-Based Access Control (RBAC)
- Reports, PDF exports, and Excel exports

## Frontend

- Next.js
- TypeScript
- Tailwind CSS
- React Hook Form
- shadcn/ui
- Zod
- TanStack Query
- TanStack Table
- Mobile responsive UI
- Vercel hosting

## Backend

- Hono.js
- TypeScript
- Cloudflare Workers hosting
- Cloudflare R2 for file storage
- Signed upload URLs for image uploads
- Cloudflare Queues for PDF generation, Excel exports, and background jobs
- Pino for structured logging
- Custom authentication system
- OAuth
- JWT
- Access tokens
- Refresh tokens
- Refresh token rotation
- RBAC based on module permissions
- Typed request and response validation
- Standardized API response structure
- Custom error classes with user-friendly messages
- Proper checks and validations in every API endpoint
- Image compression during upload to R2
- Image enhancement while viewing or downloading
- Rate limiting
- Cloudflare Cache API for caching
- Idempotency handling for critical operations
- Retry strategies for failed operations
- Pagination standards
- Search and filtering standards using URL query parameters

## Database

- Neon PostgreSQL
- Drizzle ORM
- Drizzle migrations
- Proper indexing
- Query optimization
- Proper SQL joins
- Soft deletes
- Audit trails

## API Documentation

- Swagger UI
- OpenAPI-compatible endpoint definitions
- Documented request schemas, response schemas, auth requirements, pagination, filters, and error codes

## Engineering Standards

- Modular architecture
- Type-safe full-stack development
- Production-grade security practices
- Scalable ERP-focused database design
- Maintainable and audit-friendly codebase
- Clear module boundaries
- Consistent naming
- No business logic hidden inside UI components
- No unvalidated request input
- No direct file uploads through the backend when signed URLs can be used
- No silent failures in critical operations

## Hosting Model

- Frontend runs on Vercel.
- Backend APIs run on Cloudflare Workers.
- Database runs on Neon PostgreSQL.
- File assets are stored in Cloudflare R2.
- Background tasks run through Cloudflare Queues.
- Public API documentation is served through Swagger UI.

## Primary Technical Goal

Build a type-safe, secure, scalable ERP platform that can support multiple construction companies, multiple sites per company, role-based access per module, high-volume daily entries, file uploads, reporting, and audit-friendly records.
