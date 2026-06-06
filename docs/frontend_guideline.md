# Frontend Guidelines

The frontend must be built with Next.js, TypeScript, Tailwind CSS, React Hook Form, shadcn/ui, Zod, TanStack Query, TanStack Table, and a mobile responsive UI. The frontend is hosted on Vercel.

## Frontend Principles

- Build mobile-first because site managers and supervisors will use the app from construction sites.
- Keep screens simple, fast, and role-aware.
- Prefer table-first management screens for ERP modules.
- Keep forms typed and validated.
- Keep server data in TanStack Query.
- Keep table state predictable with URL query parameters.
- Use shadcn/ui components consistently.
- Avoid business logic inside presentational components.

## UI Structure

Recommended layout:

- App shell with sidebar navigation for desktop
- Bottom navigation or compact menu for mobile
- Top bar with company/site switcher
- Role-aware navigation items
- Page-level breadcrumbs where useful
- Main table for module listing screens
- Separate create/edit screens or drawers for data entry

## Core ERP Screens

Each major module should follow this pattern:

1. List screen with table, filters, search, sort, and actions
2. Create screen or form drawer
3. Detail screen with activity/audit timeline
4. Edit flow with clear save/cancel actions
5. Export action when permission allows

Modules:

- Dashboard
- Projects
- Sites
- DPR
- Inventory
- Attendance
- Salary
- Expenses
- Purchases
- Suppliers
- Reports
- Users
- Roles and permissions

## Forms

Use React Hook Form with Zod validation.

Form requirements:

- Validate required fields.
- Show user-friendly errors.
- Disable submit while saving.
- Prevent duplicate submit.
- Preserve data during temporary network failures where practical.
- Keep form schemas near the module or shared when used by both frontend and backend.

## Data Fetching

Use TanStack Query for:

- Fetching list data
- Fetching detail data
- Mutations
- Cache invalidation
- Refetch after create/update/delete
- Optimistic updates only when safe

Do not fetch protected ERP data directly inside deeply nested UI components. Use module hooks such as `useProjects`, `useInventoryItems`, or `useDprEntries`.

## Tables

Use TanStack Table for list screens.

Table standards:

- Search input
- Filter controls
- Sortable columns where useful
- Pagination
- Column visibility where useful
- Row action menu
- Empty state
- Loading skeleton
- Error state
- Mobile-friendly stacked row layout when the table is too wide

Table state should map to URL query parameters:

```txt
?page=1&pageSize=20&search=cement&status=low_stock&sortBy=createdAt&sortOrder=desc
```

## RBAC In The UI

The frontend must respect permissions, but backend permission checks are still mandatory.

Frontend behavior:

- Hide navigation items the user cannot access.
- Hide buttons for disallowed actions.
- Show read-only views when the user has view permission only.
- Never assume hidden UI is a security boundary.

## File Upload UX

File uploads should use signed upload URLs.

Flow:

1. User selects image/file.
2. Frontend validates type and size.
3. Frontend requests signed upload URL.
4. Frontend uploads directly to R2.
5. Frontend confirms upload metadata with backend.
6. UI shows upload progress and final preview.

For DPR photos, the UI should support quick camera/photo upload from mobile.

## Mobile Responsiveness

Construction site users may work on low-end phones and weak networks.

Required behavior:

- Forms must fit small screens.
- Buttons must be easy to tap.
- Tables must not overflow unusably.
- DPR, attendance, and expenses must be fast to enter.
- Use clear loading and retry states.
- Keep pages usable without dense visual clutter.

## Visual Style

Use a practical ERP interface:

- Clean tables
- Clear status badges
- Simple cards for dashboard KPIs
- Consistent spacing
- Strong contrast
- No unnecessary decorative sections inside the app

## Error Handling

Frontend must display backend user-friendly error messages when available.

Show:

- Validation errors near fields
- API errors near the relevant action
- Toasts for save/export/upload outcomes
- Retry actions for failed fetches

Do not expose internal error codes as the main user message.

## Performance

- Use server-side rendering or static rendering only where it improves the experience.
- Keep protected dashboard data fetched through authenticated API calls.
- Use pagination for large lists.
- Avoid loading all workers, materials, or reports at once.
- Lazy-load heavy screens and export flows where practical.
