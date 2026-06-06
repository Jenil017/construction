# Product Requirements Document

## Product Name

Construction ERP

## Product Summary

Construction ERP is a web and mobile-responsive platform for contractors and builders who want to manage their construction sites from one system. It replaces scattered registers, Excel sheets, WhatsApp follow-ups, and separate tools with one role-based platform for site tracking, inventory, DPR, salary, attendance, expenses, planning, purchases, and reports.

The initial market focus is Gujarat contractors and builders.

## Target Users

- Contractor / owner
- Builder / developer
- Project manager
- Site manager
- Site assistant
- Store manager
- Accountant
- Purchase manager
- Supervisor
- Contractor or labour contractor

## Main Problem

Construction businesses commonly track work through multiple disconnected systems:

- Registers for attendance and salary
- WhatsApp for daily progress photos
- Excel for expenses and planning
- Phone calls for material stock
- Separate accounting tools for payments
- Manual reports for owner updates

This causes delayed decisions, material loss, salary disputes, missing records, poor progress visibility, and weak accountability.

## Product Goals

- Give owners complete visibility across all sites.
- Help site managers submit daily progress quickly.
- Track materials, stock, usage, wastage, and low stock.
- Track worker attendance, salary, overtime, advances, and payments.
- Compare planning vs actual progress.
- Track expenses and petty cash site-wise.
- Control access through RBAC module permissions.
- Generate PDF and Excel reports.
- Keep records audit-friendly and secure.

## MVP Modules

### Dashboard

Shows high-level KPIs:

- Total projects
- Active sites
- Today attendance
- Today expenses
- Low stock items
- Pending payments
- DPR completion
- Overall progress

### Projects And Sites

Allows users to manage:

- Project details
- Site details
- Start and end dates
- Status
- Responsible users
- Site-wise module data

### DPR

Daily Progress Report should support:

- Date-wise site progress
- Work category
- Floor/area/location
- Completed work
- Pending work
- Quantity where applicable
- Photos
- Remarks
- Created by
- Approval status

### Inventory

Inventory should support:

- Material master
- Site-wise stock
- Inward entries
- Outward entries
- Stock transfers
- Wastage tracking
- Low stock alerts
- Supplier references
- Audit trail

### Attendance And Salary

Attendance and salary should support:

- Worker master
- Site-wise attendance
- Present/absent/half-day
- Overtime
- Daily wage
- Advances
- Salary calculation
- Payment status
- Salary reports

### Expenses

Expenses should support:

- Site-wise expenses
- Petty cash
- Category-wise expenses
- Receipt uploads
- Approval status
- Paid to
- Payment mode

### Purchases And Suppliers

Purchases should support:

- Supplier master
- Purchase request
- Purchase order
- Goods received
- Pending material
- Supplier payment status

### Reports

Reports should support:

- DPR PDF
- Attendance Excel
- Salary report
- Inventory report
- Expense report
- Project progress report

## RBAC Requirements

RBAC must be based on module permissions.

Roles can include:

- Super Admin
- Owner
- Project Manager
- Site Manager
- Assistant
- Store Manager
- Accountant
- Purchase Manager
- Supervisor
- Contractor
- Client Viewer

Permissions should support:

- view
- create
- update
- delete
- approve
- export

## Non-Functional Requirements

- Type-safe full-stack development
- Secure authentication
- JWT access tokens
- Refresh token rotation
- OAuth support
- Rate limiting
- Audit trails
- Soft deletes
- Proper request and response validation
- Standard API responses
- User-friendly error messages
- Mobile responsive UI
- Fast list screens with pagination
- Search and filtering through URL query parameters
- Scalable database design
- Reliable file upload flow through signed URLs
- Background PDF and Excel generation

## Out Of Scope For MVP

These can be added later:

- Full accounting replacement
- Tally replacement
- Payroll statutory compliance automation
- Advanced BOQ estimation
- Advanced RERA filing automation
- Native mobile app
- AI forecasting
- IoT or biometric hardware integration

## Success Criteria

The MVP is successful when a contractor can:

- Create a company, project, and site.
- Add users and assign role-based permissions.
- Submit a DPR with photos.
- Track site-wise inventory.
- Mark attendance and calculate salary.
- Track site expenses.
- View dashboard KPIs.
- Export core reports.
- Use the system comfortably from a mobile device.
