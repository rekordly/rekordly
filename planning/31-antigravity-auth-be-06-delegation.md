# Antigravity Delegation — AUTH-BE-06

## Objective

Complete the final backend authentication task, `AUTH-BE-06`, in an isolated worktree for primary-agent review. Work only on the Go API, SQL migrations/queries, backend tests and this handoff. Do not modify `implementation/web/**`, the legacy `web/**`, pricing, or unrelated planning documents.

## Git boundary

- Base commit: `0debf15` (`feat(auth): complete backend authentication through invitations`).
- Create branch: `antigravity/auth-be-06`.
- Create a separate worktree outside the main checkout.
- Commit each task separately in the order below.
- Do not merge, rebase or cherry-pick into `master`.
- Do not edit or delete migrations `000001` through `000005`; add `000006_sessions_and_onboarding.sql` if schema changes are required.

## Required reading

Read completely before editing:

- `AGENT_RULES.md`
- `planning/v2-authentication-implementation-tasks.md`, especially section 10
- `planning/v2-system-blueprint/00-blueprint-conventions.md`
- `planning/v2-system-blueprint/01-registration-authentication-and-onboarding.md`
- `planning/v2-system-blueprint/02-app-shell-navigation-and-permissions.md`
- `planning/final-v2-plan/04-technical-architecture-and-data-model.md`
- existing `implementation/api/internal/auth/**`
- existing migrations and `implementation/api/sqlc/queries/auth.sql`

The existing implementation and API contracts are authoritative. Preserve Gin, pgx, sqlc, PostgreSQL, opaque cookie sessions, CSRF protection, digest-only secrets, Problem-style JSON responses and the modular-monolith structure.

## Task 1 — Session lifecycle and replay protection

Implement:

- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `POST /api/v1/auth/logout-all`
- `GET /api/v1/me/sessions`
- `DELETE /api/v1/me/sessions/:id`

Rules:

- Full session only for protected application endpoints; pre-auth must never become a normal session through refresh.
- Rotate the opaque session token in the same family on refresh.
- Store only token digests.
- Mark predecessor/replacement links transactionally.
- A narrowly bounded concurrent-tab grace may return a safe retry/conflict result; it must not require storing a replacement raw token.
- Reuse after grace revokes the entire family and requires sign-in.
- Logout is safely repeatable and clears cookies.
- Logout-all revokes every active family for the current user.
- Selected-session revocation must enforce ownership and must not disclose another user's session.
- All unsafe cookie-authenticated endpoints require CSRF cookie/header equality.
- Update `last_seen_at` without creating an unbounded write on every request.

Tests must cover normal rotation, old-token replay, concurrent-tab grace behavior, family revocation after replay, current logout, logout-all, selected revocation, ownership/IDOR and pre-auth rejection.

## Task 2 — Canonical current-user contract

Implement `GET /api/v1/me` returning one canonical contract used by every authentication method and the verified app shell:

- user ID, safe display fields, locale/timezone and onboarding status;
- current session ID/kind/issued/expiry/device summary;
- resumable onboarding progress/version;
- authorized workspaces only, with workspace kind, ownership/member status, exact role and outlet scope;
- a current/selected workspace hint only when it is authorized;
- no balances, dashboard totals or invented financial data.

Rules:

- Reject missing, expired, revoked and pre-auth sessions.
- Never accept user/workspace IDs from the client for this query.
- An invited Business membership must not reveal or include the owner's Personal workspace.
- Return Personal and Business as separate workspaces; never merge their books.
- Add handler/contract tests and live PostgreSQL authorization tests.

## Task 3 — Resumable onboarding and atomic workspace creation

Implement:

- `PUT /api/v1/me/onboarding/preferences`
- `POST /api/v1/me/onboarding/workspaces`

Requirements:

- Versioned resumable preferences.
- Roles/use cases plus `personal`, `business` or `all` space choice.
- Validate display names, unique selected kinds, ISO-style three-letter currency and approved timezone input.
- Require a full session and CSRF for mutations.
- Require a bounded `Idempotency-Key`; store only its digest plus request digest.
- Lock user/onboarding state in one PostgreSQL transaction.
- The same completed key and same request returns the original result.
- Same key with a different request is a conflict.
- Concurrent initial commands cannot duplicate the Personal workspace or the same logical onboarding result.
- Create each workspace, exact owner role and owner membership atomically.
- Create only safe configuration defaults that exist in the current schema. Do not invent balances, stock, receivables, payables, loans, assets or financial rows.
- Personal and Business remain separate.
- Mark onboarding core complete only after every requested workspace succeeds.
- Write audit events and an outbox welcome/checklist event without secrets.
- Any mandatory failure rolls back workspace, role, membership, onboarding, audit and outbox changes.
- Return created/existing workspace IDs and a safe recommended internal route.

Tests must cover Personal, Business, both, idempotent retry, idempotency mismatch, two concurrent commands, rollback on a forced mandatory failure and the invited-member privacy boundary.

## Quality gates

Run from containers if Go/sqlc are unavailable on the host:

1. `sqlc generate`
2. `sqlc vet`
3. `gofmt` on changed Go files
4. `go test -count=1 ./...` against the live local PostgreSQL database
5. `go vet ./...`
6. apply migration twice to prove repeat safety
7. rebuild the API image
8. verify `/health/live` and `/health/ready`
9. `git diff --check`

Do not add a dependency without documenting why the standard library/current approved modules cannot perform the job. Do not weaken an assertion merely to make a test pass. Tests should verify behavior and security contracts, not exact class names, implementation layout or arbitrary formatting.

## Handoff

Return:

- worktree and branch;
- three commit hashes;
- changed-file list by task;
- migration/query summary;
- API request/response examples;
- exact test commands and results;
- assumptions and unresolved risks;
- explicit confirmation that `implementation/web/**` was untouched.

