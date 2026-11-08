# Rekordly V2 Worklog

## 7 November 2026 — AUTH-BE-01 backend foundation

- Extended the Go API configuration with bounded `pgxpool` connection settings and database timeouts.
- Added a local/test database-host guard so local code cannot accidentally connect to staging or production PostgreSQL.
- Added embedded, checksummed, transaction-wrapped PostgreSQL migrations protected by an advisory lock.
- Added a dedicated migration binary and Compose migration service; API and worker wait for successful migrations.
- Connected the API process to PostgreSQL with startup verification and graceful pool shutdown.
- Split health handling into unconditional liveness and database-backed readiness; added a container health-check binary.
- Added configuration and router tests, a local environment template, and Make targets for backend startup, logs, migration and explicit local database reset.
- Added the verified authenticated app shell to `AUTH-FE-02`, including authorization/onboarding gates, space switcher, responsive navigation and safe empty placeholders.
- Verification: `docker compose config` passed and `git diff --check` passed.
- Started Docker Desktop and performed the runtime checks through the official Go 1.22 Alpine build environment because Go is not installed on the Windows host.
- Runtime verification passed: `go test ./...`, `go vet ./...`, API/migration/health-check image builds, initial migration, repeat/idempotent migration, `/health/live` and PostgreSQL-backed `/health/ready`.
- `AUTH-BE-01` is complete. The local PostgreSQL and API containers remain running for the next authentication-schema task.

## 7 November 2026 — AUTH-BE-02 authentication schema

- Added the complete authentication and onboarding schema migration: users, identities, password credentials, OTP/magic/OIDC challenges, rotating sessions, onboarding state, workspaces, roles, memberships, invitations, audit events, outbox jobs and idempotency records.
- Used ordered `BIGINT` identities, UTC-capable timestamps, typed `CHECK` constraints, explicit foreign-key deletion behavior and indexes for foreign keys/hot lookup paths.
- Enforced active email identity, Google issuer/subject, active password, Personal-workspace owner and active workspace owner uniqueness at the database layer.
- Kept OTP codes, magic/invitation/session/OIDC values and idempotency keys in digest-only columns; no plaintext secret columns exist.
- Added explicit `sqlc` authentication queries and generated the typed Go query/model layer under `internal/db`.
- Documented immutable, forward-only migration recovery and expand/contract rollout policy in the authentication task document.
- Applied the migration to local PostgreSQL, confirmed all 15 tables, and reran it safely.
- Verification passed: `sqlc vet`, containerized Go tests, live constraint tests for concurrent duplicate email identities, Google subjects and Personal workspaces, and plaintext-secret-column inspection.
- `AUTH-BE-02` is complete. Next task is `AUTH-BE-03` password authentication.

## 7 November 2026 — AUTH-BE-03 password authentication

- Added Argon2id password hashing and verification using 19 MiB memory, two iterations, one lane, 16-byte salts and 32-byte derived keys; encoded parameters support rehash-on-login.
- Enforced password input bounds before hashing and constant-time hash comparison.
- Added email-first continuation, password sign-in, first-password creation, neutral reset request and reset-completion HTTP endpoints.
- Implemented random opaque session/CSRF values with digest-only database storage and Secure cookies in production.
- Added PostgreSQL-backed auth throttling and generic invalid-credential/proof responses.
- First-password creation consumes and revokes a narrowly scoped pre-auth session transactionally.
- Password reset proof is single-use; completion replaces the active credential, revokes all prior sessions and creates a fresh session in one transaction.
- Reset request enqueues only a user-reference preparation job—never a raw token or email. `AUTH-BE-04` owns challenge generation and email delivery.
- Added password unit tests and live PostgreSQL integration tests covering concurrent creation, correct/wrong sign-in, neutral reset, replay rejection, old-password rejection and session revocation.
- Verification passed: `go test ./...`, `go vet ./...`, `sqlc vet`, migration execution, Docker image build, container health and HTTP smoke tests (`registration`, neutral reset 202, invalid sign-in 401).
- No new third-party module was introduced: Argon2id uses the already-present and approved `golang.org/x/crypto` module.
- `AUTH-BE-03` is complete. Next task is `AUTH-BE-04` OTP and magic links.

## 7 November 2026 — AUTH-BE-04 OTP, magic links and email worker

- Added neutral OTP request and verification endpoints for registration and sign-in.
- OTP codes are generated inside the worker, HMAC-digested with recipient/purpose/generation binding, stored only as digests, limited to five attempts and consumed transactionally once.
- Registration verification creates the user/email identity only after correct OTP consumption and issues a narrowly scoped pre-auth proof requiring password creation.
- Existing accounts receive a full session only when an active password exists; passwordless legacy cases receive pre-auth completion instead.
- Added neutral magic-link request, non-consuming GET inspection and explicit POST confirmation. Link scanners/prefetchers cannot consume a login through GET.
- Magic tokens are 256-bit random values; PostgreSQL stores SHA-256 digests only. Return paths are restricted to safe internal paths.
- Resend generation invalidates prior active OTP/magic challenges. Purpose-bound HMACs prevent registration/sign-in cross-use.
- Added a three-concurrency worker with `FOR UPDATE SKIP LOCKED`, stale-claim recovery, 1/5/15-minute retries, maximum three attempts and bounded 30-second job contexts.
- Worker creates the challenge and sends through SMTP in one short transaction; SMTP failure rolls back the challenge and never creates an authenticated session.
- Added local Mailpit SMTP/Web UI service. Mailpit captures development messages on port 8025; PostgreSQL and application logs still contain no raw code/token.
- Added approved `github.com/wneessen/go-mail` v0.6.2. The latest v0.8.1 requires Go 1.25, so v0.6.2 is the newest selected line compatible with the pinned Go 1.22 runtime.
- Verification passed: API/worker tests and vet, `sqlc vet`, migration/build, live SMTP registration OTP, one-time verification, replay rejection, required password completion, repeated non-consuming magic inspection, one-time magic confirmation and replay rejection.
- `AUTH-BE-04` is complete. Invitation OTP remains disabled at the public endpoint until `AUTH-BE-05` can bind it to an exact invitation.

## 8 November 2026 — AUTH-BE-05 Google OIDC and invitations

- Added Google authorization-code OIDC with PKCE S256, cryptographic state and nonce, an encrypted HttpOnly flow cookie and digest-only database attempt state.
- ID tokens accept RS256 only and validate the Google issuer, configured audience, signature/JWKS key, expiry, nonce, verified email and stable issuer/subject identity.
- Existing exact-email accounts are never silently merged: they receive a short-lived link proof and must confirm the existing password. Already-linked issuer/subject identities sign in directly.
- New Google users receive only a pre-auth session and must create a password before normal application access.
- Added authenticated Google disconnect with CSRF validation and a guard that blocks removal when no non-Google login/recovery method remains.
- Added exact-token invitation inspection, invitation-bound OTP request/verification and full-session/CSRF-protected acceptance.
- Invitation acceptance transactionally rechecks pending/unexpired state, destination email, inviter membership authority, exact server role/outlet scope and Business seat capacity.
- Encoded the approved launch Business allowance as two ordinary staff seats plus one separate accountant seat; the future billing module owns changes to these resolved limits.
- Membership creation is atomic and retry-safe. Concurrent accept requests produce one active membership; revoked invitations and exhausted seat capacity grant none.
- Added approved `github.com/golang-jwt/jwt/v5` v5.2.1 for signed ID-token parsing and validation.
- Migration `000005_google_and_invitation_auth.sql` applied successfully. Containerized `go test -count=1 ./...`, `go vet ./...`, `sqlc vet`, API image rebuild, liveness and PostgreSQL readiness all pass.
- Production Google client ID, client secret and redirect URL remain intentionally unset until deployment credentials are supplied.
- `AUTH-BE-05` is complete. Next backend task is `AUTH-BE-06` sessions and onboarding API.

