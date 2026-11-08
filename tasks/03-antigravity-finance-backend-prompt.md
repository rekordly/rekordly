# Prompt for Antigravity — Finance Backend Slices

You are implementing four bounded backend slices for Rekordly. Read `tasks/03-antigravity-finance-backend-delegation.md` completely before editing. Also read `AGENT_RULES.md`, `planning/final-v2-plan/`, `planning/v2-system-blueprint/`, and inspect the existing code under `implementation/api/`.

Use the repository's existing Go + Gin + pgxpool + PostgreSQL + sqlc patterns. Do not create a parallel architecture. Implement the slices in this order, one focused commit each:

1. `FIN-BE-01` money records/classification
2. `FIN-BE-02` sales, purchases, and payments
3. `FIN-BE-03` invoices, deposits, and wallet payments
4. `FIN-BE-04` budgets and tax-readiness aggregates

Follow every invariant and boundary in the delegation document. In particular: integer minor units only, workspace scoping on every query, balanced atomic ledger postings, immutable finalized records with void/reversal corrections, idempotency for retryable writes, safe errors, and no secrets in logs.

Do not touch frontend code, auth/session behavior, worker redesign, Docker, planning docs, billing/Paystack, AI, offline sync, inventory, storefront, or domains. If a shared helper is unavoidable, make the smallest compile-safe change and explain it.

For each slice:

- Add migrations, SQLC queries/generated output, services/use cases, handlers/routes, Swagger annotations, and focused tests.
- Test happy paths, invalid input, duplicate/idempotent retry, tenant isolation, unauthorized links, and concurrency/over-allocation protection.
- Run `gofmt`, `go test -count=1 ./...`, `go vet ./...`, `sqlc generate`, and `sqlc vet` (or the documented repository equivalents).
- Commit separately with the slice ID in the message.

At handoff, report the commit hash, changed files, migration order, endpoints with example requests/responses, commands and results, and any known limitations. Do not merge or rewrite existing commits; Codex will review and integrate each commit.
