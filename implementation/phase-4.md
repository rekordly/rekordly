# Phase 4: Invoices, Wallets, & Loans

**Goal:** Add the MVP business workflows that sit on top of the financial core. Users can issue invoices, track customer deposits, and track simple debts. PDF generation runs through async jobs.

**Depends on:** Phase 3 (Core Transactions & Manual Entry) — transactions, ledger, payments, and scope_type must be operational before invoices, wallets, and loans can create linked ledger entries and payment rows.

**References:**
- Data model: `05-data-model.md`
- API architecture: `06-api-architecture.md`
- User flows: `04-user-flows.md`
- Feature map: `03-feature-map.md`
- Design guide: `11-design-guide.md`
- Roadmap: `12-roadmap.md` (Phase 4)
- Tech stack: `13-tech-stack-and-libraries.md`
- Security: `09-security.md`
- Infrastructure: `08-infrastructure.md`

---

## Section 1: Summary Table

| ID | Work Item | Owner Area | Acceptance Criteria |
|----|-----------|------------|---------------------|
| P4-01 | Customers Table Migration | Data | Migration creates `customers` table with all required columns, FKs, indexes, and workspace_id scoping. |
| P4-02 | Invoices Table Migration | Data | Migration creates `invoices` table with status enum values, money columns as NUMERIC(20,4), unique invoice_number per workspace, and voiding fields. |
| P4-03 | Invoice Items Table Migration | Data | Migration creates `invoice_items` table with FK to invoices ON DELETE CASCADE and sort_order for line-item ordering. |
| P4-04 | Customer Wallets Table Migration | Data | Migration creates `customer_wallets` with CHECK(balance >= 0) enforcing no negative wallets, unique customer_id, and currency_code. |
| P4-05 | Customer Wallet Ledger Migration | Data | Migration creates `customer_wallet_ledger` with entry_type enum, immutable-after-finalization design, and cursor-pagination index. |
| P4-06 | Loans Table Migration | Data | Migration creates `loans` table with direction enum, CHECK(current_balance >= 0), counterparty reference, and voiding fields. |
| P4-07 | Background Jobs Table Migration | Data | Migration creates `background_jobs` with status/priority indexes, SKIP LOCKED-compatible queue index, and retry tracking columns. |
| P4-08 | sqlc Queries — Customers CRUD | Backend | All customer queries are workspace-scoped; Create, Get, List, Update operations generated via sqlc with pgx/v5. |
| P4-09 | sqlc Queries — Invoices CRUD | Backend | Invoice queries support cursor pagination, draft-only updates, finalize/void transitions, and payment state updates; all workspace-scoped. |
| P4-10 | sqlc Queries — Invoice Items | Backend | Invoice item queries support list-by-invoice, create, delete (draft-only within tx), and update operations. |
| P4-11 | sqlc Queries — Customer Wallets (Transactional) | Backend | Wallet queries support transactional credit/debit with balance validation, ledger entry creation, and cursor-paginated ledger list. |
| P4-12 | sqlc Queries — Loans | Backend | Loan queries support CRUD with overpayment-rejecting repayment, cursor pagination, direction/status filters, and void operation. |
| P4-13 | sqlc Queries — Background Jobs | Backend | Job queries support enqueue, SKIP LOCKED claim, complete, fail-with-retry-backoff, and get-by-ID with workspace/user scoping. |
| P4-14 | GET /api/v1/invoices | Backend | Returns cursor-paginated invoice list with 30-day default window, status/customer filters, and decimal-string money values. |
| P4-15 | POST /api/v1/invoices | Backend | Creates draft invoice with server-calculated totals, auto-generated invoice_number, and Idempotency-Key requirement. |
| P4-16 | GET /api/v1/invoices/{id} | Backend | Returns full invoice with items; validates workspace ownership (object-level auth). |
| P4-17 | PATCH /api/v1/invoices/{id} | Backend | Updates draft invoices only; recalculates totals server-side; rejects if not draft status. |
| P4-18 | POST /api/v1/invoices/{id}/finalize | Backend | Finalizes draft invoice, makes it immutable, creates balanced ledger entries (debit Receivable, credit Income) in same tx. |
| P4-19 | POST /api/v1/invoices/{id}/void | Backend | Voids draft/finalized invoice, sets voided_at/voided_by_id; creates reversing ledger entries if previously finalized. |
| P4-20 | POST /api/v1/invoices/{id}/pdf (async) | Backend | Enqueues PDF generation job, returns 202 with job_id; applies plan-based branding (Rekordly footer for Free). |
| P4-21 | GET /api/v1/customers/{id}/wallet | Backend | Returns customer wallet; auto-creates with balance=0 if not exists (lazy creation). |
| P4-22 | POST /api/v1/customers/{id}/wallet/deposits | Backend | Credits wallet, creates ledger entry + payment row + balanced ledger entries (debit Cash, credit Customer Liabilities) in single tx. |
| P4-23 | GET /api/v1/customers/{id}/wallet/ledger | Backend | Returns cursor-paginated wallet ledger entries ordered by created_at DESC. |
| P4-24 | GET /api/v1/loans | Backend | Returns cursor-paginated loan list with direction/status filters and 30-day default window. |
| P4-25 | POST /api/v1/loans | Backend | Creates loan with current_balance=principal_amount, direction-dependent ledger entries (borrowed: debit Cash/credit Payable; lent: debit Receivable/credit Cash). |
| P4-26 | GET /api/v1/loans/{id} | Backend | Returns full loan detail; validates workspace ownership. |
| P4-27 | POST /api/v1/loans/{id}/repayments | Backend | Repays loan with overpayment rejection, creates transaction + payment + balanced ledger entries in single tx. |
| P4-28 | GET /api/v1/jobs/{id} | Backend | Returns job status (pending/running/completed/failed/dead); validates workspace/user ownership. |
| P4-29 | Worker: PDF Generation Job Handler | Backend/DevOps | Go worker generates invoice PDF with line items and branding, stores to object storage, updates job result within 30s timeout. |
| P4-30 | Invoice Creation/Preview UI | Frontend | Invoice form with react-hook-form + zod, dynamic line items, running totals, draft save, and preview mode. |
| P4-31 | Invoice List/Detail/Payment UI | Frontend | Invoice DataTable with status chips, detail view with finalize/void/PDF actions, payment recording with split-payment support. |
| P4-32 | Customer Wallet Deposit/Payment UI | Frontend | Wallet deposit form, wallet balance StatCard, ledger DataTable, and insufficient-balance inline messaging. |
| P4-33 | Loan Tracker UI | Frontend | Loan DataTable with direction/status chips, business-only scope, and actionable empty state. |
| P4-34 | Loan Repayment UI | Frontend | Repayment form with current balance display, overpayment validation, and payment method selection. |
| P4-35 | Async Job Status Polling in Frontend | Frontend | useAsyncJob hook polls GET /jobs/{id} every 2s, stops on completion, renders inline status indicator. |
| P4-36 | Wallet Balance Validation Messaging | Frontend | WalletBalanceIndicator shows available balance, warning on insufficient funds, and disables submit when wallet payment exceeds balance. |

---

## Section 2: Detailed Descriptions

### P4-01: Customers Table Migration

**Description:**
Create the `customers` table to store customer records for invoicing, wallet deposits, and sale tracking. Each customer belongs to a workspace and can own a wallet balance. The `metadata JSONB` column supports AI tags, custom fields, and future extensibility without schema changes.

**Technical Details:**

**Table: `customers`**

| Column | Type | Constraints | Purpose |
|---|---|---|---|
| id | UUID | PK DEFAULT gen_random_uuid() | Primary key |
| workspace_id | UUID | NOT NULL FK → workspaces(id) ON DELETE CASCADE | Tenant scoping |
| name | VARCHAR(255) | NOT NULL | Display name |
| email | VARCHAR(255) | | Contact email |
| phone | VARCHAR(50) | | Phone number |
| address | TEXT | | Postal address |
| currency_code | VARCHAR(3) | NOT NULL | Default currency for this customer |
| metadata | JSONB | DEFAULT '{}' | AI tags, custom fields, extensibility |
| created_by_id | UUID | FK → users(id) | User who created |
| created_at | TIMESTAMPTZ | DEFAULT now() | Creation timestamp |
| updated_at | TIMESTAMPTZ | DEFAULT now() | Last update timestamp |

**Indexes:**
- `idx_customers_workspace_id` ON (workspace_id) — tenant query performance
- `idx_customers_workspace_name` ON (workspace_id, name) — name search within workspace

**Foreign Keys:**
- `workspace_id` → `workspaces(id)` ON DELETE CASCADE — deleting a workspace removes all customers
- `created_by_id` → `users(id)` — audit trail

**Acceptance Criteria:**
- [ ] Migration file creates `customers` table with all columns and types exactly as specified
- [ ] All tenant queries include `workspace_id` filter
- [ ] `metadata JSONB` column exists with default `'{}'`
- [ ] Foreign key to `workspaces(id)` with `ON DELETE CASCADE`
- [ ] Both indexes created

---

### P4-02: Invoices Table Migration

**Description:**
Create the `invoices` table to store invoice headers with payment tracking. Invoices follow a status lifecycle: `draft` → `finalized` → `paid`/`partially_paid`, or `voided` at any pre-payment stage. Finalized invoices are immutable; corrections use voids and reversing entries. The `invoice_number` must be unique per workspace to avoid collisions.

**Technical Details:**

**Table: `invoices`**

| Column | Type | Constraints | Purpose |
|---|---|---|---|
| id | UUID | PK DEFAULT gen_random_uuid() | Primary key |
| workspace_id | UUID | NOT NULL FK → workspaces(id) ON DELETE CASCADE | Tenant scoping |
| customer_id | UUID | NOT NULL FK → customers(id) | Billed customer |
| invoice_number | VARCHAR(50) | NOT NULL UNIQUE(workspace_id, invoice_number) | Sequential invoice ID per workspace |
| issue_date | DATE | NOT NULL | Invoice date |
| due_date | DATE | | Payment deadline |
| status | VARCHAR(20) | NOT NULL DEFAULT 'draft' | Lifecycle: draft, finalized, voided, paid, partially_paid |
| subtotal | NUMERIC(20,4) | NOT NULL DEFAULT 0 | Sum before tax/discount |
| tax_amount | NUMERIC(20,4) | NOT NULL DEFAULT 0 | Total tax |
| discount_amount | NUMERIC(20,4) | NOT NULL DEFAULT 0 | Total discount |
| total_amount | NUMERIC(20,4) | NOT NULL DEFAULT 0 | Grand total |
| paid_amount | NUMERIC(20,4) | NOT NULL DEFAULT 0 | Amount received |
| balance_amount | NUMERIC(20,4) | NOT NULL DEFAULT 0 | Outstanding = total - paid |
| currency_code | VARCHAR(3) | NOT NULL | Invoice currency |
| notes | TEXT | | Additional notes |
| metadata | JSONB | DEFAULT '{}' | Extensibility |
| voided_at | TIMESTAMPTZ | | When voided |
| voided_by_id | UUID | FK → users(id) | Who voided |
| created_by_id | UUID | NOT NULL FK → users(id) | Creator |
| created_at | TIMESTAMPTZ | DEFAULT now() | Creation timestamp |
| updated_at | TIMESTAMPTZ | DEFAULT now() | Last update timestamp |

**Indexes:**
- `idx_invoices_workspace_id` ON (workspace_id) — tenant queries
- `idx_invoices_workspace_status` ON (workspace_id, status) — status-filtered lists
- `idx_invoices_workspace_issue_date` ON (workspace_id, issue_date DESC) — date-ordered cursor pagination

**Acceptance Criteria:**
- [ ] Migration creates `invoices` table with all columns
- [ ] `status` column supports values: draft, finalized, voided, paid, partially_paid
- [ ] All money columns use `NUMERIC(20,4)` — never float
- [ ] Composite unique constraint on (workspace_id, invoice_number)
- [ ] Three indexes created for tenant queries, status filtering, and date ordering

---

### P4-03: Invoice Items Table Migration

**Description:**
Create the `invoice_items` table to store individual line items for each invoice. Items are always deleted and recreated during draft updates within a single transaction, ensuring atomicity. The `sort_order` column controls display ordering.

**Technical Details:**

**Table: `invoice_items`**

| Column | Type | Constraints | Purpose |
|---|---|---|---|
| id | UUID | PK DEFAULT gen_random_uuid() | Primary key |
| invoice_id | UUID | NOT NULL FK → invoices(id) ON DELETE CASCADE | Parent invoice |
| description | TEXT | NOT NULL | Item description |
| quantity | NUMERIC(20,4) | NOT NULL DEFAULT 1 | Quantity |
| unit_price | NUMERIC(20,4) | NOT NULL | Price per unit |
| tax_rate | NUMERIC(5,2) | DEFAULT 0 | Tax percentage |
| discount_amount | NUMERIC(20,4) | DEFAULT 0 | Item-level discount |
| total_amount | NUMERIC(20,4) | NOT NULL | Computed: qty × price + tax - discount |
| sort_order | INT | DEFAULT 0 | Display ordering |
| created_at | TIMESTAMPTZ | DEFAULT now() | Creation timestamp |
| updated_at | TIMESTAMPTZ | DEFAULT now() | Last update timestamp |

**Indexes:**
- `idx_invoice_items_invoice_id` ON (invoice_id) — item lookup by invoice

**Acceptance Criteria:**
- [ ] Migration creates `invoice_items` table with all columns
- [ ] FK to `invoices(id)` with `ON DELETE CASCADE` — deleting invoice removes items
- [ ] `sort_order` column exists for line-item ordering
- [ ] All money columns use `NUMERIC(20,4)`

---

### P4-04: Customer Wallets Table Migration

**Description:**
Create the `customer_wallets` table to track advance deposits and store credit per customer. The `CHECK (balance >= 0)` constraint enforces the core rule: no negative wallet balances. Each customer can have at most one wallet (UNIQUE customer_id).

**Technical Details:**

**Table: `customer_wallets`**

| Column | Type | Constraints | Purpose |
|---|---|---|---|
| id | UUID | PK DEFAULT gen_random_uuid() | Primary key |
| workspace_id | UUID | NOT NULL FK → workspaces(id) ON DELETE CASCADE | Tenant scoping |
| customer_id | UUID | NOT NULL UNIQUE | One wallet per customer |
| balance | NUMERIC(20,4) | NOT NULL DEFAULT 0 CHECK (balance >= 0) | Current wallet balance — never negative |
| currency_code | VARCHAR(3) | NOT NULL | Wallet currency |
| updated_at | TIMESTAMPTZ | DEFAULT now() | Last update timestamp |

**Indexes:**
- `idx_customer_wallets_workspace_id` ON (workspace_id) — tenant queries
- `idx_customer_wallets_customer_id` ON (customer_id) — customer lookup

**Acceptance Criteria:**
- [ ] Migration creates `customer_wallets` table
- [ ] `CHECK (balance >= 0)` constraint enforces no negative wallets at DB level
- [ ] `customer_id` has UNIQUE constraint — one wallet per customer
- [ ] Both indexes created

---

### P4-05: Customer Wallet Ledger Migration

**Description:**
Create the `customer_wallet_ledger` table to record an immutable, append-only history of all wallet balance changes. Each entry records the type (deposit, wallet_payment, reversal, adjustment), the amount, the resulting balance, and a reference to the originating financial record. Entries are never hard-deleted after finalization; corrections use reversal entries.

**Technical Details:**

**Table: `customer_wallet_ledger`**

| Column | Type | Constraints | Purpose |
|---|---|---|---|
| id | UUID | PK DEFAULT gen_random_uuid() | Primary key |
| workspace_id | UUID | NOT NULL FK → workspaces(id) ON DELETE CASCADE | Tenant scoping |
| customer_id | UUID | NOT NULL FK → customers(id) | Customer reference |
| wallet_id | UUID | NOT NULL FK → customer_wallets(id) | Wallet reference |
| entry_type | VARCHAR(20) | NOT NULL | deposit, wallet_payment, reversal, adjustment |
| amount | NUMERIC(20,4) | NOT NULL CHECK (amount > 0) | Amount of this entry — always positive |
| balance_after | NUMERIC(20,4) | NOT NULL | Wallet balance after this entry |
| currency_code | VARCHAR(3) | NOT NULL | Currency |
| reference_type | VARCHAR(50) | | Originating record type (payment, transaction) |
| reference_id | UUID | | Originating record ID |
| description | TEXT | | Human-readable note |
| voided_at | TIMESTAMPTZ | | If this entry was voided |
| created_by_id | UUID | NOT NULL FK → users(id) | Who created |
| created_at | TIMESTAMPTZ | DEFAULT now() | Timestamp |

**Indexes:**
- `idx_wallet_ledger_wallet_id` ON (wallet_id, created_at DESC) — chronological ledger per wallet
- `idx_wallet_ledger_workspace_id` ON (workspace_id) — tenant queries

**Acceptance Criteria:**
- [ ] Migration creates `customer_wallet_ledger` table
- [ ] `entry_type` supports: deposit, wallet_payment, reversal, adjustment
- [ ] `amount` has CHECK (amount > 0)
- [ ] Cursor-pagination index on (wallet_id, created_at DESC)
- [ ] Design supports immutable-after-finalization pattern

---

### P4-06: Loans Table Migration

**Description:**
Create the `loans` table to track money borrowed as liabilities and money lent as receivables. Loans are simple: no amortization, no compound interest, no repayment schedules. The `current_balance` starts at `principal_amount` and decreases through repayments. The CHECK constraint `current_balance >= 0` prevents overpayment at the database level.

**Technical Details:**

**Table: `loans`**

| Column | Type | Constraints | Purpose |
|---|---|---|---|
| id | UUID | PK DEFAULT gen_random_uuid() | Primary key |
| workspace_id | UUID | NOT NULL FK → workspaces(id) ON DELETE CASCADE | Tenant scoping |
| direction | VARCHAR(10) | NOT NULL | borrowed or lent |
| principal_amount | NUMERIC(20,4) | NOT NULL CHECK (principal_amount > 0) | Original loan amount |
| current_balance | NUMERIC(20,4) | NOT NULL CHECK (current_balance >= 0) | Remaining balance — never negative |
| counterparty_id | UUID | FK → customers(id) | Linked customer (optional) |
| counterparty_name | VARCHAR(255) | | Free-text counterparty name |
| start_date | DATE | NOT NULL | When loan started |
| due_date | DATE | | Repayment deadline |
| status | VARCHAR(20) | NOT NULL DEFAULT 'active' | active, fully_repaid, voided |
| currency_code | VARCHAR(3) | NOT NULL | Loan currency |
| notes | TEXT | | Description |
| metadata | JSONB | DEFAULT '{}' | Extensibility |
| voided_at | TIMESTAMPTZ | | When voided |
| voided_by_id | UUID | FK → users(id) | Who voided |
| created_by_id | UUID | NOT NULL FK → users(id) | Creator |
| created_at | TIMESTAMPTZ | DEFAULT now() | Creation timestamp |
| updated_at | TIMESTAMPTZ | DEFAULT now() | Last update timestamp |

**Indexes:**
- `idx_loans_workspace_id` ON (workspace_id) — tenant queries
- `idx_loans_workspace_status` ON (workspace_id, status) — active/repaid filtering
- `idx_loans_workspace_direction` ON (workspace_id, direction) — borrowed vs lent filtering

**Acceptance Criteria:**
- [ ] Migration creates `loans` table with all columns
- [ ] `direction` supports: borrowed, lent
- [ ] `CHECK (current_balance >= 0)` prevents overpayment at DB level
- [ ] No amortization, interest, or repayment schedule columns exist
- [ ] Three indexes created

---

### P4-07: Background Jobs Table Migration

**Description:**
Create the `background_jobs` table to serve as the Postgres-backed job queue for async operations: PDF generation, CSV/PDF exports, notification delivery, and heavy AI parsing. Workers claim jobs using `SELECT ... FOR UPDATE SKIP LOCKED` to ensure safe concurrent consumption. The retry system uses exponential backoff (1m → 5m → 15m) with a max of 3 attempts before moving to dead-letter status.

**Technical Details:**

**Table: `background_jobs`**

| Column | Type | Constraints | Purpose |
|---|---|---|---|
| id | UUID | PK DEFAULT gen_random_uuid() | Primary key |
| workspace_id | UUID | | Tenant reference (nullable for user-scoped jobs) |
| user_id | UUID | NOT NULL | User who triggered the job |
| job_type | VARCHAR(50) | NOT NULL | pdf_generation, csv_export, notification_delivery, etc. |
| status | VARCHAR(20) | NOT NULL DEFAULT 'pending' | pending, running, completed, failed, dead |
| payload | JSONB | NOT NULL DEFAULT '{}' | Job-specific parameters |
| result | JSONB | | Output on completion (e.g. download_url) |
| error_message | TEXT | | Last error on failure |
| attempts | INT | NOT NULL DEFAULT 0 | Current attempt count |
| max_attempts | INT | NOT NULL DEFAULT 3 | Maximum retries before dead-letter |
| scheduled_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | When to process (supports backoff delay) |
| started_at | TIMESTAMPTZ | | When worker claimed the job |
| completed_at | TIMESTAMPTZ | | When job finished |
| created_at | TIMESTAMPTZ | DEFAULT now() | Creation timestamp |

**Indexes:**
- `idx_jobs_status_scheduled` ON (status, scheduled_at) WHERE status IN ('pending', 'running') — worker claim query (partial index)
- `idx_jobs_workspace_id` ON (workspace_id) — tenant lookup
- `idx_jobs_user_id` ON (user_id) — user polling

**Worker Guardrails (ref: 08 §Worker And Queue Guardrails):**
- Sleep 5 seconds when queue is empty
- 3-5 concurrent goroutines per worker container
- `context.WithTimeout` per job
- Exponential backoff: 1m → 5m → 15m
- Max 3 retries; exhausted → `dead` status

**Acceptance Criteria:**
- [ ] Migration creates `background_jobs` table
- [ ] Partial index supports `SELECT ... FOR UPDATE SKIP LOCKED` claim pattern
- [ ] Retry tracking via `attempts` and `max_attempts` columns
- [ ] `scheduled_at` supports delayed retry scheduling

---

### P4-08: sqlc Queries — Customers CRUD

**Description:**
Generate type-safe sqlc queries for customer CRUD operations. All queries must include `workspace_id` filtering for tenant isolation. Uses `pgx/v5` driver as specified in the tech stack.

**Queries:**

| Name | Operation | Key Details |
|---|---|---|
| `GetCustomerByID` | SELECT | WHERE id = $1 AND workspace_id = $2 |
| `ListCustomersByWorkspace` | SELECT | WHERE workspace_id = $1 ORDER BY name ASC LIMIT $2 OFFSET $3 |
| `CreateCustomer` | INSERT | All user-supplied fields + workspace_id, created_by_id; RETURNING * |
| `UpdateCustomer` | UPDATE | SET name, email, phone, address, metadata, updated_at=now() WHERE id=$1 AND workspace_id=$7 RETURNING * |

**File:** `queries/customers.sql`

**Acceptance Criteria:**
- [ ] All queries include `workspace_id` in WHERE clause
- [ ] sqlc generates valid Go code with `pgx/v5` types
- [ ] `CreateCustomer` returns full row via `RETURNING *`
- [ ] `UpdateCustomer` scopes to workspace_id to prevent cross-tenant updates

---

### P4-09: sqlc Queries — Invoices CRUD

**Description:**
Generate type-safe sqlc queries for invoice CRUD operations including cursor pagination, draft-only updates, finalize/void transitions, and payment state updates. Invoice list queries use cursor-based pagination by `(issue_date DESC, id DESC)` with optional date filters `from_date`/`to_date`.

**Queries:**

| Name | Operation | Key Details |
|---|---|---|
| `GetInvoiceByID` | SELECT | WHERE id = $1 AND workspace_id = $2 |
| `ListInvoicesByWorkspace` | SELECT | Cursor: WHERE workspace_id = $1 AND (issue_date < $2 OR (issue_date = $2 AND id < $3)) ORDER BY issue_date DESC, id DESC LIMIT $4; overloaded with from_date/to_date |
| `CreateInvoice` | INSERT | All fields; auto-generated invoice_number; RETURNING * |
| `UpdateInvoiceDraft` | UPDATE | WHERE status='draft' AND workspace_id — rejects non-draft updates |
| `FinalizeInvoice` | UPDATE | SET status='finalized' WHERE status='draft' AND workspace_id |
| `VoidInvoice` | UPDATE | SET status='voided', voided_at, voided_by_id WHERE status IN ('draft','finalized') AND workspace_id |
| `UpdateInvoicePaymentState` | UPDATE | SET paid_amount, balance_amount, status WHERE id AND workspace_id |

**File:** `queries/invoices.sql`

**Acceptance Criteria:**
- [ ] All queries workspace-scoped
- [ ] Cursor pagination uses (issue_date DESC, id DESC) composite cursor
- [ ] `UpdateInvoiceDraft` enforces `status='draft'` guard
- [ ] `FinalizeInvoice` transitions only from `draft` to `finalized`
- [ ] `VoidInvoice` supports both draft and finalized invoices

---

### P4-10: sqlc Queries — Invoice Items

**Description:**
Generate sqlc queries for invoice line items. Items are deleted and recreated during draft updates (within the same transaction as the invoice update) to ensure atomicity.

**Queries:**

| Name | Operation | Key Details |
|---|---|---|
| `ListItemsByInvoice` | SELECT | WHERE invoice_id = $1 ORDER BY sort_order ASC |
| `CreateInvoiceItem` | INSERT | All fields; RETURNING * |
| `DeleteInvoiceItemsByInvoice` | DELETE | WHERE invoice_id = $1 — only callable during draft updates in same tx |
| `UpdateInvoiceItem` | UPDATE | SET all editable fields, updated_at=now() WHERE id = $1 RETURNING * |

**File:** `queries/invoice_items.sql`

**Acceptance Criteria:**
- [ ] `ListItemsByInvoice` orders by `sort_order ASC`
- [ ] `DeleteInvoiceItemsByInvoice` documented as draft-only operation
- [ ] All queries generated by sqlc with proper types

---

### P4-11: sqlc Queries — Customer Wallets (Transactional)

**Description:**
Generate sqlc queries for customer wallet operations with strict transactional guarantees. `CreditWalletDeposit` and `DebitWalletPayment` must run inside database transactions alongside ledger entry inserts to ensure atomic balance updates. `DebitWalletPayment` returns zero rows if insufficient balance, allowing the service layer to detect overdraft attempts.

**Queries:**

| Name | Operation | Key Details |
|---|---|---|
| `GetWalletByCustomer` | SELECT | WHERE customer_id = $1 AND workspace_id = $2 |
| `CreateWallet` | INSERT | balance=0; RETURNING * |
| `CreditWalletDeposit` | UPDATE | SET balance = balance + $2 WHERE customer_id AND workspace_id; RETURNING * |
| `DebitWalletPayment` | UPDATE | SET balance = balance - $2 WHERE customer_id AND workspace_id AND balance >= $2; RETURNING * (zero rows if insufficient) |
| `CreateWalletLedgerEntry` | INSERT | All fields including balance_after; RETURNING * |
| `ListWalletLedger` | SELECT | Cursor: WHERE wallet_id AND workspace_id AND (created_at < $3 OR ...) ORDER BY created_at DESC, id DESC LIMIT $5 |

**File:** `queries/customer_wallets.sql`

**Acceptance Criteria:**
- [ ] `DebitWalletPayment` includes `AND balance >= $2` to prevent negative balances at query level
- [ ] `CreditWalletDeposit` and `DebitWalletPayment` designed to run inside DB transactions
- [ ] `CreateWalletLedgerEntry` records `balance_after` for audit trail
- [ ] `ListWalletLedger` supports cursor pagination by (created_at DESC, id DESC)

---

### P4-12: sqlc Queries — Loans

**Description:**
Generate sqlc queries for loan CRUD operations including overpayment-rejecting repayment. `RepayLoan` includes `AND current_balance >= $2` which returns zero rows if repayment would exceed remaining balance, enabling the service to return `OVERPAYMENT_NOT_ALLOWED`.

**Queries:**

| Name | Operation | Key Details |
|---|---|---|
| `GetLoanByID` | SELECT | WHERE id = $1 AND workspace_id = $2 |
| `ListLoansByWorkspace` | SELECT | Cursor by start_date DESC, id DESC; optional direction/status filters; 30-day default |
| `CreateLoan` | INSERT | current_balance = principal_amount, status = 'active'; RETURNING * |
| `RepayLoan` | UPDATE | SET current_balance = current_balance - $2, status = CASE WHEN current_balance - $2 = 0 THEN 'fully_repaid' ELSE status END WHERE current_balance >= $2 AND workspace_id; RETURNING * |
| `VoidLoan` | UPDATE | SET status='voided', voided_at, voided_by_id WHERE status='active' AND workspace_id; RETURNING * |

**File:** `queries/loans.sql`

**Acceptance Criteria:**
- [ ] `RepayLoan` rejects overpayment via `AND current_balance >= $2`
- [ ] `RepayLoan` auto-transitions status to `fully_repaid` when balance reaches 0
- [ ] All queries workspace-scoped
- [ ] `ListLoansByWorkspace` supports direction and status filters

---

### P4-13: sqlc Queries — Background Jobs

**Description:**
Generate sqlc queries for the Postgres-backed job queue. `ClaimJob` uses the `SELECT ... FOR UPDATE SKIP LOCKED` pattern to allow multiple worker instances to safely claim jobs without collision. `FailJob` implements exponential backoff by computing the next `scheduled_at` from the current attempt count, and transitions to `dead` status after max retries.

**Queries:**

| Name | Operation | Key Details |
|---|---|---|
| `EnqueueJob` | INSERT | workspace_id, user_id, job_type, payload, scheduled_at; RETURNING * |
| `ClaimJob` | UPDATE | SET status='running', started_at=now(), attempts+1 WHERE id = (SELECT id FROM background_jobs WHERE status='pending' AND scheduled_at <= now() ORDER BY scheduled_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING * |
| `CompleteJob` | UPDATE | SET status='completed', result=$2, completed_at=now() WHERE id=$1 |
| `FailJob` | UPDATE | SET status=CASE WHEN attempts >= max_attempts THEN 'dead' ELSE 'pending' END, error_message=$2, scheduled_at=CASE WHEN attempts < max_attempts THEN now() + interval '1 minute' * power(5, attempts - 1) ELSE scheduled_at END WHERE id=$1 |
| `GetJobByID` | SELECT | WHERE id = $1 AND (workspace_id = $2 OR user_id = $3) |

**File:** `queries/background_jobs.sql`

**Acceptance Criteria:**
- [ ] `ClaimJob` uses `FOR UPDATE SKIP LOCKED` for safe concurrent claiming
- [ ] `FailJob` computes exponential backoff: 1m, 5m, 15m via `power(5, attempts - 1)`
- [ ] `FailJob` transitions to `dead` when `attempts >= max_attempts`
- [ ] `GetJobByID` checks workspace_id OR user_id for access control

---

### P4-14: GET /api/v1/invoices

**Description:**
List invoices for the authenticated user's workspace with cursor pagination, 30-day default date window, and optional status/customer filters. Returns monetary values as decimal strings only.

**Endpoint:** `GET /api/v1/invoices`

| Attribute | Value |
|---|---|
| Method | GET |
| Path | `/api/v1/invoices` |
| Auth | Required (user + workspace) |

**Query Parameters:**

| Param | Type | Default | Description |
|---|---|---|---|
| cursor | string | | Composite: ISO 8601 date + UUID |
| limit | int | 25 (max 100) | Page size |
| from | ISO 8601 date | Start of current month | Date filter start |
| to | ISO 8601 date | Today | Date filter end |
| status | string | | Filter: draft/finalized/voided/paid/partially_paid |
| customer_id | UUID | | Filter by customer |

**Response Envelope:**
```json
{
  "data": {
    "invoices": [
      {
        "id": "uuid",
        "invoice_number": "INV-001",
        "customer_id": "uuid",
        "customer_name": "string",
        "issue_date": "2025-01-15",
        "due_date": "2025-02-15",
        "status": "finalized",
        "subtotal": "5000.0000",
        "tax_amount": "250.0000",
        "discount_amount": "0.0000",
        "total_amount": "5250.0000",
        "paid_amount": "2000.0000",
        "balance_amount": "3250.0000",
        "currency_code": "NGN"
      }
    ],
    "next_cursor": "2025-01-15T00:00:00Z|uuid-or-null"
  },
  "meta": { "has_more": true }
}
```

**Security Considerations:**
- All monetary values as decimal strings — never floats (ref: 09 §Money Rules)
- Workspace-scoped: resolves workspace from session, never from client params
- Response headers include `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

**Acceptance Criteria:**
- [ ] Returns 30-day/current-month window by default
- [ ] Cursor pagination by (issue_date DESC, id DESC)
- [ ] All monetary values as decimal strings
- [ ] Rate limit headers present in response

---

### P4-15: POST /api/v1/invoices

**Description:**
Create a new draft invoice with line items. The backend calculates all totals server-side — the client never provides subtotal, tax_amount, discount_amount, total_amount, or balance_amount. Auto-generates a sequential `invoice_number` per workspace. Requires `Idempotency-Key` header.

**Endpoint:** `POST /api/v1/invoices`

| Attribute | Value |
|---|---|
| Method | POST |
| Path | `/api/v1/invoices` |
| Auth | Required (user + workspace) |
| Idempotency | Required (`Idempotency-Key` header) |

**Request Payload:**
```json
{
  "customer_id": "uuid",
  "issue_date": "2025-01-15",
  "due_date": "2025-02-15",
  "currency_code": "NGN",
  "notes": "string",
  "items": [
    {
      "description": "Web design service",
      "quantity": "1.0000",
      "unit_price": "5000.0000",
      "tax_rate": "5.00",
      "discount_amount": "0.0000",
      "sort_order": 0
    }
  ]
}
```

**Response Envelope (201 Created):**
```json
{
  "data": {
    "invoice": { "...full invoice object with server-calculated totals..." },
    "items": [ { "...created line items..." } ]
  }
}
```

**Behavior/Processing Steps:**
1. Validate `Idempotency-Key` — check for existing request with same key
2. Validate customer belongs to workspace
3. Parse all monetary strings as decimals — reject unsafe formats
4. Calculate server-side: subtotal, tax_amount, discount_amount, total_amount (sum of item totals), balance_amount = total_amount, paid_amount = 0
5. Auto-generate invoice_number (e.g. INV-0001 sequential per workspace)
6. Set status = 'draft'
7. Insert invoice + invoice_items in single database transaction
8. Return 201 with full invoice and items

**Security Considerations:**
- Item totals computed server-side — never trusted from client (ref: 09 §Property-Level Authorization)
- `workspace_id` resolved from session, not from request body
- `created_by_id` set from authenticated user, not from client

**Acceptance Criteria:**
- [ ] Returns 201 Created with full invoice and items
- [ ] All monetary totals calculated server-side
- [ ] `invoice_number` auto-generated and unique per workspace
- [ ] `Idempotency-Key` required and enforced
- [ ] Creates invoice + items in single DB transaction

---

### P4-16: GET /api/v1/invoices/{id}

**Description:**
Retrieve a single invoice with all its line items. Validates that the invoice belongs to the authenticated user's workspace (object-level authorization per 09 §Object-Level Authorization).

**Endpoint:** `GET /api/v1/invoices/{id}`

**Response Envelope:**
```json
{
  "data": {
    "invoice": {
      "id": "uuid",
      "workspace_id": "uuid",
      "customer_id": "uuid",
      "invoice_number": "INV-001",
      "issue_date": "2025-01-15",
      "due_date": "2025-02-15",
      "status": "finalized",
      "subtotal": "5000.0000",
      "tax_amount": "250.0000",
      "discount_amount": "0.0000",
      "total_amount": "5250.0000",
      "paid_amount": "2000.0000",
      "balance_amount": "3250.0000",
      "currency_code": "NGN",
      "notes": "string",
      "metadata": {},
      "voided_at": null,
      "voided_by_id": null,
      "created_by_id": "uuid",
      "created_at": "timestamp",
      "updated_at": "timestamp"
    },
    "items": [
      {
        "id": "uuid",
        "description": "Web design service",
        "quantity": "1.0000",
        "unit_price": "5000.0000",
        "tax_rate": "5.00",
        "discount_amount": "0.0000",
        "total_amount": "5000.0000",
        "sort_order": 0
      }
    ]
  }
}
```

**Security Considerations:**
- Object-level auth: invoice must belong to user's workspace (ref: 09 §Object-Level Authorization)
- Returns 404 if not found or not owned — do not leak existence to other tenants

**Acceptance Criteria:**
- [ ] Returns full invoice with items
- [ ] Returns 404 if invoice doesn't belong to workspace
- [ ] All monetary values as decimal strings

---

### P4-17: PATCH /api/v1/invoices/{id}

**Description:**
Update a draft invoice and its line items. Only draft invoices can be edited — attempting to patch a finalized or voided invoice returns 422. If `items` is provided, all existing items are deleted and recreated within the same transaction. Totals are recalculated server-side.

**Endpoint:** `PATCH /api/v1/invoices/{id}`

**Request Payload:**
```json
{
  "customer_id": "uuid?",
  "issue_date": "date?",
  "due_date": "date?",
  "notes": "string?",
  "items": [
    {
      "description": "string",
      "quantity": "decimal-string",
      "unit_price": "decimal-string",
      "tax_rate": "decimal-string?",
      "discount_amount": "decimal-string?",
      "sort_order": 0
    }
  ]
}
```

**Response Envelope:**
```json
{
  "data": {
    "invoice": { "...updated invoice with recalculated totals..." },
    "items": [ "...recreated items..." ]
  }
}
```

**Behavior/Processing Steps:**
1. Validate invoice belongs to workspace
2. Check `status = 'draft'` — return 422 if not draft
3. If `items` provided, delete all existing items and insert new ones in same tx
4. Recalculate all totals server-side
5. Return updated invoice + items

**Security Considerations:**
- Draft-only guard prevents mutating finalized records (ref: 05 §Invoices, 09 §Immutability Rules)
- Totals recalculated server-side — never trusted from client

**Acceptance Criteria:**
- [ ] Returns 422 VALIDATION_ERROR if invoice is not draft
- [ ] If items provided, replaces all items atomically
- [ ] Totals recalculated server-side after item changes
- [ ] All fields optional (partial update)

---

### P4-18: POST /api/v1/invoices/{id}/finalize

**Description:**
Finalize a draft invoice, making it immutable. Creates balanced ledger entries (debit Accounts Receivable, credit Income) within the same database transaction. Finalized invoices cannot be PATCHed or hard-deleted.

**Endpoint:** `POST /api/v1/invoices/{id}/finalize`

**Response Envelope:**
```json
{
  "data": {
    "invoice": { "...status='finalized'..." }
  }
}
```

**Behavior/Processing Steps:**
1. Validate invoice belongs to workspace and `status = 'draft'`
2. Set `status = 'finalized'`
3. Create balanced ledger entries in same tx:
   - Debit Accounts Receivable for `total_amount`
   - Credit Income for `total_amount`
4. Return updated invoice

**Security Considerations:**
- Balanced ledger entries must commit or rollback together (ref: 05 §Ledger, 06 §API Architecture)
- Finalized invoices are immutable (ref: 09 §Immutability Rules)

**Acceptance Criteria:**
- [ ] Returns 422 VALIDATION_ERROR if already finalized or voided
- [ ] Creates balanced ledger entries (total debits = total credits) before commit
- [ ] Invoice status transitions from `draft` to `finalized`
- [ ] Ledger write and invoice update in single DB transaction

---

### P4-19: POST /api/v1/invoices/{id}/void

**Description:**
Void a draft or finalized invoice. If the invoice was previously finalized, creates reversing ledger entries (debit Income, credit Accounts Receivable) to undo the original booking. Sets `voided_at` and `voided_by_id` for audit trail.

**Endpoint:** `POST /api/v1/invoices/{id}/void`

**Response Envelope:**
```json
{
  "data": {
    "invoice": {
      "...status='voided', voided_at='2025-01-20T10:00:00Z', voided_by_id='uuid'..."
    }
  }
}
```

**Behavior/Processing Steps:**
1. Validate invoice belongs to workspace
2. Check status is `draft` or `finalized` — return 422 if already voided
3. Set `status = 'voided'`, `voided_at = now()`, `voided_by_id = current_user_id`
4. If invoice was `finalized`, create reversing ledger entries in same tx:
   - Debit Income for original `total_amount`
   - Credit Accounts Receivable for original `total_amount`
5. Return voided invoice

**Security Considerations:**
- Reversing entries maintain ledger balance integrity (ref: 05 §Invoices, 09 §Immutability Rules)
- `voided_by_id` set from authenticated user — not client-supplied

**Acceptance Criteria:**
- [ ] Returns 422 VALIDATION_ERROR if already voided
- [ ] Sets voided_at and voided_by_id
- [ ] Creates reversing ledger entries if invoice was finalized
- [ ] Void and ledger reversal in single DB transaction

---

### P4-20: POST /api/v1/invoices/{id}/pdf (async)

**Description:**
Generate a PDF for a finalized invoice using the async job pattern. Enqueues a `pdf_generation` background job and returns 202 Accepted with a job_id. Free-plan invoices include "Generated by Rekordly" footer; paid-plan invoices render without branding.

**Endpoint:** `POST /api/v1/invoices/{id}/pdf`

**Request:** No body required.

**Response Envelope (202 Accepted):**
```json
{
  "data": {
    "job_id": "uuid"
  }
}
```

**Behavior/Processing Steps:**
1. Validate invoice belongs to workspace and `status = 'finalized'`
2. Enqueue background job with `job_type = 'pdf_generation'`, `payload = { invoice_id, workspace_id }`
3. Return 202 with job_id

**Security Considerations:**
- Job payload references DB records — doesn't embed large blobs (ref: 08 §Postgres Queue Rules)
- Plan-based branding enforced at generation time, not just frontend (ref: 10 §Invoice Branding)

**Acceptance Criteria:**
- [ ] Returns 202 Accepted with job_id
- [ ] Rejects non-finalized invoices
- [ ] Free-plan PDFs include "Generated by Rekordly" footer
- [ ] Paid-plan PDFs render without Rekordly branding

---

### P4-21: GET /api/v1/customers/{id}/wallet

**Description:**
Retrieve a customer's wallet balance. If no wallet exists for the customer, auto-creates one with `balance = 0` and returns it (lazy creation pattern). This ensures the wallet endpoint always returns a valid wallet object.

**Endpoint:** `GET /api/v1/customers/{id}/wallet`

**Response Envelope:**
```json
{
  "data": {
    "wallet": {
      "id": "uuid",
      "customer_id": "uuid",
      "balance": "50000.0000",
      "currency_code": "NGN",
      "updated_at": "2025-01-15T10:00:00Z"
    }
  }
}
```

**Acceptance Criteria:**
- [ ] Auto-creates wallet with balance=0 if none exists
- [ ] Returns wallet with balance as decimal string
- [ ] Validates customer belongs to workspace

---

### P4-22: POST /api/v1/customers/{id}/wallet/deposits

**Description:**
Record a customer wallet deposit within a single atomic database transaction. Credits the wallet balance, creates a wallet ledger entry, creates a payment row, and creates balanced ledger entries (debit Cash, credit Customer Liabilities). Deposits credit liabilities, not revenue — this is a core accounting rule.

**Endpoint:** `POST /api/v1/customers/{id}/wallet/deposits`

| Attribute | Value |
|---|---|
| Method | POST |
| Path | `/api/v1/customers/{id}/wallet/deposits` |
| Auth | Required (user + workspace) |
| Idempotency | Required (`Idempotency-Key` header) |

**Request Payload:**
```json
{
  "amount": "50000.0000",
  "currency_code": "NGN",
  "description": "Advance deposit for next order",
  "payment_method": "cash",
  "paid_at": "2025-01-15T10:00:00Z"
}
```

**Response Envelope:**
```json
{
  "data": {
    "wallet": { "...updated balance..." },
    "ledger_entry": { "...new deposit entry with balance_after..." }
  }
}
```

**Behavior/Processing Steps:**
1. Validate `Idempotency-Key`
2. Validate amount > 0 as decimal string
3. Validate customer belongs to workspace and currency matches wallet currency
4. Within a single database transaction:
   a. Credit `customer_wallets.balance` via `CreditWalletDeposit`
   b. Insert `customer_wallet_ledger` entry with `entry_type='deposit'` and `balance_after`
   c. Create a `payment` row
   d. Create balanced ledger entries: debit Cash, credit Customer Liabilities
5. Return updated wallet and ledger entry

**Security Considerations:**
- Wallet deposits credit Customer Liabilities, NOT Revenue (ref: 05 §Customer Wallets, 05 §Ledger)
- All balance updates in single DB transaction (ref: 05 §Customer Wallets, 09 §Wallet Rules)
- Amount validated as positive decimal before any DB writes

**Acceptance Criteria:**
- [ ] Wallet balance increased by deposit amount
- [ ] Ledger entry created with `entry_type='deposit'` and `balance_after`
- [ ] Balanced ledger entries: debit Cash, credit Customer Liabilities
- [ ] Payment row created
- [ ] All operations in single DB transaction
- [ ] `Idempotency-Key` required and enforced

---

### P4-23: GET /api/v1/customers/{id}/wallet/ledger

**Description:**
List wallet ledger entries for a customer with cursor pagination by (created_at DESC, id DESC). Provides an immutable audit trail of all balance-changing events.

**Endpoint:** `GET /api/v1/customers/{id}/wallet/ledger`

**Query Parameters:**

| Param | Type | Default | Description |
|---|---|---|---|
| cursor | string | | Composite cursor |
| limit | int | 25 (max 100) | Page size |
| from | ISO 8601 date | | Date filter start |
| to | ISO 8601 date | | Date filter end |

**Response Envelope:**
```json
{
  "data": {
    "entries": [
      {
        "id": "uuid",
        "entry_type": "deposit",
        "amount": "50000.0000",
        "balance_after": "50000.0000",
        "currency_code": "NGN",
        "reference_type": "payment",
        "reference_id": "uuid",
        "description": "Advance deposit",
        "created_at": "2025-01-15T10:00:00Z"
      }
    ],
    "next_cursor": "..."
  },
  "meta": { "has_more": true }
}
```

**Acceptance Criteria:**
- [ ] Cursor-paginated by (created_at DESC, id DESC)
- [ ] Validates customer belongs to workspace
- [ ] All monetary values as decimal strings

---

### P4-24: GET /api/v1/loans

**Description:**
List loans for the authenticated user's workspace with cursor pagination, direction/status filters, and 30-day default date window.

**Endpoint:** `GET /api/v1/loans`

**Query Parameters:**

| Param | Type | Default | Description |
|---|---|---|---|
| cursor | string | | Composite cursor |
| limit | int | 25 (max 100) | Page size |
| from | ISO 8601 date | Start of current month | Date filter start |
| to | ISO 8601 date | Today | Date filter end |
| direction | string | | borrowed or lent |
| status | string | | active, fully_repaid, voided |

**Response Envelope:**
```json
{
  "data": {
    "loans": [
      {
        "id": "uuid",
        "direction": "borrowed",
        "principal_amount": "100000.0000",
        "current_balance": "40000.0000",
        "counterparty_name": "Segun",
        "start_date": "2025-01-01",
        "due_date": "2025-06-30",
        "status": "active",
        "currency_code": "NGN"
      }
    ]
  },
  "meta": { "has_more": false, "next_cursor": "..." }
}
```

**Acceptance Criteria:**
- [ ] Defaults to 30-day/current-month window
- [ ] Cursor-paginated by (start_date DESC, id DESC)
- [ ] Supports direction and status filters
- [ ] All monetary values as decimal strings

---

### P4-25: POST /api/v1/loans

**Description:**
Create a new loan record with `current_balance = principal_amount` and `status = 'active'`. Creates balanced ledger entries in the same transaction depending on direction: `borrowed` debits Cash and credits Loan Payable/Liability; `lent` debits Loan Receivable and credits Cash.

**Endpoint:** `POST /api/v1/loans`

| Attribute | Value |
|---|---|
| Method | POST |
| Path | `/api/v1/loans` |
| Auth | Required (user + workspace) |
| Idempotency | Required (`Idempotency-Key` header) |

**Request Payload:**
```json
{
  "direction": "borrowed",
  "principal_amount": "100000.0000",
  "counterparty_id": "uuid-or-null",
  "counterparty_name": "Segun",
  "start_date": "2025-01-01",
  "due_date": "2025-06-30",
  "currency_code": "NGN",
  "notes": "Loan from Segun for inventory"
}
```

**Response Envelope (201 Created):**
```json
{
  "data": {
    "loan": { "...full loan object..." }
  }
}
```

**Behavior/Processing Steps:**
1. Validate `Idempotency-Key`
2. Validate `direction` is `borrowed` or `lent`
3. Validate `principal_amount > 0` as decimal string
4. Validate counterparty belongs to workspace if `counterparty_id` provided
5. Set `current_balance = principal_amount`, `status = 'active'`
6. Within a single database transaction:
   a. Insert loan record
   b. Create balanced ledger entries:
      - `borrowed`: debit Cash, credit Loan Payable/Liability
      - `lent`: debit Loan Receivable, credit Cash
7. Return 201 with loan

**Acceptance Criteria:**
- [ ] Returns 201 Created with full loan object
- [ ] `current_balance` initialized to `principal_amount`
- [ ] Direction-dependent ledger entries created in same tx
- [ ] Ledger entries balance before commit
- [ ] `Idempotency-Key` required and enforced

---

### P4-26: GET /api/v1/loans/{id}

**Description:**
Retrieve a single loan detail. Validates loan belongs to authenticated user's workspace.

**Endpoint:** `GET /api/v1/loans/{id}`

**Response Envelope:**
```json
{
  "data": {
    "loan": {
      "id": "uuid",
      "direction": "borrowed",
      "principal_amount": "100000.0000",
      "current_balance": "40000.0000",
      "counterparty_name": "Segun",
      "start_date": "2025-01-01",
      "due_date": "2025-06-30",
      "status": "active",
      "currency_code": "NGN",
      "notes": "string",
      "created_at": "timestamp",
      "updated_at": "timestamp"
    }
  }
}
```

**Acceptance Criteria:**
- [ ] Returns full loan detail
- [ ] Returns 404 if loan doesn't belong to workspace
- [ ] All monetary values as decimal strings

---

### P4-27: POST /api/v1/loans/{id}/repayments

**Description:**
Record a loan repayment with overpayment rejection. Within a single database transaction: reduces loan balance, auto-transitions to `fully_repaid` if balance reaches 0, creates a payment row, creates a linked transaction, and creates balanced ledger entries. Rejects repayments that exceed `current_balance` with `OVERPAYMENT_NOT_ALLOWED`.

**Endpoint:** `POST /api/v1/loans/{id}/repayments`

| Attribute | Value |
|---|---|
| Method | POST |
| Path | `/api/v1/loans/{id}/repayments` |
| Auth | Required (user + workspace) |
| Idempotency | Required (`Idempotency-Key` header) |

**Request Payload:**
```json
{
  "amount": "10000.0000",
  "payment_method": "transfer",
  "paid_at": "2025-01-20T12:00:00Z",
  "notes": "Partial repayment"
}
```

**Response Envelope:**
```json
{
  "data": {
    "loan": { "...updated loan with reduced balance..." },
    "transaction": { "...new repayment transaction..." },
    "payment": { "...new payment row..." }
  }
}
```

**Behavior/Processing Steps:**
1. Validate `Idempotency-Key`
2. Validate loan belongs to workspace and `status = 'active'`
3. Validate `amount > 0` as decimal string
4. Validate `amount <= current_balance` — return 422 `OVERPAYMENT_NOT_ALLOWED` if exceeded
5. Within a single database transaction:
   a. Reduce `loans.current_balance` by `amount` via `RepayLoan` (sets `fully_repaid` if balance = 0)
   b. Create a `payment` row linked to the loan
   c. Create a linked `transaction` with `source_type='loan'` and `source_id=loan_id`
   d. Create balanced ledger entries:
      - `borrowed`: debit Loan Payable, credit Cash
      - `lent`: debit Cash, credit Loan Receivable
6. Return updated loan, transaction, and payment

**Security Considerations:**
- Overpayment rejection enforced at DB query level (`AND current_balance >= $2`) and service level
- All financial writes in single DB transaction (ref: 09 §Financial Integrity Security)

**Acceptance Criteria:**
- [ ] Returns `422 OVERPAYMENT_NOT_ALLOWED` if amount > current_balance
- [ ] Loan balance reduced by repayment amount
- [ ] Status auto-transitions to `fully_repaid` when balance reaches 0
- [ ] Payment row, transaction, and ledger entries created in same tx
- [ ] Ledger entries balance before commit
- [ ] `Idempotency-Key` required and enforced

---

### P4-28: GET /api/v1/jobs/{id}

**Description:**
Poll the status of an async background job. Returns 200 (not 202) for all statuses — the 202 pattern only applies to the initial enqueue call. Supports status values: `pending`, `running`, `completed`, `failed`, `dead`.

**Endpoint:** `GET /api/v1/jobs/{id}`

**Response Envelope:**
```json
{
  "data": {
    "job": {
      "id": "uuid",
      "job_type": "pdf_generation",
      "status": "completed",
      "result": {
        "download_url": "/api/v1/exports/uuid/download"
      },
      "error_message": null,
      "attempts": 1,
      "created_at": "timestamp",
      "completed_at": "timestamp"
    }
  }
}
```

**Acceptance Criteria:**
- [ ] Returns job status for all states: pending, running, completed, failed, dead
- [ ] Validates job belongs to user's workspace or user_id
- [ ] Returns `result` payload when completed
- [ ] Returns `error_message` when failed

---

### P4-29: Worker: PDF Generation Job Handler

**Description:**
Go worker handler for `job_type='pdf_generation'`. Reads invoice data from the database, renders a formatted PDF with line items, calculates totals, applies plan-based branding, stores the file to object storage, and updates the job result. Uses a 30-second timeout per job.

**Technical Details:**

**Processing Steps:**
1. Claim job from queue via `ClaimJob`
2. Read `payload.invoice_id` and `payload.workspace_id`
3. Fetch invoice + items + customer from DB
4. Render PDF using `github.com/go-pdf/fpdf` (ref: 13 §PDF Generation) with:
   - Invoice number and workspace business name
   - Customer details
   - Line items table (description, qty, unit price, tax, total)
   - Subtotal, tax total, discount, grand total
   - Paid amount and balance due
   - Issue date and due date
   - Free-plan: "Generated by Rekordly" footer text (ref: 10 §Invoice Branding)
   - Paid-plan: no branding footer
5. Store generated PDF to object storage (or app-managed temp storage during early MVP per 08 §Storage)
6. Update `background_jobs`: `status='completed'`, `result={"download_url": "...", "filename": "INV-001.pdf", "expires_at": "..."}`
7. On failure: call `FailJob` which increments attempts and schedules retry with exponential backoff

**Configuration:**
- Timeout: `context.WithTimeout` of 30 seconds (ref: 08 §Worker And Queue Guardrails)
- Library: `github.com/go-pdf/fpdf`
- Storage: Object storage with expiry metadata

**Acceptance Criteria:**
- [ ] Generates PDF with all invoice data (header, items, totals)
- [ ] Free-plan PDFs include "Generated by Rekordly" footer
- [ ] Paid-plan PDFs render without Rekordly branding
- [ ] Stores file to object storage and updates job result
- [ ] Uses `context.WithTimeout` of 30 seconds
- [ ] On failure, calls `FailJob` for retry with backoff

---

### P4-30: Invoice Creation/Preview UI

**Description:**
Invoice creation form as a reusable `<InvoiceFormDrawer />` component. Uses `react-hook-form` + `zod` for validation. Supports dynamic line items with running totals, draft save, and a preview mode that renders a read-only view before saving.

**Component Hierarchy:**
```
<InvoiceFormDrawer />
  ├── <CustomerSelect /> (searchable dropdown)
  ├── <DatePicker /> (issue date)
  ├── <DatePicker /> (due date, optional)
  ├── <CurrencySelect /> (defaulted to workspace currency)
  ├── <LineItemsSection />
  │   ├── <LineItemRow /> (description, qty, unit_price, tax, discount, computed total)
  │   └── "Add Item" button
  ├── <RunningTotals /> (subtotal, total tax, total discount, grand total)
  └── Actions: "Save as Draft" | "Preview"
```

**Props/State:**

| Prop/State | Type | Description |
|---|---|---|
| `customerId` | string (uuid) | Selected customer |
| `issueDate` | string | Issue date |
| `dueDate` | string? | Due date (optional) |
| `currencyCode` | string | Currency (default: workspace currency) |
| `notes` | string? | Notes |
| `items` | LineItem[] | Dynamic line items array |
| `isPreview` | boolean | Preview mode toggle |
| `isSubmitting` | boolean | Form submission state |

**Form Fields & Validation (Zod Schema):**

| Field | Type | Validation |
|---|---|---|
| customer_id | string (uuid) | Required, valid UUID |
| issue_date | string | Required, valid date |
| due_date | string | Optional, valid date |
| currency_code | string | Required, length 3 |
| notes | string | Optional |
| items | array | Required, min 1 item |
| items[].description | string | Required, min 1 char |
| items[].quantity | string | Required, parseDecimal > 0 |
| items[].unit_price | string | Required, parseDecimal >= 0 |
| items[].tax_rate | string | Optional |
| items[].discount_amount | string | Optional |

**State Behaviors:**
- **idle**: Form rendered with empty/defaults
- **loading**: "Saving..." spinner on submit button
- **success**: Redirect to invoice list, success toast
- **error**: Inline field errors from backend

**Design Tokens:**
- Primary button: `#009e10` (green) for "Save as Draft"
- Font: Sora for total amounts, Figtree for labels (ref: 11 §Typography)
- Card: rounded dashboard cards (ref: 11 §Layout System)

**Acceptance Criteria:**
- [ ] Form validates with react-hook-form + zod
- [ ] Dynamic line items: add/remove rows
- [ ] Running totals computed client-side for preview; server-side for actual save
- [ ] "Save as Draft" POSTs to `/api/v1/invoices`
- [ ] "Preview" renders read-only invoice within drawer
- [ ] API calls use `@tanstack/react-query` mutation

---

### P4-31: Invoice List/Detail/Payment UI

**Description:**
Invoice list page with DataTable, detail page with actions (finalize, void, PDF), and payment recording with split-payment support. Invoice status uses color-coded StatusChip components.

**Component Hierarchy:**
```
/dashboard/invoices (List Page)
  ├── <FinanceScopeToggle />
  ├── <DataTable />
  │   └── Columns: Invoice #, Customer, Issue Date, Due Date, Status, Total, Balance
  └── <StatusFilterDropdown />

/dashboard/invoices/[id] (Detail Page)
  ├── <InvoiceHeader /> (number, customer, status chip, dates)
  ├── <InvoiceItemsTable />
  ├── <InvoiceTotals />
  ├── Actions: Finalize | Void | Download PDF
  └── <PaymentSection />
      ├── <PaymentForm /> (method select, amount, paid_at)
      ├── <WalletBalanceIndicator /> (when method=wallet)
      ├── <SplitPaymentRows /> ("Add Payment Row")
      └── Running total + remaining balance
```

**Status Chip Colors:**

| Status | Color | Text |
|---|---|---|
| draft | gray | Draft |
| finalized | blue | Finalized |
| paid | green (#009e10) | Paid |
| partially_paid | orange (#fa8901) | Partially Paid |
| voided | red | Voided |
| overdue | red | Overdue |

**State Behaviors:**
- **loading**: SkeletonLoader for DataTable and detail page
- **success**: Data rendered with status chips
- **error**: Error toast with retry

**Acceptance Criteria:**
- [ ] DataTable supports cursor pagination, date filters, status filter
- [ ] Status chips use color + text (not color alone)
- [ ] "Finalize" button disabled if not draft
- [ ] "Void" button requires confirmation modal
- [ ] "Download PDF" triggers async job with polling (P4-35)
- [ ] Payment form supports split payments with running totals
- [ ] Wallet payment shows available balance and validates against it

---

### P4-32: Customer Wallet Deposit/Payment UI

**Description:**
Customer wallet management UI including deposit form, wallet balance StatCard, wallet ledger DataTable, and insufficient-balance inline messaging. Wallet balance is displayed as a debt/liability variant StatCard.

**Component Hierarchy:**
```
/dashboard/customers/[id] (Customer Detail Page)
  ├── <StatCard variant="debt/liability" /> (wallet balance)
  ├── <WalletDepositForm />
  │   ├── Amount (decimal string input)
  │   ├── Description (text input)
  │   ├── Payment Method (select: cash/transfer/POS)
  │   ├── Paid At (date picker, defaults to now)
  │   └── Submit → POST /api/v1/customers/{id}/wallet/deposits
  └── <DataTable /> (wallet ledger)
      └── Columns: Date, Type, Amount, Balance After, Reference, Description
```

**Form Fields & Validation:**

| Field | Type | Validation |
|---|---|---|
| amount | string | Required, parseDecimal > 0 |
| description | string | Optional |
| payment_method | enum | Required: cash/transfer/POS |
| paid_at | string | Required, valid datetime |

**Design Tokens:**
- StatCard debt/liability variant: orange (#fa8901) accent (ref: 11 §StatCard)
- Sora font for balance amount (ref: 11 §Typography)

**State Behaviors:**
- **idle**: Form rendered with empty fields
- **loading**: "Depositing..." spinner on submit
- **success**: Balance updated in cache, success toast
- **error**: Inline error "Insufficient wallet balance. Available: NGN X,XXX.XX" for wallet payment failures

**Acceptance Criteria:**
- [ ] Wallet balance StatCard uses debt/liability variant
- [ ] Deposit form validates with react-hook-form + zod
- [ ] Success updates wallet balance in `@tanstack/react-query` cache
- [ ] Insufficient balance for wallet payments shows inline error with available amount
- [ ] Ledger DataTable supports cursor pagination

---

### P4-33: Loan Tracker UI

**Description:**
Loan list page using DataTable with direction and status chips. Loans are business-only — hidden when Finance Scope Toggle is set to "Personal". Includes actionable empty state.

**Component Hierarchy:**
```
/dashboard/loans (List Page)
  ├── <FinanceScopeToggle /> (loans hidden in Personal view)
  ├── <DataTable />
  │   └── Columns: Counterparty, Direction, Principal, Current Balance, Start, Due, Status, Currency
  └── <EmptyState /> (actionable)
```

**Direction Chip Colors:**

| Direction | Color | Label |
|---|---|---|
| borrowed | orange (#fa8901) | Borrowed (liability) |
| lent | green (#009e10) | Lent (receivable) |

**Status Chip Colors:**

| Status | Color | Text |
|---|---|---|
| active | blue | Active |
| fully_repaid | green (#009e10) | Fully Repaid |
| voided | red | Voided |

**Empty State:**
"No loans yet. Record money you've borrowed or lent to start tracking debts." (ref: 11 §EmptyState — actionable, explains next step)

**Business-Only Scope:**
Loans hidden when Finance Scope Toggle = "Personal" (ref: 11 §Business-Only Actions In Personal View)

**Acceptance Criteria:**
- [ ] DataTable with direction and status chips
- [ ] Loans hidden in Personal scope view
- [ ] Actionable empty state with next-step guidance
- [ ] Filters: direction dropdown, status dropdown, date range
- [ ] Click row navigates to `/dashboard/loans/[id]`

---

### P4-34: Loan Repayment UI

**Description:**
Loan repayment form on the loan detail page. Displays current balance prominently, validates repayment amount doesn't exceed balance, and shows overpayment error from API inline.

**Component Hierarchy:**
```
/dashboard/loans/[id] (Loan Detail Page)
  ├── <StatCard /> (Current Balance — prominent, Sora font)
  ├── <LoanInfo /> (Principal, Direction, Counterparty, Dates)
  └── <LoanRepaymentForm />
      ├── Repayment Amount (decimal string input)
      ├── Payment Method (select: cash/transfer/POS)
      ├── Paid At (date picker)
      ├── Notes (optional)
      └── Submit → POST /api/v1/loans/{id}/repayments
```

**Form Fields & Validation:**

| Field | Type | Validation |
|---|---|---|
| amount | string | Required, parseDecimal > 0 AND ≤ current_balance |
| payment_method | enum | Required: cash/transfer/POS |
| paid_at | string | Required, valid datetime |
| notes | string | Optional |

**Validation Behavior:**
- On blur: if amount > current_balance, inline error: "Repayment cannot exceed current balance of NGN X,XXX.XX"
- On API 422 `OVERPAYMENT_NOT_ALLOWED`: display error inline

**Design Tokens:**
- Current Balance: Sora font, prominent size (ref: 11 §Typography — "Sora for headings, stat card titles, and financial summaries")

**Acceptance Criteria:**
- [ ] Current Balance displayed prominently with Sora font
- [ ] Repayment amount validated: > 0 and ≤ current_balance
- [ ] Inline error on overpayment with available balance shown
- [ ] On success: loan balance updated in cache, success toast
- [ ] `Idempotency-Key` sent with request

---

### P4-35: Async Job Status Polling in Frontend

**Description:**
Utility hook and inline status component for polling async job status. Used by PDF download and export buttons across the app.

**Hook: `useAsyncJob`**

```typescript
useAsyncJob(jobId: string, options?: {
  pollInterval?: number,   // default: 2000ms
  onSuccess?: (result) => void,
  onError?: (error) => void
})
```

**Polling Logic:**
1. Call `GET /api/v1/jobs/{id}` every `pollInterval` ms while status is `pending` or `running`
2. Stop polling when status is `completed`, `failed`, or `dead`
3. On `completed`: call `onSuccess` callback with `result` payload, show success toast
4. On `failed`: show error toast with `error_message`
5. On `dead`: show permanent error: "Job failed after multiple retries. Please try again."

**Component: `<AsyncJobStatus />`**

| Status | Visual |
|---|---|
| pending/running | Spinning loader |
| completed | Green check + download link |
| failed | Red X with error message |
| dead | Dead letter icon with permanent error message |

**Acceptance Criteria:**
- [ ] Hook polls every 2 seconds while pending/running
- [ ] Stops polling on terminal states (completed, failed, dead)
- [ ] Calls onSuccess with result payload on completion
- [ ] Shows appropriate toast messages for each terminal state
- [ ] Built on `@tanstack/react-query`

---

### P4-36: Wallet Balance Validation Messaging

**Description:**
Inline wallet balance indicator component displayed next to payment method selectors when "wallet" is chosen. Shows available balance, warns on insufficient funds, and disables submit when payment exceeds balance. Frontend messaging is UX guidance — backend still validates wallet balance transactionally.

**Component: `<WalletBalanceIndicator />`**

**Behavior:**
1. When payment method = "wallet", fetch balance via `GET /api/v1/customers/{id}/wallet`
2. Display: "Available wallet balance: NGN 50,000.00"
3. If wallet balance < entered payment amount: yellow warning "Insufficient wallet balance" + disable submit
4. If wallet balance = 0: orange "Customer has no wallet balance"
5. Cache balance with `@tanstack/react-query`

**Design Tokens:**
- Warning text: yellow/orange (#fa8901) (ref: 11 §Brand Tokens — "Secondary orange" for "Warning accents")
- Error state: disables submit button

**Security Note:**
- Backend validates wallet balance transactionally — frontend messaging is UX guidance only (ref: 09 §Wallet Rules, 11 §Financial UX Rules)

**Acceptance Criteria:**
- [ ] Shows available wallet balance when wallet payment method selected
- [ ] Yellow warning when payment amount exceeds balance
- [ ] Disables submit button when insufficient funds
- [ ] Orange message when wallet balance is zero
- [ ] Balance cached via `@tanstack/react-query`
- [ ] Backend validation remains authoritative

---

## Additional Notes

### Dependency Sequencing
1. **P4-01** (customers) must land before P4-02 (invoices FK to customers), P4-04 (wallets FK to customers), P4-06 (loans FK to customers)
2. **P4-02/P4-03** (invoices + items) must land before P4-14–P4-20 (invoice API routes)
3. **P4-04/P4-05** (wallets + ledger) must land before P4-11 (wallet queries), P4-21–P4-23 (wallet API routes)
4. **P4-06** (loans) must land before P4-12 (loan queries), P4-24–P4-27 (loan API routes)
5. **P4-07** (background_jobs) must land before P4-13 (job queries), P4-20 (PDF async), P4-28 (job status endpoint), P4-29 (worker handler)
6. Backend API routes (P4-14–P4-28) must be testable before frontend work begins
7. Frontend components (P4-30–P4-36) depend on their corresponding backend routes being operational

### Cross-Cutting Concerns
- **Immutability**: Finalized invoices, finalized wallet ledger entries, and finalized loan repayments are never hard-deleted or directly edited. Corrections use voids and reversing entries (ref: 05 §Guardrails, 09 §Immutability Rules).
- **Tenant isolation**: Every query includes `workspace_id`. Object-level auth checks on every `/{id}` route (ref: 09 §Authorization And Tenant Isolation).
- **Idempotency**: All mutation endpoints require `Idempotency-Key` header (ref: 06 §API Architecture, 09 §API Abuse Protection).
- **Money as strings**: All monetary values accepted and returned as decimal strings. Go uses `shopspring/decimal`, Postgres uses `NUMERIC(20,4)` (ref: 05 §Core Model, 09 §Money Rules, 13 §Decimal Math).
- **Ledger balance**: Every financial write creates balanced debit/credit entries before commit (ref: 05 §Ledger, 06 §API Architecture).
- **Rate limit headers**: All API responses include `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` (ref: 06 §API Architecture).
