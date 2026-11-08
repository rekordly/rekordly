# Phase 1 Evaluation — Foundation and Authentication

## AUTH-BE-01 checkpoint — 7 November 2026

### Scope evaluated

Backend/DB foundation for the authentication slice, plus the planning addition for the verified-user application shell.

### Passed evidence

- `docker compose -f implementation/docker-compose.yml config` renders successfully.
- `git diff --check` reports no whitespace errors.
- Compose contains separate PostgreSQL, migration, API, worker and web services.
- API and worker are gated on successful migrations.
- Local/test database URLs are restricted to approved local or Compose hosts.
- Pool size and connection/readiness timeouts are explicit and bounded.
- Liveness is independent from PostgreSQL; readiness is PostgreSQL-backed.
- Migration files are embedded, ordered, checksummed, transactional and guarded against concurrent runners.

### Runtime evidence

- Containerized `go test ./...`: passed.
- Containerized `go vet ./...`: passed.
- API, migration and health-check binary image build: passed.
- Initial migration against PostgreSQL 16: passed.
- Second idempotent migration run: passed without duplicating the migration record.
- `/health/live`: HTTP 200.
- `/health/ready` with PostgreSQL available: HTTP 200.
- Readiness failure behavior is covered by the router test; forcibly stopping PostgreSQL was not required for this checkpoint.

### Decision

Status: **complete and verified**. `AUTH-BE-02` may now build the authentication schema on this foundation.

## AUTH-BE-02 checkpoint — 7 November 2026

### Passed evidence

- `000002_authentication.sql` applied successfully to PostgreSQL 16 and is recorded by checksum.
- A repeated migration run completed without recreating or corrupting schema.
- All 15 required authentication, session, onboarding, workspace, invitation, audit, outbox and idempotency tables exist.
- `sqlc generate` produced compiling Go models and query methods; `sqlc vet` passed.
- Containerized `go test ./...` passed against the live Compose PostgreSQL database.
- Concurrent duplicate normalized-email inserts produce exactly one success and one PostgreSQL unique violation.
- Concurrent duplicate Google issuer/subject inserts produce exactly one success and one unique violation.
- Concurrent Personal-workspace creation for one owner produces exactly one success and one unique violation.
- Schema inspection found no plaintext `password`, `code`, `token`, refresh-token, state, nonce or PKCE-verifier columns in credential-bearing tables.

### Design audit

- Foreign keys used by joins/deletion checks are indexed.
- Equality columns precede expiry/sort columns in composite challenge, invitation and job indexes.
- Partial unique indexes express active-record policies without blocking retained history.
- Secret material is represented by `BYTEA` digests; only the Argon2id encoded password hash is retained.
- Applied migrations are immutable. Recovery uses compatible application rollback plus reviewed forward correction, never manual production row editing.

### Decision

Status: **complete and verified**. Password authentication can now be implemented against generated queries and transaction-owned use cases.

## AUTH-BE-03 checkpoint — 7 November 2026

### Passed evidence

- Argon2id round-trip, wrong-password, malformed-hash and password-boundary unit tests pass.
- Two concurrent first-password requests yield exactly one active password credential.
- Valid password sign-in creates a digest-backed session; wrong password returns the generic credential error and creates no session.
- Reset request returns the same neutral response for missing and existing accounts.
- Reset outbox payload contains only a user reference, with no email or raw reset token.
- Reset proof can be consumed once only.
- Successful reset rejects the old password, accepts the new password, revokes pre-reset sessions and creates a fresh session transactionally.
- Containerized `go test ./...`, `go vet ./...` and `sqlc vet` pass.
- Migration `000003_password_authentication.sql` applied successfully and the rebuilt API container is healthy.
- Live HTTP smoke checks returned: unknown email continuation `registration`, reset request HTTP 202 and invalid sign-in HTTP 401.

### Security audit

- Raw passwords and session/reset secrets are never stored or logged.
- Unknown accounts use a real Argon2id dummy hash to reduce account-dependent timing differences.
- Credential errors do not disclose hash, account status or identity details.
- Session tokens are 256-bit random opaque values; PostgreSQL stores SHA-256 digests only.
- Authentication rate-limit keys use keyed HMAC digests rather than email/IP plaintext.
- Cookies are HttpOnly for the session token, Secure in production and paired with a separate CSRF token for protected unsafe methods added in the session slice.
- No additional dependency approval was required because Argon2id comes from the already-approved `golang.org/x/crypto` module.

### Deferred boundary

The reset request queues `prepare_password_reset`. Generating the short-lived email challenge and delivering it belong to `AUTH-BE-04`, which owns OTP/magic-link email flows. Reset completion is already implemented and verified against a correctly created single-use challenge.

### Decision

Status: **complete and verified**. Proceed to OTP and magic-link authentication.

## AUTH-BE-04 checkpoint — 7 November 2026

### Passed evidence

- Registration OTP request returned HTTP 202 and the worker delivered a six-digit code to local Mailpit.
- Correct registration code produced one verified identity and a 256-bit pre-auth proof requiring password creation.
- Replaying the consumed OTP returned HTTP 401; the pre-auth proof created a password and full session once.
- Concurrent verification test produced one success and one rejected replay.
- Automated tests prove OTP purpose separation and reject an older invalidated resend generation.
- Magic-link request returned HTTP 202 and delivered a 256-bit link through SMTP.
- Two GET inspections returned HTTP 200 without consuming the link.
- Explicit POST confirmation returned HTTP 200; a second confirmation returned HTTP 401.
- API and worker `go test ./...` and `go vet ./...` pass; `sqlc vet` passes.
- Migration `000004_email_authentication.sql` applied and all API, worker, PostgreSQL and Mailpit containers started successfully.

### Security and delivery audit

- OTPs are HMAC-bound to recipient, purpose and resend generation; six-digit values cannot be brute-forced from a leaked database digest alone.
- Magic/session tokens use high-entropy random generation and digest-only database storage.
- Raw OTPs and magic tokens exist only transiently in worker memory and the local development mailbox or real recipient mailbox.
- API responses for OTP/magic requests remain neutral for existing and missing accounts.
- Link inspection uses `Cache-Control: no-store` and `Referrer-Policy: no-referrer` and never consumes authentication state.
- Invitation OTP is not exposed until exact invitation binding is implemented in `AUTH-BE-05`.
- Production configuration rejects non-mandatory SMTP TLS.
- Failed jobs retain only bounded failure classification, never message secrets.

### Decision

Status: **complete and verified**. Proceed to Google OIDC and invitation authentication.

## AUTH-BE-05 checkpoint — 8 November 2026

### Passed evidence

- Unit tests reject invalid Google issuer, audience, nonce, expiry, email-verification status and signing key while accepting a correctly signed local-provider fixture.
- OAuth flow state, nonce and PKCE verifier are protected by an authenticated-encryption cookie; tampering is rejected and plaintext values are not exposed in the cookie.
- A Google identity matching an existing email creates no identity or session until the existing password is proven; wrong proof fails and correct proof links once.
- A new Google account receives `pre_auth` and cannot enter the normal app until password creation.
- Google disconnect requires a full session plus CSRF and is blocked when Google is the final login/recovery method.
- Invitation OTP is reachable only through a valid exact invitation token and remains unavailable through the generic OTP endpoint.
- Acceptance rechecks invitation state, exact destination, inviter authority, role scope, outlet scope and staff/accountant seat capacity inside one PostgreSQL transaction.
- Two concurrent accepts return an idempotent result with exactly one membership.
- A real revoked invitation and a valid invitation with zero remaining seats both create no membership.
- Migration 5 applied to PostgreSQL 16; `sqlc generate` and `sqlc vet` pass.
- Live-database `go test -count=1 ./...` and `go vet ./...` pass.
- Rebuilt API reports HTTP 200 for `/health/live` and `/health/ready`.

### Security and boundary audit

- Provider identity is keyed by Google issuer and `sub`, never email alone.
- Matching email invokes an explicit account-link proof, preventing silent account takeover/merge.
- State, nonce, PKCE verifier, social-link proof and invitation token are stored as digests or authenticated ciphertext, not plaintext database secrets.
- Unsafe invitation acceptance and disconnect operations require the session cookie plus matching CSRF cookie/header.
- Production Google credentials are an external configuration gate. Tests use a locally signed OIDC fixture and do not pretend a real Google tenant was exercised.

### Decision

Status: **complete and verified**. Proceed to `AUTH-BE-06` session lifecycle and onboarding API.

## AUTH-BE-06 checkpoint — 8 November 2026

### Passed evidence

- Refresh rotates token and CSRF digests transactionally and links predecessor/replacement sessions in one family.
- Immediate duplicate refresh receives the bounded concurrent-tab result; replay after grace revokes the replacement family and queues a security notice.
- Full-session authentication rejects pre-auth, expired and revoked proofs.
- Session listing identifies the current session; selected revocation enforces ownership and logout-all invalidates every active session.
- Canonical `/me` returns only membership-authorized workspaces with exact role, ownership and outlet scope.
- An invited Business member receives that Business only and cannot see its owner’s Personal workspace.
- Two concurrent initial-onboarding commands with one key return the same two-workspace result and create exactly one Personal, one Business, two owner memberships, one audit event and one welcome job.
- Reusing an idempotency key with changed input is rejected.
- A forced mandatory outbox failure leaves zero workspaces, idempotency records and completion audits, proving transaction rollback.
- Business basics validate ISO currency, IANA timezone, type and country; migration 6 preserves them without creating financial values.
- Live PostgreSQL full suite, API/worker vet, sqlc verification, repeat migration, image rebuild, liveness and readiness all pass.

### Decision

Status: **complete and verified**. Every backend authentication task (`AUTH-BE-01` through `AUTH-BE-06`) is complete. Proceed with frontend authentication integration and `AUTH-E2E-01`.
- 8 November 2026 frontend session foundation: PASS — Zod-validated `/api/v1/me`, Zustand session state, TanStack Query restoration, protected/guest guards, safe return routing, 403/404 states and dashboard shell compile and pass 21 tests.
- Financial safety: NOT APPLICABLE — no money or ledger behavior changed.
- Memory/disk: PASS — one bounded session query, one retry, no token persistence and no new cache/storage layer.
- Dependencies: PASS — no package was added; existing Axios, TanStack Query, Zustand and Zod dependencies were used.
- Architecture: PASS — implementation remains under `/implementation/web`; the Go API remains the authoritative session and permission boundary.
- Deferred: live browser E2E against the running API/database stack, including session expiry and post-login return routing.
