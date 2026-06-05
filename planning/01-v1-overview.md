# 01 - Rekordly V1 App Overview

## Purpose

This document summarizes the current `web` application so Rekordly v2 planning can start from the real product, not assumptions.

Rekordly v1 is a Next.js monolith for business management. It combines public marketing pages, authentication, onboarding, protected dashboard pages, API routes, Prisma database access, reporting logic, and UI state management in one application.

The v2 goal is not to copy the codebase directly. The goal is to preserve the strongest product ideas, redesign the architecture, and separate the backend and frontend cleanly.

## Current Stack

- Frontend: Next.js App Router, React, TypeScript, HeroUI, Tailwind CSS
- Client state: Zustand stores
- API layer: Next.js route handlers under `src/app/api`
- Auth: NextAuth with email, password credentials, OTP, and Google OAuth
- Database: PostgreSQL through Prisma
- Validation: Zod schemas
- Charts and reports: Recharts
- Email: Nodemailer
- Media: Cloudinary is currently used in v1. V2 should evaluate direct S3-compatible object storage plus CDN to reduce long-term media cost.
- Document generation: v1 uses jsPDF and html2canvas. V2 should move invoice and report PDF generation to the Go backend for crisp, reliable financial documents instead of screenshot-style PDFs.

## Current Architecture

V1 is a single full-stack web app.

The browser renders Next.js pages and calls internal `/api` endpoints. Those API routes authenticate the user, validate input, run Prisma queries, and return JSON responses. Dashboard modules use Zustand stores and Axios to fetch and mutate backend data.

This architecture helped v1 move quickly, but v2 should separate responsibilities:

- Next.js should own UI, SEO pages, auth-facing screens, PWA shell, offline UX, and dashboard rendering.
- The Go backend should own APIs, business rules, financial calculations, background jobs, billing webhooks, AI processing, and database access.
- PostgreSQL should remain the main transactional database.
- Background work should move out of request/response routes into a controlled worker system.

## V2 Authentication Shift

V1 relied on NextAuth within the monolith, sharing cookies seamlessly between pages and API routes.

V2 introduces a cross-domain split:

- Frontend: Next.js on `rekordly.com`
- Backend: Go API on `api.rekordly.com`

This changes authentication from a simple monolith cookie model into a split-architecture auth boundary.

V2 authentication planning must define:

- How login and signup UI are handled in Next.js.
- How session state is represented in the browser.
- How the Go API validates every request.
- Whether API authentication uses short-lived JWTs, secure cookies, token verification endpoints, or a hybrid approach.
- How refresh, logout, expiry, and revoked sessions work.
- How CORS, cookie attributes, allowed origins, and CSRF protection work across `rekordly.com` and `api.rekordly.com`.

These details must be specified in `06-api-architecture.md` before implementation. If this boundary is vague, v2 risks locked-out users, insecure APIs, or broken production sessions.

## Main User Flow

1. Visitor lands on the marketing page.
2. Visitor joins waitlist or creates/signs into an account.
3. User verifies email or OTP.
4. User completes onboarding.
5. Authenticated user reaches the dashboard.
6. User manages business and financial records.
7. User reviews reports, balances, income, expenses, inventory, and operational activity.

## Existing Product Areas

The current app includes these major areas:

- Landing page and waitlist
- Authentication and onboarding
- Dashboard overview
- Income tracking
- Sales
- Invoices
- Quotations
- Purchases
- Expenses
- Inventory
- Storefront
- Production and product templates
- Customers
- Loans
- Payments
- Profile and bank account management
- Cash flow, income, expenses, revenue, debtor, creditor, and overview reports

## Existing Data Model Themes

The Prisma schema already models a broad business system:

- Users and sessions
- Packages/subscriptions
- Waitlist entries
- Onboarding data
- Customers
- Inventory items
- Stock adjustments
- Product recipes
- Production batches
- Quotations
- Invoices
- Sales
- Purchases
- Payments
- Income records
- Expenses
- Loans
- Owner equity
- Fixed assets
- Digital assets
- Securities

V2 should simplify where needed, but it should not lose the core financial relationships between invoices, sales, purchases, payments, inventory, and reports.

## Important V2 Lessons From V1

V1 proves the product direction is broad and useful, but v2 needs stricter architecture.

Key lessons:

- Financial data must be modeled carefully and consistently.
- Backend logic should not live inside frontend framework route handlers.
- Reports should be generated from dedicated backend endpoints, not from raw client-side aggregation.
- Multi-tenant queries must be tenant-scoped everywhere.
- Financial amounts must not use floating-point types.
- Background jobs need strict retry, timeout, and failure handling.
- Offline support needs hard queue limits and clear conflict rules.
- AI features must be rate-limited and cost-controlled from day one.
- V1 treated everything as business data. V2's requirement to separate personal and business finance means the core data model must be scoped at the transaction level from day one. Mixed transactions, such as buying a laptop that is 70% business and 30% personal, require split-ledger capabilities that did not exist in v1.

## V1 To V2 Migration Stance

V2 should use a pragmatic hybrid migration stance.

The initial v2 launch will not include automated database-to-database migration scripts. The schema, backend, auth model, and personal/business ledger model are changing too drastically for migration to be a safe MVP dependency.

Migration assumptions:

- V1 becomes read-only when v2 launches.
- Existing users can still log in to v1 to view old financial history and export CSVs.
- V1 users cannot create new v1 data after the read-only transition.
- V2 starts with a clean database.
- Users create a new account or workspace in v2.
- A future self-service CSV import feature should allow users to export from v1 and import into v2 at their own pace.
- Paying or high-value users may receive manual or semi-manual migration support later, only if requested.

This stance protects the v2 launch from risky legacy migration work while still preserving access to historical records.

## V2 Guardrails To Carry Forward

The following constraints are architectural requirements for later planning documents.

### Worker And Queue Guardrails

- Workers must never use a tight polling loop without sleep.
- If the Postgres-backed queue is empty, workers must sleep before polling again.
- Failed jobs must retry with exponential backoff.
- Jobs must have a maximum retry limit.
- Jobs that exceed retry limits must move to a failed jobs table.
- Worker jobs must use context timeouts.
- AI parsing jobs must fail gracefully if they exceed the timeout window.
- Queue workers must use bounded concurrency, starting with 3 to 5 goroutines per container.

### API And Database Guardrails

- All money values must use decimal values or integer minor units, never `float64`.
- Every multi-tenant query must include `workspace_id`, `business_id`, or `user_id` scoping.
- List endpoints must require pagination.
- No endpoint should return unbounded transaction arrays.
- Dashboard components must use aggregate backend endpoints, not raw client-side aggregation.

### Frontend And PWA Guardrails

- Offline action queues must have a hard cap, such as 100 pending actions.
- If the offline queue is full, the user must be blocked from creating more offline records until sync completes.
- Server wins for finalized financial records, account balances, and finalized invoices.
- Draft conflicts should prompt the user for resolution.

### AI Cost Guardrails

- AI endpoints must have strict per-user and per-plan rate limits.
- Free-tier AI usage must be especially constrained.
- User input must be truncated before any LLM call.
- AI-generated records must require user confirmation before becoming financial truth.

## V2 Direction

The recommended v2 direction is:

- Next.js frontend
- Go backend API
- Go background worker
- PostgreSQL database
- Postgres-backed queue at first
- Redis added later when needed
- PWA/offline-first transaction capture
- AI-assisted financial entry
- Paid subscription plans
- Clear separation between personal and business transactions

V2 should be treated as a full redesign, not a refactor of v1.
