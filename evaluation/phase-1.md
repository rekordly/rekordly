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

## Blueprint 03 offline-draft slice — 10 November 2026

### Task completion

- PASS — durable local bounded manual draft queue with opaque, user-partitioned metadata and no authentication secret persistence.
- PASS — reconnect/manual sync creates only server drafts; it does not post ledger, balance, invoice, stock, wallet or loan changes.
- PASS — duplicate client-command retries return the first server draft; changed intent returns `IDEMPOTENCY_CONFLICT`; concurrent insert protection remains the database unique index.
- PASS — Sync centre exposes queued, syncing, review, failed and saved copy status with safe recovery messaging.

### Self-check

- Financial safety: PASS. Major-unit money remains a form string; local items are not financial records; only the Go API parses/postings and confirmation remains online-only.
- Tenant isolation: PASS. The local queue is partitioned by current authenticated user and individual workspace; every upload uses the existing workspace-scoped API call.
- Memory/disk: PASS. Queue is capped at 100 active drafts per user; no unbounded remote list was added; blobs and signed/private URLs are not stored.
- Dependency: PASS. Added `idb@8.0.3`, the package mandated by AGENT_RULES/Blueprint 15 for the offline queue.
- Architecture: PASS. SQL/query/service/test changes stay in `implementation/api`; web code stays in `implementation/web`; SQLC regenerated and verified.

### Evidence

- `bun run type-check`, `bun run lint`, `bun test` (44 passed) and `bun run build` passed.
- `sqlc vet`, `git diff --check`, and Docker-backed `go test -count=1 ./internal/finance` passed.

### Deferred

- Review inbox UI/API integration, local evidence-blob staging, capability manifest/plan controls and PWA service-worker delivery are not marked complete. The product offers safe local drafts rather than claiming unsupported offline confirmation.

## Blueprint 03 review and purpose/link slice — 10 November 2026

### Task completion

- PASS — the Review inbox lists only workspace-scoped saved and needs-review drafts, previews through the server and requires explicit confirmation.
- PASS — Capture presents allowed purpose choices by scope/direction rather than silently inferring an accounting purpose; server validation remains authoritative.
- PASS — document links use selectable in-workspace sales, purchases and invoices; API validation rejects foreign/missing links.
- PASS — a draft can be loaded into Capture for safe versioned correction after review.

### Self-check

- Financial safety: PASS. Frontend sends decimal strings and never computes money. Preview/posting remain API-owned; confirmation keeps an idempotency key and optimistic version.
- Tenant isolation: PASS. Draft reads, lists, document options and link writes all send the active workspace header; the new service test proves foreign-workspace draft read returns not found.
- Memory/disk: PASS. Review and selectors use bounded API lists (`limit=50`/existing record pagination); no blob or prompt payload was added.
- Dependency: PASS. No dependency was added in this slice.
- Architecture: PASS. API handler/service/tests remain under `implementation/api`; web UI stays under `implementation/web`; no frontend Docker container was introduced.

### Evidence

- `bun run type-check`, `bun run lint`, `bun test` (44 passed), `bun run build` and `git diff --check` passed.
- Docker-backed finance integration tests passed; rebuilt API completed migration and returned live health HTTP 200.
- Local Bun routes `/review` and `/capture` both returned HTTP 200.

### Deferred

- AI provider parsing/credit controls, bill-payment allocation, offline capability manifest and PWA service worker remain separate gated implementation work. The implemented Review path does not claim a configured AI provider exists.

## Blueprint 03 offline staged evidence — 10 November 2026

### Task completion

- PASS — Capture can stage supported receipt blobs before a server draft exists, while offline only.
- PASS — readable queue metadata contains only filename, MIME type and size; the binary remains in a separate IndexedDB object store keyed by the local command.
- PASS — sync creates/replays the draft first, uploads private evidence next, and reaches `synced` only when all staged files are registered. Network/validation failures preserve the files for safe recovery.
- PASS — each attachment registration is checkpointed locally, so a later failure retries only receipts that have not already registered.
- PASS — reopened server drafts include existing evidence and link metadata, allowing Capture to preserve review context while still excluding private delivery URLs and credentials.
- PASS — Review now surfaces evidence/link state alongside the deterministic preview, before the distinct confirm action.
- PASS — verified evidence can be opened only through a fresh workspace-scoped, five-minute Cloudinary authenticated-download URL. The API secret remains server-side; URL generation, wrong-workspace rejection and API route registration are covered by finance tests/runtime checks.

### Self-check

- Financial safety: PASS. Staged evidence creates no transaction, posting or balance mutation; confirmation remains a separate online server command.
- Tenant isolation: PASS. The queue remains user/workspace partitioned; each evidence authorization and registration uses the draft's active workspace.
- Privacy: PASS. No signed URL, provider secret, session, CSRF value or object URL is persisted. The API remains the issuer of short-lived upload authorizations and verifies the private Cloudinary asset before registering it.
- Storage: PASS. The existing 100 active-draft cap remains in force; every staged file is limited to the API's 10 MB evidence policy.

### Evidence

- `bun run type-check`, `bun run lint`, `bun test` (44 passed), `bun run build`, `git diff --check`, and local Bun `/capture` (HTTP 200) passed.
- Docker-backed finance integration coverage verifies draft supporting-data retrieval and foreign-workspace rejection.

### Deferred

- Cloudinary credentials are configured locally and the API is able to issue the authorization route, but a live provider upload/download remains an external end-to-end check. A configured AI provider, bill-payment allocation, offline capability manifest and PWA service worker remain unimplemented and are not presented as available.

## Direct invoice settlement — 10 November 2026

- PASS — the invoice surface has a Record payment action for finalised and partly-paid invoices, using the existing split-payment form rather than a duplicate payments UI.
- PASS — the API locks the target invoice inside the payment transaction, verifies customer ownership and remaining balance, and updates invoice paid amount atomically.
- PASS — invoice settlement posts cash/bank debit against Accounts Receivable credit; it does not create another revenue credit after invoice finalisation.
- PASS — partial payment, idempotent replay and overpayment rejection are covered by the finance integration test.

## Customer receipt allocation foundation — 10 November 2026

- PASS — `payment_allocations` records the documents settled independently from payment legs; migration backfills legacy one-document payment links without changing their existing API fields.
- PASS — one incoming settlement can allocate across multiple invoices for one customer. The server sorts and locks documents, validates each current outstanding balance and requires allocation total to equal the received total.
- PASS — a cross-customer attempt rolls back every allocation/update atomically; idempotent replay returns the original payment and allocations.
- PASS — the Payments page exposes an Allocate receipt drawer with customer selection, open-invoice rows, oldest-due auto-allocation, manual overrides and an explicit zero-remainder requirement before it invokes the allocation command.
- Deferred — supplier bills/payables need their own bill lifecycle and must not be faked with an ordinary purchase payment.

## Capture-schema runtime correction — 10 November 2026

- PASS — the draft capture schema safely extends the already-refined base capture schema through Zod v4 `safeExtend()`, preserving transfer validation without schema-initialization failure.
- PASS — direct module loading, TypeScript validation, lint, all 44 frontend tests and the local `/transactions` route now succeed.

## Guided-record navigation correction — 10 November 2026

- PASS — Capture is presented truthfully as a guided manual draft flow, not as an available natural-language/AI parser. New records are manual; any future AI-assisted draft still goes to review before posting.
- PASS — Guided record, Review drafts and Offline drafts are reachable from both Personal and Business navigation.
- PASS — income, expense, transfer and draft-edit entry points use static routes that pass component props rather than UI-state query strings.

## Preview resilience and in-place record creation — 10 November 2026

- PASS — empty server preview collections are serialized as JSON arrays. The API-boundary normalizer and the two rendering surfaces also tolerate an older server returning `null`, so an empty warning list cannot crash Capture or Review.
- PASS — income, expense and transfer are one cash-record flow. The app-shell drawer opens from Add or command search without a route transition, including while the user is on a filtered Activity page.
- PASS — Activity is the user-facing list name. Sales and invoices remain commercial documents; payments are applied to those documents rather than presented as another generic cash entry.
- PASS — legacy `/new` and `/capture` URLs redirect to their parent list instead of rendering duplicate entry pages.
- PASS — API/migration images rebuilt and the replacement API is healthy. No database data or volume was deleted.

## Unified records and category initialization — 10 November 2026

- PASS — Records is the shared history surface for Personal and Business. Income, Expense and Transfer have identical user meanings in both; only their workspace/accounting context differs.
- PASS — category lookup initializes the idempotent default set for an existing or new workspace and enforces the active workspace kind as its scope.
- PASS — the integration check covers repeated initialization, business-only defaults, and exclusion of personal-only categories from the business result.

## Blueprint 07 catalogue foundation — 10 November 2026

### Task completion

- PASS — a Business workspace can create and list service, non-stock and stock-tracked catalogue items from the real `/inventory` page.
- PASS — each new item receives exactly one default variant, price/currency snapshot and optional SKU; database constraints prevent duplicate SKU or barcode inside the workspace.
- PASS — retried catalogue creation returns the original item by workspace idempotency key rather than creating a second row.
- PASS — creating a stock-tracked product creates no opening stock, inventory movement, valuation or financial posting.

### Self-check

- Money: PASS. The browser submits a decimal string; Go parses it to `BIGINT` minor units. No frontend arithmetic is used for a saved price.
- Tenant isolation: PASS. Every product and variant has `workspace_id`; list/get/retry queries bind it, and the integration test exercises two workspaces.
- Data integrity: PASS. Product/variant creation commits as one transaction; SKU, barcode and default-variant uniqueness are enforced by PostgreSQL.
- Scope honesty: PASS. The UI explicitly says that stock setup comes next. Quantity, costing, stocktakes, procurement and sale-line integration are not represented as completed.

### Evidence

- `bun run build`, `bun test` (44 passing), `git diff --check`, Docker migration/API rebuild and live health HTTP 200 passed.
- Docker-backed `go test -count=1 ./internal/finance -run TestCatalogue` passed after migration 000014 was applied.

### Deferred

- Opening stock, immutable inventory movements/cost layers, counts/adjustments, purchase receipt and sale-line stock integration remain the next Blueprint 07 work; procurement then builds on that ledger-backed inventory state.

## Blueprint 08 purchase-request foundation — 10 November 2026

### Task completion

- PASS — a Business workspace can create, list, submit and owner-approve multi-line purchase requests.
- PASS — request totals are server-derived from decimal quantities and exact minor-unit prices; retry keys and expected versions prevent duplicate or stale state changes.
- PASS — supplier/product references are workspace validated; an integration test proves another workspace cannot list or command the request.
- PASS — request/approval writes no money transaction or ledger entry, verified by integration test.

### Deferred

- Purchase orders, PO issue/versioning, receiving, inventory/GRNI, supplier bills/AP, matching, advances, returns and remittance remain separate Blueprint 08 slices. The application does not present this request as a supplier order or purchase.

## Blueprint 08 purchase-order lifecycle — 10 November 2026

### Task completion

- PASS — an approved purchase request converts once into a draft PO with a snapshot of its lines and source link.
- PASS — the PO can move draft → submitted → approved → issued from the Procurement page. Each transition has an expected-version guard and a workspace-scoped idempotency command log.
- PASS — issue allocates the atomic workspace sequence and exposes the resulting `PO-######` number. A PO remains an operational supplier commitment, not a financial posting.

### Self-check

- Tenant isolation: PASS. Every PO, line, list, source request, command log and generated number binds `workspace_id`; the integration test rejects a foreign-workspace command.
- Concurrency/idempotency: PASS. The PO row is locked before the command key is checked a second time; the command and state mutation commit together. A changed reuse of a key returns an idempotency conflict.
- Financial safety: PASS. The lifecycle test asserts zero money transactions and zero ledger entries before and after PO issue. No receipt, bill, AP, cash or stock effect is implied.
- UI/API boundary: PASS. The browser sends the active workspace header, a unique retry key and a version. It cannot provide a workspace id or a PO status directly.

### Evidence

- Docker migration/API rebuild completed without deleting volumes; `/health/live` returned HTTP 200.
- Docker-backed `go test -count=1 ./internal/finance -run TestPurchaseOrderLifecycleIsReplaySafeTenantScopedAndNonPosting` passed.
- `bun test` passed (44 tests), `bun run lint` passed, `bun run build` completed, and `git diff --check` passed.

### Deferred

- Blueprint 08 as a whole is not complete: it still requires the Blueprint 07 immutable stock movement/cost layer before a goods receipt can truthfully post Inventory/GRNI. Supplier acknowledgement/sharing, partial receipt, bills/AP, matching/variance, advances/payments, returns/credits/refunds, and reconciliation reports remain unimplemented and are not exposed as complete.

## Blueprint 07/08 receipt and GRNI foundation — 10 November 2026

### Task completion

- PASS — an issued or partially received PO offers only its remaining quantities in the Procurement receipt drawer.
- PASS — posting a receipt locks its PO, rejects duplicate lines and over-receipt, writes immutable receipt lines and creates one immutable inventory movement per stock-tracked receipt line.
- PASS — the same transaction posts balanced debits to Inventory (or Expense for service/non-stock) and a credit to GRNI, then marks the PO partially or fully received.

### Evidence

- Docker migration/API rebuild completed without removing the database volume; API health returned HTTP 200.
- `TestGoodsReceiptPostsImmutableStockMovementAndBalancedGRNI` and the PO lifecycle test passed against the Docker database.
- Web type-check, tests, lint, production build and `git diff --check` passed.

### Deferred

- The movement table is an immutable quantity/value foundation, not yet FIFO/weighted-average costing, batch/serial tracking, outlet stock, opening stock, count/adjustment, sale issue or returns. Supplier bills/AP, three-way matching, advances/payments, credits/refunds and supplier sharing remain separate Blueprint 08 work.

## Blueprint 08 supplier bills / AP foundation — 10 November 2026

### Task completion

- PASS — a posted receipt can create one workspace-scoped supplier-bill draft; retry keys and the receipt/supplier invoice constraints prevent duplicate bills.
- PASS — owner approval locks the bill, checks the version, records an idempotency command and atomically posts the GRNI-to-Accounts-Payable ledger transfer.
- PASS — Procurement has Receipts and Bills tabs, an in-place bill drawer, and the approved status reflects the real API response.

### Evidence

- Docker-backed `TestSupplierBillApprovalClearsGRNIToAP` passed; it proves a balanced ledger and the approved AP state.
- API/migration rebuild preserved volumes and `/health/live` returned HTTP 200. Web type-check, 44 tests, production build and `git diff --check` passed.

### Deferred

- The current bill is intentionally receipt-backed and exact-value only. Direct expense bills, multi-receipt/partial billing, due/overdue projections, corrections, payments/advances and two-/three-way variance matching remain upcoming Blueprint 08 slices.

## Blueprint 08 inventory costing and acknowledgement — 11 November 2026

### Task completion

- PASS — stock-tracked products now have workspace/location inventory balances using exact decimal quantities and weighted-average value updates.
- PASS — opening stock is an idempotent, tenant-scoped command that creates an immutable opening entry, movement, balance update and balanced Inventory/Opening-equity ledger posting atomically.
- PASS — goods receipts attach to a location and update the same balance in the receipt transaction; acknowledged POs can be received.
- PASS — Inventory frontend lists balances and supports recording opening stock; PO acknowledgement is available through the versioned command endpoint.

### Evidence

- Migration `000025_inventory_balances_opening_stock.sql` applied without deleting PostgreSQL data; API health returned HTTP 200.
- `TestInventoryOpeningStockIsWeightedAverageAndIdempotent` and the full containerized finance suite passed.
- `bun run type-check`, `bun test` (44 passing), `bun run build`, and `git diff --check` passed.

### Deferred

- Blueprint 08 still has planned extensions for unplanned/service receipts, batch/serial/expiry capture, direct and multi-receipt bills, detailed variance/revaluation, supplier returns/credits/refunds, guest supplier sharing, and procurement reconciliation/report drill-downs.

## Blueprint 08 returns and direct bills — 11 November 2026

### Task completion

- PASS — receipt-backed supplier returns are quantity- and stock-on-hand-guarded, original-cost valued, immutable, idempotent and tenant-scoped.
- PASS — supplier credits reduce approved bill AP balances without a second cash or expense posting.
- PASS — supplier refunds consume a valid credit balance and post cash receipt atomically.
- PASS — direct expense/service supplier bills support due dates and post Expense/Asset to AP on approval.
- PASS — Procurement exposes Returns and the Inventory/Procurement UI builds successfully.

### Evidence

- Migrations `000026_supplier_returns_credits_refunds.sql` and `000027_direct_supplier_bills.sql` applied without deleting the database volume; API health returned HTTP 200.
- Focused return/refund and direct-bill integration tests plus the full containerized finance suite passed.
- `bun run type-check`, `bun test` (44 passing), `bun run build`, and `git diff --check` passed.
