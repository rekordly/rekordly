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

## 8 November 2026 — AUTH-BE-06 sessions and onboarding API

- Added a 24-hour opaque full-session lifecycle with transactional rotation inside one session family; only SHA-256 token/CSRF digests are stored.
- A ten-second concurrent-tab grace returns a safe retry conflict without storing replacement raw tokens. Reuse after grace revokes the entire family, writes an audit event and queues a security notice.
- Added refresh, current logout, logout-all, active-session listing and owner-scoped selected-session revocation endpoints with cookie/header CSRF protection.
- Logout-all and selected-session revocation create audit evidence; logout-all queues a security notification through the worker.
- Added canonical `GET /api/v1/me` returning safe user/session/onboarding data and membership-scoped authorized workspaces only—never balances or invented dashboard data.
- Membership joins enforce the privacy boundary: an invited Business member does not receive the owner’s Personal workspace.
- Added resumable, versioned onboarding preferences for personal, freelancer, small-business and general-business use cases plus Personal/Business/both selection.
- Added validated Personal/Business basics: name, ISO currency, IANA timezone, Business type and two-letter country code.
- Initial workspace creation locks the user, digests the idempotency key/request, replays completed results safely, rejects key mismatch and creates workspace/Owner role/membership atomically.
- Personal and Business spaces remain separate. Creation writes no opening balance, stock, receivable, payable, loan, asset or other invented financial record.
- Onboarding completion, audit event, welcome/checklist outbox job and idempotency completion are committed in the same transaction; a forced outbox failure test proves complete rollback.
- Worker now delivers onboarding, session-replay and all-session-revoked notices without secrets in outbox payloads.
- Migration `000006_sessions_and_onboarding.sql` stores Business type/country configuration and applied successfully; repeat migration is safe.
- Verification passed: live PostgreSQL `go test -count=1 ./...`, API and worker `go vet ./...`, `sqlc generate/vet`, migration replay, Docker rebuild and HTTP 200 liveness/readiness.
- `AUTH-BE-06` is complete. All backend authentication tasks are complete; frontend integration and final E2E remain.

## 8 November 2026 — Frontend session and route-access foundation

- Added a cookie-aware shared session API using the existing Axios client and authoritative `GET /api/v1/me` endpoint.
- Added Zod boundary validation for current-user, session and workspace payloads; inferred frontend types come from the schemas.
- Added an in-memory Zustand session store. No session token or sensitive proof is persisted in browser storage.
- Added a TanStack Query session query with bounded retry and explicit authenticated, unauthenticated and restoration states.
- Added guest and protected route guards. Protected routes preserve a sanitized `return_to`; authenticated users visiting auth pages return to onboarding or their intended application route.
- Added permission primitives, a dedicated 403 state, a protected application shell and `/dashboard` route.
- Added a global 404 page for unknown routes.
- Verification passed: ESLint, TypeScript, 21 authentication/session tests and the Next.js production build.
- Runtime browser validation with the live Go API remains part of final frontend/backend E2E.



## 9 November 2026 — Web restructure onto the kero-admin architecture

- Rebuilt `globals.css` on kero-admin's primitive/semantic token structure and neutral backgrounds, keeping Rekordly green `#009e10`, orange `#fa8901` and Figtree/Sora/Fira Code.
- Replaced the Rekordly UI wrappers with the kero UI kit (`AppButton`, `AppInput`, `AppSelect`, `AppTextarea`, `AppModal`, `AppRowActions`, `DashboardCard`, `page.tsx` primitives, `MoneyInput`) and the kero shell (sidebar, topbar, command menu, network banner).
- Deliberate departures from kero: no profile in localStorage, no bearer token in JavaScript, money stays a string, no `sonner` (HeroUI toast used because `sonner` is not in doc 13).
- Session: memory-only auth store, single-flight cross-tab rotation before expiry, idle limit, cross-tab sign-out, full reload on sign-out, tenant cache purge when a session ends or the user changes.
- Workspace: selection bound to the user id and validated against `/me`; permissions come only from the workspace in view (previously owner of any workspace unlocked all).
- API: added `X-Workspace-ID` to CORS allowed headers (browser preflight was rejecting every workspace-scoped call).
- Verification passed: ESLint, TypeScript, 41 tests, Next.js production build, and a browser run against the local Docker API (sign-in, record, workspace isolation, void, revoked session, rotation, sign-out, light/dark, 375px).
- Deferred, needs a backend decision: `rekordly_csrf` is host-only on the API domain so production JS cannot read it; finance writes do not check CSRF; `X-Workspace-ID` is client-supplied (membership-checked) versus AGENT_RULES 2.2; `/me` sends no per-workspace permissions for staff.

- 9 November 2026 follow-up: every page now uses the shared Page layout; sidebar menu is light with a white active item; workspace switching uses HeroUI Select; auth pages use smaller type, the green panel, the official R logo and the Google mark; added magic-link sign-in (with confirm step), sign-in by code, and the registration code entry. Registration now requests its code because /auth/email/continue only classifies the address.

- 9 November 2026 follow-up: reduced src/lib to the kero-admin shape. Auth routes and onboarding API merged into lib/auth.ts; form validation merged into lib/schemas/auth.schemas.ts; sign-in state and actions merged into stores/auth-store.ts; workspace rules into stores/workspace-store.ts; session lifecycle moved to components/providers/session-provider.tsx; feature registry to components/features; tests to web/tests.

- 9 November 2026 follow-up: CSRF. rekordly_csrf stays host-only on the API because the storefront/domain blueprint places storefronts on businessname.rekordly.com; the API now returns the token from sign-in, refresh and GET /me (CORS-limited) and the web app keeps it in memory. Finance writes authenticated by cookie now require a valid X-CSRF-Token (403 CSRF_INVALID), verified against the session digest. Verified with Go tests, 43 web tests and live forged/valid requests against the local API.

- 9 November 2026 follow-up: finance UI on the implemented backend. Ported legacy StatCard and record cards to HeroUI v3, added DataView (table default, cards toggle, phones always cards), FormDrawer, ConfirmDialog (AlertDialog) and recharts charts. Screens wired for dashboard, reports, accounts, categories, contacts, sales, purchases, payments, invoices, wallets, budgets and tax. Added GET /api/v1/reports/summary (SQL aggregates, money as strings) and decimal-string inputs for budgets, invoice tax, wallet payments and opening balances. Google sign-in now completes through /auth/google/callback; no client library, because the server already runs authorization-code with PKCE.

## 10 November 2026 — Blueprint 03 offline draft vertical slice

- Added a per-user, per-workspace IndexedDB queue using the approved `idb` package. It stores only bounded local draft intent and no sessions, CSRF tokens, OTPs or private delivery URLs.
- A Capture form used while offline now saves an explicitly local `offline` draft with stable client-command and idempotency identifiers. It never finalizes a financial record while disconnected.
- Built the Sync screen around the actual local queue: queued, syncing, needs-review, permanent-failure and server-saved states; reconnection/manual sync uploads only a server draft. It intentionally requires a fresh server accounting preview and an explicit online confirmation before posting.
- Closed the server replay gap: a repeated `(workspace_id, client_command_id)` returns the exact original draft only when the normalized intent matches. A changed payload returns `IDEMPOTENCY_CONFLICT`; the unique index covers concurrent tabs.
- Added finance integration coverage for offline command replay, changed-intent rejection and single-row persistence.
- Verification passed: `bun run type-check`, `bun run lint`, `bun test` (44 tests), `bun run build`, `sqlc vet`, `git diff --check`, and containerized `go test -count=1 ./internal/finance`.
- Deferred: the Blueprint 03 Review inbox is still a placeholder; local staged attachment blobs, offline capability/plan manifest, and service-worker/PWA delivery remain gated rather than being misrepresented as supported.

## 10 November 2026 — Blueprint 03 purpose, links and review inbox

- Added a workspace-scoped `GET /money-record-drafts/:id` API route backed by the existing tenant-scoped query. The integration test proves another workspace cannot load the draft.
- Replaced the placeholder Review page with a real inbox for AI-assisted `needs_review` drafts and offline-synced `saved` drafts. Users see the normalized amount and server-calculated accounting preview, then explicitly confirm once; there is no client posting path.
- Added a safe edit handoff from Review to Capture. Capture loads the server draft by ID, preserves an offline origin when it is edited, refreshes the deterministic preview and uses the existing version guard.
- Capture now asks the user to state the economic purpose instead of deriving it silently from direction. Purpose choices are limited by Personal/Business scope and incoming/outgoing direction; counterparty and category requirements change with the selected purpose.
- Replaced free-form document IDs with workspace-scoped Sale, Purchase and Invoice selectors. The backend still validates the typed target under the active workspace before persisting the link.
- Rebuilt only the API/migration containers; migration completion and API health were verified. No database volume or existing data was removed. The Next.js app remains local Bun only.
- Verification passed: `bun run type-check`, `bun run lint`, `bun test` (44 passing), `bun run build`, `git diff --check`, containerized finance tests, API `health/live` (200), plus local Bun `/review` and `/capture` (200).

## 10 November 2026 — Blueprint 03 offline staged evidence

- Offline capture now accepts bounded receipt evidence before a server draft exists. PDF, JPEG, PNG and WebP files are client-checked against the same 10 MB policy the API enforces.
- Each staged binary is an IndexedDB Blob in a separate evidence store, keyed to its local command. The visible queue stores only safe filename/type/size metadata; it never persists a signed upload URL, provider credential, auth cookie, CSRF token or object URL.
- Sync first creates/replays the immutable server draft, then uploads and verifies each private receipt. A queue item becomes `synced` only when every staged receipt is registered; failure keeps the blob for a retry/review and retains the already-created server draft ID to avoid a second draft.
- Each receipt is marked locally registered immediately after the server confirms it, so a later failure in a multi-receipt batch retries only the unfinished files.
- Reopening a server draft now returns its existing link and evidence metadata with the workspace-scoped draft. Capture restores that supporting context after a Review edit handoff without exposing private delivery URLs.
- Runtime check: the local API currently has no `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` or `CLOUDINARY_API_SECRET`. The secure evidence flow is implemented and correctly returns unavailable until all three deployment-owned values are supplied; no credentials were printed or committed.
- Added an integration test proving a draft detail returns its own workspace-scoped links/evidence and that the same draft is unavailable from another workspace.
- The Review inbox now shows the private-evidence count/status and linked-document count next to the server-calculated preview before confirmation; it still shows no provider delivery URL.

## 11 November 2026 — Blueprint 08 inventory costing and PO acknowledgement

- Added migration `000025_inventory_balances_opening_stock.sql`: workspace-scoped inventory locations, explicit weighted-average costing settings, immutable opening-stock entries, location/source-aware movements and transactional inventory balances.
- Goods receipts now resolve a business location, persist the location on the receipt/movement, and atomically increment the product/location quantity and value balance while keeping the existing GRNI posting.
- Added `POST /api/v1/inventory/opening-stock` and `GET /api/v1/inventory/balances`. Opening stock validates stock-tracked products, exact decimal quantity/cost, idempotency and tenant scope, then posts Inventory debit / Opening-equity credit in one transaction.
- Added supplier acknowledgement as a versioned PO command (`issued -> acknowledged`) and allowed acknowledged POs to proceed to receiving. The acknowledgement is operational only and creates no financial effect.
- Replaced the Inventory catalogue placeholder with a real stock-on-hand section and opening-stock drawer; balances show location, quantity, value and weighted-average policy.
- Verification passed: migration applied without deleting the PostgreSQL volume, API health 200, containerized finance integration tests (including opening-stock idempotency/ledger balance), `bun run type-check`, `bun test` (44 passing), production `bun run build`, and `git diff --check`.

## 11 November 2026 — Blueprint 08 supplier returns and direct AP bills

- Added migration `000026_supplier_returns_credits_refunds.sql` for immutable supplier returns, supplier credits, supplier refunds, signed inventory return movements and safe balance decrements.
- A supplier return locks the receipt line and inventory balance, checks eligible quantity and on-hand stock, reduces stock at the original receipt cost, and posts a balanced return journal atomically. Replays are idempotent.
- Added supplier credit notes against approved bills. They reduce Accounts Payable without creating cash or recognizing a second expense.
- Added supplier cash refunds against valid supplier-credit balances and a workspace-owned money account; the credit balance and refund journal commit atomically.
- Added return options/list endpoints and a Procurement Returns tab with a return drawer.
- Added migration `000027_direct_supplier_bills.sql`. Supplier bills can now be receipt-backed or direct expense/service bills with currency, due date, description and account class. Direct approval posts Expense/Asset debit and AP credit; overdue status is derived from due date.
- Verification passed: migrations 000026/000027 applied without deleting PostgreSQL data, API health 200, focused return/direct-bill tests, full containerized finance tests, frontend type-check, 44 Bun tests, production build, and `git diff --check`.

## 11 November 2026 — Blueprint 08 procurement report surface

- Added `GET /api/v1/reports/procurement`, with tenant-scoped server aggregates for open PO commitments, unbilled receipts/GRNI, AP outstanding and overdue balances, and unapplied supplier advances.
- Added a Procurement Reports tab that renders those values from the live API rather than fabricated client totals.
- Rebuilt the API without touching the PostgreSQL volume; migrations through `000027` are applied and the full finance suite remains green.

## 11 November 2026 — Blueprint 08 three-way matching

- Supplier bill matching now derives ordered, received and billed totals from the PO/receipt/bill chain, calculates open-to-bill and variance amounts, and classifies exact, receipt-quantity variance, price/quantity variance, and overbilled states server-side.
- Bills in Procurement now expose a three-way match drawer with the live server projection; direct bills are explicitly shown as direct and do not pretend to have a receipt match.
- Verification passed: API rebuild/health, full containerized finance tests, frontend type-check, 44 Bun tests, production build, and `git diff --check`.
- Added workspace-authorized evidence access: the API returns a five-minute Cloudinary authenticated-download URL only for a verified asset owned by the active workspace. The URL is never stored; Capture and Review request it only when the user presses Open. Local Cloudinary configuration was verified by presence only and the rebuilt API now exposes the route.
- The Capture and Sync UI now disclose staged receipt state and let the user remove a receipt before the local draft is saved. No offline action can confirm or post a financial record.
- Verification passed: frontend type-check, ESLint, 44 Bun tests, production build, `git diff --check`, and local Bun `/capture` HTTP 200.
- Added direct invoice settlement from the invoice screen. A finalised or partly-paid invoice can receive an incoming payment through the existing split-payment drawer; the server locks the invoice, prevents a customer mismatch, duplicate-idempotency settlement and overpayment, then atomically updates its paid amount. Its ledger is debit cash/bank asset and credit Accounts Receivable asset, so payment never recognises revenue a second time. The dedicated integration test covers partial payment, replay and overpayment rejection.
- Added the payment-allocation backbone. `payment_allocations` separates the cash movement from the documents it settles and backfills pre-existing linked payments. A new incoming receipt can atomically allocate across multiple invoices for one customer: deterministic invoice locks, exact allocation-total validation, overpayment protection and transaction rollback prevent partial or cross-customer settlement. The service returns allocations with payment detail; the multi-invoice integration test passes against the configured database.
- Added the Payments-page allocation drawer: choose a customer and receiving account, enter the receipt, auto-allocate oldest due invoices or set each amount manually, then confirm only when the full receipt is allocated. The client uses decimal strings and bigint only for display/suggestions; the API revalidates current invoice balances, customer, currency and totals inside its transaction.
- Fixed a Zod v4 startup failure in the capture flow: `moneyRecordDraftSchema` now uses `safeExtend()` because its base money schema already has a transfer cross-field refinement. Direct module loading, type-check, lint, 44 frontend tests and local protected-route checks pass.
- Corrected the misleading Capture product language and navigation. Capture is now labelled Guided record: a manual draft-and-preview workflow for evidence, links, mixed expenses and explicit confirmation; it does not claim to parse natural-language purchases until a real AI parser exists. Guided record, Review drafts and Offline drafts are in Personal and Business navigation. Add actions now use static prop-driven routes (`/transactions/new/income`, `/expense`, `/transfer`), while draft editing uses `/capture/drafts/:draftId`; UI state is no longer carried in those query strings.

## 10 November 2026 — Preview resilience and in-place record creation

- Fixed the Capture preview crash caused by an older API response serializing an empty `warnings` slice as `null`. The Go contract now emits `[]` for empty preview collections, the client normalizes legacy responses at the API boundary, and both preview surfaces retain a defensive array guard.
- Rebuilt the API/migration images without removing the PostgreSQL volume. The replacement API container is healthy at `/health/live`.
- Consolidated the normal money-entry experience into one app-shell drawer. The Add menu and command menu open income, expense or transfer in place, preserve the current page/filter state, and do not use a `/new`, `/capture`, or query-string route to carry UI state.
- Activity is now the user-facing name for the cash-movement list. A payment remains a contextual settlement of an existing sale, purchase or invoice; it is not a second generic way to add cash. Sales, invoices and contacts continue to use drawers opened from their own list pages.
- Removed Guided record, Review drafts and Offline drafts from the primary navigation. Their underlying review/offline workflows remain available for existing drafts, but they no longer compete with the normal add-record journey.
- Verification passed: TypeScript, ESLint, 44 Bun tests, `git diff --check`, production build completion, and API health (200).

## 10 November 2026 — Unified records and category initialization

- Replaced the ambiguous Activity label with Records. Income, Expense and Transfer are now the same terms in Personal and Business spaces; workspace kind changes the books they affect, not the meaning of the action.
- Confirmed the empty category selector was a real backend wiring gap: default categories existed but were never initialized for a workspace. The category endpoint now performs an idempotent first-use initialization and only returns categories valid for the active Personal or Business workspace.
- Business defaults include Sales Revenue, Service Revenue and Other Income; Personal defaults include Salary / Wage and Other Income. Shared and space-appropriate expense defaults are supplied for each workspace; no personal-only category appears in a business selector, or vice versa.

## 10 November 2026 — Blueprint 07 catalogue foundation

- Replaced the Inventory placeholder with a real, Business-only Products & services page. It lists saved catalogue items, supports local search and opens an in-place drawer to add an item without losing the current page state.
- Added an immutable-migration catalogue model: workspace-scoped products and default variants; unique SKU/barcode rules per workspace; indexed cursor-capable list queries; prices stored as `BIGINT` minor units with an ISO currency/exponent snapshot.
- The API accepts ordinary decimal strings, parses them with the existing exact minor-unit parser, requires an idempotency key for creation and returns the original item on a retry. The integration test proves exact NGN conversion, idempotent retry and tenant isolation.
- Catalogue creation deliberately has no quantity, valuation, stock movement, ledger or sale/purchase side effect. A stock-tracked product is an item prepared for the later opening-stock/movement workflow, not a claim that stock is already active.
- Verification passed: generated SQLC code, Docker migration/API rebuild without removing PostgreSQL data, API health (200), containerized `TestCatalogue` integration tests, `bun run build`, `bun test` (44 passing), and `git diff --check`.

## 10 November 2026 — Blueprint 08 purchase-request foundation

- Added a Business-only Procurement page for creating multi-line purchase-request drafts, selecting an existing supplier/catalogue item where useful, submitting the frozen version and approving it as an owner.
- Added workspace-scoped request, line and command-idempotency tables. Quantities use PostgreSQL `NUMERIC(18,4)` and the already-declared `shopspring/decimal` SQLC mapping; money remains exact `BIGINT` minor units.
- A request’s server-calculated estimate is rounded deterministically to the currency minor unit. Creation, submit and approval use idempotency keys and optimistic document versions; the integration test covers retry, changed-payload rejection, state transitions and cross-workspace rejection.
- Request creation/submission/approval intentionally has no stock, GL, payable, expense, cash, supplier message or PO effect. It is operational approval groundwork only.

- Purchase-order follow-up: Procurement now lets a user create a PO draft from an approved request and view it on its own Purchase orders tab. The API snapshots approved request lines and supports draft/submitted/approved/issued state transitions with an atomic number at issue; receiving, supplier sending and all posting effects remain unavailable.
- Purchase-order lifecycle completion: submit, approve and issue now require a workspace-scoped idempotency key and expected document version. Replays return the current PO without advancing it twice; a key reused for another PO/command/version is rejected. Issuing assigns one atomic, non-reused `PO-######` number and still creates no stock, payable, expense, cash or ledger posting. The Procurement UI exposes only the valid next action for an owner and refreshes the real list after each command.
- Goods-receipt foundation: issued POs now expose their open line quantities in an in-place receipt drawer. Posting accepted quantities locks the PO, rejects over-receipt, inserts immutable receipt lines and stock movements for stock-tracked items, updates the PO receipt status, and creates a balanced Inventory/GRNI (or expense/GRNI) entry in the same transaction. It remains deliberately separate from supplier billing and payment.
- Supplier-bill/AP foundation: Procurement now lists posted receipts and lets a user create a supplier-bill draft from one. Approval is versioned/idempotent and posts a balanced GRNI debit / Accounts Payable credit. Bills and receipt records are visible in their own Procurement tabs; this slice does not imply payment or stock creation from a bill.

## Blueprint 08 request decisions, supplier settlements and advances — 11 November 2026

- Purchase requests now carry a server-validated priority and have an append-only, workspace-scoped decision timeline. Owners can request changes or reject with a required reason; a changed request can be resubmitted as a new version. This remains non-posting. The Procurement UI exposes priority and reasoned decision drawers instead of irreversible one-click actions.
- Approved supplier bills can now be settled by a partial or multi-bill outgoing payment. The transaction locks and validates every bill, prevents over-settlement, and posts debit AP / credit cash rather than recognizing expense again.
- Added supplier advances as a distinct asset subledger. Creation posts debit Supplier Advances / credit cash once; applying an advance to an approved bill locks both documents, reduces AP and the advance balance atomically, and posts debit AP / credit Supplier Advances with no second cash movement. Both creation and application are idempotent and version guarded.
- Verification: migrations `000022` and `000023` applied without deleting the PostgreSQL volume; API health is 200; all containerized finance integration tests pass; frontend type-check and 44 Bun tests pass; `git diff --check` passes. A fresh production web build was not run because the user’s existing Next development server holds Next’s build lock.
## 11 November 2026 — Blueprint 08 supplier resolution and PO detail

- Added direct supplier-bill creation in the procurement UI for expense/service bills, including due-date and overdue display.
- Extended supplier-credit resolution to support credits created from a posted supplier return, with a return-balance cap.
- Added atomic supplier-advance refunds with idempotent cash-receipt posting and preserved minor-unit accounting.
- Added purchase-order detail endpoint and frontend drawer with immutable lines and event timeline.
- Verification: API finance tests pass; frontend type-check and all 44 Bun tests pass.

## 11 November 2026 — Blueprint 08 procurement controls and evidence

- Added workspace approval-policy storage and endpoints for amount thresholds and self-approval policy; high-value approvals require an owner when configured.
- Added tenant-validated procurement attachment metadata for requests, purchase orders, receipts and supplier bills.
- Reasserted supplier return/credit/refund ledger source types after later inventory migrations had narrowed the ledger constraint.
- Verification: full finance Go suite, API health check, frontend type-check, 44 Bun tests and production web build pass.

## 11 November 2026 — Blueprint 08 receipt identity and ordered-versus-received reporting

- Added a workspace-unique supplier delivery reference constraint and normalized receipt references before posting.
- Procurement reports now expose ordered and accepted value totals for open commitments, alongside GRNI/AP/advance balances.
- Verification: migration/API rebuild preserved data, health returned 200, full finance tests and frontend checks passed.

## 11 November 2026 — Blueprint 08 inventory adjustments and transfers

- Added atomic, idempotent stock adjustments with reason codes, weighted-average valuation, signed immutable movements and balanced inventory/offset ledger entries.
- Added atomic location-to-location stock transfers at current weighted-average cost, with paired immutable movements and on-hand guards.
- Added Inventory UI drawers and API actions for adjustments and transfers.
- Verification: migration `000036_inventory_adjustments_transfers.sql` applied without deleting data; focused integration test, frontend type-check and 44 tests passed.

## 11 November 2026 — Blueprint 08 physical stock counts

- Added idempotent physical stock counts with expected-versus-counted quantities, variance movements, weighted-average valuation and balanced ledger offsets.
- Added the Inventory count drawer and API route.
- Migration `000037_stock_counts.sql` is included for fresh deployments; focused inventory and frontend type checks pass.
### Blueprint 08 — supplier PO sharing (2026-11-11)

- Added expiring, hashed-token supplier share links for issued purchase orders.
- Added public read/respond endpoints for acknowledgement, decline, and change requests; tokens are single-purpose, tenant-scoped, and cannot be reused after expiry/revocation.
- Added owner-facing procurement action and link drawer in the web app.
- Migration `000038_purchase_order_shares.sql` applied successfully without deleting existing data.
- API image rebuilt and health check returned 200; Go finance tests and web type-check/Bun tests pass.

## 11 November 2026 — Blueprint 07 Catalogue, Inventory and Outlets Completion

- Completed all missing Blueprint 07 parts across backend and frontend:
  1. Outlets & Locations: Multi-outlet support (`outlets` table) with `is_default`, `code`, `address`, and location-to-outlet hierarchy (`inventory_locations.outlet_id`). Full tenant-scoped CRUD endpoints (`GET /inventory/locations`, `POST /inventory/locations`, `PATCH /inventory/locations/:id`).
  2. Product Options & Variant Matrix: `product_options`, `product_option_values`, and `product_variants` matrix with SKU, barcode, price_minor, cost_minor, options_combination jsonb. Full tenant-scoped CRUD endpoints (`GET/POST /catalogue/options`, `GET/POST /catalogue/variants`).
  3. 4-State Quantity Model & Stock Reservations: Extended `inventory_balances` with `reserved_quantity`, `available_quantity` (on-hand - reserved), and `in_transit_quantity`. Full `stock_reservations` lifecycle (`reserve`, `release`, `consume`) with over-reservation guards and expiry. Endpoints: `GET/POST /inventory/reservations`, `POST /inventory/reservations/:id/release`.
  4. Sales Stock Issue & COGS Recognition: `POST /inventory/issue-sale` calculates moving weighted-average cost, atomically decrements stock, consumes reservations if applicable, and writes balanced double-entry ledger postings (debit 5000 COGS / credit 1200 Inventory Asset).
  5. Outlet Transfers: Multi-outlet stock transfers (`stock_transfers`, `stock_transfer_lines`) with draft -> dispatched -> received/cancelled lifecycle, in-transit quantity tracking, and ledger postings for transfer variances. Endpoints: `GET/POST /inventory/transfers`, `POST /inventory/transfers/:id/dispatch`, `POST /inventory/transfers/:id/receive`, `POST /inventory/transfers/:id/cancel`.
  6. Stock Counts & Audits: Physical stock counts (`stock_counts`, `stock_count_lines`) with draft -> in_progress -> completed -> reconciled workflow, expected vs counted variance tracking, and automatic balanced variance ledger postings (shrinkage / gain). Endpoints: `GET/POST /inventory/counts`, `POST /inventory/counts/:id/reconcile`.
  7. Stock Adjustments & Damage Write-Offs: Reason-coded stock write-offs (`stock_adjustments`, `stock_adjustment_lines` for damage, shrinkage, spoilage, internal use, correction) with weighted-average cost valuation and balanced ledger postings (debit 5050 Shrinkage / credit 1200 Inventory Asset). Endpoints: `GET/POST /inventory/adjustments`.
  8. Comprehensive 7-Tab Frontend: Replaced the single-tab inventory page with a fully responsive 7-tab interface (`balances`, `catalogue`, `outlets`, `transfers`, `counts`, `adjustments`, `reservations`) using HeroUI v3 wrappers, Phosphor duotone icons, Rekordly green (#009e10) and orange (#fa8901) accents, Sora/Figtree typography, and 10 interactive drawers.
- Added comprehensive unit tests in `implementation/web/tests/inventory.test.ts` (8 passing test cases).
- Verification: Dockerized Go test suite passed (all auth, config, database, finance, server packages green), `go vet ./...` passed with zero errors, `bun test` passed (52/52 tests green across all test files), `bun run type-check` passed (0 errors), `bun run build` compiled 45/45 static pages in Next.js 16.4.5 with Turbopack, and ESLint passed with 0 errors.

## 11 November 2026 — Blueprints 01–06 Full Completion & Verification

- Completed all missing and partial features across Blueprints 01 through 06 adhering to user design system requirements:
  1. Selection Primitives & Multi-Step Drawers (`planning/design-system-selection-components.md`):
     - Created `AppComboBox` (`components/ui/app-combo-box.tsx`): HeroUI v3 combobox with inline `<Input>` visible at rest, immediate typing, custom item typing (`allowsCustomValue`), and on-the-fly customer/supplier creation without pre-registering.
     - Created `AppAutocomplete` (`components/ui/app-autocomplete.tsx`): HeroUI v3 autocomplete with `<Select>` button trigger at rest, popover with search field, and strict list selection for countries, bank accounts, and categories.
     - Created `AppPickerSheet` (`components/ui/app-picker-sheet.tsx`): HeroUI v3 mobile-first bottom sheet picker (Professions Picker pattern) with search and category filter chips.
     - Refactored `invoices-page.tsx` and `trade-page.tsx` (`sales`, `purchases`) into clean multi-step drawer wizards (Items & Pricing -> Customer & Info -> Summary & Review), eliminating overly long single-page scrolling forms.
  2. Blueprint 06 Estimates & Quotations Engine:
     - Migration `000040_estimates_and_quotations.sql`: Created `estimates` and `estimate_items` tables with integer minor units, currency exponents, status lifecycle (`draft`, `sent`, `accepted`, `declined`, `expired`, `converted`), and tenant indexes.
     - SQLC queries and Go models in `internal/db/finance_estimates.sql.go`.
     - Go service (`internal/finance/estimate_service.go`) and handlers (`internal/finance/estimate_handler.go`) with endpoints `GET/POST /estimates`, `GET /estimates/:id`, `PATCH /estimates/:id/status`, and atomic invoice conversion `POST /estimates/:id/convert-to-invoice`.
     - Frontend UI in `invoices-page.tsx`: Invoices & Quotations tab switcher, 3-step quotation drawer, status actions (Send, Accept, Decline), and atomic "Convert to Invoice" button.
  3. Blueprint 05 & 06 Public Guest Portals & WhatsApp/Email Sharing:
     - Migration `000041_invoice_shares_and_receipts.sql`: Created `invoice_shares` with expiring SHA-256 tokens and access counters; created `payment_receipts` with immutable receipt numbers and token hashes.
     - SQLC queries and Go code in `internal/db/finance_shares.sql.go`.
     - Go service (`internal/finance/invoice_share_service.go`) and handlers (`internal/finance/invoice_share_handler.go`) with guest public endpoints `GET /api/v1/public/invoices/:token` and `GET /api/v1/public/receipts/:token`, and protected share creation routes.
     - Frontend Guest Pages:
       - `src/app/public/invoices/[token]/page.tsx`: Printable public invoice with line items, tax totals, payment status, WhatsApp click-to-chat sharing (`https://wa.me/?text=...`), email sharing (`mailto:`), and `window.print()`.
       - `src/app/public/receipts/[token]/page.tsx`: Official payment receipt with "PAID IN FULL" watermark, transaction reference, amount spotlight, and print button.
     - Next.js route proxy (`src/proxy.ts`) updated to allow guest public paths (`/public`, `/invitations`).
  4. Blueprint 06 Customer Credit Notes & Sales Returns:
     - Migration `000042_sales_returns_and_credits.sql`: Created `sales_returns`, `sales_return_items`, `customer_credits`, and `customer_credit_transactions` tables.
     - Go service (`internal/finance/sales_return_service.go`) and handlers (`internal/finance/sales_return_handler.go`) with endpoints `GET/POST /sales-returns`, `GET /sales-returns/:id`, `GET /customers/:id/credit`, and `POST /customers/:id/credit/apply`.
     - Implemented atomic ledger postings: Debit 4000 Sales Returns & Allowances, Debit 2200 VAT Output Payable, Credit 1100 Accounts Receivable / Customer Credit.
     - Implemented optional automatic inventory restock with weighted-average cost: Debit 1200 Inventory Asset, Credit 5000 COGS.
     - Frontend UI: "Issue Credit Note / Sales Return" drawer in `invoices-page.tsx` with itemized returns, restock toggle, compensation method selection (`customer_credit`, `invoice_reduction`, `refund`), and customer wallet credit tracking.
  5. Blueprint 01 Workspace Invitation Acceptance Flow:
     - Frontend route `src/app/invitations/[token]/page.tsx` implementing the complete invitation lifecycle: inspection of workspace/role details, existing signed-in user acceptance (`POST /invitations/:token/accept`), and unauthenticated OTP verification flow (`POST /invitations/:token/otp/request` and `POST /invitations/:token/otp/verify`).
  6. Blueprint 03 Bank CSV Statement Batch Import:
     - Backend endpoint `POST /api/v1/transactions/import-csv` in `internal/finance/money_capture_handler.go` supporting up to 500 rows per batch, validating account scoping, and staging transactions into `needs_review` money record drafts.
     - Frontend page `src/app/(protected)/transactions/import/page.tsx` with drag-and-drop CSV parser, target account picker, direction detection (money_in / money_out), and staged preview table with "Confirm & Import" action.
- Verification Suite:
  - `docker run ... golang:1.23-alpine go vet ./...`: 0 errors.
  - `bun test`: 52/52 tests passing across all test suites.
  - `bun run type-check`: 0 errors.
  - `bun run build`: All 45 application routes compiled cleanly with Next.js 16.4.5 Turbopack.

## 11 November 2026 — Customer History, Account Statement & Bank Reconciliation Engine

- Implemented customer history, statement of account, and the complete bank reconciliation engine:
  1. Customer Detail & Statement of Account (Blueprint 05):
     - Added `GET /api/v1/customers/:id` returning customer details, wallet balance, open invoices, and recent direct sales.
     - Added `GET /api/v1/customers/:id/statement` compiling a formal date-bounded statement of account with line-item invoices, payments, and wallet ledger entries.
     - Added `GET /api/v1/suppliers/:id` returning supplier details and recent purchases.
     - Built customer detail route `src/app/(protected)/customers/[id]/page.tsx` with summary cards (Wallet Balance, Total Invoiced, Outstanding Due), contact details, recent invoice history, and an interactive printable "Statement of Account" overlay with `window.print()`.
     - Linked customer names directly to `/customers/[id]` from the contacts listing table (`contacts-page.tsx`).
  2. Bank & Cash Reconciliation Engine (Blueprint 04):
     - Migration `000043_bank_reconciliation.sql`: Added `bank_reconciliations` table (tracking `money_account_id`, `statement_date`, `statement_balance_minor`, `ledger_balance_minor`, `difference_minor`, status lifecycle) and `bank_reconciliation_matches` table (for matching cleared transactions).
     - Generated sqlc queries and Go models in `internal/db/finance_bank_reconciliation.sql.go`.
     - Implemented Go service (`internal/finance/bank_reconciliation_service.go`) and handlers (`internal/finance/bank_reconciliation_handler.go`) with endpoints:
       - `GET /api/v1/reconciliations`: List reconciliation periods.
       - `POST /api/v1/reconciliations`: Start a new reconciliation against an account statement.
       - `GET /api/v1/reconciliations/:id`: Get reconciliation details with matched and unmatched transactions.
       - `POST /api/v1/reconciliations/:id/commands/match`: Mark a transaction as cleared.
       - `POST /api/v1/reconciliations/:id/commands/unmatch`: Remove a transaction match.
       - `POST /api/v1/reconciliations/:id/commands/complete`: Finalize a balanced zero-difference reconciliation.
     - Frontend UI in `accounts-page.tsx`: Added a 3rd tab "Bank Reconciliation" with reconciliation history, status pills, difference spotlight (green for balanced zero difference, rose for discrepancy), and "Start Reconciliation" drawer.
- Verification:
  - Dockerized `go vet ./...` passed with 0 errors.
  - `bun test` passed 52/52 tests.
  - `bun run type-check` passed with 0 errors.
  - Next.js production build (`next build`) compiled 45 routes cleanly with Turbopack.

## 11 November 2026 — Blueprints 01–06 Completion: Split Payments, Reconciliation Matching, Customer/Supplier Portals, RBAC & Settings

- Completed all remaining UI/API features and resolved structural bugs across Blueprints 01 through 06:
  1. Slice A — Core Response Wrapping, Split Payments & Invoice/Return/Receipt Wiring:
     - Wrapped response payloads in `gin.H{"data": ...}` across `internal/finance/estimate_handler.go`, `sales_return_handler.go`, and `invoice_share_handler.go` to match the frontend `apiClient` envelope contract.
     - Fixed `getInvoice` in `src/lib/money.ts` to return full `InvoiceDetail` (`{ invoice, items, payments }`) and added `getPayment`, fixing `openReturnForInvoice` itemized returns in `invoices-page.tsx`.
     - Upgraded `payment-drawer.tsx` with multi-leg split payment support (`split_enabled`, dynamic `legs` array, "Set total from legs" helper).
     - Replaced `split-payments-page.tsx` placeholder with a complete multi-tender settlement ledger, payment leg inspector, split payment recording, and official receipt links; wired leg inspector & WhatsApp/Email/printable receipt share drawer into `payments-page.tsx`.
     - Added "Credit Notes & Returns" tab, customer store credit application drawer (`applyCustomerCredit`), estimate sharing drawer (`createEstimateShare`), and `discount_amount` / `delivery_fee_amount` support with live totals calculation to `invoices-page.tsx`.
  2. Slice B — Bank & Cash Reconciliation Engine & Statement Matching:
     - Migration `000044_reconciliation_statements_and_portals.sql` & sqlc queries (`finance_bank_reconciliation.sql`): added `reconciliation_type` (`bank` | `cash`), `cleared_balance_minor`, `denominations`, `bank_import_batches`, `bank_lines`, `estimate_shares`, `customer_statement_shares`, invoice/estimate `discount_minor` & `delivery_fee_minor`, and counterparty `opening_balance_minor` / `merged_into_id`.
     - Rewrote `bank_reconciliation_service.go` and `bank_reconciliation_handler.go` with `recomputeClearedBalances`, strict zero-difference completion guard (`ErrReconciliationUnbalanced`), cash count denominations, and CSV statement batch import with +/-3-day exact amount/direction auto-suggest matching (`/reconciliations/import-lines`, `/reconciliations/bank-lines`, `/reconciliations/bank-lines/:lineId/match`).
     - Upgraded `accounts-page.tsx` reconciliation tab with Bank Statement vs Physical Cash Count mode toggle and interactive "Match & Complete" drawer (CSV statement upload, suggested match confirmation, ledger transaction matching checkboxes, and completion).
  3. Slice C — Counterparty Update/Merge, Customer Credit Fix & Public Portals:
     - Fixed foreign key table names in `000042_sales_returns_and_credits.sql` (`products` and `inventory_locations`), updated `inventory_balances` restock columns, and fixed `ApplyCustomerCreditToInvoice` in `sales_return_service.go` to atomically debit `customer_credits` and update invoice paid amounts inside a single transaction.
     - Added counterparty edit & duplicate merge (`UpdateCounterparty`, `MergeCounterparties`, `PATCH /customers/:id`, `PATCH /suppliers/:id`, `POST /counterparties/merge`), date-bounded customer statements including direct `sales`, workspace-currency & credit summary in `getCustomer`, discount/delivery propagation across estimates & invoices, and shareable guest portals (`public/estimates/[token]/page.tsx` and `public/statements/[token]/page.tsx`).
     - Upgraded `customers/[id]/page.tsx` and `contacts-page.tsx`, and built `suppliers/[id]/page.tsx` with purchase history and edit drawer.
  4. Slice D — Granular RBAC, Notifications, Workspace Settings & Onboarding Checklist:
     - Migration `000045_rbac_notifications_and_settings.sql` & sqlc queries (`rbac_notifications.sql`): added workspace profile columns, `role_permissions` table with backfill, and `notifications` table.
     - Extended `auth/me.go`, `auth/invitation.go`, `auth/handler.go`, and `finance/context.go` with `Permissions`, `OutletScope`, `HasPermission()`, `ScopedOutletID()`, and workspace invitation creation/revocation endpoints; added `workspace_ops_handler.go` (`/settings/workspace`, `/settings/team`, `/settings/team/roles/:roleId/permissions`, `/notifications`, `/onboarding/checklist`).
     - Built complete `notifications/page.tsx` and `settings/page.tsx` (profile form, active members, invitations drawer, RBAC role permission toggles, and active session management) plus dismissible Onboarding First-Action Checklist banner in `overview.tsx`.
     - Added live PostgreSQL integration tests in `internal/finance/blueprints_04_06_complete_integration_test.go`.
- Verification Suite:
  - Live migrations & Go test suite (`docker run ... golang:1.23-alpine sh -c "go run ./cmd/migrate && go test -count=1 ./..."` with `--network rekordly-v2_rekordly-net`): migrations applied cleanly and all packages passed (`internal/auth`, `internal/config`, `internal/database`, `internal/finance`, `internal/server`).
  - `bun run lint` (`eslint src tests`): 0 errors, 11 warnings.
  - `bun run type-check` (`tsc --noEmit`): 0 errors.
  - `bun test`: 52/52 tests passed across 4 files.
  - `bun run build` (`next build` 16.4.5 Turbopack): 45 static pages and all dynamic routes compiled cleanly.

## 11 November 2026 — Final Blueprints 01–06 Closure: Multi-Tax, Line Discounts, Proforma, Debit Notes, Portals & RBAC Enforcement

- Implemented all remaining partial/missing items identified across Blueprints 01–06:
  1. Counterparty Opening Balances & Duplicate Detection (Blueprint 05):
     - Added major-unit `opening_balance` parsing in `sales_purchases_service.go`, exposed `Opening balance` in `contacts-page.tsx`, `customers/[id]/page.tsx`, and `suppliers/[id]/page.tsx`, and surfaced brought-forward Opening Balance rows in authenticated & public customer statements (`public/statements/[token]/page.tsx`).
     - Added duplicate counterparty detection query (`FindPossibleDuplicateCounterparties`, `GET /counterparties/check-duplicates`) and live duplicate warning banner in `contacts-page.tsx`.
  2. Line-Level Discounts, Compound Multi-Tax Lines, Proforma Invoices, Debit Notes & Version History (Blueprint 06):
     - Migration `000046_blueprints_01_06_completion.sql` & sqlc (`finance_blueprints_completion.sql`): added `invoice_tax_lines`, `estimate_tax_lines`, `invoices.document_kind` (`invoice` | `proforma`), `debit_notes` / `debit_note_items`, `document_versions`, and optional `outlet_id` columns.
     - Implemented integer half-up compound multi-tax calculation (`ComputeMultiTaxLines`), per-line discount subtraction + balanced ledger discount/delivery postings (`postInvoiceLedger`, `VoidInvoice`), non-posting proforma conversion (`POST /proformas/:id/convert`), debit notes (`POST /debit-notes`, `POST /debit-notes/:id/void`), and automatic point-in-time document revision snapshots (`GET /documents/:docType/:id/versions`).
     - Upgraded `invoices-page.tsx` with line-level discount fields, Multi-Tax / Compound Tax Lines builder, Proforma toggle & conversion action, "Debit Notes" tab, and "History & Portal Inbox" drawer.
  3. External Portal Completion (Blueprint 05):
     - Added `external_payment_evidences`, `external_messages`, and `external_party_links` with public & team endpoints (`blueprints_05_06_handler.go`), guest payment evidence submission and messaging in `public/invoices/[token]/page.tsx` & `public/estimates/[token]/page.tsx`, and supplier PO portal `src/app/purchase-orders/share/[token]/page.tsx` (`src/proxy.ts` whitelisted).
  4. Route-Wide RBAC Enforcement, Outlet Scoping & Prebuilt Role Templates (Blueprints 01 & 02):
     - Seeded all 8 Blueprint 02 role templates (`owner`, `admin`, `accountant`, `sales`, `cashier`, `inventory_manager`, `procurement`, `viewer`) in Migration `000046` and workspace creation (`auth/onboarding.go`), updated `auth/me.go` and `auth/invitation.go`.
     - Added `requirePermission`, `ScopedOutletIDs`, and `IsOutletAllowed` in `finance/context.go` and enforced granular permissions & outlet scopes across `money_handler.go`, `money_capture_handler.go`, `sales_purchases_handler.go`, `invoices_wallets_handler.go`, `estimate_handler.go`, `sales_return_handler.go`, `invoice_share_handler.go`, `bank_reconciliation_handler.go`, `budgets_tax_handler.go`, and `reports.go`, plus member outlet-scope assignment in `settings/page.tsx`.
  5. Integration tests added in `internal/finance/blueprints_05_06_completion_integration_test.go`.
- Verification Suite:
  - Live PostgreSQL migration (`000046_blueprints_01_06_completion.sql`) & `go test -count=1 ./...`: all packages passed (`internal/auth`, `internal/config`, `internal/database`, `internal/finance`, `internal/server`).
  - `bun run type-check`: 0 errors.
  - `bun run lint`: 0 errors.
  - `bun test`: 52/52 tests passed across 4 files.
  - `bun run build` (`next build` 16.4.5 Turbopack): all 45 static pages and all dynamic routes compiled cleanly.






## 2026-11-11 — Blueprint 08 (Purchasing, Procurement & Payables) Full Closure
- Implemented all remaining Blueprint 08 backend and frontend capabilities across `implementation/api` and `implementation/web`:
  1. Direct Purchase Orders, Draft Editing/Duplication & Issued Revisions (Blueprint 08 §§7, 10):
     - Migration `000047_blueprint_08_completion.sql` & sqlc (`finance_procurement_completion.sql`): dropped NOT NULL on `purchase_orders.source_purchase_request_id` & `purchase_order_lines.source_purchase_request_line_id`, added `outlet_id`, `expected_date`, `payment_terms`, `notes`, line-level `discount_minor` & `tax_amount_minor`, and `purchase_order_versions`.
     - Added `CreateDirectPurchaseOrder`, `UpdatePurchaseOrderDraft` (`PATCH /purchase-orders/:id`), `DuplicatePurchaseOrder` (`POST /purchase-orders/:id/duplicate`), `RevisePurchaseOrder` (`POST /purchase-orders/:id/revise` storing `purchase_order_versions` snapshot and preventing quantity reduction below already received quantities), and `ListPurchaseOrderVersions` (`GET /purchase-orders/:id/versions`) in `purchase_order_service.go` / `purchase_order_handler.go`.
  2. Extended Goods Receipts — Unplanned Receipts, Rejected Qty, Batch/Serial/Expiry & Landed Cost Allocation (Blueprint 08 §§11, 12, 15):
     - Extended `goods_receipts` (`source_type`, `supplier_id`, `reason`, `currency`, `currency_exponent`, `landed_cost_minor`) and `goods_receipt_lines` (`rejected_quantity`, `batch_number`, `expiry_date`, `serial_numbers`, `landed_cost_minor`, `effective_unit_cost_minor`).
     - Added unplanned receipt support (`PurchaseOrderID == 0`), rejected quantity logging (excluded from available stock), serial count matching against accepted whole units, over-receipt policy enforcement (`allow_over_receipt`), and proportional landed cost allocation with residual rounding into inventory value and GRNI in `goods_receipt_service.go`.
  3. Supplier Bill Lines, Partial/Multi-Receipt Billing, Duplicate Detection, Tolerance/PPV Accounting, Credits & Reversal (Blueprint 08 §§17–24):
     - Replaced receipt unique constraint on `supplier_bills` with partial/multi-receipt support via `supplier_bill_lines`, normalized duplicate `(workspace_id, supplier_id, lower(btrim(supplier_invoice_number)))` detection returning `SUPPLIER_BILL_DUPLICATE` (`409 Conflict`), and extended `supplier_bill_commands` (`approve`, `reject`, `dispute`, `reverse`, `apply_credit`).
     - Updated `ApproveSupplierBill` to check `price_variance_tolerance_bps` / explicit `AcceptVariance` and post balanced Purchase Price Variance and Input Tax Recoverable ledger entries alongside GRNI and AP. Added `TransitionSupplierBill` (`reject`, `dispute`, `reverse`) and `ApplySupplierCreditToBill` (`POST /supplier-bills/:id/commands/apply-credit`), plus `GET /supplier-credits` and `GET /supplier-refunds` in `supplier_return_handler.go`.
  4. Blueprint 08 RBAC Permissions, Outlet Scoping & Reconciliation Reports (Blueprint 08 §§33, 40):
     - Seeded all 14 granular `purchases.*` permissions into `role_permissions` (Migration `000047`) and `auth.RoleTemplateDefinitions()` (`me.go`), and enforced `requireProcurementPermission` and `enforceProcurementOutletScope` across all procurement handlers.
     - Extended `GetProcurementReport` (`procurement_report_service.go`) with `ap_aging` (`current`, `1–30`, `31–60`, `61+` days), `aged_grni`, `variance_bills`, `unapplied_credit_count`/`minor`, and `pending_returns`.
  5. Complete Procurement Frontend (`procurement-page.tsx`, `procurement-drawers.tsx`, `src/types/finance.ts`, `src/lib/money.ts`):
     - Replaced hardcoded `is_owner` gates with `hasWorkspacePermission`, wired `PurchaseOrderEditorDrawer` (create/edit/revise + duplicate), `ExtendedGoodsReceiptDrawer` (PO & unplanned receipts with location, delivery ref, landed cost, batch/expiry/serials, rejected qty), `GoodsReceiptDetailDrawer` (with attachments), `ReceiptBillDrawer` (editable line qty/price/discount/tax), `BillActionDrawer` (reject/dispute/reverse/apply-credit + variance approval), `ApprovalPolicyDrawer`, Supplier Credits & Refunds lists, and `ProcurementReportsPanel`.
- Verification Suite:
  - Live PostgreSQL migration (`000047_blueprint_08_completion.sql`) & `go vet ./...` + `go test -count=1 ./...`: all packages passed (`internal/auth`, `internal/config`, `internal/database`, `internal/finance`, `internal/server`) including new tests in `internal/finance/blueprint_08_completion_integration_test.go`.
  - `bun run type-check`: 0 errors.
  - `bun run lint`: 0 errors.
  - `bun test`: 52/52 tests passed across 4 files.
  - `bun run build`: Next.js production build succeeded cleanly.
