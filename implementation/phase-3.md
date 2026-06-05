# Phase 3: Core Transactions & Manual Entry

## Goal

Build the financial core with manual entry first, so accounting rules are proven before AI is layered on top. By the end of Phase 3, users can manually create and review core financial records, ledger-backed financial writes are working, and scope filtering and smart defaults are visible.

**Ref:** Doc 12 §Phase 3, Doc 05 §Transactions / Ledger / Allocations / Payments / Sales And Purchases, Doc 06 §Transactions / Sales·Purchases / Payments, Doc 09 §Financial Integrity Security, Doc 11 §GlobalAddDrawer / DataTable / StatCard / Scope UI

---

## Section 1: Summary Table

| ID | Work Item | Owner Area | Acceptance Criteria |
|----|-----------|------------|---------------------|
| P3-01 | Migration: `transactions` table | Data | `transactions` table with type, scope_type, status, amount (NUMERIC), metadata JSONB; cursor pagination indexes; check constraint amount > 0. |
| P3-02 | Migration: `ledger_accounts` table | Data | `ledger_accounts` with name, account_type, is_default; unique on workspace+name; supports 9 default accounts. |
| P3-03 | Migration: `ledger_entries` table | Data | `ledger_entries` with debit/credit amounts, reversal_of_id; check constraints ensure each entry is debit OR credit; balanced before commit. |
| P3-04 | Migration: `transaction_allocations` table | Data | `transaction_allocations` for mixed transactions; scope_type + amount per allocation; check amount > 0. |
| P3-05 | Migration: `payments` table | Data | `payments` with method (cash/transfer/pos/wallet), amount, context refs (transaction/sale/purchase); check amount > 0. |
| P3-06 | Migration: `sales` table | Data | `sales` with total_amount, tax, discount, customer_id, transaction_id FK; check total_amount > 0. |
| P3-07 | Migration: `sale_items` table | Data | `sale_items` with name, quantity, unit_price, total_price; check all > 0. |
| P3-08 | Migration: `purchases` table | Data | `purchases` with total_amount, tax, tax_deductible, vendor_id, transaction_id FK; check total_amount > 0. |
| P3-09 | Migration: `purchase_items` table | Data | `purchase_items` with name, quantity, unit_price, total_price; check all > 0. |
| P3-10 | Seed default ledger accounts | Data | 9 default ledger accounts seeded per workspace (Cash, Income, Expense, Receivable, Payable, Customer Liability, Tax, Owner Equity, Adjustment). |
| P3-11 | sqlc queries: transactions CRUD | Data | Create, GetByID, ListWithCursorPagination, CountByWorkspace, Void, SumByTypeAndScope queries; all use shopspring/decimal. |
| P3-12 | sqlc queries: ledger entries | Data | Create, ListByTransaction, SumDebits, SumCredits, GetAccountByName, CreateReversalEntries queries. |
| P3-13 | sqlc queries: sales, purchases, payments, allocations | Data | CRUD + list with cursor pagination for sales, purchases, payments; allocation queries; all money columns use decimal. |
| P3-14 | `POST /api/v1/transactions` | Backend | Creates transaction with balanced ledger entries in DB transaction; validates decimal strings; enforces plan limits; mixed allocations validated. |
| P3-15 | `GET /api/v1/transactions` | Backend | Cursor pagination by occurred_at+id; default 30-day window; scope_type filter; workspace-scoped. |
| P3-16 | `GET /api/v1/transactions/{id}` | Backend | Returns transaction with allocations and ledger entries summary; workspace ownership checked. |
| P3-17 | `POST /api/v1/transactions/{id}/void` | Backend | Sets status voided; creates reversing ledger entries; verifies reversal balance; audit log. |
| P3-18 | `POST /api/v1/sales` | Backend | Creates sale + transaction + ledger entries + items + payments in single DB transaction; validates overpayment. |
| P3-19 | `GET /api/v1/sales` | Backend | Cursor pagination by sold_at+id; default 30-day window; workspace-scoped. |
| P3-20 | `POST /api/v1/purchases` | Backend | Creates purchase + transaction + ledger entries + items + payments in single DB transaction; validates tax_deductible. |
| P3-21 | `GET /api/v1/purchases` | Backend | Cursor pagination by purchased_at+id; default 30-day window; workspace-scoped. |
| P3-22 | `POST /api/v1/payments` | Backend | Records payment with overpayment rejection; wallet payments return 501 for Phase 3; ledger entry created. |
| P3-23 | `GET /api/v1/payments` | Backend | Cursor pagination by paid_at+id; default 30-day window; filter by sale/purchase/transaction. |
| P3-24 | Idempotency middleware for mutation endpoints | Backend | Checks Idempotency-Key header; replays stored responses; stores new responses; concurrent duplicates return 409. |
| P3-25 | Global Add Transaction Drawer (manual form first) | Frontend | Drawer with type selector, scope selector, amount, date, category, items, payments; react-hook-form + zod; submits to correct endpoint. |
| P3-26 | Transaction list DataTable with cursor pagination | Frontend | Table with columns, cursor pagination, scope filter, scope indicators, loading skeletons, empty state. |
| P3-27 | StatCards for basic totals | Frontend | Revenue/expense/profit/debt variants; skeleton state; scope-filtered; Sora font for values. |
| P3-28 | Scope selector inside Add Transaction drawer | Frontend | Business/Personal/Mixed/Transfer selector; defaults from dashboard scope; override always possible; mixed shows allocation sub-form. |
| P3-29 | Split Payment UI with running totals | Frontend | Payment rows with method + amount; running total + remaining balance; overpayment validation; wallet "coming soon." |
| P3-30 | Scope indicators in transaction lists | Frontend | Color-coded scope chips/dots: Business=green, Personal=blue, Mixed=orange, Transfer=gray/purple; color + text for accessibility. |

---

## Section 2: Detailed Descriptions

### P3-01: Migration: `transactions` Table

**Description:**
Create the `transactions` table as the primary user-facing financial activity entity. Every financial record in Rekordly — income, expense, sale, purchase, wallet deposit, wallet payment, loan repayment, and transfer — is represented as a transaction. The table supports the `scope_type` classification (business, personal, mixed, transfer) that is central to V2's personal/business finance separation. Amounts use `NUMERIC(20,4)` — never float (Ref: Doc 09 §Money Rules). Finalized transactions are immutable; corrections use void/reversal (Ref: Doc 05 §Transactions). All queries must be workspace-scoped.

**Table Schema:**

| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Unique transaction identifier |
| `workspace_id` | `UUID` | `NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE` | Tenant scope |
| `type` | `VARCHAR(50)` | `NOT NULL` | `'income'`, `'expense'`, `'sale'`, `'purchase'`, `'wallet_deposit'`, `'wallet_payment'`, `'loan_repayment'`, `'transfer'` |
| `scope_type` | `VARCHAR(20)` | `NOT NULL` | `'business'`, `'personal'`, `'mixed'`, `'transfer'` (Ref: Doc 05 §Transactions) |
| `status` | `VARCHAR(30)` | `NOT NULL DEFAULT 'finalized'` | `'draft'`, `'finalized'`, `'voided'` |
| `amount` | `NUMERIC(20,4)` | `NOT NULL` | Never float — Ref: Doc 09 §Money Rules |
| `currency_code` | `CHAR(3)` | `NOT NULL DEFAULT 'NGN'` | ISO 4217 currency code |
| `occurred_at` | `TIMESTAMPTZ` | `NOT NULL` | When the financial event occurred |
| `category` | `VARCHAR(100)` | nullable | User-assigned category |
| `tax_deductible` | `BOOLEAN` | `NOT NULL DEFAULT FALSE` | Whether this transaction is tax deductible |
| `description` | `TEXT` | nullable | Free-text description |
| `source_type` | `VARCHAR(50)` | nullable | `'sale'`, `'purchase'`, `'manual'`, `'ai_draft'` |
| `source_id` | `UUID` | nullable | FK to sale/purchase/ai_draft |
| `metadata` | `JSONB` | `NOT NULL DEFAULT '{}'` | AI metadata, custom tags, source context; NOT core financial truth |
| `voided_at` | `TIMESTAMPTZ` | nullable | When the transaction was voided |
| `voided_by_id` | `UUID` | nullable `REFERENCES users(id)` | Who voided it |
| `created_by_id` | `UUID` | `NOT NULL REFERENCES users(id)` | Who created it |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` | Record creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` | Last update timestamp |

**Check Constraint:** `amount > 0`

**Indexes:**

| Index | Definition | Rationale |
|-------|-----------|-----------|
| `idx_transactions_workspace_occurred` | `ON transactions(workspace_id, occurred_at DESC, id DESC)` | Cursor pagination by `occurred_at + id` (Ref: Doc 06 §Transactions) |
| `idx_transactions_workspace_scope` | `ON transactions(workspace_id, scope_type)` | Scope filtering for Finance Scope Toggle |
| `idx_transactions_workspace_type` | `ON transactions(workspace_id, type)` | Type filtering (income, expense, etc.) |
| `idx_transactions_source` | `ON transactions(source_type, source_id)` | Link back to originating record |

**Acceptance Criteria:**
- [ ] File `api/migrations/000012_transactions.up.sql` exists
- [ ] File `api/migrations/000012_transactions.down.sql` drops the table
- [ ] `amount` is `NUMERIC(20,4)`, never float
- [ ] Check constraint `amount > 0` enforced
- [ ] `scope_type` supports `'business'`, `'personal'`, `'mixed'`, `'transfer'`
- [ ] Cursor pagination index on `(workspace_id, occurred_at DESC, id DESC)` exists
- [ ] All required columns and constraints present

---

### P3-02: Migration: `ledger_accounts` Table

**Description:**
Create the `ledger_accounts` table as the accounting backbone. Ledger accounts define the chart of accounts for double-entry bookkeeping: Cash, Income, Expense, Receivable, Payable, Customer Liability, Tax, Owner Equity, and Adjustment (Ref: Doc 05 §Ledger). Each workspace gets its own set of ledger accounts, ensuring tenant isolation. Default accounts are seeded when a workspace is created.

**Table Schema:**

| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Unique account identifier |
| `workspace_id` | `UUID` | `NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE` | Tenant scope |
| `name` | `VARCHAR(100)` | `NOT NULL` | Account name (e.g., `'Cash'`, `'Income'`) |
| `account_type` | `VARCHAR(30)` | `NOT NULL` | `'asset'`, `'liability'`, `'equity'`, `'income'`, `'expense'` |
| `is_default` | `BOOLEAN` | `NOT NULL DEFAULT FALSE` | Whether this is a system-seeded default account |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` | Record creation timestamp |

**Indexes:**

| Index | Definition | Rationale |
|-------|-----------|-----------|
| `idx_ledger_accounts_workspace_name` | `UNIQUE ON ledger_accounts(workspace_id, name)` | One account per name per workspace |

**Acceptance Criteria:**
- [ ] File `api/migrations/000013_ledger_accounts.up.sql` exists
- [ ] File `api/migrations/000013_ledger_accounts.down.sql` drops the table
- [ ] Unique constraint on `(workspace_id, name)` works
- [ ] `account_type` supports `'asset'`, `'liability'`, `'equity'`, `'income'`, `'expense'`
- [ ] `is_default` flag for seeded accounts

---

### P3-03: Migration: `ledger_entries` Table

**Description:**
Create the `ledger_entries` table as the double-entry bookkeeping record. Every finalized financial action creates balanced ledger entries: total debits must equal total credits before commit (Ref: Doc 05 §Ledger). Entries are immutable after finalization; corrections use reversing entries via `reversal_of_id`. Each entry is either a debit or a credit, never both — enforced by a check constraint.

**Table Schema:**

| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Unique entry identifier |
| `workspace_id` | `UUID` | `NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE` | Tenant scope |
| `transaction_id` | `UUID` | `NOT NULL REFERENCES transactions(id) ON DELETE CASCADE` | Owning transaction |
| `ledger_account_id` | `UUID` | `NOT NULL REFERENCES ledger_accounts(id)` | Account debited or credited |
| `debit_amount` | `NUMERIC(20,4)` | `NOT NULL DEFAULT 0` | Debit amount |
| `credit_amount` | `NUMERIC(20,4)` | `NOT NULL DEFAULT 0` | Credit amount |
| `currency_code` | `CHAR(3)` | `NOT NULL DEFAULT 'NGN'` | ISO 4217 currency code |
| `entry_date` | `DATE` | `NOT NULL` | Date of the accounting entry |
| `description` | `TEXT` | nullable | Entry description |
| `reversal_of_id` | `UUID` | nullable `REFERENCES ledger_entries(id)` | Points to original entry if this is a reversal |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` | Record creation timestamp |

**Check Constraints:**
- `debit_amount >= 0 AND credit_amount >= 0`
- `(debit_amount > 0 AND credit_amount = 0) OR (credit_amount > 0 AND debit_amount = 0)` — each entry is either debit or credit, never both

**Indexes:**

| Index | Definition | Rationale |
|-------|-----------|-----------|
| `idx_ledger_entries_transaction` | `ON ledger_entries(transaction_id)` | Find all entries for a transaction |
| `idx_ledger_entries_account_date` | `ON ledger_entries(ledger_account_id, entry_date)` | Account balance queries by date |
| `idx_ledger_entries_workspace_date` | `ON ledger_entries(workspace_id, entry_date)` | Workspace-wide balance queries |

**Acceptance Criteria:**
- [ ] File `api/migrations/000014_ledger_entries.up.sql` exists
- [ ] File `api/migrations/000014_ledger_entries.down.sql` drops the table
- [ ] Check constraint: each entry is either debit or credit (not both, not neither)
- [ ] Check constraint: amounts are non-negative
- [ ] `reversal_of_id` supports void/reversal pattern
- [ ] All money columns use `NUMERIC(20,4)`

---

### P3-04: Migration: `transaction_allocations` Table

**Description:**
Create the `transaction_allocations` table for mixed personal/business transactions. When a transaction has `scope_type = 'mixed'`, allocation rows break down the amount into business and personal portions. Allocation totals must equal the transaction total (Ref: Doc 05 §Allocations). This enables split-ledger capabilities that did not exist in V1 (Ref: Doc 01 §V2 Direction).

**Table Schema:**

| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Unique allocation identifier |
| `transaction_id` | `UUID` | `NOT NULL REFERENCES transactions(id) ON DELETE CASCADE` | Owning transaction |
| `workspace_id` | `UUID` | `NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE` | Tenant scope |
| `scope_type` | `VARCHAR(20)` | `NOT NULL` | `'business'` or `'personal'` |
| `amount` | `NUMERIC(20,4)` | `NOT NULL` | Allocated amount |
| `percentage` | `NUMERIC(5,2)` | nullable | e.g., 70.00 for 70% |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` | Record creation timestamp |

**Check Constraint:** `amount > 0`

**Indexes:**

| Index | Definition | Rationale |
|-------|-----------|-----------|
| `idx_allocations_transaction` | `ON transaction_allocations(transaction_id)` | Find allocations for a transaction |

**Acceptance Criteria:**
- [ ] File `api/migrations/000015_transaction_allocations.up.sql` exists
- [ ] File `api/migrations/000015_transaction_allocations.down.sql` drops the table
- [ ] Check constraint `amount > 0` enforced
- [ ] `scope_type` supports `'business'` and `'personal'` (not `'mixed'` or `'transfer'` — those are for the parent transaction)

---

### P3-05: Migration: `payments` Table

**Description:**
Create the `payments` table for recording payments against transactions, sales, and purchases. Supports split payments — one sale or invoice can have multiple payment records, each with a different method (cash, transfer, POS, wallet) (Ref: Doc 05 §Payments And Split Payments). Total payment rows cannot exceed the amount due (validated in application logic). Finalized payments are immutable; corrections use voids and reversing entries.

**Table Schema:**

| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Unique payment identifier |
| `workspace_id` | `UUID` | `NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE` | Tenant scope |
| `transaction_id` | `UUID` | nullable `REFERENCES transactions(id) ON DELETE CASCADE` | Linked transaction |
| `sale_id` | `UUID` | nullable | FK to sales (added when sales table exists) |
| `purchase_id` | `UUID` | nullable | FK to purchases (added when purchases table exists) |
| `amount` | `NUMERIC(20,4)` | `NOT NULL` | Payment amount |
| `currency_code` | `CHAR(3)` | `NOT NULL DEFAULT 'NGN'` | ISO 4217 currency code |
| `method` | `VARCHAR(30)` | `NOT NULL` | `'cash'`, `'transfer'`, `'pos'`, `'wallet'` (Ref: Doc 05) |
| `reference` | `VARCHAR(255)` | nullable | External payment reference |
| `paid_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` | When payment was made |
| `voided_at` | `TIMESTAMPTZ` | nullable | When payment was voided |
| `voided_by_id` | `UUID` | nullable `REFERENCES users(id)` | Who voided it |
| `created_by_id` | `UUID` | `NOT NULL REFERENCES users(id)` | Who created it |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` | Record creation timestamp |

**Check Constraint:** `amount > 0`

**Indexes:**

| Index | Definition | Rationale |
|-------|-----------|-----------|
| `idx_payments_workspace` | `ON payments(workspace_id)` | Workspace-scoped queries |
| `idx_payments_transaction` | `ON payments(transaction_id)` | Payments for a transaction |
| `idx_payments_paid_at` | `ON payments(workspace_id, paid_at DESC)` | Cursor pagination by paid_at |

**Acceptance Criteria:**
- [ ] File `api/migrations/000016_payments.up.sql` exists
- [ ] File `api/migrations/000016_payments.down.sql` drops the table
- [ ] `method` supports `'cash'`, `'transfer'`, `'pos'`, `'wallet'`
- [ ] Check constraint `amount > 0` enforced
- [ ] Nullable FKs for `sale_id` and `purchase_id` (added via ALTER after sales/purchases tables)

---

### P3-06: Migration: `sales` Table

**Description:**
Create the `sales` table for recording business revenue from customer-facing transactions. Each sale creates a parent `transactions` row and balanced ledger entries. Sales support tax, discounts, and link to invoice records. MVP avoids complex inventory coupling (Ref: Doc 05 §Sales And Purchases). Settlement is handled through payment rows and ledger entries.

**Table Schema:**

| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Unique sale identifier |
| `workspace_id` | `UUID` | `NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE` | Tenant scope |
| `customer_id` | `UUID` | nullable | FK to customers (added in Phase 4) |
| `transaction_id` | `UUID` | `REFERENCES transactions(id) ON DELETE CASCADE` | Parent transaction |
| `total_amount` | `NUMERIC(20,4)` | `NOT NULL` | Sale total |
| `tax_amount` | `NUMERIC(20,4)` | `NOT NULL DEFAULT 0` | VAT/sales tax |
| `discount_amount` | `NUMERIC(20,4)` | `NOT NULL DEFAULT 0` | Discount applied |
| `currency_code` | `CHAR(3)` | `NOT NULL DEFAULT 'NGN'` | ISO 4217 currency code |
| `notes` | `TEXT` | nullable | Free-text notes |
| `status` | `VARCHAR(30)` | `NOT NULL DEFAULT 'finalized'` | `'draft'`, `'finalized'`, `'voided'` |
| `sold_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` | When the sale occurred |
| `voided_at` | `TIMESTAMPTZ` | nullable | When voided |
| `voided_by_id` | `UUID` | nullable `REFERENCES users(id)` | Who voided it |
| `created_by_id` | `UUID` | `NOT NULL REFERENCES users(id)` | Who created it |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` | Record creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` | Last update timestamp |

**Check Constraint:** `total_amount > 0`

**Indexes:**

| Index | Definition | Rationale |
|-------|-----------|-----------|
| `idx_sales_workspace` | `ON sales(workspace_id)` | Workspace-scoped queries |
| `idx_sales_transaction` | `ON sales(transaction_id)` | Find sale by parent transaction |
| `idx_sales_sold_at` | `ON sales(workspace_id, sold_at DESC)` | Cursor pagination by sold_at |

**Acceptance Criteria:**
- [ ] File `api/migrations/000017_sales.up.sql` exists
- [ ] File `api/migrations/000017_sales.down.sql` drops the table
- [ ] Check constraint `total_amount > 0` enforced
- [ ] `transaction_id` FK to `transactions(id)` is valid
- [ ] `customer_id` is nullable (FK added in Phase 4)

---

### P3-07: Migration: `sale_items` Table

**Description:**
Create the `sale_items` table for individual line items within a sale. Each item has a name, quantity, unit price, and total price. MVP avoids complex inventory coupling — items are descriptive, not linked to inventory records.

**Table Schema:**

| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Unique item identifier |
| `sale_id` | `UUID` | `NOT NULL REFERENCES sales(id) ON DELETE CASCADE` | Owning sale |
| `workspace_id` | `UUID` | `NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE` | Tenant scope |
| `name` | `VARCHAR(255)` | `NOT NULL` | Item description |
| `quantity` | `NUMERIC(20,4)` | `NOT NULL DEFAULT 1` | Quantity sold |
| `unit_price` | `NUMERIC(20,4)` | `NOT NULL` | Price per unit |
| `total_price` | `NUMERIC(20,4)` | `NOT NULL` | quantity × unit_price |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` | Record creation timestamp |

**Check Constraint:** `quantity > 0 AND unit_price > 0 AND total_price > 0`

**Indexes:**

| Index | Definition | Rationale |
|-------|-----------|-----------|
| `idx_sale_items_sale` | `ON sale_items(sale_id)` | Find items for a sale |

**Acceptance Criteria:**
- [ ] File `api/migrations/000018_sale_items.up.sql` exists
- [ ] File `api/migrations/000018_sale_items.down.sql` drops the table
- [ ] Check constraint ensures all amounts > 0
- [ ] FK to `sales(id)` with ON DELETE CASCADE

---

### P3-08: Migration: `purchases` Table

**Description:**
Create the `purchases` table for recording business buying and vendor spending. Each purchase creates a parent `transactions` row and balanced ledger entries. Purchases support tax-deductible tagging where applicable. MVP avoids complex inventory coupling (Ref: Doc 05 §Sales And Purchases).

**Table Schema:**

| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Unique purchase identifier |
| `workspace_id` | `UUID` | `NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE` | Tenant scope |
| `vendor_id` | `UUID` | nullable | FK to customers/vendors |
| `transaction_id` | `UUID` | `REFERENCES transactions(id) ON DELETE CASCADE` | Parent transaction |
| `total_amount` | `NUMERIC(20,4)` | `NOT NULL` | Purchase total |
| `tax_amount` | `NUMERIC(20,4)` | `NOT NULL DEFAULT 0` | Tax amount |
| `currency_code` | `CHAR(3)` | `NOT NULL DEFAULT 'NGN'` | ISO 4217 currency code |
| `tax_deductible` | `BOOLEAN` | `NOT NULL DEFAULT FALSE` | Whether this purchase is tax deductible |
| `notes` | `TEXT` | nullable | Free-text notes |
| `status` | `VARCHAR(30)` | `NOT NULL DEFAULT 'finalized'` | `'draft'`, `'finalized'`, `'voided'` |
| `purchased_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` | When the purchase occurred |
| `voided_at` | `TIMESTAMPTZ` | nullable | When voided |
| `voided_by_id` | `UUID` | nullable `REFERENCES users(id)` | Who voided it |
| `created_by_id` | `UUID` | `NOT NULL REFERENCES users(id)` | Who created it |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` | Record creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` | Last update timestamp |

**Check Constraint:** `total_amount > 0`

**Indexes:**

| Index | Definition | Rationale |
|-------|-----------|-----------|
| `idx_purchases_workspace` | `ON purchases(workspace_id)` | Workspace-scoped queries |
| `idx_purchases_transaction` | `ON purchases(transaction_id)` | Find purchase by parent transaction |
| `idx_purchases_purchased_at` | `ON purchases(workspace_id, purchased_at DESC)` | Cursor pagination by purchased_at |

**Acceptance Criteria:**
- [ ] File `api/migrations/000019_purchases.up.sql` exists
- [ ] File `api/migrations/000019_purchases.down.sql` drops the table
- [ ] Check constraint `total_amount > 0` enforced
- [ ] `tax_deductible` boolean field exists
- [ ] `transaction_id` FK to `transactions(id)` is valid

---

### P3-09: Migration: `purchase_items` Table

**Description:**
Create the `purchase_items` table for individual line items within a purchase. Same structure as `sale_items` but for purchases.

**Table Schema:**

| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Unique item identifier |
| `purchase_id` | `UUID` | `NOT NULL REFERENCES purchases(id) ON DELETE CASCADE` | Owning purchase |
| `workspace_id` | `UUID` | `NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE` | Tenant scope |
| `name` | `VARCHAR(255)` | `NOT NULL` | Item description |
| `quantity` | `NUMERIC(20,4)` | `NOT NULL DEFAULT 1` | Quantity purchased |
| `unit_price` | `NUMERIC(20,4)` | `NOT NULL` | Price per unit |
| `total_price` | `NUMERIC(20,4)` | `NOT NULL` | quantity × unit_price |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` | Record creation timestamp |

**Check Constraint:** `quantity > 0 AND unit_price > 0 AND total_price > 0`

**Indexes:**

| Index | Definition | Rationale |
|-------|-----------|-----------|
| `idx_purchase_items_purchase` | `ON purchase_items(purchase_id)` | Find items for a purchase |

**Acceptance Criteria:**
- [ ] File `api/migrations/000020_purchase_items.up.sql` exists
- [ ] File `api/migrations/000020_purchase_items.down.sql` drops the table
- [ ] Check constraint ensures all amounts > 0
- [ ] FK to `purchases(id)` with ON DELETE CASCADE

---

### P3-10: Seed Default Ledger Accounts

**Description:**
Seed default ledger accounts for each workspace. These 9 accounts form the chart of accounts for double-entry bookkeeping (Ref: Doc 05 §Ledger). A Go helper function `EnsureDefaultLedgerAccounts(workspaceID)` is created to seed accounts when a new workspace is created — called from the OTP verify flow so every new user starts with a complete chart of accounts.

**Default Accounts:**

| Name | Account Type | is_default |
|------|-------------|------------|
| `Cash` | `asset` | `TRUE` |
| `Income` | `income` | `TRUE` |
| `Expense` | `expense` | `TRUE` |
| `Receivable` | `asset` | `TRUE` |
| `Payable` | `liability` | `TRUE` |
| `Customer Liability` | `liability` | `TRUE` |
| `Tax` | `liability` | `TRUE` |
| `Owner Equity` | `equity` | `TRUE` |
| `Adjustment` | `equity` | `TRUE` |

**Implementation:**
- Migration `000021_seed_ledger_accounts.up.sql`: inserts accounts for any workspace that does not already have them
- Go helper function `EnsureDefaultLedgerAccounts(workspaceID)` in `internal/service/ledger.go`
- Called from OTP verify flow when a new workspace is created
- Down migration deletes rows where `is_default = TRUE`

**Acceptance Criteria:**
- [ ] Migration `000021_seed_ledger_accounts.up.sql` exists
- [ ] 9 default ledger accounts seeded per workspace
- [ ] Go helper `EnsureDefaultLedgerAccounts(workspaceID)` exists
- [ ] Helper is called from OTP verify flow for new workspaces
- [ ] Down migration deletes rows where `is_default = TRUE`
- [ ] Idempotent — does not duplicate accounts if already seeded

---

### P3-11: sqlc Queries: Transactions CRUD

**Description:**
Create all sqlc queries for transaction CRUD operations. These queries power the transaction endpoints (P3-14 through P3-17) and the dashboard aggregation. All money columns are returned as `shopspring/decimal.Decimal`. All queries are workspace-scoped. The `ListTransactions` query implements cursor pagination by `(occurred_at DESC, id DESC)` with N+1 fetch for `has_next` detection.

**Query Definitions:**

File: `api/sqlc/queries/transactions.sql`

| Query Name | Operation | Description |
|-----------|-----------|-------------|
| `CreateTransaction` | INSERT | Create transaction with all columns, returning `*` |
| `GetTransactionByID` | SELECT | Find by `id` AND `workspace_id` (object-level auth) |
| `ListTransactions` | SELECT | Cursor pagination by `(occurred_at, id)`, filtered by `workspace_id`, optional `scope_type`, `type`, date range. Fetch N+1 for `has_next` |
| `CountTransactionsByWorkspace` | SELECT COUNT | For plan limit enforcement |
| `VoidTransaction` | UPDATE | Set `status = 'voided'`, `voided_at`, `voided_by_id`. Only if `status = 'finalized'` |
| `SumTransactionsByTypeAndScope` | SELECT | `SUM(amount)` grouped by `type` and `scope_type` for dashboard aggregations |

**Cursor Pagination Pattern:**
```sql
WHERE workspace_id = $1
  AND (occurred_at, id) < ($cursor_occurred_at, $cursor_id)
  AND occurred_at >= $from
  AND occurred_at < $to
  -- optional: AND scope_type = $scope_type
  -- optional: AND type = $type
ORDER BY occurred_at DESC, id DESC
LIMIT $limit + 1  -- fetch N+1 to detect has_next
```

**Acceptance Criteria:**
- [ ] All 6 queries exist in `api/sqlc/queries/transactions.sql`
- [ ] `ListTransactions` supports cursor pagination by `(occurred_at DESC, id DESC)`
- [ ] All queries are workspace-scoped (include `workspace_id` filter)
- [ ] Money columns returned as `shopspring/decimal.Decimal`
- [ ] `sqlc generate` produces valid Go code

---

### P3-12: sqlc Queries: Ledger Entries

**Description:**
Create all sqlc queries for ledger entry operations. These queries power the double-entry bookkeeping system — creating entries, verifying balance, and generating reversals for voided transactions. The critical rule is that total debits must equal total credits before commit (Ref: Doc 05 §Ledger).

**Query Definitions:**

File: `api/sqlc/queries/ledger_entries.sql`

| Query Name | Operation | Description |
|-----------|-----------|-------------|
| `CreateLedgerEntry` | INSERT | Create ledger entry returning `*` |
| `ListLedgerEntriesByTransaction` | SELECT | Find all entries for a transaction, workspace-scoped |
| `SumDebitsByTransaction` | SELECT SUM | Sum debit_amount for balance verification |
| `SumCreditsByTransaction` | SELECT SUM | Sum credit_amount for balance verification |
| `GetLedgerAccountByName` | SELECT | Find account by workspace_id + name |
| `CreateReversalEntries` | INSERT | For each original entry of a voided transaction, create reversal with debit/credit swapped |

**Reversal Pattern:**
- For each original entry, create a new entry with `debit_amount` and `credit_amount` swapped
- Set `reversal_of_id` pointing to the original entry
- Verify reversal entries balance before commit

**Acceptance Criteria:**
- [ ] All 6 queries exist in `api/sqlc/queries/ledger_entries.sql`
- [ ] Money columns returned as `shopspring/decimal.Decimal`
- [ ] All queries are workspace-scoped
- [ ] `CreateReversalEntries` swaps debit/credit amounts correctly
- [ ] `sqlc generate` produces valid Go code

---

### P3-13: sqlc Queries: Sales, Purchases, Payments, Allocations

**Description:**
Create all sqlc queries for sales, purchases, payments, and allocations. These queries power the sale, purchase, and payment endpoints. All list queries use cursor pagination. All money columns use `shopspring/decimal.Decimal`. All queries are workspace-scoped.

**Query Definitions:**

**File: `api/sqlc/queries/sales.sql`**

| Query Name | Operation |
|-----------|-----------|
| `CreateSale` | INSERT returning `*` |
| `ListSales` | SELECT with cursor pagination by `sold_at DESC, id DESC`, filtered by `workspace_id`, date range |
| `GetSaleByID` | SELECT WHERE `id = $1 AND workspace_id = $2` |
| `CreateSaleItem` | INSERT returning `*` |

**File: `api/sqlc/queries/purchases.sql`**

| Query Name | Operation |
|-----------|-----------|
| `CreatePurchase` | INSERT returning `*` |
| `ListPurchases` | SELECT with cursor pagination by `purchased_at DESC, id DESC` |
| `GetPurchaseByID` | SELECT WHERE `id = $1 AND workspace_id = $2` |
| `CreatePurchaseItem` | INSERT returning `*` |

**File: `api/sqlc/queries/payments.sql`**

| Query Name | Operation |
|-----------|-----------|
| `CreatePayment` | INSERT returning `*` |
| `ListPayments` | SELECT with cursor pagination by `paid_at DESC, id DESC`, filter by `sale_id`, `purchase_id`, `transaction_id` |
| `SumPaymentsBySale` | SELECT SUM(`amount`) WHERE `sale_id = $1 AND voided_at IS NULL` |
| `SumPaymentsByPurchase` | SELECT SUM(`amount`) WHERE `purchase_id = $1 AND voided_at IS NULL` |

**File: `api/sqlc/queries/allocations.sql`**

| Query Name | Operation |
|-----------|-----------|
| `CreateAllocation` | INSERT returning `*` |
| `ListAllocationsByTransaction` | SELECT WHERE `transaction_id = $1` |

**Acceptance Criteria:**
- [ ] All queries exist in their respective files
- [ ] All list queries use cursor pagination
- [ ] Money columns returned as `shopspring/decimal.Decimal`
- [ ] All queries are workspace-scoped
- [ ] `SumPaymentsBySale` and `SumPaymentsByPurchase` exclude voided payments
- [ ] `sqlc generate` produces valid Go code

---

### P3-14: `POST /api/v1/transactions`

**Description:**
Implement the transaction creation endpoint — the core financial write operation. This endpoint creates a transaction with balanced ledger entries in a single database transaction. It validates decimal strings for money (rejecting float/scientific notation), enforces plan limits, handles mixed transaction allocations, and ensures total debits equal total credits before commit (Ref: Doc 05 §Ledger, Doc 09 §Ledger Rules). Protected fields (`workspace_id`, `created_by_id`, `status`, etc.) are never accepted from the request body (Ref: Doc 09 §Property-Level Authorization).

**Endpoint:**

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/v1/transactions` | Bearer token | Create a financial transaction |

**Request Payload:**

```json
{
  "type": "income",
  "scope_type": "business",
  "amount": "5000.00",
  "currency_code": "NGN",
  "occurred_at": "2025-01-15T10:30:00Z",
  "category": "Consulting",
  "tax_deductible": false,
  "description": "Client payment",
  "allocations": [
    { "scope_type": "business", "amount": "5000.00" }
  ]
}
```

**Response Envelope (201 Created):**

```json
{
  "data": {
    "id": "<uuid>",
    "type": "income",
    "scope_type": "business",
    "status": "finalized",
    "amount": "5000.0000",
    "currency_code": "NGN",
    "occurred_at": "2025-01-15T10:30:00Z",
    "category": "Consulting",
    "tax_deductible": false,
    "description": "Client payment",
    "allocations": [],
    "created_at": "...",
    "updated_at": "..."
  },
  "meta": {}
}
```

**Validation Rules:**
1. `type` must be one of: `'income'`, `'expense'`, `'sale'`, `'purchase'`, `'wallet_deposit'`, `'wallet_payment'`, `'loan_repayment'`, `'transfer'`
2. `scope_type` must be one of: `'business'`, `'personal'`, `'mixed'`, `'transfer'`
3. `amount` must be a valid decimal string, parseable by `shopspring/decimal`, > 0 (Ref: Doc 09 §Money Rules)
4. `currency_code` must be 3-char ISO code
5. If `scope_type = 'mixed'`, `allocations` array must be provided and `SUM(allocations.amount) = amount` exactly

**Business Logic (runs in a single DB transaction):**
1. INSERT into `transactions` with `status = 'finalized'`, `created_by_id = user_id`, `workspace_id = workspace_id` from auth context
2. Create balanced ledger entries based on `type`:
   - `'income'`: Debit Cash, Credit Income
   - `'expense'`: Debit Expense, Credit Cash
   - `'transfer'`: Debit Cash (dest), Credit Cash (source)
3. Total debits MUST equal total credits before commit (Ref: Doc 05 §Ledger)
4. If `scope_type = 'mixed'`, INSERT into `transaction_allocations`
5. If plan limit reached for transactions this month, return `403` with error code `PLAN_LIMIT_REACHED`

**Security Considerations:**
- Protected fields never accepted from request body (Ref: Doc 09 §Property-Level Authorization)
- All money validated as decimal strings (Ref: Doc 09 §Money Rules)
- Plan limits checked before write (Ref: Doc 10)
- Audit log for financial write with masked details

**Acceptance Criteria:**
- [ ] Endpoint creates transaction with balanced ledger entries
- [ ] All writes happen in a single DB transaction
- [ ] Decimal string validation rejects floats/scientific notation
- [ ] Mixed transactions require allocations where SUM = amount
- [ ] Plan limit check returns `403 PLAN_LIMIT_REACHED`
- [ ] Protected fields cannot be mass-assigned
- [ ] Audit log written for financial writes

---

### P3-15: `GET /api/v1/transactions`

**Description:**
Implement the transaction list endpoint with cursor pagination. Financial list endpoints must default to a 30-day or current-month window (Ref: Doc 06 §Cross-Cutting Rules). Offset pagination is not allowed (Ref: Doc 06 §Transactions). The Finance Scope Toggle filters by `scope_type` — `Business` view includes business records plus relevant mixed/transfer context (Ref: Doc 11 §Finance Scope Toggle).

**Endpoint:**

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/v1/transactions` | Bearer token | List transactions with cursor pagination |

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `cursor` | string | null | Opaque cursor from previous page |
| `limit` | int | 25 | Max 100 |
| `from` | ISO8601 | 30 days ago | Start date filter |
| `to` | ISO8601 | now | End date filter |
| `scope_type` | string | null | `'business'`, `'personal'`, `'mixed'`, `'transfer'` |
| `type` | string | null | `'income'`, `'expense'`, etc. |

**Response Envelope (200 OK):**

```json
{
  "data": [
    {
      "id": "<uuid>",
      "type": "income",
      "scope_type": "business",
      "status": "finalized",
      "amount": "5000.0000",
      "currency_code": "NGN",
      "occurred_at": "...",
      "category": "Consulting",
      "description": "Client payment"
    }
  ],
  "meta": {
    "next_cursor": "<opaque or null>",
    "has_more": true,
    "total_count": 142
  }
}
```

**Acceptance Criteria:**
- [ ] Cursor pagination by `(occurred_at DESC, id DESC)`
- [ ] Default 30-day window when no `from`/`to` provided
- [ ] `scope_type` filter works for Finance Scope Toggle
- [ ] All queries workspace-scoped
- [ ] No offset pagination
- [ ] `meta` includes `next_cursor`, `has_more`, `total_count`

---

### P3-16: `GET /api/v1/transactions/{id}`

**Description:**
Implement the transaction detail endpoint. Returns the full transaction including allocations (for mixed transactions) and a ledger entries summary. Object-level authorization is checked — the transaction must belong to the authenticated user's workspace (Ref: Doc 09 §Object-Level Authorization).

**Endpoint:**

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/v1/transactions/:id` | Bearer token | Get transaction details |

**Response Envelope (200 OK):**

```json
{
  "data": {
    "id": "<uuid>",
    "type": "income",
    "scope_type": "business",
    "status": "finalized",
    "amount": "5000.0000",
    "currency_code": "NGN",
    "occurred_at": "...",
    "category": "Consulting",
    "tax_deductible": false,
    "description": "...",
    "allocations": [],
    "ledger_entries": [
      { "ledger_account_name": "Cash", "debit_amount": "5000.0000", "credit_amount": "0" },
      { "ledger_account_name": "Income", "debit_amount": "0", "credit_amount": "5000.0000" }
    ],
    "voided_at": null,
    "created_by_id": "<uuid>",
    "created_at": "...",
    "updated_at": "..."
  },
  "meta": {}
}
```

**Acceptance Criteria:**
- [ ] Returns transaction with allocations and ledger entries
- [ ] Returns `404 NOT_FOUND` if transaction not in user's workspace
- [ ] Object-level authorization: transaction must belong to `workspace_id`

---

### P3-17: `POST /api/v1/transactions/{id}/void`

**Description:**
Implement the transaction void endpoint. This is the only way to correct a finalized transaction — finalized records are never hard-deleted or directly edited (Ref: Doc 09 §Immutability Rules). Voiding creates reversing ledger entries with debits and credits swapped, and `reversal_of_id` pointing to the original entries. The frontend must enforce confirmation before voiding (Ref: Doc 11 §Financial UX Rules).

**Endpoint:**

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/v1/transactions/:id/void` | Bearer token | Void a finalized transaction |

**Request Payload:**

```json
{
  "reason": "Duplicate entry"
}
```

**Behavior (runs in DB transaction):**
1. Look up transaction WHERE `id = :id AND workspace_id = :workspace_id AND status = 'finalized'`
2. If not found or already voided, return `404` or `409 CONFLICT`
3. Set `status = 'voided'`, `voided_at = now()`, `voided_by_id = user_id`
4. Create reversing ledger entries: for each original entry, create a new entry with debit/credit swapped and `reversal_of_id` pointing to the original
5. Verify reversal entries balance before commit
6. If the voided transaction was linked to a sale/purchase, update sale/purchase status accordingly

**Response Envelope (200 OK):**

```json
{
  "data": {
    "id": "<uuid>",
    "status": "voided",
    "voided_at": "...",
    "voided_by_id": "<uuid>",
    "reversal_entries": []
  },
  "meta": {}
}
```

**Security Considerations:**
- Only finalized transactions can be voided (not drafts, not already voided)
- Reversal entries must balance before commit
- Audit log for void event
- Destructive action — frontend must show confirmation dialog (Ref: Doc 11)

**Acceptance Criteria:**
- [ ] Voiding sets `status = 'voided'`, `voided_at`, `voided_by_id`
- [ ] Reversing ledger entries created with swapped debit/credit
- [ ] `reversal_of_id` points to original entries
- [ ] Reversal entries verified to balance before commit
- [ ] Already-voided transactions return `409 CONFLICT`
- [ ] Audit log written for void event

---

### P3-18: `POST /api/v1/sales`

**Description:**
Implement the sale creation endpoint. A sale is a composite operation that creates a parent transaction, balanced ledger entries, sale record, line items, and optional payment records — all in a single database transaction. If payments are provided, the sum must not exceed the sale total (Ref: Doc 05 §Payments — total payment rows cannot exceed amount due). Wallet payments are deferred to Phase 4.

**Endpoint:**

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/v1/sales` | Bearer token | Create a sale |

**Request Payload:**

```json
{
  "customer_id": "<uuid or null>",
  "currency_code": "NGN",
  "notes": "...",
  "sold_at": "2025-01-15T10:30:00Z",
  "items": [
    { "name": "Bag of Rice", "quantity": "2", "unit_price": "10000.00", "total_price": "20000.00" }
  ],
  "tax_amount": "0",
  "discount_amount": "0",
  "payments": [
    { "method": "cash", "amount": "20000.00" }
  ]
}
```

**Response Envelope (201 Created):**

```json
{
  "data": {
    "id": "<uuid>",
    "transaction_id": "<uuid>",
    "total_amount": "20000.0000",
    "tax_amount": "0",
    "discount_amount": "0",
    "currency_code": "NGN",
    "items": [],
    "payments": [],
    "status": "finalized",
    "sold_at": "...",
    "created_at": "..."
  },
  "meta": {}
}
```

**Validation:**
1. `items` must be non-empty array
2. Each item: `quantity > 0`, `unit_price > 0`, `total_price = quantity × unit_price`
3. `total_amount = SUM(items.total_price) + tax_amount - discount_amount`
4. If `payments` provided: `SUM(payments.amount) <= total_amount`
5. Wallet payments return `501 NOT_IMPLEMENTED` for Phase 3

**Business Logic (DB transaction):**
1. Create parent `transactions` row: `type = 'sale'`, `scope_type = 'business'`, `amount = total_amount`
2. Ledger: Debit Cash (or Receivable if unpaid), Credit Income
3. INSERT `sales` row linked to `transaction_id`
4. INSERT `sale_items` rows
5. If `payments` provided, INSERT `payment` rows

**Acceptance Criteria:**
- [ ] Creates sale + transaction + ledger entries + items + payments in single DB transaction
- [ ] Validates item math: quantity × unit_price = total_price
- [ ] Overpayment rejected: SUM(payments) <= total_amount
- [ ] Wallet payments return `501 NOT_IMPLEMENTED`
- [ ] Ledger entries balance before commit
- [ ] Plan limit checked before write

---

### P3-19: `GET /api/v1/sales`

**Description:**
Implement the sale list endpoint with cursor pagination. Default 30-day window. Workspace-scoped.

**Endpoint:**

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/v1/sales` | Bearer token | List sales with cursor pagination |

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `cursor` | string | null | Opaque cursor from previous page |
| `limit` | int | 25 | Max 100 |
| `from` | ISO8601 | 30 days ago | Start date filter |
| `to` | ISO8601 | now | End date filter |

**Response Envelope (200 OK):**

```json
{
  "data": [
    {
      "id": "<uuid>",
      "total_amount": "20000.0000",
      "currency_code": "NGN",
      "status": "finalized",
      "sold_at": "...",
      "customer_id": "<uuid>"
    }
  ],
  "meta": {
    "next_cursor": "<opaque or null>",
    "has_more": true
  }
}
```

**Acceptance Criteria:**
- [ ] Cursor pagination by `(sold_at DESC, id DESC)`
- [ ] Default 30-day window
- [ ] Workspace-scoped
- [ ] `meta` includes `next_cursor` and `has_more`

---

### P3-20: `POST /api/v1/purchases`

**Description:**
Implement the purchase creation endpoint. Similar to sales — creates a composite record with transaction, ledger entries, purchase record, line items, and optional payments in a single DB transaction. Purchases support `tax_deductible` tagging.

**Endpoint:**

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/v1/purchases` | Bearer token | Create a purchase |

**Request Payload:**

```json
{
  "vendor_id": "<uuid or null>",
  "currency_code": "NGN",
  "notes": "...",
  "purchased_at": "2025-01-15T10:30:00Z",
  "items": [
    { "name": "Office Supplies", "quantity": "5", "unit_price": "2000.00", "total_price": "10000.00" }
  ],
  "tax_amount": "0",
  "tax_deductible": true,
  "payments": [
    { "method": "transfer", "amount": "10000.00" }
  ]
}
```

**Business Logic (DB transaction):**
1. Create `transactions` row: `type = 'purchase'`, `scope_type = 'business'`, `amount = total_amount`, `tax_deductible`
2. Ledger: Debit Expense, Credit Cash (or Payable if unpaid)
3. INSERT `purchases` row, `purchase_items`, `payments` if provided

**Acceptance Criteria:**
- [ ] Creates purchase + transaction + ledger entries + items + payments in single DB transaction
- [ ] `tax_deductible` field saved correctly
- [ ] Same item/payment validation as sales
- [ ] Ledger entries balance before commit

---

### P3-21: `GET /api/v1/purchases`

**Description:**
Implement the purchase list endpoint with cursor pagination. Default 30-day window. Workspace-scoped.

**Endpoint:**

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/v1/purchases` | Bearer token | List purchases with cursor pagination |

**Query Parameters:** Same as sales (`cursor`, `limit`, `from`, `to`)

**Response Envelope (200 OK):**

```json
{
  "data": [
    {
      "id": "<uuid>",
      "total_amount": "10000.0000",
      "currency_code": "NGN",
      "tax_deductible": true,
      "status": "finalized",
      "purchased_at": "...",
      "vendor_id": "<uuid>"
    }
  ],
  "meta": {
    "next_cursor": "...",
    "has_more": true
  }
}
```

**Acceptance Criteria:**
- [ ] Cursor pagination by `(purchased_at DESC, id DESC)`
- [ ] Default 30-day window
- [ ] Workspace-scoped

---

### P3-22: `POST /api/v1/payments`

**Description:**
Implement the standalone payment creation endpoint. Payments can be recorded against a transaction, sale, or purchase. Overpayment is rejected transactionally — the sum of existing payments plus the new payment cannot exceed the amount due (Ref: Doc 05 §Payments, Doc 06 §Payments). Wallet payments require balance validation and will be fully implemented in Phase 4; for Phase 3, wallet payments return `501 NOT_IMPLEMENTED`.

**Endpoint:**

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/v1/payments` | Bearer token | Record a payment |

**Request Payload:**

```json
{
  "transaction_id": "<uuid or null>",
  "sale_id": "<uuid or null>",
  "purchase_id": "<uuid or null>",
  "amount": "5000.00",
  "currency_code": "NGN",
  "method": "cash",
  "reference": "TXN-123",
  "paid_at": "2025-01-15T10:30:00Z"
}
```

**Response Envelope (201 Created):**

```json
{
  "data": {
    "id": "<uuid>",
    "amount": "5000.0000",
    "currency_code": "NGN",
    "method": "cash",
    "reference": "TXN-123",
    "paid_at": "...",
    "created_at": "..."
  },
  "meta": {}
}
```

**Validation:**
1. At least one context reference must be provided (`transaction_id`, `sale_id`, or `purchase_id`)
2. `amount` must be valid decimal string > 0
3. `method` must be one of: `'cash'`, `'transfer'`, `'pos'`, `'wallet'`
4. Overpayment rejection: existing payments + new amount <= amount due
5. Wallet method: return `501 NOT_IMPLEMENTED` for Phase 3

**Business Logic (DB transaction):**
1. INSERT into `payments`
2. Create ledger entry for payment (Debit Cash, Credit Receivable or Debit Payable, Credit Cash)
3. Verify ledger balance before commit

**Acceptance Criteria:**
- [ ] Records payment with overpayment rejection
- [ ] Wallet payments return `501 NOT_IMPLEMENTED`
- [ ] At least one context reference required
- [ ] Ledger entry created for payment
- [ ] Ledger balance verified before commit
- [ ] Overpayment returns `400 OVERPAYMENT_NOT_ALLOWED`

---

### P3-23: `GET /api/v1/payments`

**Description:**
Implement the payment list endpoint with cursor pagination and optional filters by sale, purchase, or transaction.

**Endpoint:**

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/v1/payments` | Bearer token | List payments with cursor pagination |

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `cursor` | string | null | Opaque cursor from previous page |
| `limit` | int | 25 | Max 100 |
| `from` | ISO8601 | 30 days ago | Start date filter |
| `to` | ISO8601 | now | End date filter |
| `sale_id` | UUID | null | Filter by sale |
| `purchase_id` | UUID | null | Filter by purchase |
| `transaction_id` | UUID | null | Filter by transaction |

**Acceptance Criteria:**
- [ ] Cursor pagination by `(paid_at DESC, id DESC)`
- [ ] Default 30-day window
- [ ] Filter by `sale_id`, `purchase_id`, `transaction_id`
- [ ] Workspace-scoped

---

### P3-24: Idempotency Middleware for Mutation Endpoints

**Description:**
Implement the idempotency middleware that prevents duplicate record creation from retries or offline sync. Mutation endpoints require an `Idempotency-Key` header (Ref: Doc 06 §API Architecture). If a key is found in the `idempotency_keys` table, the stored response is returned without executing the handler. Concurrent duplicate keys return `409 IDEMPOTENCY_CONFLICT`.

**Configuration Details:**
- Checks for `Idempotency-Key` header on all `POST`/`PATCH`/`DELETE` requests
- Uses `idempotency_keys` table:

| Column | Type | Purpose |
|--------|------|---------|
| `id` | `UUID PK` | Row identifier |
| `key` | `VARCHAR(255) UNIQUE` | Idempotency key value |
| `workspace_id` | `UUID NOT NULL` | Tenant scope |
| `user_id` | `UUID NOT NULL` | Who submitted |
| `response_status` | `INT` | HTTP status code stored |
| `response_body` | `JSONB` | Response body stored |
| `created_record_type` | `VARCHAR(50)` | e.g., `'transaction'` |
| `created_record_id` | `UUID` | ID of created record |
| `created_at` | `TIMESTAMPTZ DEFAULT now()` | When key was stored |

**Behavior:**
1. If `Idempotency-Key` provided: look up in `idempotency_keys` table
2. If key found: return stored response without executing handler (idempotent replay)
3. If key not found: execute handler, store response in `idempotency_keys` before returning
4. If duplicate key arrives concurrently: return `409 IDEMPOTENCY_CONFLICT`
5. Keys expire after 24 hours (configurable)

**Migration Required:** `idempotency_keys` table creation

**Acceptance Criteria:**
- [ ] Middleware checks `Idempotency-Key` header on all mutation requests
- [ ] Existing key returns stored response without re-executing handler
- [ ] New key stores response after handler execution
- [ ] Concurrent duplicate returns `409 IDEMPOTENCY_CONFLICT`
- [ ] Keys expire after 24 hours
- [ ] Applied to all mutation endpoints (transactions, sales, purchases, payments)

---

### P3-25: Global Add Transaction Drawer (Manual Form First)

**Description:**
Implement the primary creation surface for financial records. The GlobalAddDrawer is triggered by the Quick Action FAB and provides a unified entry point for all transaction types. Phase 3 implements the manual form first — the AI-first "Type what happened" flow is deferred to Phase 5. The drawer adapts based on the selected transaction type, showing additional fields for sales (items, payments) and purchases (items, tax_deductible). The scope selector defaults to the current Finance Scope Toggle state but can be overridden (Ref: Doc 11 §Smart Defaults For Creation).

**Component Hierarchy:**

```
GlobalAddDrawer
  ├── Type Selector: Income | Expense | Sale | Purchase (segmented control)
  ├── Scope Selector: Business | Personal | Mixed | Transfer (compact button group)
  │     └── If Mixed: Allocation sub-form
  ├── Common Fields
  │     ├── amount (decimal input, zod validated)
  │     ├── currency_code (select, default workspace currency)
  │     ├── occurred_at (date picker, default today)
  │     ├── category (text input or select from recent)
  │     ├── description (textarea, optional)
  │     └── tax_deductible (toggle, for expenses/purchases only)
  ├── If type = Sale
  │     ├── items[] (name, quantity, unit_price, total_price)
  │     ├── tax_amount
  │     ├── discount_amount
  │     └── SplitPaymentForm
  ├── If type = Purchase
  │     ├── items[] (name, quantity, unit_price, total_price)
  │     ├── tax_amount
  │     └── SplitPaymentForm
  └── Submit Button
```

**Props/State:**

| State | Behavior |
|-------|----------|
| `idle` | Form editable, all fields interactive |
| `submitting` | Button spinner, fields disabled |
| `success` | Toast notification, drawer closes, lists refresh via react-query invalidation |
| `error` | Inline errors per field |

**Form Fields:**

| Field | Type | Validation | Default |
|-------|------|-----------|---------|
| `type` | segmented control | required | `'income'` |
| `scope_type` | button group | required | from Finance Scope Toggle |
| `amount` | decimal input | required, valid decimal string, > 0 | — |
| `currency_code` | select | required, 3-char ISO | workspace default |
| `occurred_at` | date picker | required | today |
| `category` | text/select | optional | — |
| `description` | textarea | optional | — |
| `tax_deductible` | toggle | boolean | `false` |

**Design Tokens (Ref: Doc 11):**
- HeroUI Drawer / Sheet
- Slides up from bottom on mobile, from right on desktop
- Uses `react-hook-form` + `zod` for validation (Ref: Doc 13)
- Primary green `#009e10` for submit button

**Acceptance Criteria:**
- [ ] Component at `web/src/components/global-add-drawer.tsx`
- [ ] Triggered by Quick Action FAB
- [ ] Type selector: Income, Expense, Sale, Purchase
- [ ] Scope selector defaults from Finance Scope Toggle, overrideable
- [ ] Sale type shows items + payment sections
- [ ] Purchase type shows items + tax_deductible
- [ ] Mixed scope shows allocation sub-form
- [ ] Uses `react-hook-form` + `zod`
- [ ] Submit calls correct endpoint
- [ ] Success: toast + close + list refresh
- [ ] Error: inline field errors

---

### P3-26: Transaction List DataTable with Cursor Pagination

**Description:**
Implement the shared DataTable component for displaying transaction lists. Supports cursor pagination (not offset), Finance Scope Toggle filtering, scope indicators, loading skeletons, and actionable empty states. Tables degrade into card layout on mobile (Ref: Doc 11 §Accessibility And Responsiveness). Voided records remain visible with clear voided status chip (Ref: Doc 11 §Financial UX Rules).

**Component Hierarchy:**

```
TransactionDataTable
  ├── Date Filters (from/to date pickers)
  ├── HeroUI Table
  │     ├── Columns: Date, Description, Category, Scope, Type, Amount, Status
  │     ├── Rows with scope indicators
  │     └── Voided rows with StatusChip
  ├── "Load More" button or infinite scroll (cursor pagination)
  ├── DataTableSkeleton (loading)
  └── EmptyState (no data)
```

**Columns:**

| Column | Data | Notes |
|--------|------|-------|
| Date | `occurred_at` | Formatted with `date-fns` |
| Description | `description` | Truncated if long |
| Category | `category` | Text label |
| Scope | `scope_type` | Colored dot/chip (P3-30) |
| Type | `type` | Income, Expense, etc. |
| Amount | `amount` | Formatted with currency code |
| Status | `status` | StatusChip: finalized, voided |

**Pagination:**
- "Load more" button or infinite scroll
- Passes `next_cursor` from `meta.next_cursor`
- Default 30-day window with date filter controls

**Design Tokens (Ref: Doc 11):**
- Scope indicators: Business=green, Personal=blue, Mixed=orange, Transfer=gray/purple
- Status chips: Paid (green), Voided (red), Draft (gray)
- Loading: `DataTableSkeleton`
- Empty: `EmptyState` with actionable CTA

**Acceptance Criteria:**
- [ ] Component at `web/src/components/transaction-data-table.tsx`
- [ ] Columns: Date, Description, Category, Scope, Type, Amount, Status
- [ ] Cursor pagination via "Load more" or infinite scroll
- [ ] Finance Scope Toggle filters by `scope_type`
- [ ] Scope indicators with color + text
- [ ] Mobile: card layout or horizontal scroll
- [ ] Loading: DataTableSkeleton
- [ ] Empty: actionable EmptyState
- [ ] Voided records visible with voided StatusChip

---

### P3-27: StatCards for Basic Totals

**Description:**
Implement the StatCard component for displaying financial summaries on the dashboard. StatCards support multiple variants for different financial contexts: revenue (green), expense (orange), profit (neutral), debt (red), budget (conditional), and tax (info). Each card includes a skeleton state that preserves dimensions (Ref: Doc 11 §StatCard). Cards are scope-filtered by the Finance Scope Toggle.

**Component Hierarchy:**

```
StatCard
  ├── Title (Sora font)
  ├── Value (Sora font, formatted with currency)
  ├── Timeframe label (Figtree font)
  └── Variant accent (border or icon color)
```

**Props:**

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `title` | `string` | Yes | Card title (e.g., "Revenue") |
| `value` | `string` | Yes | Formatted value (e.g., "₦50,000.00") |
| `variant` | `'revenue' \| 'expense' \| 'profit' \| 'debt' \| 'budget' \| 'tax'` | Yes | Visual variant |
| `currency_code` | `string` | Yes | Currency display |
| `timeframe` | `string` | Yes | e.g., "This month" |
| `loading` | `boolean` | Yes | Show skeleton state |

**Variant Colors (Ref: Doc 11 §StatCard, Doc 11 §Color Usage):**

| Variant | Accent Color | Usage |
|---------|-------------|-------|
| `revenue` | Primary green `#009e10` | Revenue, success, confirmed positive |
| `expense` | Secondary orange `#fa8901` | Expenses, warning |
| `profit` | Default/neutral | Profit calculations |
| `debt` | Red | Liabilities, negative balances |
| `budget` | Conditional (green/orange/red) | Budget status |
| `tax` | Info/neutral | Tax summaries |

**Data Source:**
- Dashboard fetches aggregated totals from `SumTransactionsByTypeAndScope` sqlc query
- Phase 6 will add a dedicated `GET /api/v1/dashboard/summary` endpoint
- Cards respect Finance Scope Toggle (business/personal/all)

**Acceptance Criteria:**
- [ ] Component at `web/src/components/stat-card.tsx`
- [ ] All 6 variants render with correct accent colors
- [ ] Skeleton state preserves dimensions (Ref: Doc 11)
- [ ] Shows currency and timeframe
- [ ] Scope-filtered values
- [ ] Sora font for title and value, Figtree for labels

---

### P3-28: Scope Selector Inside Add Transaction Drawer

**Description:**
Implement the scope selector as a sub-component of the GlobalAddDrawer. The selector renders as a compact button group: `Business | Personal | Mixed | Transfer`. It defaults to the current Finance Scope Toggle state but users can always override it (Ref: Doc 11 §Smart Defaults For Creation). If Mixed is selected, an allocation sub-form appears with two rows (Business amount, Personal amount) and a running total.

**Component Behavior:**
- Default: set by current Finance Scope Toggle state (Ref: Doc 11 §Smart Defaults For Creation)
- Override rule: users must always be able to override `scope_type` directly inside the drawer
- Users must NOT have to switch the main dashboard toggle just to record a different type of transaction (Ref: Doc 11)

**If Mixed:**
- Show allocation sub-form with two rows: Business amount, Personal amount
- Running total displayed
- Allocation amounts must sum to transaction total before submit

**Scope Indicator Colors (Ref: Doc 11 §Scope Indicators In Lists):**
- Business: green
- Personal: blue
- Mixed: orange
- Transfer: gray/purple

**Acceptance Criteria:**
- [ ] Scope selector renders as compact button group
- [ ] Default set by Finance Scope Toggle
- [ ] Override always possible within the drawer
- [ ] Mixed selection shows allocation sub-form
- [ ] Allocation running total displayed
- [ ] Allocation amounts must sum to transaction total
- [ ] Colors match Doc 11 scope indicators

---

### P3-29: Split Payment UI with Running Totals

**Description:**
Implement the split payment form as a sub-component used inside the GlobalAddDrawer when type is Sale or Purchase. The form allows adding multiple payment rows with different methods and amounts. Running totals show the total paid and remaining balance. Overpayment validation prevents the sum from exceeding the total amount due (Ref: Doc 11 §Financial UX Rules).

**Component Hierarchy:**

```
SplitPaymentForm
  ├── Total amount due (read-only)
  ├── Payment rows list (useFieldArray)
  │     └── Row: method select + amount input + remove button
  ├── "Add payment method" button
  ├── Running totals
  │     ├── Total paid: <sum>
  │     └── Remaining: <total - sum>
  └── Validation error (if overpaid)
```

**Payment Row Fields:**

| Field | Type | Options | Default |
|-------|------|---------|---------|
| `method` | select | Cash, Transfer, POS, Wallet | `'cash'` |
| `amount` | decimal input | — | remaining balance |

**Validation:**
- Total payments must not exceed total amount due
- If exceeded, show error and disable submit (Ref: Doc 11 §Financial UX Rules)
- Wallet method: show "Coming soon" for Phase 3

**State Management:**
- Uses `react-hook-form` `useFieldArray` for dynamic payment rows
- Running totals computed from field values

**Acceptance Criteria:**
- [ ] Component at `web/src/components/split-payment-form.tsx`
- [ ] "Total amount due" displayed at top
- [ ] Payment rows with method + amount
- [ ] "Add payment method" button appends rows
- [ ] "Remove" button on each row
- [ ] Running totals: Total paid + Remaining
- [ ] Overpayment validation with error message
- [ ] Wallet option shows "Coming soon"
- [ ] Uses `react-hook-form` useFieldArray

---

### P3-30: Scope Indicators in Transaction Lists

**Description:**
Implement color-coded scope indicators in the transaction list. Each transaction row displays a scope indicator using color plus text/icon — never color alone (Ref: Doc 11 §Accessibility And Responsiveness). The indicators must be visible without overwhelming the list.

**Scope Indicator Mapping (Ref: Doc 11 §Scope Indicators In Lists):**

| Scope | Color | Pattern |
|-------|-------|---------|
| Business | Primary green `#009e10` | Green dot/chip + "Business" label |
| Personal | Blue | Blue dot/chip + "Personal" label |
| Mixed | Secondary orange `#fa8901` | Orange dot/chip + "Mixed" label |
| Transfer | Gray/purple | Gray/purple dot/chip + "Transfer" label |

**Implementation Patterns (Ref: Doc 11 §Scope Indicators In Lists):**
- Subtle colored dot next to category
- Small scope icon
- Compact scope chip
- Scope label in metadata row

**Accessibility:**
- Color cannot be the only status signal (Ref: Doc 11)
- Use icons plus text for unfamiliar states

**View-Specific Behavior:**
- `All` view: all indicators visible
- `Business` view: business rows prominent; mixed/transfer rows show with contextual indicators
- `Personal` view: personal rows prominent; mixed/transfer rows show with contextual indicators

**Acceptance Criteria:**
- [ ] Each transaction row shows scope indicator
- [ ] Color mapping matches Doc 11 specification
- [ ] Indicators use color + text (not color alone)
- [ ] Visible without overwhelming the list
- [ ] View-specific behavior: Business/Personal views show contextual indicators

---

## Dependency / Sequencing Notes

1. **P3-01 through P3-09** (migrations) must run in order: `transactions` (012) → `ledger_accounts` (013) → `ledger_entries` (014) → `transaction_allocations` (015) → `payments` (016) → `sales` (017) → `sale_items` (018) → `purchases` (019) → `purchase_items` (020). FK dependencies require this ordering.
2. **P3-10** (seed ledger accounts) depends on P3-02 and should run before P3-14 (POST transactions needs ledger accounts).
3. **P3-11, P3-12, P3-13** (sqlc queries) depend on all Phase 3 migrations being applied. They must be complete before any backend endpoints can be implemented.
4. **P3-14** (POST transactions) is the critical path item — it proves the ledger-balancing logic. Build and test this before P3-18/P3-20 (sales/purchases).
5. **P3-17** (void transaction) depends on P3-14 and P3-12 (reversal entries query). Must be thoroughly tested for ledger integrity.
6. **P3-24** (idempotency middleware) should be implemented early and applied to all mutation endpoints. It requires its own migration (`idempotency_keys` table).
7. **P3-25** (Global Add Drawer) depends on P3-14/P3-18/P3-20/P3-22 backend endpoints being functional.
8. **P3-26** (transaction list) depends on P3-15 (GET transactions with cursor pagination).
9. **P3-27** (StatCards) depends on aggregate queries. Initially compute from `GET /api/v1/transactions`; dedicated `GET /api/v1/dashboard/summary` in Phase 6.
10. **P3-28 and P3-29** are sub-components of P3-25 but listed separately for clarity. Build as standalone components first, then integrate.
11. **P3-30** (scope indicators) can be built in parallel with P3-26.
12. All backend endpoints in Phase 3 must enforce: workspace scoping, plan limit checking, decimal string validation for money, and ledger balance verification before commit.
13. The `payments.sale_id` FK and `payments.purchase_id` FK may need to be added as ALTER TABLE if `sales` and `purchases` tables are created after `payments`, or the migration order can be adjusted.
