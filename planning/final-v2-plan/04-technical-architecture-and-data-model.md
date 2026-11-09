# Rekordly v2 Technical Architecture and Data Model

**Prepared:** 7 November 2026  
**Status:** Authoritative planning draft  
**Constraints:** solo founder, responsive web/PWA, under ₦50,000 monthly infrastructure/AI budget through December

## 1. Architecture goals

- Preserve financial and stock correctness under retries and concurrency.
- Keep deployment simple enough for one implementer.
- Provide clear module boundaries without premature microservices.
- Support Personal and Business spaces in one tenant-safe platform.
- Support wildcard Rekordly storefront subdomains and verified custom domains.
- Keep AI outside the authority path for posting.
- Allow reports and projections to be rebuilt from immutable journals/movements.

## 2. Recommended system shape

The application shape below is locked. Go is selected in documents 10 and 11. Initial deployment uses Render for the API, Neon PostgreSQL and Cloudinary under the restrictions in document 11; production tiers still require measurement.

### Frontend

- Next.js with TypeScript
- Responsive web/PWA
- Server-rendered public storefront where practical
- Client components only where interaction requires them
- Typed API client generated or maintained from the backend contract
- Local bounded draft/offline queue

### Backend

- Go capability-based modular monolith
- HTTP/JSON API
- PostgreSQL 16+
- PostgreSQL-backed job queue/outbox
- Separate worker process using the same backend codebase/modules
- S3-compatible object storage for attachments and generated documents
- PDF rendering through a controlled backend/worker path

### Deployment

- Frontend on a selected managed web platform or container host
- API and worker as separate containers on the selected managed container PaaS
- Managed PostgreSQL with automated backup
- Separate staging and production databases/storage
- Wildcard DNS/TLS for `*.rekordly.com`
- Custom-domain verification and certificate management through the hosting/edge provider capability selected during implementation

Avoid microservices for P0. Module boundaries and outbox events provide later extraction points.

## 3. Frontend component policy

The founder selected modern HeroUI v3 plus shadcn/ui patterns.

### Rules

- One Rekordly token layer controls colour, typography, spacing, radius, shadow and motion.
- HeroUI v3 is the preferred packaged component source for accessible application controls where it fits.
- shadcn/ui patterns/primitives may be used for layouts or controls not suitably covered, but must consume Rekordly tokens.
- Do not ship two visually inconsistent versions of the same primitive.
- Wrap external primitives behind Rekordly components such as `Button`, `MoneyInput`, `DataTable`, `Dialog`, `Drawer`, `FormField` and `StatusBadge`.
- Financial forms use one validation, error and confirmation pattern regardless of underlying library.
- Component-library upgrades happen behind wrappers, not throughout feature code.

### Required shared components

- App shell and responsive navigation
- Space switcher
- Universal Add menu
- Money/currency input
- Date/effective-date input
- Account/category/counterparty selectors
- Draft/confirmation review card
- Source/effect explanation
- Status badge and timeline
- Responsive data table/card list
- Filter/search/export bar
- Approval panel
- Attachment uploader/viewer
- Offline/sync indicator
- Usage/limit meter
- Empty/error/permission/locked states
- Product/variant picker
- Stock quantity/cost display
- Storefront theme primitives

## 4. Backend module boundaries

### Identity

Accounts, authentication identities, OTP/social providers, sessions, MFA-ready hooks and revocation.

### Workspace and entitlement

Personal/Business spaces, memberships, roles, permissions, subscriptions, limits and add-ons.

### Ledger

Chart of accounts, journal entries/lines, posting engine, periods, locks, opening balances and reconciliation.

### Money

Cash/bank/wallet accounts, manual transactions, transfers, categories, attachments and imports.

### Personal finance

Budgets, loans, investments, assets and lifestyle aggregates.

### CRM

Customers, suppliers, organization contacts, statements and balances.

### Sales

Estimates, invoices, sales, payments, customer deposits, receipts and adjustments.

### Purchasing

Purchase requests, purchase orders, goods receipts, supplier bills/payments and supplier returns.

### Catalogue

Products, services, variants, categories, collections, media, prices, units, tax and tracking policies.

### Inventory

Outlets, stock movements, cost layers/averages, reservations, transfers, batches, serials, counts and adjustments.

### Commerce

Storefronts, themes/settings, domains, carts/checkout requests and orders.

### Reporting

Financial statements, aging, inventory valuation, tax schedules, exports and drill-down.

### AI

Prompt orchestration, structured draft schemas, credit/rate limits and explanation. No direct repository access to posting authority.

### Documents/communications

PDF generation, email, WhatsApp share metadata and notifications.

### Audit

Immutable actor/action/resource events and security/admin history.

## 5. Command and posting architecture

Financial/stock changes use explicit commands, for example:

- `ConfirmMoneyRecord`
- `IssueInvoice`
- `RecordCustomerPayment`
- `ApproveSupplierBill`
- `ApprovePurchaseOrder`
- `PostGoodsReceipt`
- `ConfirmOrder`
- `FulfillOrder`
- `PostStockAdjustment`
- `ReverseDocument`

Command handler sequence:

1. Authenticate actor/session.
2. Resolve workspace and membership.
3. Check entitlement and permission.
4. Validate idempotency key.
5. Load required current state with transactional locks where necessary.
6. Validate business invariants.
7. Write source document/state transition.
8. Write journal, stock movement, reservation and subledger effects atomically.
9. Write audit event and outbox events.
10. Commit.
11. Async worker produces PDFs/notifications/search projections.

No frontend calculation is authoritative.

## 6. Multi-tenancy

Every tenant-owned table includes `workspace_id`. Business outlets add `outlet_id` where relevant.

Rules:

- Workspace identity comes from authenticated membership and server route context, not arbitrary request body alone.
- Repository queries require workspace scope.
- Database uniqueness includes workspace where applicable.
- Cross-space owner views use authorized aggregation queries; they do not join/mutate ledgers.
- Object-storage keys are tenant scoped with private access controls.
- Tests attempt cross-workspace IDs on every sensitive API family.

Row-level security may be added as defense in depth, but application scoping remains mandatory.

## 7. Core identity and workspace tables

### `users`

- id
- display_name
- locale/timezone
- status
- created_at/updated_at

### `auth_identities`

- id, user_id
- provider (`email`, `phone`, `google`)
- normalized_identifier/hash as appropriate
- verified_at

### `sessions`

- id, user_id
- token hash/family
- device metadata
- expires/revoked timestamps

### `workspaces`

- id
- kind (`personal`, `business`)
- name, slug
- base_currency
- timezone
- status
- owner_user_id

### `memberships`

- workspace_id, user_id
- role_id
- outlet scope
- status

### `roles`, `permissions`, `role_permissions`

System templates plus future custom roles.

## 8. Entitlement tables

### `plans`

Plan definitions and versioned public metadata.

### `subscriptions`

- workspace/user billing owner
- plan/version
- provider/customer/subscription references
- lifecycle status and periods

### `entitlements`

Resolved feature/limit grants by subscription/add-on/beta override.

### `usage_counters`

Period, metric, consumed, reserved and adjustment audit references.

Never infer entitlement from frontend plan name alone.

## 9. Ledger model

### `accounts`

- workspace_id
- code/name/type/subtype
- control-account kind
- currency where restricted
- active/system flags

### `accounting_periods`

- start/end
- open/closed/locked
- closed/locked actor and timestamps

### `journal_entries`

- workspace_id
- source_type/source_id
- effective_at/posted_at
- currency/exchange rate
- status/reversal_of
- description/reference
- idempotency key

### `journal_lines`

- journal_entry_id
- account_id
- debit/credit signed-safe `BIGINT` minor-unit values with currency/exponent metadata
- transaction-currency minor-unit values; exchange rates remain fixed-precision decimal
- customer/supplier/outlet/product dimensions where applicable

Database/application validation ensures one-sided positive line values and balanced entries before commit.

## 10. General money model

### `money_accounts`

Cash/bank/mobile wallet configuration mapped to ledger accounts.

### `money_records`

- type/scope
- amount/currency/rate
- effective date
- money account/category/counterparty
- personal/business/mixed classification
- status/source/reversal link

### `transfers`

One atomic source/destination transfer with two ledger sides; not independent income/expense records.

### `categories`, `tags`, `record_tags`

User-facing classification separate from accounting accounts.

### `attachments`

Private metadata, storage key, hash, MIME, size, scan state and source link.

## 11. CRM model

### `parties`

Unified person/organization identity with customer/supplier roles.

### `party_contacts`

Contacts linked to organization parties.

### `party_addresses`

Billing/shipping/contact purposes.

### `party_opening_balances`

References controlled opening journal/subledger entry.

Historical documents snapshot relevant names/addresses so later profile edits do not rewrite history.

## 12. Sales model

### `sales_documents`

Estimate, proforma, invoice, credit/debit/refund note with version/status, customer snapshot, totals and source links.

### `sales_document_lines`

Catalogue/custom line, quantity, unit, price, discount, tax, outlet, product/variant snapshot.

### `payments`

Counterparty, method/account, amount/currency, effective date, status and reversal link.

### `payment_allocations`

Payment-to-document allocations supporting partial settlement and one payment across multiple documents. Payment-method splits are modeled separately so a settlement may use several accounts and allocate to several documents.

### `customer_deposits`

Liability subledger movements and available balance projection.

## 13. Purchasing model

### `purchase_requests`

Need/request document and approval state.

### `purchase_orders`, `purchase_order_lines`

Versioned commercial commitment, supplier, outlet, expected terms and ordered quantities.

### `goods_receipts`, `goods_receipt_lines`

Actual received quantity/cost, variance, batch/expiry/serial and PO references.

### `supplier_bills`, `supplier_bill_lines`

Payable document and account/item/tax allocation.

### Match projection/query

Derive ordered, received, returned and billed quantities/values from linked lines rather than mutable summary truth.

## 14. Catalogue model

### `products`

Kind, title, description, status, stock policy, tax/tracking flags.

### `product_variants`

SKU, barcode, option combination, unit and active status.

### `product_options`, `product_option_values`

Variant-generating dimensions.

### `price_lists`, `variant_prices`

Retail/wholesale or future channel pricing with currency/effective period.

### `categories`, `collections`, mappings

Navigation/merchandising structures.

### `product_media`

Ordered images with storefront visibility.

## 15. Inventory model

### `outlets`

Business locations and stock settings.

### `stock_movements`

- workspace/outlet/variant
- movement type
- signed quantity
- source type/id/line
- effective/posted timestamps
- batch/serial references
- unit/total cost base
- reversal link

### `stock_reservations`

- order/order line
- outlet/variant
- quantity
- active/released/fulfilled state
- expiry/version timestamps

### `inventory_cost_layers` (FIFO)

Receipt layer, original/remaining quantity, unit cost and source.

### `inventory_issue_layers` (FIFO)

Outbound movement-to-layer consumption.

### `inventory_average_state` (weighted average projection)

Outlet/variant quantity, value, average cost and version, rebuildable from movements.

### `batches`

Variant, outlet/source lot, manufacture/expiry metadata.

### `serial_items`

Unique identifier and current state/location/source.

### `stock_counts`, `stock_count_lines`

Snapshot/cutoff, counted quantity, variance and approval.

Concurrency control/version fields protect projections and reservations.

## 16. Commerce model

### `storefronts`

Business workspace, slug, publication/status and selected theme.

### `storefront_settings`

Brand tokens, cover/contact/policies, catalogue visibility and checkout configuration.

### `storefront_domains`

Hostname, type (`rekordly_subdomain`, `custom`), verification token/state, certificate/routing state and entitlement/grace timestamps.

### `carts` and `cart_lines`

Short-lived visitor state; no stock reservation.

### `orders`, `order_lines`

Customer/guest snapshot, delivery/contact data, status, outlet and price/product snapshots.

### `order_state_events`

Immutable transition history.

Reservations reference confirmed order lines.

## 17. Personal-finance models

### `budgets`, `budget_lines`

Workspace period/type and category/account targets.

### `loans`, `loan_events`

Borrowed/lent direction, counterparty, principal, due date and linked repayments.

### `investments`, `investment_events`

Contribution/purchase, income, manual valuation and disposal.

### `assets`, `asset_events`

Acquisition, evidence, manual value/disposal; later depreciation extensions.

## 18. AI model

### `ai_requests`

Workspace/user, purpose, provider/model metadata, status, latency, token/cost metrics and redacted/hash references as privacy policy permits.

### `ai_drafts`

Structured schema, uncertainty/missing fields, creator, source channel, status and confirmed record reference.

Rules:

- AI service returns typed drafts only.
- Posting commands accept user-reviewed structured data, not raw model output as authority.
- Provider keys remain server-side.
- Per-plan rate/spend limits apply before provider calls.

## 19. Audit and outbox

### `audit_events`

Actor, workspace, action, resource, before/after field-name metadata where safe, reason, IP/device/session reference and timestamp. Avoid duplicating sensitive full documents.

### `outbox_events`

Committed domain event, payload/version, processing state and retry metadata.

Worker consumers are idempotent. Notifications/PDF failure does not roll back a successfully posted financial command; UI exposes delivery failure separately.

## 20. API shape

Use versioned resource queries and command endpoints.

Examples:

- `POST /v1/workspaces/{id}/money-record-drafts`
- `POST /v1/workspaces/{id}/commands/confirm-money-record`
- `POST /v1/businesses/{id}/commands/issue-invoice`
- `POST /v1/businesses/{id}/commands/record-payment`
- `POST /v1/businesses/{id}/commands/approve-purchase-order`
- `POST /v1/businesses/{id}/commands/post-goods-receipt`
- `POST /v1/businesses/{id}/commands/confirm-order`
- `POST /v1/businesses/{id}/commands/fulfill-order`
- `POST /v1/businesses/{id}/commands/reverse-document`
- `GET /v1/businesses/{id}/reports/profit-and-loss`

Every mutation returns durable status/resource IDs and accepts an idempotency key. Use cursor pagination and server-side filtering.

## 21. Storefront routing

### Rekordly subdomain

- Wildcard DNS routes `*.rekordly.com` to storefront frontend/edge.
- Requested host resolves to active storefront-domain record.
- Reserved/unsafe slugs are blocked.

### Custom domain

- Normalize and validate hostname.
- Generate ownership/routing DNS instructions.
- Verify DNS before activation.
- Map host to exactly one active storefront.
- Provision/observe TLS state.
- Prevent host-header spoofing and unverified routing.
- Keep Rekordly subdomain fallback.

Domain verification workers use bounded polling/backoff, not request-time blocking.

## 22. Reporting architecture

- Posted journals and stock movements are authoritative.
- Maintain transactional projections for balances/dashboards where useful.
- Every projection has reconciliation/rebuild tooling.
- Financial statements query ledger by effective period and dimensions.
- Inventory valuation queries cost layers/average state reconciled to movements.
- PDFs/CSVs are generated from the same server report result, not reimplemented calculations.
- Report result includes as-of time, basis, currency and filters.

## 23. Offline architecture

- Store only bounded encrypted/local drafts and cached read models appropriate to browser capabilities.
- Each offline command gets a client-generated ID/idempotency key.
- Sync submits drafts; server revalidates all current permissions, plan and balances.
- Finalized records are not edited offline.
- Queue states: pending, syncing, needs review, failed, confirmed.
- Sensitive cache is cleared on logout/session revocation where feasible.

## 24. Security controls

- TLS everywhere
- Secure HttpOnly cookies or equally reviewed token strategy
- CSRF protection where cookie authentication is used
- Strict CORS allowlist
- OTP rate limiting and replay prevention
- Session rotation/revocation
- Server-side permission/tenant enforcement
- Input/schema validation
- File type/size validation and malware scanning strategy
- Private object storage and signed short-lived access
- Content Security Policy
- Storefront/admin origin separation where helpful
- Secrets in managed environment stores only
- Structured logs with sensitive-field redaction
- Backup encryption and restore testing
- Dependency and container scanning

## 25. Performance and reliability targets

Initial beta objectives:

- Common API reads p95 under 500 ms excluding network distance
- Financial command p95 under 1.5 s excluding document generation
- AI draft latency clearly indicated; hard timeout/fallback to manual entry
- Storefront core pages optimized for low-bandwidth mobile
- No unbounded list queries
- Async work has retry limits and dead-letter visibility
- Health/readiness endpoints
- Graceful deploy/migration strategy

## 26. Observability

- Error tracking for frontend/API/worker
- Structured logs with request, workspace-safe correlation and command IDs
- Metrics: latency, error rate, queue depth, DB pool, AI cost, PDF failures, domain verification, posting/reconciliation failures
- Synthetic uptime checks
- Alerts to founder for critical failures
- Audit and product analytics remain separate systems

Under the budget ceiling, prefer a small number of reliable services and strict retention rather than fragmented tooling.

## 27. Backup and recovery

- Automated database backups
- Object-storage versioning/lifecycle as budget permits
- Documented restore procedure
- Restore into isolated environment before launch
- Verify journal, stock, attachments and tenant access after restore
- Record recovery point/time objectives after provider selection

Public launch is blocked until a restore succeeds.

## 28. Database migrations

- Versioned forward migrations
- Backward-compatible expand/migrate/contract approach for production changes
- Migrations run before incompatible application rollout
- Data backfills are restartable and observable
- Financial/stock transformations include reconciliation checks
- Never use destructive migration against production without verified backup and rollback/forward plan

## 29. Testing architecture

- Unit tests for money, tax, costing and state transitions
- Property tests for balanced journals and invariant preservation
- Integration tests against PostgreSQL
- Deterministic fixtures from rulebook
- Concurrency tests for stock/order/payment races
- API authorization and cross-tenant tests
- Contract tests between frontend/backend
- End-to-end core journeys on supported responsive sizes
- Restore and migration tests
- Storefront host/domain routing tests
- AI schema/confirmation tests with provider stub

## 30. Implementation sequencing

1. Repository/code audit and foundation decisions
2. Shared money/decimal/ID/time primitives
3. Identity, workspace, membership and entitlement
4. Ledger and posting engine
5. Personal money capture/reports
6. CRM and sales/invoicing/payments
7. Catalogue/outlets
8. Inventory movements and both costing methods
9. Purchasing/procurement/bills
10. Orders/reservations/fulfilment
11. Storefront/subdomain/custom-domain connection
12. Full reports/reconciliation
13. AI draft layer
14. PWA/offline and hardening
15. Beta operations and launch gates

Parallel feature work is limited for a solo founder; the dependency order must be respected.

## 31. Architecture decisions requiring implementation verification

- Backend stack selection between Rust, Go, NestJS, direct Fastify and FastAPI per document 10
- Deployment provider and measured monthly cost per document 10
- Exact current repository/framework versions and reusable component quality
- Final HeroUI v3 package maturity/API and shadcn integration boundaries
- Hosting provider wildcard/custom-domain automation capability
- PostgreSQL queue library versus small internal implementation
- PDF renderer choice and deployment footprint
- Object-storage provider and malware-scanning approach
- OTP provider and phone-cost feasibility under budget
- Whether negative-stock override can be safely implemented for both costing methods in P0

These are implementation-spike decisions, not reasons to weaken the accounting rules.
