# 09 - Rekordly V2 Security

## Summary

This document defines the MVP security plan for Rekordly V2.

Rekordly is a financial SaaS, so security must be designed into the architecture from the start. The system will use a split architecture: Next.js on `rekordly.com`, a Go API on `api.rekordly.com`, PostgreSQL as the source of truth, and a Go worker for background jobs.

This document turns the product, data model, API, AI, and infrastructure plans into enforceable security rules.

Security guidance should align with:

- [OWASP API Security Top 10 2023](https://owasp.org/API-Security/editions/2023/en/0x11-t10/)
- [OWASP CSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)

## Security Principles

- Backend is the security boundary.
- Frontend may guide UX but cannot enforce access, plan limits, money rules, wallet rules, or ledger truth.
- Every protected request must resolve an authenticated `user_id`.
- Every protected tenant-owned request must resolve a `workspace_id`.
- MVP has one workspace per user, but workspace scoping is still mandatory.
- All financial operations are immutable after finalization.
- Corrections must use voids and reversing entries.
- Fail closed by default.
- Do not trust client-supplied identifiers, amounts, statuses, plan data, or ledger data.
- Do not expose implementation details in public errors.

## Authentication And Session Security

MVP authentication uses email OTP only. SMS is excluded due to cost.

### Responsibilities

- Next.js owns login, signup, and auth-facing UI.
- Go API validates every protected request.
- Go API owns protected session validation, refresh, logout, revocation, and user/workspace resolution.
- Auth provider design must allow WhatsApp OTP in Phase 2 without rewriting the auth flow.

### Session Rules

- Use short-lived access sessions.
- Support refresh and session revocation.
- Tokens or cookies must be environment-specific.
- Tokens or cookies must be `Secure` in production.
- Cookies must be `HttpOnly` where applicable.
- Long-lived auth secrets must never be stored in `localStorage`.
- Do not store long-lived auth secrets in IndexedDB.
- Logout must revoke the active session or refresh token.
- Refresh expiry must be finite.
- Revoked sessions must fail on the next protected API request.

### OTP Rules

- OTPs must expire quickly.
- OTP values must not be stored in plaintext.
- Failed OTP attempts must be rate-limited.
- OTP resend must be throttled.
- Excessive failed OTP attempts should temporarily block verification for that email.
- OTP request responses should avoid confirming whether an email already exists.
- OTP logs must not include the OTP value.

## Cross-Domain CORS And CSRF

V2 separates the frontend and backend across domains.

- Production frontend origin: `https://rekordly.com`.
- Production API origin: `https://api.rekordly.com`.
- Staging API origin: `https://staging-api.rekordly.com`.

### CORS Rules

- Production must allow only approved production frontend origins.
- Staging must allow only approved staging frontend origins.
- No wildcard CORS on protected endpoints.
- Credentialed requests must use strict allowed origins.
- CORS config must be environment-specific.
- Unknown origins must be rejected.

### CSRF Rules

If cookies are used for API authentication:

- Add CSRF protection.
- Use token-based or double-submit style defense.
- SameSite cookie settings are defense-in-depth, not the only CSRF control.
- Unsafe methods such as `POST`, `PATCH`, and `DELETE` must require CSRF validation.

If bearer tokens are used:

- Tokens must not be stored in localStorage.
- Token refresh and revocation still need explicit server-side design.

## Authorization And Tenant Isolation

Tenant isolation is mandatory even though MVP has one workspace per user.

### Workspace Scoping

- Every tenant-owned table must include `workspace_id`.
- Every tenant-owned query must include `workspace_id`.
- Every protected request must resolve the workspace from server-side session context.
- Clients must not be trusted to choose arbitrary workspace IDs.
- Cross-workspace access must fail with `FORBIDDEN` or `NOT_FOUND`, depending on the endpoint behavior.

### Object-Level Authorization

Every `/{id}` route must check object ownership.

Examples:

- A transaction ID must belong to the authenticated user's workspace.
- An invoice ID must belong to the authenticated user's workspace.
- A customer wallet must belong to the authenticated user's workspace.
- A job ID must belong to the authenticated user's workspace or user.
- An export ID must belong to the authenticated user's workspace or user.

### Property-Level Authorization

Clients must not be able to mass-assign protected fields.

Protected fields include:

- `workspace_id`
- `user_id`
- `plan_id`
- `subscription_id`
- `ledger_entries`
- `wallet_balance`
- `loan_balance`
- `paid_amount`
- `voided_at`
- `voided_by_id`
- `created_by_id`
- `updated_by_id`
- internal status fields

The API should map request DTOs to allowed fields explicitly instead of binding directly into database models.

## Data Encryption And Privacy

Rekordly stores sensitive financial and personal data. Encryption and privacy rules are mandatory.

### Encryption At Rest

- PostgreSQL must use encryption at rest.
- All database backups must use encryption at rest.
- Object storage for PDFs and exports must use encryption at rest.
- Local development data may be fake, but production data must never be copied into local development without explicit anonymization.

### Encryption In Transit

- All external traffic must use TLS 1.2 or newer.
- All internal service-to-service traffic must use TLS 1.2 or newer where the hosting environment supports it.
- Webhooks must use HTTPS.
- API calls from Next.js to Go must use HTTPS in staging and production.

### PII Definition

Personally identifiable information includes:

- Email addresses.
- Phone numbers.
- Bank account details.
- Customer contact data.
- Names tied to financial records.
- Addresses.
- Any personal identifier that can identify a user, customer, vendor, borrower, or lender.

### Application-Level PII Protection

- PII must be encrypted at the application level before storage if the hosting/database provider does not provide adequate encryption.
- Bank details require stronger handling than ordinary display names or notes.
- Do not store sensitive payment card data directly.
- Prefer payment-provider tokens or references for subscription payments.
- Store only the PII required for the product, legal compliance, support, and audit obligations.

### Data Masking

Logs and API error responses must never expose:

- Raw secrets.
- Raw tokens.
- Full OTP values.
- Full PII.
- Bank details.
- Sensitive financial details in unsafe contexts.
- Raw provider payloads containing sensitive user data.

PII should be masked in logs.

Examples:

- `john@gmail.com` -> `j***@gmail.com`
- `08012345678` -> `080****5678`
- Bank account numbers should show only the last few digits when necessary.

### NDPA Alignment

Data handling must align with the Nigerian Data Protection Act.

Rekordly should:

- Minimize PII collection.
- Explain why user data is collected.
- Support user data access requests.
- Support data correction requests where legally and operationally safe.
- Retain data only as long as needed for legal, operational, and financial audit requirements.
- Avoid deleting finalized financial truth when retention is legally required.
- Use exports to support data portability.

## API Abuse Protection

API abuse controls protect cost, availability, and data safety.

- Rate limiting is required on auth endpoints.
- Rate limiting is required on AI endpoints.
- Rate limiting is required on exports.
- Rate limiting is required on webhooks.
- Rate limiting is required on offline sync.
- Rate limiting is required on all write endpoints.
- All API responses must include:
  - `X-RateLimit-Limit`
  - `X-RateLimit-Remaining`
  - `X-RateLimit-Reset`
- Request body size limits must apply to all endpoints.
- AI and offline sync endpoints need especially strict body limits.
- Financial list endpoints must use cursor pagination.
- Financial list endpoints must default to a 30-day or current-month window unless explicit `from` and `to` filters are provided.
- Unbounded financial list requests are not allowed.
- Mutation endpoints require `Idempotency-Key`, especially payments and offline sync.

## Financial Integrity Security

Financial integrity is part of security. The database must not allow user actions, API bugs, AI output, or sync retries to corrupt financial truth.

### Money Rules

- Monetary values use decimal strings at the API boundary.
- Go must use decimal types.
- PostgreSQL must use `NUMERIC(20,4)` or equivalent precise numeric storage.
- Never use `float64` for money.
- Reject unsafe numeric formats such as ambiguous floats or scientific notation when they could cause precision risk.

### Ledger Rules

- Every finalized financial action creates balanced ledger entries.
- Total debits must equal total credits before commit.
- Ledger writes must happen in database transactions.
- Finalized ledger entries must not be directly edited.
- Corrections use voids and reversing entries.

### Wallet Rules

- Customer wallet balances cannot go negative.
- Wallet payments must validate available balance transactionally.
- Wallet deposits credit customer liabilities, not revenue.
- Wallet ledger entries are immutable after finalization.

### Split Payment Rules

- A sale or invoice may have multiple payment rows.
- Sum of payment rows must not exceed amount due.
- Wallet payment portions must also pass wallet balance validation.
- Payment validation must happen transactionally.

### Loan Rules

- Loan repayments must not reduce balance below zero.
- Interest is recorded manually as income or expense in MVP.
- No automated amortization or compound interest in MVP.

### Immutability Rules

- Finalized transactions must not be hard-deleted.
- Finalized invoices must not be hard-deleted.
- Finalized payments must not be hard-deleted.
- Finalized wallet ledger entries must not be hard-deleted.
- Finalized rows must not be directly mutated for corrections.
- Use `voided_at`, `voided_by_id`, and reversing entries.

### Injection Prevention

- Use parameterized SQL queries only.
- The Go database layer should use `sqlc` or an equivalent parameterized-query layer.
- Raw SQL string concatenation with user-supplied input is absolutely banned.
- User-controlled sort/filter fields must be allowlisted before being applied to queries.
- Dynamic SQL, where unavoidable, must compose only from trusted allowlisted fragments and parameterized values.
- Code review and static checks should reject unsafe SQL construction.

## AI Security

AI is a suggestion layer, not a trusted execution layer.

- No anonymous AI calls.
- Enforce per-user and per-plan AI rate limits.
- Enforce plan limits before or atomically with provider calls.
- Truncate input before sending to the AI provider.
- Enforce request body limits.
- Enriched context must be tenant-scoped.
- Enriched context must be minimized.
- Do not leak another user's categories, vendors, customers, or financial history into AI prompts.
- Never trust model output directly.
- Validate AI output with backend schemas.
- AI output must use decimal strings for money.
- AI drafts never become financial truth without user confirmation.
- AI cannot finalize ledger entries.
- AI cannot bypass wallet, loan, split-payment, invoice, tax, or plan validation.
- Store minimum necessary AI audit metadata.
- Avoid storing sensitive raw prompts unless explicitly required.
- Do not expose raw provider errors to users.

## PWA And Offline Security

Offline support is useful but must be bounded.

- Offline queue is capped at 100 pending actions.
- When the offline queue is full, block new offline writes until sync completes.
- Offline mutations require idempotency keys.
- Server wins for finalized financial records.
- Server wins for account balances.
- Server wins for wallet balances.
- Server wins for loan balances.
- Server wins for finalized invoices.
- Draft conflicts require user resolution.
- Cached dashboards must be marked stale.
- Cached data must not leak across users on shared devices.
- Do not store long-lived auth secrets in IndexedDB.
- Do not store long-lived auth secrets in localStorage.
- Sensitive cached data should be minimized.

## Secrets, Webhooks, And Infrastructure

### Secrets

- Use separate secrets for local, staging, and production.
- Production secrets must never be used locally.
- Production secrets must never be used in staging.
- Secrets must be stored in deployment provider secret stores or GitHub Actions secrets.
- Do not commit `.env` files.
- Rotate secrets after suspected exposure.

Secret groups include:

- Auth/session signing secrets.
- Database URLs.
- Payment provider keys.
- Payment webhook secrets.
- AI provider keys.
- Email provider keys.
- Push notification keys.
- Object storage credentials.

### Webhooks

- Webhook signatures must be verified before processing.
- Invalid webhook signatures must be rejected.
- Webhook processing must be idempotent.
- Duplicate provider events must not duplicate subscription updates or payments.
- Webhook payloads should be logged only in sanitized form.

### Infrastructure

- Database backups are required for production.
- Database backups must be encrypted.
- CI/CD migrations run automatically before deploy.
- Failed migrations block deploy.
- Worker jobs use bounded concurrency.
- Worker jobs use timeouts.
- Worker jobs use retry backoff.
- Worker jobs have max retry limits.
- Exhausted jobs move to DLQ or `failed_jobs`.
- No tight infinite worker polling loops.

## Supply Chain Security

Dependencies are part of the attack surface.

- CI/CD must run automated dependency vulnerability scanning.
- Next.js dependencies should use `npm audit` or an equivalent scanner.
- Go dependencies should use `govulncheck`.
- Docker images should be scanned before production deployment when practical.
- Deployment must be blocked for critical dependency vulnerabilities.
- Deployment must be blocked for high-severity dependency vulnerabilities unless explicitly reviewed and accepted with mitigation.
- Lockfiles must be committed.
- Dependency updates should be reviewed intentionally.
- Avoid abandoned packages for security-sensitive code.

## Audit Logging And Monitoring

Audit logs must support security investigation, financial review, and compliance.

### Events To Log

- Login attempts.
- OTP requests.
- Failed OTP attempts.
- Session refresh.
- Logout.
- Revoked sessions.
- Financial writes.
- Transaction voids.
- Invoice finalization and voids.
- Wallet deposits.
- Wallet payments.
- Loan creation.
- Loan repayments.
- Export generation.
- PDF generation.
- AI parse requests and confirmations.
- Webhook events.
- Plan-limit blocks.
- Rate-limit events.
- Admin/system actions.
- Access to raw PII by system/admin processes.
- Access to sensitive financial records by system/admin processes.

### Log Safety

Logs must not contain:

- Full secrets.
- Raw tokens.
- Full OTP values.
- Unmasked PII.
- Unnecessary raw AI prompts.
- Unnecessary payment provider payloads.
- Full bank details.

### Alerts

Alert on:

- Auth spikes.
- OTP failure spikes.
- AI usage spikes.
- Rate-limit spikes.
- Webhook signature failures.
- DLQ growth.
- Export/PDF failures.
- Suspicious tenant-access failures.
- Unusual raw PII access patterns.
- Unusual sensitive financial record access patterns.

## Test Plan

- Auth: OTP expiry, resend throttling, failed attempt lockout, refresh, logout, revoked session.
- CORS/CSRF: reject unknown origins, reject missing CSRF token if cookie auth is used.
- Tenant isolation: user cannot read or update another workspace's transactions, invoices, wallets, loans, exports, or jobs.
- Object authorization: every `/{id}` route checks workspace ownership.
- Mass assignment: protected fields cannot be set by clients.
- Encryption/privacy: backups are encrypted, TLS is enforced, logs mask PII, and API errors do not leak sensitive data.
- Injection prevention: SQL access uses `sqlc` parameterized queries; raw concatenated user input is rejected in review or static checks.
- Financial integrity: unbalanced ledger writes fail.
- Wallets: wallet overdrafts fail.
- Split payments: overpayments fail.
- Loans: loan overpayments fail.
- Immutability: finalized records cannot be patched or deleted.
- API abuse: rate limits return `429` plus standard rate-limit headers.
- Pagination: unbounded financial list requests are rejected or default-scoped.
- AI: oversized prompts truncate.
- AI: low-plan users hit limits.
- AI: AI output cannot bypass validation.
- Webhooks: invalid signatures are rejected.
- Webhooks: duplicate events are idempotent.
- Offline sync: duplicate mutation keys do not create duplicate records.
- Supply chain: CI blocks high or critical npm and Go dependency vulnerabilities.
- Audit: raw PII/admin financial access creates compliance audit entries.

## Assumptions

- MVP auth remains email OTP only.
- SMS remains excluded.
- Go API is the security boundary.
- PostgreSQL is the source of truth.
- MVP has one workspace per user, but all tenant data still uses `workspace_id`.
- Go database access will use `sqlc` or an equivalent parameterized-query layer.
- PostgreSQL provider encryption at rest is required for production.
- Production backups must be encrypted.
- WhatsApp OTP, WhatsApp notifications, advanced roles, SSO, device trust, and enterprise audit tooling are Phase 2+.
