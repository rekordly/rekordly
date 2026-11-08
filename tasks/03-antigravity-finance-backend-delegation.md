# Antigravity Backend Delegation — Finance Foundation

Status: ready for implementation
Owner: Antigravity
Reviewer/integrator: Codex

This task delegates four bounded backend slices. Work in separate commits so each slice can be reviewed or reverted independently. The delegation covers roughly 4/10 of the finance backend; it is not permission to redesign the API or implement the whole feature map.

## Required reading

- `AGENT_RULES.md`
- `planning/final-v2-plan/`
- `planning/v2-system-blueprint/`
- `implementation/api/`

Use the existing Go/Gin/pgxpool/PostgreSQL/sqlc conventions. Do not invent a second architecture.

## Assigned slices

### FIN-BE-01 — Money records and classification

Implement income, expense, transfer, draft, confirm/post, void/reversal, categories, notes, dates, attachments metadata, and idempotency. Store monetary amounts as integer minor units (`BIGINT`) with an explicit currency/exponent; never use `float64` for money. Finalized records are immutable; corrections create void/reversal records. Ledger entries must balance in the same database transaction.

### FIN-BE-02 — Sales, purchases, and payments

Implement sales/purchase records and full, partial, and split payments. A customer or supplier may be an external counterparty and must not need a Rekordly account. Support linking payments to a record, overpayment protection, status transitions, and tenant isolation. Do not implement inventory, storefront, invoicing, or wallet logic in this slice.

### FIN-BE-03 — Invoices, deposits, and wallet payments

Implement invoices and line items, payment allocation, customer deposits, and wallet liability/payment records. Prevent negative wallet balances and over-allocation. Preserve an explicit boundary for export/async jobs; do not implement Paystack, billing plans, or a worker redesign.

### FIN-BE-04 — Budgets and tax-readiness aggregates

Implement budgets, spending goals, and read-only VAT/tax-readiness aggregates with date, workspace, and personal/business scope filters. Add plan-limit hooks without implementing the plan catalogue or billing. Aggregates must be deterministic and queryable from posted records only.

## Non-negotiable invariants

- Every tenant-owned table and query is scoped by `workspace_id` (and user scope where applicable).
- Money is integer minor units; no floating point arithmetic or lossy JSON conversion.
- Posted/finalized records are immutable; use void/reversal for corrections.
- Double-entry postings balance atomically with the source record.
- Write endpoints accept idempotency keys where retries can create records.
- Validate ownership before linking customers, suppliers, invoices, payments, budgets, or ledger rows.
- Never log secrets, tokens, OTPs, or raw payment credentials.
- Return safe, consistent API errors and add Swagger annotations for new endpoints.

## Ownership boundaries

Allowed: `implementation/api/**`, migrations, sqlc queries/generated output, and focused API tests.

Do not change: `implementation/web/**`, auth/session behavior, worker architecture, Docker, planning documents, or unrelated formatting. If a shared helper is necessary, keep the change minimal and call it out in the handoff.

## Definition of done for each slice

1. Migration(s), SQLC queries, service/use-case code, handlers/routes, and tests are complete.
2. `gofmt` is clean.
3. `go test -count=1 ./...` and `go vet ./...` pass.
4. `sqlc generate` and `sqlc vet` pass (or the repository's documented equivalent).
5. Tests cover happy path, validation, duplicate/idempotent retry, tenant isolation, unauthorized linking, and concurrent update protection.
6. Handoff lists migration order, endpoint examples, known limitations, commands run, and commit hashes.

Create one focused commit per slice (`FIN-BE-01` through `FIN-BE-04`). Do not merge into another branch or rewrite existing history.
