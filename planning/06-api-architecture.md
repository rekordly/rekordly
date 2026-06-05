# 06 - Rekordly V2 API Architecture

## Summary

This document defines the MVP API architecture for Rekordly v2.

It describes how the Next.js frontend on `rekordly.com` talks to the Go API on `api.rekordly.com`, how cross-domain auth works, and how core finance APIs enforce accounting correctness.

The API is REST-first under `/api/v1`. Storefront, complex inventory, complex production, quotations, WhatsApp, and amortization remain Phase 2.

## API Architecture

- Frontend/backend split: Next.js owns UI, auth screens, PWA shell, and offline queue; Go API owns protected business logic.
- Auth: email OTP only for MVP; SMS excluded. API validates every protected request and supports future provider channels such as WhatsApp OTP.
- Tenant safety: every protected request resolves `user_id` and `workspace_id`; all queries are workspace-scoped.
- Money: accept and return monetary values as decimal strings, never floats.
- Ledger safety: money-changing writes run in database transactions and commit only after balanced ledger entries are created.
- Idempotency: mutation endpoints require `Idempotency-Key`, especially payments and offline sync.
- Pagination/date scoping: all financial list endpoints use cursor pagination and default to a 30-day/current-month window unless explicit `from` and `to` filters are provided.
- Async jobs: heavy operations return `202 Accepted` with `job_id`; frontend polls job status.
- Rate limits: all responses include `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset`.

## API Groups

### Auth / Session

Endpoints:

- `POST /api/v1/auth/request-otp`
- `POST /api/v1/auth/verify-otp`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `GET /api/v1/session`

Rules:

- Define CORS, secure cookies/JWT, CSRF, token expiry, refresh, and revocation behavior.
- MVP uses email OTP only.
- SMS is excluded due to cost.
- Auth provider design should allow WhatsApp OTP in Phase 2 without rewriting the auth flow.

### Workspace / Onboarding

Endpoints:

- `GET /api/v1/workspace`
- `PATCH /api/v1/workspace`
- `POST /api/v1/onboarding/complete`

Rules:

- Every protected request resolves a workspace.
- MVP supports one workspace per user.
- `workspace_id` remains mandatory to avoid future tenant-model rewrites.

### AI-Assisted Entry

Endpoints:

- `POST /api/v1/ai/parse-entry`
- `POST /api/v1/ai/drafts/{id}/confirm`

Rules:

- Enforce rate limits.
- Enforce input truncation.
- Enforce plan limits.
- Store audit logs.
- Require user confirmation before creating financial truth.
- Complex AI parsing may use the async job pattern if request cost or runtime exceeds synchronous limits.
- MVP AI entry is web-app only, but the backend should allow a future WhatsApp channel to submit text into the same parser.

### Transactions

Endpoints:

- `GET /api/v1/transactions`
- `POST /api/v1/transactions`
- `GET /api/v1/transactions/{id}`
- `POST /api/v1/transactions/{id}/void`

Rules:

- Lists default to 30 days/current month.
- Explicit `from` and `to` filters are required for wider historical queries.
- Lists use cursor pagination by `occurred_at` and `id`.
- Offset pagination is not allowed for financial record lists.
- No hard delete.
- Corrections use void/reversal.
- Writes must create balanced ledger entries before commit.

### Invoices

Endpoints:

- `GET /api/v1/invoices`
- `POST /api/v1/invoices`
- `GET /api/v1/invoices/{id}`
- `PATCH /api/v1/invoices/{id}`
- `POST /api/v1/invoices/{id}/finalize`
- `POST /api/v1/invoices/{id}/void`
- `POST /api/v1/invoices/{id}/pdf`

Rules:

- `PATCH /api/v1/invoices/{id}` is for drafts only.
- Finalized invoices are immutable.
- Corrections use void/reversal patterns.
- PDF generation uses the async job pattern and returns `job_id`.
- Invoice lists follow default date scoping and cursor pagination.

### Sales / Purchases

Endpoints:

- `GET /api/v1/sales`
- `POST /api/v1/sales`
- `GET /api/v1/purchases`
- `POST /api/v1/purchases`

Rules:

- Lists default to 30 days/current month.
- Explicit `from` and `to` filters are required for wider historical queries.
- Lists use cursor pagination by business date and `id`.
- Offset pagination is not allowed.
- MVP avoids complex inventory coupling.
- Writes must validate decimal money and ledger balance.

### Payments And Split Payments

Endpoints:

- `POST /api/v1/payments`
- `GET /api/v1/payments`

Rules:

- Supports multiple payment rows for sale/invoice contexts.
- Rejects overpayment transactionally.
- Rejects invalid wallet usage transactionally.
- Wallet payments must validate available wallet balance.
- Payment list endpoints use cursor pagination and default date scoping.

### Customer Wallets

Endpoints:

- `GET /api/v1/customers/{id}/wallet`
- `POST /api/v1/customers/{id}/wallet/deposits`
- `GET /api/v1/customers/{id}/wallet/ledger`

Rules:

- No negative wallets.
- Deposits credit customer liabilities.
- Wallet ledger list uses cursor pagination.
- Wallet balance updates must happen transactionally.

### Simple Loans / Debts

Endpoints:

- `GET /api/v1/loans`
- `POST /api/v1/loans`
- `GET /api/v1/loans/{id}`
- `POST /api/v1/loans/{id}/repayments`

Rules:

- No amortization.
- No compound interest.
- No repayment schedules.
- Repayments cannot reduce loan balance below zero.
- Loan lists use cursor pagination and date scoping.

### Budgets And Notifications

Endpoints:

- `GET /api/v1/budgets`
- `POST /api/v1/budgets`
- `GET /api/v1/budgets/{id}/status`
- `GET /api/v1/notifications`
- `PATCH /api/v1/notifications/{id}/read`

Rules:

- Budget status is computed from backend aggregates.
- Budget alerts use generic notification service.
- MVP notification channels: email, PWA push, in-app.
- SMS is excluded due to cost.

### Dashboard / Report Summaries

Endpoints:

- `GET /api/v1/dashboard/summary`
- `GET /api/v1/reports/cashflow-summary`
- `GET /api/v1/reports/budget-summary`

Rules:

- Use aggregate backend endpoints only.
- Frontend must not aggregate large raw datasets.
- Summary endpoints should accept explicit date filters when needed.
- Defaults should avoid scanning unnecessary historical data.

### Offline Sync

Endpoint:

- `POST /api/v1/sync/mutations`

Rules:

- Accepts client mutation batch with idempotency keys.
- Server wins for finalized records, balances, wallets, loans, and invoices.
- Duplicate idempotency keys must not create duplicate records.
- Request body size limits apply.

### Async Jobs & Workers

Endpoint:

- `GET /api/v1/jobs/{id}`

Pattern:

1. API validates the request.
2. API enqueues the job to the Postgres job queue.
3. API returns `202 Accepted` with `job_id`.
4. Go worker processes the job.
5. Frontend polls `GET /api/v1/jobs/{id}` for status.

Applies to:

- PDF generation.
- Bulk exports.
- Complex AI parsing.

Worker guardrails:

- No tight polling loop.
- Sleep when the queue is empty.
- Use timeouts.
- Use bounded concurrency.
- Use retries with backoff.
- Move exhausted failures to a dead letter queue.

### Plans / Usage / Exports

Endpoints:

- `GET /api/v1/plan`
- `GET /api/v1/usage`
- `POST /api/v1/exports`
- `GET /api/v1/exports/{id}`

Rules:

- Exports use the async job pattern.
- Backend enforces plan limits before writes, AI calls, exports, and sync.
- Export jobs track status through the job endpoint.

### Webhooks

Endpoint:

- `POST /api/v1/webhooks/payment-provider`

Rules:

- Placeholder for subscription payment providers such as Stripe or Paystack.
- Must verify webhook signatures before processing events.
- Invalid signatures must be rejected.
- Webhook processing should be idempotent.

### System

Endpoints:

- `GET /api/v1/health`
- `GET /api/v1/ready`

Rules:

- Health checks confirm API process availability.
- Readiness checks confirm required dependencies are reachable.

## Cross-Cutting Rules

- Responses use `data`, `error`, and `meta`.
- Standard error codes include `UNAUTHORIZED`, `FORBIDDEN`, `VALIDATION_ERROR`, `PLAN_LIMIT_REACHED`, `RATE_LIMITED`, `CONFLICT`, `IDEMPOTENCY_CONFLICT`, `INSUFFICIENT_WALLET_BALANCE`, `OVERPAYMENT_NOT_ALLOWED`, and `JOB_NOT_READY`.
- All responses include `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset`.
- All write endpoints validate workspace access, plan limits, idempotency, decimal money strings, and ledger balance.
- All finalized financial corrections use void/reversal endpoints.
- CORS allows only approved frontend origins.
- AI endpoints have strict per-user and per-plan rate limits.
- Request body size limits apply, especially for AI and sync endpoints.
- Financial list endpoints must require cursor pagination and default date scoping.
- Financial list endpoints must not use offset pagination.
- Major financial list endpoints must default to 30 days/current month unless explicit `from` and `to` filters are provided.

## Test Plan

- Auth: login, refresh, logout, invalid token, revoked token, CORS rejection.
- Tenant safety: user cannot read or mutate another workspace's records.
- Pagination/date scope: list endpoints default to 30 days/current month and reject unbounded list requests.
- Cursor pagination: financial lists use cursor by date/id, not offset.
- Money: decimal strings parse correctly; floats/scientific unsafe values are rejected.
- Ledger: finalized financial writes create balanced debit/credit entries.
- Immutability: finalized records cannot be patched/deleted directly.
- Wallets: deposit increases liability; wallet payment cannot exceed balance.
- Split payments: total rows cannot exceed amount due.
- Loans: repayment reduces balance and rejects overpayment.
- AI: rate limits, input truncation, confirmation required.
- Offline sync: duplicate idempotency key does not create duplicate records.
- Async jobs: PDF/export requests return `202` and job status progresses.
- Webhooks: invalid signatures are rejected.
- Plans: backend blocks limit-exceeding writes and AI calls.
- Notifications: budget threshold emits email/PWA/in-app delivery records, not SMS.

## Assumptions

- Go API is REST-first for MVP.
- API version is `/api/v1`.
- PostgreSQL is the source of truth.
- MVP auth uses email OTP, not SMS.
- Next.js and Go API are cross-domain: `rekordly.com` and `api.rekordly.com`.
- MVP supports one workspace per user, with `workspace_id` required everywhere.
- WhatsApp, storefront, complex inventory, complex production, quotations, and amortization are Phase 2.
