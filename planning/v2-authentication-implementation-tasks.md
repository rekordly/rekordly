# Rekordly v2 Authentication Implementation Tasks

**Status:** Ready for development  
**Approved blueprint scope:** documents 00 and 01  
**Primary reference:** `planning/v2-system-blueprint/01-registration-authentication-and-onboarding.md`  
**Supporting references:** blueprint documents 00, 02, 14, 15, 16, 18 and 19  
**Execution order:** authentication backend/database first, then authentication frontend, then end-to-end verification  
**Task-round limit:** 10 actionable tasks

## 1. Selected authentication experience

### Existing verified email

After email submission, show:

- password field and `Sign in` button;
- `Forgot password?`;
- divider labelled `or`;
- sign in with email OTP;
- sign in with magic link;
- continue with Google.

### New email

1. Send registration OTP.
2. Verify OTP.
3. Create user and verified email identity.
4. Require password and password confirmation.
5. Store Argon2id hash.
6. Create authenticated session.
7. Continue role/space onboarding.

### First Google sign-in

1. Verify Google OIDC authorization response and verified email.
2. If it is a new identity, create the account.
3. Require password creation before normal onboarding/application entry.
4. If the email belongs to an existing but unlinked account, require password/OTP/magic-link proof before linking Google.

### Invited new member

1. Open valid invitation.
2. Verify the invited email by OTP.
3. Create account and password.
4. Create session.
5. Show exact Business, role and outlet scope.
6. Accept invitation atomically.

Existing invitees can authenticate by password, OTP, magic link or already linked Google identity.

## 2. Architectural execution note

The repository constitution requires vertical slices. “Backend first, then frontend” therefore means:

1. finish the database and Go API foundation for this authentication slice;
2. immediately build the corresponding Next.js authentication UI;
3. prove the complete slice end to end;
4. only then begin another product module.

It does not mean building every Rekordly backend module before any frontend work.

## 3. Existing implementation assets to reuse

The repository already contains:

- `implementation/api/Dockerfile`;
- `implementation/docker-compose.yml` with PostgreSQL, API, worker and web services;
- `implementation/api/go.mod` and initial Go API structure;
- `implementation/worker/` Go scaffold;
- `implementation/web/` Next.js scaffold;
- `implementation/.env.local.example`.

Development MUST inspect and improve these files rather than creating a competing backend or Compose stack. Local services must never point to Neon staging/production.

## 4. Round-one task board

| Order | ID | Area | Task | Depends on | Beta blocker |
|---:|---|---|---|---|---:|
| 1 | AUTH-BE-01 | Docker/foundation | Validate and harden local PostgreSQL + Go API Compose workflow | Approved docs | Yes |
| 2 | AUTH-BE-02 | Database | Add authentication, identity, challenge, session and onboarding migrations | AUTH-BE-01 | Yes |
| 3 | AUTH-BE-03 | Password | Implement password creation, sign-in and reset | AUTH-BE-02 | Yes |
| 4 | AUTH-BE-04 | Email methods | Implement OTP and magic-link registration/sign-in | AUTH-BE-02 | Yes |
| 5 | AUTH-BE-05 | Social/invitations | Implement Google OIDC, secure identity linking and invitation authentication | AUTH-BE-03, AUTH-BE-04 | Yes |
| 6 | AUTH-BE-06 | Sessions/onboarding | Implement sessions, current user and idempotent initial workspace creation | AUTH-BE-03–05 | Yes |
| 7 | AUTH-FE-01 | Frontend auth | Build email-first, password, OTP, magic-link, Google and reset screens | AUTH-BE-03–06 | Yes |
| 8 | AUTH-FE-02 | Frontend onboarding/shell | Build password creation, role/space setup and the verified authenticated app shell | AUTH-FE-01 | Yes |
| 9 | AUTH-FE-03 | Frontend invitations/session | Build invitation acceptance, return routing and session management UI | AUTH-FE-01, AUTH-BE-05–06 | Yes |
| 10 | AUTH-E2E-01 | Verification | Prove the full authentication/onboarding slice in Docker | AUTH-BE-01–06, AUTH-FE-01–03 | Yes |

## 5. AUTH-BE-01 — Docker and backend foundation

### Outcome

One documented command starts a safe local PostgreSQL database and Go API; the API waits for database health, validates configuration and exposes liveness/readiness.

### Work

- Inspect and retain `implementation/docker-compose.yml` and `implementation/api/Dockerfile`.
- Pin an approved PostgreSQL image and keep a named local-only volume.
- Keep local-only database credentials in `.env.local` generated from the example; never commit the real file.
- Ensure API `DATABASE_URL` uses the Compose hostname, not `localhost` inside the container and never a Neon production URL.
- Add/verify PostgreSQL health check and API startup dependency.
- Add API liveness and database/schema readiness endpoints.
- Add graceful shutdown, HTTP timeouts and a small explicit `pgxpool` limit.
- Add automated migration command/container or Make target used before API readiness.
- Document commands for clean start, normal stop, log inspection and explicit local-volume reset.
- Preserve the separate worker/web services even if only database/API are started for early backend work.

### Acceptance

- `docker compose up --build rekordly-postgres rekordly-api` starts from a clean checkout plus local env file.
- PostgreSQL becomes healthy before API readiness.
- Readiness fails when database/schema is unavailable; liveness remains meaningful.
- Container runs as non-root in final stage.
- Ctrl+C/stop drains API and closes the pool.
- Local config contains an environment guard that rejects known staging/production database hosts.
- No secrets are committed or printed.

## 6. AUTH-BE-02 — Authentication database schema

### Required migrations

- `users`;
- `auth_identities` for email and Google subject identities;
- `password_credentials`;
- `otp_challenges` with typed purpose;
- `magic_link_challenges`;
- `oauth_login_attempts`;
- `sessions` and session-family/rotation fields;
- onboarding progress/preferences;
- workspaces, memberships, roles and invitation records needed by the approved flow;
- audit events and minimal transactional outbox/job records required for authentication email/security delivery;
- idempotency records for workspace creation and relevant auth completion commands.

### Required constraints

- normalized email identity uniqueness under the approved policy;
- unique active Google issuer/subject link;
- at most one active password credential per user;
- hashed/digest fields only for OTP, magic links, reset/session secrets and invitation tokens;
- challenge purpose/state/expiry constraints;
- one Personal workspace per entitled owner where selected;
- membership and owner uniqueness rules;
- timestamps stored in UTC-capable types;
- no plaintext password/code/token columns.

### Queries/repositories

Use `pgxpool`, explicit SQL and `sqlc` according to repository rules. Authentication use cases own transactions; HTTP handlers do not compose financial/workspace SQL manually.

### Acceptance

- Empty database migrates forward successfully.
- Migration rerun does not recreate or corrupt schema.
- Constraint tests prevent duplicate email identity, Google subject and workspace creation races.
- Schema contains no plaintext credential fields.
- Down/forward recovery policy is documented; production data migrations do not depend on manual row editing.

### Migration recovery policy

- Applied migrations are immutable and checksum-verified.
- Production uses forward-only corrective migrations; an applied migration file is never edited.
- Before a destructive or high-volume migration, take and verify a restorable managed-database backup and rehearse the forward correction on a production-shaped copy.
- Application rollout must remain compatible with both the old and new schema during expand/contract changes.
- Rollback means reverting application code while preserving compatible expanded schema, then applying a reviewed forward correction. It never means manually editing production rows or deleting a recorded migration.

## 7. AUTH-BE-03 — Password authentication

### Endpoints/use cases

- email-first account-state continuation;
- password sign-in;
- first password creation through a narrowly scoped verified pre-auth context;
- neutral password-reset request;
- reset completion;
- password change from authenticated settings may be scaffolded but belongs to the security/settings slice if not required now.

### Security contract

- Argon2id with reviewed launch parameters and encoded algorithm parameters;
- maximum password bytes before hashing plus approved minimum policy;
- constant-time verifier behaviour through the password library;
- generic invalid-credential errors;
- rate limits/risk counters;
- no password in logs, analytics, error details or jobs;
- reset token/OTP single-use and short-lived;
- reset revokes other sessions and creates a fresh session;
- rehash-on-login when parameters are obsolete.

### Acceptance

- New verified user creates a password once and can sign in.
- Wrong password produces no session and no hash/account detail.
- Concurrent password creation cannot create two active credentials.
- Reset request does not disclose account existence.
- Expired/replayed reset proof cannot change password.
- Successful reset invalidates the old password and other sessions.

## 8. AUTH-BE-04 — OTP and magic links

### OTP

- purposes: registration, sign-in, invitation, password reset and contact change;
- hashed code, expiry, attempts, resend generation and single-use consumption;
- neutral request response;
- bounded outbox/email job;
- concurrent verify consumes once;
- one purpose cannot authenticate another purpose.

### Magic link

- high-entropy hashed token;
- short expiry, generation and single-use consumption;
- safe allowlisted `return_to`;
- scanner/prefetch mitigation through a confirmation/intermediate exchange design;
- token redaction from logs, analytics and referrer leakage;
- passwordless existing user proceeds to required password creation.

### Acceptance

- New email registration OTP creates one verified user only after success.
- Existing user OTP/magic link signs into the same account.
- Older resend generation cannot be replayed.
- Magic-link scanner/prefetch cannot consume the login irreversibly for the user.
- Lost response/retry produces one session/result under idempotency/session rules.
- Email-provider failure never creates an authenticated session.

## 9. AUTH-BE-05 — Google OIDC and invitations

### Google

- authorization code flow with PKCE;
- state and nonce generation/verification;
- issuer, audience, signature, expiry and verified-email checks;
- unique issuer/subject identity;
- new account creation followed by password creation;
- existing exact-email account requires password/OTP/magic proof before link;
- already linked identity signs in directly;
- disconnect blocked if it removes the final login/recovery method.

Initial social scope is Google. Additional providers require a new approved adapter/task.

### Invitations

- hashed, expiring, revocable token;
- invitation stores exact Business, role, outlet scope and destination policy;
- new member verifies invited email, creates password and session;
- existing member authenticates through an approved method;
- acceptance rechecks inviter authority, invitation state and seat entitlement;
- membership creation is atomic/idempotent;
- invited member does not create a separate Business.

### Acceptance

- Invalid OIDC state/nonce/issuer/audience/signature/expiry/email-verification fails.
- Matching email never silently merges accounts.
- New Google account cannot enter normal app before creating a password.
- Replayed/revoked/expired invite cannot grant membership.
- Two concurrent accept requests create one membership.
- Invitation never grants more role/outlet access than its server record.

## 10. AUTH-BE-06 — Sessions and onboarding API

### Sessions

- Secure, HttpOnly production cookie strategy with correct SameSite/CSRF/CORS for separate frontend/API origins;
- short-lived session/access proof plus rotating refresh/session family;
- safe concurrent-tab refresh grace;
- refresh replay family protection;
- current logout, logout all and revoke selected session;
- current user/session/workspace query;
- security events and outbox notifications for sensitive changes.

### Onboarding

- resumable versioned preferences;
- role/use-case choice;
- Personal, Business or both selection;
- validated Personal/Business basics;
- atomic idempotent workspace, owner membership, safe defaults, audit and outbox creation;
- no financial opening values created implicitly;
- safe invitation/guest/protected route return resolution.

### Acceptance

- Every authentication method produces the same canonical session/user contract.
- Revoked session immediately fails protected API access.
- Refresh replay triggers configured family protection without breaking normal concurrent tabs.
- Two initial-workspace commands cannot duplicate workspaces.
- Failure creating defaults rolls back workspace and membership.
- Personal and Business ledgers remain separate; Business member sees no owner Personal space.

## 11. AUTH-FE-01 — Authentication frontend

### Pages/states

- welcome/auth entry;
- email-first form;
- existing-account password form with `or` alternatives;
- registration/sign-in OTP form;
- magic-link requested and confirmation/expired screens;
- Google redirect/callback/loading/link-account states;
- forgot/reset/create password forms;
- offline/provider/rate-limit/session-error states.

### Frontend rules

- React Hook Form and Zod v4 schemas;
- accessible labels, descriptions, error association and keyboard flow;
- password-manager/autocomplete attributes;
- show/hide does not destroy value/focus;
- OTP paste works;
- no auth token in local storage;
- no full email/token/password in analytics/logging;
- preserve only allowlisted return context;
- responsive HeroUI v3/shadcn-style composition according to the approved design system decision.

### Acceptance

- Existing email shows password plus OTP/magic/Google choices.
- New email goes to OTP, then password creation.
- Every loading/error/resend/cooldown state is explicit.
- Small mobile and keyboard/screen-reader flow retains all required actions.

## 12. AUTH-FE-02 — Password creation, onboarding and verified app shell

### Pages

- required password creation after new OTP, Google or invitation account;
- use-case/role selection;
- Personal/Business/both selection;
- Personal setup;
- Business setup;
- atomic creation progress/error/retry;
- first-action checklist.

### Verified app shell

After a full authenticated session exists, render the initial protected shell from blueprint document 02:

- protected route boundary that calls the canonical current-user/session endpoint;
- loading, unauthenticated, onboarding-incomplete and authenticated states;
- Personal/Business space switcher using only authorized workspaces;
- desktop sidebar and responsive mobile navigation foundation;
- top bar with current space, notifications placeholder and profile/session menu;
- Universal Add placeholder gated to approved current capabilities;
- Review/sync/plan status placeholders with honest empty states;
- logout action and redirect to the email-first authentication entry;
- safe preserved return routing after authentication/onboarding;
- no financial dashboard totals invented before their modules exist.

The shell is added only after verification/password completion. A narrowly scoped pre-auth session must never render the authenticated shell.

### Acceptance

- Password requirement/confirmation is understandable and paste/autofill-friendly.
- User cannot accidentally bypass required first password creation.
- Refresh/resume returns to the first incomplete step.
- Retry after committed workspace creation displays original result, not duplicates.
- Defaults contain no invented opening balances/stock/payables.
- Freelancer creates both spaces; Business offers optional Personal; combined view never merges books.
- Verified user with complete onboarding enters the protected app shell.
- Unauthenticated or pre-auth/password-creation session cannot render protected shell data.
- Incomplete onboarding resumes its required step before shell entry.
- Space switcher contains only authorized Personal/Business workspaces and does not merge their data.
- Desktop and small-mobile navigation keep logout, space identity and primary navigation reachable.

## 13. AUTH-FE-03 — Invitations, return context and sessions

### Pages

- invitation valid/expired/revoked/loading;
- invite authentication using existing/new branch;
- exact Business/role/outlet acceptance preview;
- guest/storefront optional account prompt with context preservation;
- session/device list and revoke controls;
- logout/logout-all;
- account-linking proof screen for existing email + Google.

### Acceptance

- Guest document/storefront never forces registration.
- New invitee verifies email, creates password and accepts exact invitation.
- Existing invitee can use every approved method.
- Removed/revoked session returns to safe sign-in without leaking prior workspace.
- Unsafe external `return_to` is rejected.
- Google linking clearly requires existing-account proof.

## 14. AUTH-E2E-01 — Docker end-to-end verification

Run using the local Compose stack and real PostgreSQL transactions.

### Required automated journeys

1. New email → OTP → password → Personal onboarding → session → logout/login.
2. Existing user → password sign-in.
3. Existing user → OTP sign-in.
4. Existing user → magic-link sign-in.
5. New Google user → password creation → onboarding.
6. Existing email → Google attempt → existing-method proof → linked Google sign-in.
7. New invitation → OTP → password → exact membership acceptance.
8. Existing invitation → password/OTP/magic/linked-Google acceptance.
9. Forgot/reset password → other sessions revoked → new password works.
10. Session refresh/replay/revoke/logout-all.

### Required negative/concurrency evidence

- account/workspace IDOR;
- OTP/reset/magic/invitation replay and expiry;
- password brute/rate controls;
- invalid OIDC state/nonce/claims;
- duplicate email/Google identity races;
- concurrent OTP verification;
- concurrent workspace creation/invitation acceptance;
- CSRF/CORS/cookie protections;
- logs/analytics contain no credentials/tokens/full sensitive values;
- mobile/keyboard/accessibility smoke.

### Definition of done

- All authentication G0/G1 tests from blueprint documents 01 and 19 pass.
- Docker start/migrate/test instructions work from a clean local state.
- API, database and frontend tests pass.
- No secrets are committed.
- Worklog and evaluation record implementation decisions, test output and remaining provider credentials/configuration.

## 15. Deferred from this task round

- SMS authentication;
- passkeys/WebAuthn UI;
- authenticator-app MFA;
- Apple/Facebook/Microsoft social login;
- mandatory KYC;
- production email/Google/Render/Neon account activation;
- non-authentication finance modules.

The database/session model should remain extensible for future MFA/passkeys without pretending those features already exist.

## 16. Development start command

Start with `AUTH-BE-01`, inspect the existing implementation scaffold, and make the smallest verified changes needed. Do not replace the existing Go API, Next.js app or Compose topology unless a proven blocker is recorded and explicitly approved.

## 17. Implementation progress

| Task | Status | Evidence / remaining gate |
|---|---|---|
| `AUTH-BE-01` | Complete and verified | PostgreSQL pool, embedded migration runner, migration service, API readiness/liveness, bounded configuration and container health check are present. Compose validation, containerized `go test ./...`, `go vet ./...`, image builds, live migration, repeat migration, liveness and readiness all pass. |
| `AUTH-BE-02` | Complete and verified | Authentication/workspace migration, generated `sqlc` models/queries, forward-only recovery policy and live PostgreSQL constraint/race tests pass. |
| `AUTH-BE-03` | Complete and verified | Argon2id password creation/sign-in/reset, opaque session issuance, neutral reset preparation, rate limits, HTTP endpoints and live PostgreSQL lifecycle/concurrency tests pass. Reset email challenge generation/delivery is completed by `AUTH-BE-04`. |
| `AUTH-BE-04` | Complete and verified | Registration/sign-in OTP, magic-link request/inspect/confirm, resend generation invalidation, pre-auth issuance, bounded worker retries, SMTP delivery and Mailpit end-to-end tests pass. Invitation-purpose completion remains correctly owned by `AUTH-BE-05`. |
| `AUTH-BE-05` | Complete and verified | Google authorization-code OIDC with PKCE/state/nonce and signed claim validation, explicit existing-account linking proof, guarded disconnect, exact invitation authentication/acceptance and transactional staff/accountant seat enforcement pass unit and live PostgreSQL tests. Real Google credentials remain an external deployment configuration gate, not an implementation gap. |
| `AUTH-BE-06` to `AUTH-E2E-01` | Not started | Session lifecycle and onboarding API are next; frontend authentication work remains delegated in its separate branch/worktree. |

