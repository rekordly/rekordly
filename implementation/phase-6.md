# Phase 6: Reports, Budgets, & Tax Readiness

**Goal:** Help users understand their money, budgets, and tax position using backend aggregates. Users can view meaningful summaries, budgets, and tax readiness reports. Reports use backend aggregate endpoints instead of client-side raw scans.

**Depends on:** Phase 3 (Core Transactions & Manual Entry) — all transaction types, ledger entries, and scope classifications must be operational for aggregate queries. Phase 4 (Invoices, Wallets, & Loans) — invoice, wallet, and loan data feed into dashboard summaries and tax reports. Phase 5 (AI-First Entry) — AI credit usage feeds into plan usage; AI-assisted budget creation is a possible extension.

**References:**
- Data model: `05-data-model.md` (§Budgets, §Notifications, §Exports / Documents)
- API architecture: `06-api-architecture.md` (§Budgets And Notifications, §Dashboard / Report Summaries, §Plans / Usage / Exports)
- User flows: `04-user-flows.md` (§Budgeting Flow With Notifications)
- Feature map: `03-feature-map.md` (§Basic Budgeting, §Tax Readiness Reports)
- Design guide: `11-design-guide.md` (§StatCard, §DataTable, §ExportButton, §EmptyState)
- Roadmap: `12-roadmap.md` (Phase 6)
- Tech stack: `13-tech-stack-and-libraries.md`
- Security: `09-security.md`
- Monetization: `10-monetization.md` (§Tax Readiness Reports, §Premium Feature Gates)

---

## Section 1: Summary Table

| ID | Work Item | Owner Area | Acceptance Criteria |
|----|-----------|------------|---------------------|
| P6-01 | Budgets Migration | Data | Migration creates `budgets` table with scope_type, timeframe enum, income/expense goals, status, metadata JSONB, and CHECK(end_date > start_date). |
| P6-02 | Budget Categories Migration | Data | Migration creates `budget_categories` with category/type/limit, alert_threshold percentage, computed status, and UNIQUE(budget_id, category, type). |
| P6-03 | Notifications Migration (3 tables) | Data | Migrations create `notification_preferences`, `notifications`, and `notification_deliveries` tables with email/pwa_push/in_app channels, read tracking, and delivery status. |
| P6-04 | Exports Migration (2 tables) | Data | Migrations create `exports` and `generated_documents` tables with export_type enum, job_id FK, expiry metadata, and file tracking. |
| P6-05 | sqlc Queries — Budgets CRUD | Backend | Budget + category CRUD queries: Get, List with scope/status filters, Create with categories in tx, Update, Archive, category actuals update. |
| P6-06 | sqlc Queries — Dashboard Summary Aggregates | Backend | Aggregate queries: income/expense/sale totals, outstanding invoices, active loan balances, wallet liabilities, transaction counts by scope, monthly cashflow. |
| P6-07 | sqlc Queries — Tax Readiness Calculations | Backend | Tax aggregate queries: VAT collected/paid, taxable income, deductible expenses, deductible breakdown by category — all with explicit date range params. |
| P6-08 | GET /api/v1/dashboard/summary | Backend | Returns aggregate dashboard summary with scope filter, date range, income/expense/sale totals, outstanding invoices, loan balances, wallet liabilities, and monthly cashflow. |
| P6-09 | GET /api/v1/reports/cashflow-summary | Backend | Returns cashflow summary with total inflow/outflow, inflow by source, outflow by category, and daily cashflow data. |
| P6-10 | GET /api/v1/reports/budget-summary | Backend | Returns budget summary for all active budgets or single budget detail with category-level progress and status. |
| P6-11 | GET /api/v1/budgets | Backend | Returns list of budgets with scope_type and status filters. |
| P6-12 | POST /api/v1/budgets | Backend | Creates budget with categories in single tx; validates scope_type, timeframe, amounts, and at least 1 category; plan-gated. |
| P6-13 | GET /api/v1/budgets/{id}/status | Backend | Recalculates category actuals from live transaction aggregates, computes status per category (on_track/warning/exceeded/under_target/met), returns budget + categories with progress. |
| P6-14 | Budget Alert Trigger Logic | Backend | After every finalized transaction, checks active budgets for threshold breaches and creates deduplicated notifications + delivery records. |
| P6-15 | Tax Readiness Endpoint | Backend | Plan-gated tax report: VAT collected/paid/net, taxable income, deductible expenses, taxable profit estimate, breakdowns, disclaimer; Free=no access, Starter=quarterly, Business/Pro=on-demand. |
| P6-16 | POST /api/v1/exports | Backend | Enqueues export job, creates exports row; returns 202 with export_id and job_id; plan-gated. |
| P6-17 | GET /api/v1/exports/{id} | Backend | Returns export status with file_url when completed; validates workspace ownership. |
| P6-18 | GET /api/v1/notifications | Backend | Returns notification list ordered by created_at DESC with unread_count meta; supports unread_only filter. |
| P6-19 | PATCH /api/v1/notifications/{id}/read | Backend | Marks notification as read; idempotent if already read. |
| P6-20 | Worker: CSV/PDF Export Job Handler | Backend/DevOps | Go worker generates CSV (transactions/tax) or PDF (tax readiness) exports, stores to object storage with expiry, updates export + job rows. |
| P6-21 | Worker: Notification Delivery Job | Backend/DevOps | Go worker delivers pending notifications via email (go-mail), PWA push (webpush-go), or in-app; updates delivery status; max 3 retries; SMS excluded. |
| P6-22 | Dashboard Charts & Report Summaries | Frontend | Dashboard upgrade with StatCards (revenue, expenses, net, invoices, loans, wallets), recharts BarChart for cashflow, ScopeToggle, DateRangePicker, all from backend aggregates. |
| P6-23 | Budget Setup UI | Frontend | Budget form with react-hook-form + zod, scope/timeframe selectors, dynamic categories with alert thresholds, smart scope defaults. |
| P6-24 | Budget Status Views | Frontend | Budget list DataTable with progress bars and status chips; detail page with category breakdown, color-coded progress bars, and status chips. |
| P6-25 | Tax Readiness Summary UI | Frontend | Tax report page with PlanGate, date range selector, StatCards (VAT, income, deductions), breakdown tables, disclaimer, and export buttons. |
| P6-26 | Export/PDF Download Buttons with Async Status | Frontend | ExportButton component with 6 states (ready, plan locked, starting, processing, download, failed), async job polling, and expiry info. |
| P6-27 | Budget Alert Notification UI | Frontend | NotificationBell in navbar with unread badge, dropdown panel with notification types (budget warning/exceeded, export ready, invoice overdue), mark-all-read, and navigation. |

---

## Section 2: Detailed Descriptions

### P6-01: Budgets Migration

**Description:**
Create the `budgets` table to support personal and business budgeting with weekly, monthly, and yearly timeframes. Each budget has income goals and expense limits, a scope_type for filtering, and metadata JSONB for extensibility. The CHECK constraint enforces that end_date is always after start_date.

**Technical Details:**

**Table: `budgets`**

| Column | Type | Constraints | Purpose |
|---|---|---|---|
| id | UUID | PK DEFAULT gen_random_uuid() | Primary key |
| workspace_id | UUID | NOT NULL FK → workspaces(id) ON DELETE CASCADE | Tenant scoping |
| name | VARCHAR(255) | NOT NULL | Budget name (e.g. "January 2025 Business") |
| scope_type | VARCHAR(10) | NOT NULL | business or personal |
| timeframe | VARCHAR(20) | NOT NULL | weekly, monthly, yearly |
| start_date | DATE | NOT NULL | Budget period start |
| end_date | DATE | NOT NULL CHECK (end_date > start_date) | Budget period end |
| total_income_goal | NUMERIC(20,4) | DEFAULT 0 | Target income |
| total_expense_limit | NUMERIC(20,4) | DEFAULT 0 | Maximum expenses |
| status | VARCHAR(20) | NOT NULL DEFAULT 'active' | active, archived |
| metadata | JSONB | DEFAULT '{}' | Extensibility |
| created_by_id | UUID | NOT NULL FK → users(id) | Creator |
| created_at | TIMESTAMPTZ | DEFAULT now() | Creation timestamp |
| updated_at | TIMESTAMPTZ | DEFAULT now() | Last update timestamp |

**Indexes:**
- `idx_budgets_workspace_id` ON (workspace_id) — tenant queries
- `idx_budgets_workspace_scope` ON (workspace_id, scope_type) — scope-filtered lists
- `idx_budgets_workspace_status` ON (workspace_id, status) — active budget queries

**Acceptance Criteria:**
- [ ] Migration creates `budgets` table with all columns
- [ ] `scope_type` supports: business, personal
- [ ] `timeframe` supports: weekly, monthly, yearly
- [ ] `CHECK (end_date > start_date)` constraint enforced
- [ ] `metadata JSONB` column exists with default `'{}'`
- [ ] Three indexes created

---

### P6-02: Budget Categories Migration

**Description:**
Create the `budget_categories` table to track category-level expense limits and income goals within a budget. Each category has an `alert_threshold` percentage (default 80%) that triggers warning notifications, a `current_actual` field for computed spending/income, and a `status` field derived from backend aggregates. The UNIQUE constraint prevents duplicate categories within the same budget and type.

**Technical Details:**

**Table: `budget_categories`**

| Column | Type | Constraints | Purpose |
|---|---|---|---|
| id | UUID | PK DEFAULT gen_random_uuid() | Primary key |
| budget_id | UUID | NOT NULL FK → budgets(id) ON DELETE CASCADE | Parent budget |
| category | VARCHAR(100) | NOT NULL | Category name (e.g. "Transport") |
| type | VARCHAR(10) | NOT NULL | income or expense |
| limit_amount | NUMERIC(20,4) | NOT NULL CHECK (limit_amount > 0) | Budget limit for this category |
| alert_threshold | NUMERIC(5,2) | DEFAULT 80.00 | Warning trigger percentage (e.g. 80%) |
| current_actual | NUMERIC(20,4) | DEFAULT 0 | Computed actual from transactions |
| status | VARCHAR(20) | NOT NULL DEFAULT 'on_track' | on_track, warning, exceeded, under_target, met |
| created_at | TIMESTAMPTZ | DEFAULT now() | Creation timestamp |
| updated_at | TIMESTAMPTZ | DEFAULT now() | Last update timestamp |

**Constraints:**
- `UNIQUE(budget_id, category, type)` — prevents duplicate category+type within budget

**Indexes:**
- `idx_budget_categories_budget_id` ON (budget_id) — categories by budget
- `idx_budget_categories_status` ON (status) — status-filtered queries

**Acceptance Criteria:**
- [ ] Migration creates `budget_categories` table
- [ ] `alert_threshold` defaults to 80.00%
- [ ] `status` supports: on_track, warning, exceeded, under_target, met
- [ ] `UNIQUE(budget_id, category, type)` prevents duplicates
- [ ] FK to `budgets(id)` with `ON DELETE CASCADE`

---

### P6-03: Notifications Migration (3 tables)

**Description:**
Create three notification tables: `notification_preferences` for user channel preferences, `notifications` for notification records, and `notification_deliveries` for tracking delivery status per channel. The channel model is generic (email, pwa_push, in_app) so WhatsApp can be added in Phase 2 without rewriting alert logic. SMS is excluded due to cost.

**Technical Details:**

**Table: `notification_preferences`**

| Column | Type | Constraints | Purpose |
|---|---|---|---|
| id | UUID | PK DEFAULT gen_random_uuid() | Primary key |
| workspace_id | UUID | NOT NULL FK → workspaces(id) ON DELETE CASCADE | Tenant scoping |
| user_id | UUID | NOT NULL FK → users(id) | User preference owner |
| channel | VARCHAR(20) | NOT NULL | email, pwa_push, in_app |
| enabled | BOOLEAN | NOT NULL DEFAULT true | Whether channel is active |
| notification_type | VARCHAR(50) | NOT NULL | budget_warning, budget_exceeded, invoice_overdue, export_ready |
| created_at | TIMESTAMPTZ | DEFAULT now() | Creation timestamp |
| updated_at | TIMESTAMPTZ | DEFAULT now() | Last update timestamp |

**Constraints:** `UNIQUE(workspace_id, user_id, channel, notification_type)`

**Table: `notifications`**

| Column | Type | Constraints | Purpose |
|---|---|---|---|
| id | UUID | PK DEFAULT gen_random_uuid() | Primary key |
| workspace_id | UUID | NOT NULL FK → workspaces(id) ON DELETE CASCADE | Tenant scoping |
| user_id | UUID | NOT NULL FK → users(id) | Notification recipient |
| notification_type | VARCHAR(50) | NOT NULL | Type of notification |
| title | VARCHAR(255) | NOT NULL | Short heading |
| message | TEXT | NOT NULL | Full message body |
| reference_type | VARCHAR(50) | | Related entity type (budget, invoice, export) |
| reference_id | UUID | | Related entity ID |
| read_at | TIMESTAMPTZ | | When user read it (null = unread) |
| created_at | TIMESTAMPTZ | DEFAULT now() | Creation timestamp |

**Indexes:**
- `idx_notifications_user_unread` ON (user_id, read_at) WHERE read_at IS NULL — unread query (partial index)
- `idx_notifications_workspace_id` ON (workspace_id) — tenant queries

**Table: `notification_deliveries`**

| Column | Type | Constraints | Purpose |
|---|---|---|---|
| id | UUID | PK DEFAULT gen_random_uuid() | Primary key |
| notification_id | UUID | NOT NULL FK → notifications(id) ON DELETE CASCADE | Parent notification |
| channel | VARCHAR(20) | NOT NULL | email, pwa_push, in_app |
| status | VARCHAR(20) | NOT NULL DEFAULT 'pending' | pending, sent, delivered, failed |
| provider_id | VARCHAR(255) | | External provider reference |
| error_message | TEXT | | Failure reason |
| sent_at | TIMESTAMPTZ | | When delivery was attempted |
| created_at | TIMESTAMPTZ | DEFAULT now() | Creation timestamp |

**Index:** `idx_notification_deliveries_notification_id` ON (notification_id)

**Acceptance Criteria:**
- [ ] All three tables created with correct columns and constraints
- [ ] Channel values: email, pwa_push, in_app (SMS excluded)
- [ ] `notification_preferences` has UNIQUE constraint on (workspace_id, user_id, channel, notification_type)
- [ ] `notifications` has partial index for unread queries
- [ ] Generic channel model supports future WhatsApp addition

---

### P6-04: Exports Migration (2 tables)

**Description:**
Create two export/document tables: `exports` for tracking user export requests and `generated_documents` for storing generated file metadata. Both tables enforce expiry metadata — generated documents should not be stored forever by default.

**Technical Details:**

**Table: `exports`**

| Column | Type | Constraints | Purpose |
|---|---|---|---|
| id | UUID | PK DEFAULT gen_random_uuid() | Primary key |
| workspace_id | UUID | NOT NULL FK → workspaces(id) ON DELETE CASCADE | Tenant scoping |
| user_id | UUID | NOT NULL FK → users(id) | Requesting user |
| export_type | VARCHAR(30) | NOT NULL | csv_transactions, csv_invoices, pdf_report, pdf_tax_readiness, csv_tax_readiness |
| status | VARCHAR(20) | NOT NULL DEFAULT 'pending' | pending, processing, completed, failed |
| job_id | UUID | FK → background_jobs(id) | Linked async job |
| parameters | JSONB | DEFAULT '{}' | Export filters (e.g. date range, scope_type) |
| file_url | TEXT | | Download URL when completed |
| file_size_bytes | BIGINT | | File size |
| expires_at | TIMESTAMPTZ | | When download link expires |
| created_at | TIMESTAMPTZ | DEFAULT now() | Creation timestamp |

**Indexes:**
- `idx_exports_workspace_id` ON (workspace_id)
- `idx_exports_user_id` ON (user_id)

**Table: `generated_documents`**

| Column | Type | Constraints | Purpose |
|---|---|---|---|
| id | UUID | PK DEFAULT gen_random_uuid() | Primary key |
| workspace_id | UUID | NOT NULL FK → workspaces(id) ON DELETE CASCADE | Tenant scoping |
| user_id | UUID | NOT NULL | Requesting user |
| document_type | VARCHAR(30) | NOT NULL | invoice_pdf, tax_report_pdf, export_csv |
| reference_type | VARCHAR(50) | | Related entity type |
| reference_id | UUID | | Related entity ID |
| file_url | TEXT | NOT NULL | File location |
| file_size_bytes | BIGINT | | File size |
| expires_at | TIMESTAMPTZ | | When file should be cleaned up |
| created_at | TIMESTAMPTZ | DEFAULT now() | Creation timestamp |

**Index:** `idx_generated_docs_workspace` ON (workspace_id)

**Acceptance Criteria:**
- [ ] Both tables created with correct columns
- [ ] `exports` links to `background_jobs` via `job_id` FK
- [ ] Both tables have `expires_at` column for document lifecycle
- [ ] `export_type` supports: csv_transactions, csv_invoices, pdf_report, pdf_tax_readiness, csv_tax_readiness

---

### P6-05: sqlc Queries — Budgets CRUD

**Description:**
Generate sqlc queries for budget and budget category CRUD operations. Budgets support listing with scope_type/status filters, creation with categories in a single transaction, updates, and archiving. Categories support listing by budget, creation, updates, actual amount updates, and bulk deletion during budget updates.

**Budget Queries:**

| Name | Operation | Key Details |
|---|---|---|
| `GetBudgetByID` | SELECT | WHERE id = $1 AND workspace_id = $2 |
| `ListBudgetsByWorkspace` | SELECT | WHERE workspace_id = $1 AND status = 'active' ORDER BY start_date DESC; with optional scope_type filter |
| `CreateBudget` | INSERT | All fields; RETURNING * |
| `UpdateBudget` | UPDATE | SET name, goals, metadata WHERE id AND workspace_id; RETURNING * |
| `ArchiveBudget` | UPDATE | SET status='archived' WHERE id AND workspace_id |

**Budget Category Queries:**

| Name | Operation | Key Details |
|---|---|---|
| `ListCategoriesByBudget` | SELECT | WHERE budget_id = $1 ORDER BY type, category |
| `CreateBudgetCategory` | INSERT | All fields; RETURNING * |
| `UpdateBudgetCategory` | UPDATE | SET limit_amount, alert_threshold WHERE id; RETURNING * |
| `UpdateCategoryActual` | UPDATE | SET current_actual, status WHERE id |
| `DeleteCategoriesByBudget` | DELETE | WHERE budget_id = $1 — within same tx as budget update |

**Files:** `queries/budgets.sql`, `queries/budget_categories.sql`

**Acceptance Criteria:**
- [ ] All budget queries workspace-scoped
- [ ] `ListBudgetsByWorkspace` supports scope_type filter
- [ ] Categories can be created alongside budget in single tx
- [ ] `UpdateCategoryActual` updates both current_actual and status
- [ ] `DeleteCategoriesByBudget` for atomic category replacement during updates

---

### P6-06: sqlc Queries — Dashboard Summary Aggregates

**Description:**
Generate sqlc aggregate queries for the dashboard summary endpoint. All queries accept explicit date range parameters and scope_type filters. Results use `COALESCE(SUM(...), 0)` to return 0 instead of NULL for empty periods. All queries avoid scanning unnecessary historical data by requiring explicit date parameters.

**Queries:**

| Name | Key Details |
|---|---|
| `GetIncomeTotal` | `SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE workspace_id AND type='income' AND status='finalized' AND scope_type = ANY($2) AND occurred_at BETWEEN $3 AND $4` |
| `GetExpenseTotal` | Same pattern for `type='expense'` |
| `GetSaleTotal` | `SELECT COALESCE(SUM(amount), 0) FROM sales WHERE workspace_id AND created_at BETWEEN` |
| `GetOutstandingInvoiceTotal` | `SELECT COALESCE(SUM(balance_amount), 0) FROM invoices WHERE workspace_id AND status IN ('finalized', 'partially_paid')` |
| `GetActiveLoanBalanceTotal` | `SELECT direction, COALESCE(SUM(current_balance), 0) FROM loans WHERE workspace_id AND status='active' GROUP BY direction` |
| `GetWalletLiabilityTotal` | `SELECT COALESCE(SUM(balance), 0) FROM customer_wallets WHERE workspace_id` |
| `GetTransactionCountByScope` | `SELECT scope_type, COUNT(*) FROM transactions WHERE workspace_id AND occurred_at BETWEEN AND status='finalized' GROUP BY scope_type` |
| `GetMonthlyCashflow` | `SELECT DATE_TRUNC('month', occurred_at) as month, type, SUM(amount) FROM transactions WHERE workspace_id AND status='finalized' AND occurred_at BETWEEN GROUP BY month, type ORDER BY month` |

**File:** `queries/dashboard.sql`

**Acceptance Criteria:**
- [ ] All queries accept explicit date range parameters
- [ ] All queries use `COALESCE(SUM(...), 0)` to avoid NULLs
- [ ] All queries are workspace-scoped
- [ ] Results use `NUMERIC(20,4)` for monetary values

---

### P6-07: sqlc Queries — Tax Readiness Calculations

**Description:**
Generate sqlc aggregate queries for the tax readiness report. Computes VAT collected vs. paid, taxable income, and deductible expenses with category-level breakdowns. All queries require explicit date range parameters and workspace scoping.

**Queries:**

| Name | Key Details |
|---|---|
| `GetVATCollected` | `SELECT COALESCE(SUM(tax_amount), 0) FROM invoices WHERE workspace_id AND status IN ('finalized','paid','partially_paid') AND issue_date BETWEEN` |
| `GetVATPaid` | `SELECT COALESCE(SUM(p.tax_amount), 0) FROM purchases p WHERE workspace_id AND created_at BETWEEN` |
| `GetTaxableIncome` | `SELECT COALESCE(SUM(t.amount), 0) FROM transactions t WHERE workspace_id AND type IN ('income','sale') AND tax_deductible = false AND status='finalized' AND occurred_at BETWEEN` |
| `GetDeductibleExpenses` | `SELECT COALESCE(SUM(t.amount), 0) FROM transactions t WHERE workspace_id AND type='expense' AND tax_deductible = true AND status='finalized' AND occurred_at BETWEEN` |
| `GetTaxSummaryByCategory` | `SELECT t.category, t.scope_type, SUM(t.amount), COUNT(*) FROM transactions t WHERE workspace_id AND status='finalized' AND tax_deductible = true AND occurred_at BETWEEN GROUP BY t.category, t.scope_type ORDER BY total DESC` |

**File:** `queries/tax.sql`

**Acceptance Criteria:**
- [ ] All queries workspace-scoped with explicit date range params
- [ ] VAT collected from finalized/paid/partially_paid invoices
- [ ] Taxable income from income/sale transactions
- [ ] Deductible expenses from tax_deductible=true expense transactions
- [ ] Category breakdown ordered by total DESC

---

### P6-08: GET /api/v1/dashboard/summary

**Description:**
Returns an aggregate dashboard summary with income, expenses, sales, outstanding invoices, loan balances, wallet liabilities, transaction counts, and monthly cashflow data. All values are computed from backend aggregate queries — the frontend must never aggregate large raw datasets. Plan-gated: basic summary for Free, standard for Starter, advanced for Business/Pro.

**Endpoint:** `GET /api/v1/dashboard/summary`

**Query Parameters:**

| Param | Type | Default | Description |
|---|---|---|---|
| scope | string | business | business, personal, or all |
| from | ISO 8601 date | Start of current month | Period start |
| to | ISO 8601 date | Today | Period end |

**Response Envelope:**
```json
{
  "data": {
    "period": { "from": "2025-01-01", "to": "2025-01-31" },
    "scope": "business",
    "income_total": "1500000.0000",
    "expense_total": "850000.0000",
    "net_income": "650000.0000",
    "sale_total": "2000000.0000",
    "outstanding_invoices": "325000.0000",
    "active_loans_borrowed": "400000.0000",
    "active_loans_lent": "150000.0000",
    "wallet_liabilities": "50000.0000",
    "transaction_count": 42,
    "monthly_cashflow": [
      { "month": "2025-01-01", "income": "1500000.0000", "expense": "850000.0000" }
    ]
  },
  "meta": { "currency_code": "NGN" }
}
```

**Security Considerations:**
- All queries workspace-scoped
- Uses aggregate endpoints only — frontend must not aggregate raw datasets (ref: 06 §Dashboard / Report Summaries)
- Plan gating enforced server-side

**Acceptance Criteria:**
- [ ] Returns all aggregate values as decimal strings
- [ ] Supports scope filter (business/personal/all)
- [ ] Supports explicit date range
- [ ] Monthly cashflow data included
- [ ] Plan-gated: Free=basic, Starter=standard, Business/Pro=advanced

---

### P6-09: GET /api/v1/reports/cashflow-summary

**Description:**
Returns a cashflow summary report with total inflow/outflow, inflow by source, outflow by category, and daily cashflow data. Defaults to 30 days if no date filters provided.

**Endpoint:** `GET /api/v1/reports/cashflow-summary`

**Query Parameters:**

| Param | Type | Default | Description |
|---|---|---|---|
| scope | string | business | Scope filter |
| from | ISO 8601 date | 30 days ago | Period start (required if `to` provided) |
| to | ISO 8601 date | Today | Period end |

**Response Envelope:**
```json
{
  "data": {
    "period": { "from": "2025-01-01", "to": "2025-01-31" },
    "scope": "business",
    "total_inflow": "3500000.0000",
    "total_outflow": "850000.0000",
    "net_cashflow": "2650000.0000",
    "inflow_by_source": [
      { "source": "income", "amount": "1500000.0000" },
      { "source": "sales", "amount": "2000000.0000" }
    ],
    "outflow_by_category": [
      { "category": "Transport", "amount": "200000.0000" },
      { "category": "Rent", "amount": "350000.0000" }
    ],
    "daily_cashflow": [
      { "date": "2025-01-15", "inflow": "50000.0000", "outflow": "12000.0000" }
    ]
  }
}
```

**Acceptance Criteria:**
- [ ] Defaults to 30-day window if no date filters
- [ ] Returns inflow/outflow breakdowns
- [ ] Daily cashflow data for chart rendering
- [ ] All values as decimal strings

---

### P6-10: GET /api/v1/reports/budget-summary

**Description:**
Returns budget summary for all active budgets or detailed status for a single budget. Budget status is computed from backend aggregates, not stored stale data. Each budget includes income/expense progress percentages and overall status.

**Endpoint:** `GET /api/v1/reports/budget-summary`

**Query Parameters:**

| Param | Type | Default | Description |
|---|---|---|---|
| scope | string | | Scope filter |
| budget_id | UUID | | If provided, returns single budget detail |

**Response (all budgets):**
```json
{
  "data": {
    "budgets": [
      {
        "id": "uuid",
        "name": "January 2025 Business",
        "scope_type": "business",
        "timeframe": "monthly",
        "start_date": "2025-01-01",
        "end_date": "2025-01-31",
        "total_income_goal": "2000000.0000",
        "total_expense_limit": "1000000.0000",
        "total_income_actual": "1500000.0000",
        "total_expense_actual": "850000.0000",
        "income_progress_pct": 75.00,
        "expense_progress_pct": 85.00,
        "overall_status": "warning"
      }
    ]
  }
}
```

**Response (single budget, includes categories):**
```json
{
  "data": {
    "budget": { "...all budget fields + actuals + progress..." },
    "categories": [
      {
        "id": "uuid",
        "category": "Transport",
        "type": "expense",
        "limit_amount": "200000.0000",
        "current_actual": "180000.0000",
        "progress_pct": 90.00,
        "alert_threshold": 80.00,
        "status": "warning"
      }
    ]
  }
}
```

**Acceptance Criteria:**
- [ ] Returns summary for all active budgets when no budget_id
- [ ] Returns detailed single budget with categories when budget_id provided
- [ ] Budget status computed from backend aggregates
- [ ] Progress percentages calculated server-side

---

### P6-11: GET /api/v1/budgets

**Description:**
List budgets for the authenticated user's workspace with optional scope_type and status filters.

**Endpoint:** `GET /api/v1/budgets`

**Query Parameters:**

| Param | Type | Default | Description |
|---|---|---|---|
| scope_type | string | | business or personal |
| status | string | | active or archived |

**Response Envelope:**
```json
{
  "data": {
    "budgets": [
      {
        "id": "uuid",
        "name": "January 2025 Business",
        "scope_type": "business",
        "timeframe": "monthly",
        "start_date": "2025-01-01",
        "end_date": "2025-01-31",
        "total_income_goal": "2000000.0000",
        "total_expense_limit": "1000000.0000",
        "status": "active",
        "created_at": "timestamp"
      }
    ]
  }
}
```

**Acceptance Criteria:**
- [ ] Returns budget list with scope_type and status filters
- [ ] All monetary values as decimal strings
- [ ] Workspace-scoped

---

### P6-12: POST /api/v1/budgets

**Description:**
Create a new budget with categories in a single database transaction. Validates scope_type, timeframe, amounts, date range, and requires at least 1 category. Plan-gated: limited for Free, yes for paid plans.

**Endpoint:** `POST /api/v1/budgets`

**Request Payload:**
```json
{
  "name": "January 2025 Business",
  "scope_type": "business",
  "timeframe": "monthly",
  "start_date": "2025-01-01",
  "end_date": "2025-01-31",
  "total_income_goal": "2000000.0000",
  "total_expense_limit": "1000000.0000",
  "categories": [
    {
      "category": "Transport",
      "type": "expense",
      "limit_amount": "200000.0000",
      "alert_threshold": 80.00
    },
    {
      "category": "Sales Revenue",
      "type": "income",
      "limit_amount": "500000.0000",
      "alert_threshold": 80.00
    }
  ]
}
```

**Response Envelope (201 Created):**
```json
{
  "data": {
    "budget": { "...full budget object..." },
    "categories": [ "...created categories..." ]
  }
}
```

**Validation Rules:**
- `scope_type` must be `business` or `personal`
- `timeframe` must be `weekly`, `monthly`, or `yearly`
- `end_date > start_date`
- All amounts > 0 as decimal strings
- At least 1 category required

**Acceptance Criteria:**
- [ ] Creates budget + categories in single DB transaction
- [ ] Validates scope_type, timeframe, date range, amounts
- [ ] Requires at least 1 category
- [ ] Returns 201 Created with budget and categories
- [ ] Plan-gated: limited for Free, yes for paid

---

### P6-13: GET /api/v1/budgets/{id}/status

**Description:**
Recalculates budget category actuals from live transaction aggregates (not stored stale data) and returns the budget with category-level progress and computed status. This is the source-of-truth endpoint for budget tracking UI.

**Endpoint:** `GET /api/v1/budgets/{id}/status`

**Behavior/Processing Steps:**
1. Validate budget belongs to workspace
2. For each `budget_category`, query `SUM(amount)` from `transactions` where:
   - `workspace_id` matches
   - `category` matches
   - `type` matches (income/expense)
   - `scope_type` matches budget scope
   - `occurred_at` between budget `start_date` and `end_date`
   - `status = 'finalized'`
3. Update `budget_categories.current_actual` and compute `status`:

**Budget Status Computation Rules:**

| Category Type | Progress | Status |
|---|---|---|
| Expense | < alert_threshold% | `on_track` |
| Expense | >= alert_threshold% and < 100% | `warning` |
| Expense | >= 100% | `exceeded` |
| Income | < alert_threshold% | `under_target` |
| Income | >= alert_threshold% and < 100% | `on_track` |
| Income | >= 100% | `met` |

**Overall budget status** = worst status among all categories (priority: `exceeded` > `warning` > `under_target` > `met` > `on_track`)

**Response Envelope:**
```json
{
  "data": {
    "budget": {
      "id": "uuid",
      "name": "January 2025 Business",
      "total_income_goal": "2000000.0000",
      "total_expense_limit": "1000000.0000",
      "total_income_actual": "1500000.0000",
      "total_expense_actual": "850000.0000",
      "income_progress_pct": 75.00,
      "expense_progress_pct": 85.00,
      "overall_status": "warning"
    },
    "categories": [
      {
        "id": "uuid",
        "category": "Transport",
        "type": "expense",
        "limit_amount": "200000.0000",
        "current_actual": "180000.0000",
        "progress_pct": 90.00,
        "alert_threshold": 80.00,
        "status": "warning"
      }
    ]
  }
}
```

**Acceptance Criteria:**
- [ ] Actuals recalculated from live transaction data each time
- [ ] Category status computed using threshold rules
- [ ] Overall status = worst category status
- [ ] All monetary values as decimal strings
- [ ] Budget must belong to workspace

---

### P6-14: Budget Alert Trigger Logic

**Description:**
Service function `CheckBudgetAlerts(workspaceID uuid)` called after every finalized transaction write (hook in the transaction service). For each active budget matching the transaction's scope_type, recalculates category actuals and creates deduplicated notifications when thresholds are breached.

**Behavior/Processing Steps:**
1. After every finalized transaction, call `CheckBudgetAlerts` for the transaction's workspace
2. For each active budget matching the transaction's `scope_type`:
   a. Recalculate category actuals from aggregate queries
   b. If `progress_pct >= alert_threshold` AND no notification already sent for this category+threshold in current period:
      - Create `notifications` row: `notification_type='budget_warning'`, `title="Budget Warning: {category}"`, `message="You've used {progress_pct}% of your {category} budget ({current_actual} of {limit_amount})"`
      - Create `notification_deliveries` rows for enabled channels (email, pwa_push, in_app)
   c. If `progress_pct >= 100` AND no 'budget_exceeded' notification already sent:
      - Create `notifications` row: `notification_type='budget_exceeded'`, `title="Budget Exceeded: {category}"`, `message="You've exceeded your {category} budget by {overage_amount}"`
      - Create deliveries

**Deduplication:**
- Check if notification already sent for same `notification_type` + `reference_type` + `reference_id` within the budget period
- Prevents spamming users with repeated warnings for the same threshold breach

**Default Thresholds:**
- Warning: 80% (ref: 04 §Budgeting Flow)
- Exceeded: 100%

**Acceptance Criteria:**
- [ ] Triggered after every finalized transaction
- [ ] Creates warning notification at alert_threshold (default 80%)
- [ ] Creates exceeded notification at 100%
- [ ] Deduplicates — no duplicate notifications for same category+threshold in same period
- [ ] Creates delivery records for all enabled channels
- [ ] Notifications are infrequent and unobtrusive

---

### P6-15: Tax Readiness Endpoint

**Description:**
Plan-gated tax readiness report endpoint. Computes VAT collected vs. paid, taxable income, deductible expenses, and estimated taxable profit. Returns informational data only — does not constitute tax advice or government filing. Plan access: Free = no access (optional 1 annual summary growth experiment), Starter = quarterly only, Business/Pro = on-demand/unlimited.

**Endpoint:** `GET /api/v1/reports/tax-readiness`

**Query Parameters:**

| Param | Type | Default | Description |
|---|---|---|---|
| from | ISO 8601 date | Required | Period start |
| to | ISO 8601 date | Required | Period end |
| scope | string | business | business or all |

**Plan Gating Rules:**

| Plan | Access | Backend Enforcement |
|---|---|---|
| Free | No access (or 1 annual summary) | Return 403 PLAN_LIMIT_REACHED |
| Starter | Quarterly only | Reject if date range is not a calendar quarter |
| Business | On-demand / unlimited | No restrictions |
| Pro | On-demand / unlimited | No restrictions |

**Response Envelope:**
```json
{
  "data": {
    "period": { "from": "2025-01-01", "to": "2025-03-31" },
    "scope": "business",
    "vat_collected": "125000.0000",
    "vat_paid": "45000.0000",
    "vat_net_owed": "80000.0000",
    "taxable_income": "3500000.0000",
    "deductible_expenses": "1200000.0000",
    "taxable_profit_estimate": "2300000.0000",
    "income_breakdown": [
      { "source": "income_transactions", "amount": "1500000.0000" },
      { "source": "sales", "amount": "2000000.0000" }
    ],
    "deductible_breakdown": [
      { "category": "Transport", "amount": "300000.0000", "count": 15 },
      { "category": "Office Supplies", "amount": "150000.0000", "count": 8 }
    ],
    "generated_at": "2025-03-31T23:59:59Z"
  },
  "meta": {
    "currency_code": "NGN",
    "disclaimer": "This report is informational and does not constitute tax advice or government filing."
  }
}
```

**Acceptance Criteria:**
- [ ] Free users get 403 PLAN_LIMIT_REACHED (or 1 annual summary if growth experiment enabled)
- [ ] Starter users restricted to quarterly date ranges — returns 403 if not a calendar quarter
- [ ] Business/Pro users have on-demand access
- [ ] Returns VAT collected, paid, net owed
- [ ] Returns taxable income and deductible expenses
- [ ] Returns category-level breakdowns
- [ ] Disclaimer included in meta

---

### P6-16: POST /api/v1/exports

**Description:**
Create an export request using the async job pattern. Validates export_type, parameters, and plan limits, then enqueues a background job and creates an exports tracking row. Returns 202 Accepted with export_id and job_id.

**Endpoint:** `POST /api/v1/exports`

**Request Payload:**
```json
{
  "export_type": "csv_transactions",
  "parameters": {
    "from": "2025-01-01",
    "to": "2025-03-31",
    "scope_type": "business"
  }
}
```

**Response Envelope (202 Accepted):**
```json
{
  "data": {
    "export_id": "uuid",
    "job_id": "uuid"
  }
}
```

**Behavior/Processing Steps:**
1. Validate `export_type` is allowed value
2. Validate parameters match export_type requirements
3. Check plan allows exports (limited for Free, yes for paid)
4. Check export plan limit for current period
5. Enqueue background job with `job_type` derived from `export_type`
6. Create `exports` row with `status='pending'`, linked to `job_id`
7. Return 202 with export_id and job_id

**Acceptance Criteria:**
- [ ] Returns 202 Accepted with export_id and job_id
- [ ] Validates export_type against allowed values
- [ ] Plan-gated: limited for Free, yes for paid
- [ ] Creates exports row linked to background job
- [ ] Uses async job pattern

---

### P6-17: GET /api/v1/exports/{id}

**Description:**
Check the status of an export request. Returns file_url when completed. Validates workspace ownership.

**Endpoint:** `GET /api/v1/exports/{id}`

**Response Envelope:**
```json
{
  "data": {
    "id": "uuid",
    "export_type": "csv_transactions",
    "status": "completed",
    "file_url": "/api/v1/exports/uuid/download",
    "file_size_bytes": 45000,
    "expires_at": "2025-04-30T23:59:59Z",
    "parameters": {
      "from": "2025-01-01",
      "to": "2025-03-31",
      "scope_type": "business"
    },
    "created_at": "timestamp"
  }
}
```

**Acceptance Criteria:**
- [ ] Returns export status with file_url when completed
- [ ] `file_url` is null when pending/processing
- [ ] Validates workspace ownership
- [ ] Includes `expires_at` for download link lifecycle

---

### P6-18: GET /api/v1/notifications

**Description:**
List notifications for the authenticated user ordered by created_at DESC. Supports unread_only filter and returns unread_count in meta.

**Endpoint:** `GET /api/v1/notifications`

**Query Parameters:**

| Param | Type | Default | Description |
|---|---|---|---|
| limit | int | 25 (max 100) | Page size |
| unread_only | boolean | false | Only return unread notifications |

**Response Envelope:**
```json
{
  "data": {
    "notifications": [
      {
        "id": "uuid",
        "notification_type": "budget_warning",
        "title": "Budget Warning: Transport",
        "message": "You've used 90% of your Transport budget (180,000 of 200,000 NGN)",
        "reference_type": "budget_category",
        "reference_id": "uuid",
        "read_at": null,
        "created_at": "2025-01-20T14:30:00Z"
      }
    ]
  },
  "meta": { "unread_count": 3 }
}
```

**Acceptance Criteria:**
- [ ] Returns notifications ordered by created_at DESC
- [ ] Supports unread_only filter
- [ ] Returns unread_count in meta
- [ ] Workspace-scoped

---

### P6-19: PATCH /api/v1/notifications/{id}/read

**Description:**
Mark a notification as read. Idempotent — if already read, returns current state without error.

**Endpoint:** `PATCH /api/v1/notifications/{id}/read`

**Response Envelope:**
```json
{
  "data": {
    "notification": {
      "id": "uuid",
      "read_at": "2025-01-20T15:00:00Z"
    }
  }
}
```

**Acceptance Criteria:**
- [ ] Sets `read_at = now()` for the notification
- [ ] Validates notification belongs to user
- [ ] Idempotent — returns current state if already read

---

### P6-20: Worker: CSV/PDF Export Job Handler

**Description:**
Go worker handlers for export job types. Generates CSV (transactions, tax readiness) or PDF (tax readiness report) files, stores them to object storage with expiry metadata, and updates both the exports row and background_jobs row. Uses 60-second timeout per job.

**Technical Details:**

**CSV Export Handler (`job_type='csv_export'`):**

1. Read `payload.export_id` from job
2. Fetch export record for `export_type` and `parameters`
3. For `csv_transactions`:
   - Query transactions matching parameters (workspace_id, date range, scope_type) using cursor pagination (no unbounded queries)
   - Generate CSV with headers: `Date,Type,Category,Amount,Currency,Scope,Payment Method,Notes`
   - Write to temporary file
4. For `csv_tax_readiness`:
   - Fetch tax readiness data via aggregate queries
   - Generate CSV with VAT/income/expense breakdown
5. Store file to object storage (or app-managed temp storage during early MVP)
6. Update `exports` row: `status='completed'`, `file_url`, `file_size_bytes`, `expires_at` (default 30 days)
7. Update `background_jobs` row: `status='completed'`, `result={"file_url": "...", "filename": "..."}`

**PDF Export Handler (`job_type='pdf_export'`):**

1. Read `payload.export_id` from job
2. Fetch export record for `export_type` and `parameters`
3. Use `github.com/go-pdf/fpdf` (ref: 13 §PDF Generation) to render:
   - Report title and date range
   - Summary table (VAT, income, expenses, profit)
   - Category breakdown table
   - Disclaimer text: "This report is informational and does not constitute tax advice or government filing."
4. Store similarly to CSV handler
5. Update exports and background_jobs rows

**Configuration:**
- Timeout: `context.WithTimeout` of 60 seconds
- Library: `github.com/go-pdf/fpdf`
- Storage: Object storage with expiry metadata (default 30-day expiry)

**Acceptance Criteria:**
- [ ] CSV export generates correct headers and data rows
- [ ] PDF export renders formatted report with summary and breakdown
- [ ] Both store files to object storage with expiry metadata
- [ ] Updates exports row with file_url, file_size_bytes, expires_at
- [ ] Updates background_jobs row with result
- [ ] Uses `context.WithTimeout` of 60 seconds
- [ ] On failure, calls `FailJob` for retry with backoff

---

### P6-21: Worker: Notification Delivery Job

**Description:**
Go worker handler for delivering notifications via configured channels. Processes pending `notification_deliveries` rows created by `CheckBudgetAlerts` (P6-14) or other notification sources. Delivers via email, PWA push, or in-app. SMS is excluded; channel model is generic for future WhatsApp addition.

**Technical Details:**

**Delivery Channels:**

| Channel | Implementation | Library |
|---|---|---|
| email | Templated email to user's registered email | `github.com/wneessen/go-mail` (ref: 13 §Email Sending) |
| pwa_push | Push notification to subscribed endpoints | `github.com/SherClockHolmes/webpush-go` (ref: 13 §Web Push) |
| in_app | No additional delivery — visible via GET /api/v1/notifications | N/A |

**Processing Steps:**
1. Fetch pending `notification_deliveries` rows
2. For each pending delivery:
   - `email`: Send templated email with notification title and message
   - `pwa_push`: Send push notification to user's subscribed push endpoints stored in DB
   - `in_app`: Skip (already visible via API)
3. Update `notification_deliveries` row: `status='sent'` or `'failed'`, `sent_at`, `error_message` on failure
4. Retries failed deliveries with backoff
5. Max 3 attempts per delivery

**Configuration:**
- Max retries: 3
- Retry backoff: 1m → 5m → 15m
- Channel model is generic — WhatsApp can be added in Phase 2 without rewriting alert logic

**Acceptance Criteria:**
- [ ] Email delivery via go-mail with templated content
- [ ] PWA push delivery via webpush-go
- [ ] In-app notifications require no additional delivery
- [ ] Updates delivery status (sent/failed) after each attempt
- [ ] Max 3 retries with exponential backoff
- [ ] SMS excluded; channel model supports future WhatsApp

---

### P6-22: Dashboard Charts & Report Summaries

**Description:**
Upgrade the existing empty dashboard from Phase 2 to a fully functional finance dashboard with StatCards, a cashflow chart, Finance Scope Toggle, and date range picker. All data is fetched from backend aggregate endpoints — no client-side raw data aggregation.

**Component Hierarchy:**
```
/dashboard (Upgraded Dashboard Page)
  ├── <FinanceScopeToggle /> ("All | Business | Personal")
  ├── <DateRangePicker /> (from/to date selector)
  ├── <DashboardSummaryCards />
  │   ├── <StatCard variant="revenue" /> (Revenue/Sales — green #009e10)
  │   ├── <StatCard variant="expense" /> (Expenses — orange #fa8901)
  │   ├── <StatCard variant="profit" /> (Net Income — neutral)
  │   ├── <StatCard variant="debt" /> (Outstanding Invoices — blue)
  │   ├── <StatCard variant="debt" /> (Active Loans — debt/liability)
  │   └── <StatCard variant="debt" /> (Wallet Liabilities — debt/liability)
  ├── <CashflowChart /> (recharts BarChart)
  └── <EmptyState /> (when no data)
```

**StatCard Details:**

| Variant | Color | Shows |
|---|---|---|
| Revenue/Sales | Green #009e10 | Label, amount (Sora font), currency, timeframe, scope badge |
| Expenses | Orange #fa8901 | Same layout |
| Net Income | Neutral | Same layout |
| Outstanding Invoices | Blue | Same layout |
| Active Loans | Debt/Liability (orange) | Same layout |
| Wallet Liabilities | Debt/Liability (orange) | Same layout |

**CashflowChart:**
- Library: recharts `BarChart` (ref: 13 §Charts — `recharts v2.12+`)
- X-axis: months
- Y-axis: amounts
- Two series: income (green #009e10), expense (orange #fa8901)
- Responsive container
- Data from `monthly_cashflow` in dashboard summary response

**Finance Scope Toggle:**
- "All | Business | Personal" segmented control
- Default: Business
- Switching re-fetches `GET /api/v1/dashboard/summary` with `scope` param

**State Behaviors:**

| State | Visual |
|---|---|
| loading | SkeletonLoader for StatCards and chart (ref: 11 §SkeletonLoader) |
| success | Data rendered |
| empty | "No business activity yet. Type what happened to add your first transaction." (ref: 11 §EmptyState) |

**Design Tokens:**
- StatCard amounts: Sora font (ref: 11 §Typography)
- Revenue green: #009e10
- Expense orange: #fa8901
- Skeleton: preserves component dimensions, prevents layout shift

**Acceptance Criteria:**
- [ ] StatCards show all 6 dashboard metrics
- [ ] CashflowChart renders monthly income vs. expense bars
- [ ] Finance Scope Toggle re-fetches data on change
- [ ] Date range picker adjusts dashboard summary period
- [ ] All data from backend aggregate endpoints (no client-side aggregation)
- [ ] SkeletonLoader during loading prevents layout shift
- [ ] Actionable empty state with AI-first CTA
- [ ] Uses `@tanstack/react-query` for data fetching

---

### P6-23: Budget Setup UI

**Description:**
Budget creation form as a reusable `<BudgetFormDrawer />` component using react-hook-form + zod. Supports scope_type selection, timeframe with auto-date-setting, dynamic categories with alert thresholds, and smart scope defaults based on the current dashboard scope toggle.

**Component Hierarchy:**
```
<BudgetFormDrawer />
  ├── Name (text input)
  ├── Scope Type (segmented control: Business/Personal)
  ├── Timeframe (select: Weekly/Monthly/Yearly — auto-sets start/end dates)
  ├── Date Range (start/end date pickers)
  ├── Income Goal (decimal string)
  ├── Expense Limit (decimal string)
  ├── <CategoriesSection />
  │   ├── <CategoryRow /> (name, type toggle, limit, alert threshold %)
  │   └── "Add Category" button
  ├── <RunningTotals /> (category sums)
  └── Submit → POST /api/v1/budgets
```

**Form Fields & Validation (Zod Schema):**

| Field | Type | Validation |
|---|---|---|
| name | string | Required, min 1 char |
| scope_type | enum | Required: business, personal |
| timeframe | enum | Required: weekly, monthly, yearly |
| start_date | string | Required, valid date |
| end_date | string | Required, valid date, must be after start_date |
| total_income_goal | string | Required, parseDecimal > 0 |
| total_expense_limit | string | Required, parseDecimal > 0 |
| categories | array | Required, min 1 |
| categories[].category | string | Required, min 1 char |
| categories[].type | enum | Required: income, expense |
| categories[].limit_amount | string | Required, parseDecimal > 0 |
| categories[].alert_threshold | string | Default "80.00" |

**Smart Defaults:**
- If user is viewing "Personal" on dashboard, budget form defaults `scope_type='personal'` (ref: 11 §Smart Defaults For Creation)
- If user is viewing "Business", defaults `scope_type='business'`
- Selecting "Monthly" timeframe auto-sets start_date to first of current month, end_date to last day

**Design Tokens:**
- Primary button: #009e10 (green)
- Segmented control for scope_type
- Sora font for financial amounts

**Acceptance Criteria:**
- [ ] Form validates with react-hook-form + zod
- [ ] Dynamic categories: add/remove rows
- [ ] Alert threshold defaults to 80%
- [ ] Timeframe selection auto-sets date range
- [ ] Scope default follows current dashboard scope toggle
- [ ] Submit calls POST /api/v1/budgets

---

### P6-24: Budget Status Views

**Description:**
Budget list page with DataTable showing all budgets with progress bars and status chips. Detail page with budget header, category breakdown table, color-coded progress bars, and status chips per category. All data fetched from backend aggregate endpoints.

**Component Hierarchy:**
```
/dashboard/budgets (List Page)
  ├── <FinanceScopeToggle />
  ├── <DataTable />
  │   └── Columns: Name, Scope, Timeframe, Period, Income Progress, Expense Progress, Status

/dashboard/budgets/[id] (Detail Page)
  ├── <BudgetHeaderCard /> (name, scope, period, goals vs actuals, overall status)
  └── <CategoryBreakdownTable />
      └── Each row: category name, type, limit, actual, progress bar, status chip
```

**Progress Bar Colors:**

| Progress | Color |
|---|---|
| < 80% | Green (#009e10) |
| 80-99% | Orange (#fa8901) |
| >= 100% | Red |

**Status Chip Colors:**

| Status | Color | Text |
|---|---|---|
| on_track | Green (#009e10) | On Track |
| warning | Orange (#fa8901) | Warning |
| exceeded | Red | Exceeded |
| under_target | Blue | Under Target |
| met | Green (#009e10) | Met |

**Data Source:**
- List: `GET /api/v1/budgets` (basic info)
- Detail: `GET /api/v1/budgets/{id}/status` (computed actuals + status)

**Acceptance Criteria:**
- [ ] Budget list with progress bars and status chips
- [ ] Category breakdown with color-coded progress bars
- [ ] Status chips use color + text (not color alone)
- [ ] Data fetched from backend aggregate endpoints
- [ ] Click row navigates to budget detail

---

### P6-25: Tax Readiness Summary UI

**Description:**
Tax readiness report page wrapped in PlanGate. Free users see upgrade messaging; paid users see the full report with date range selector, StatCards, breakdown tables, disclaimer, and export buttons. Starter users are restricted to quarterly date ranges.

**Component Hierarchy:**
```
/dashboard/reports/tax-readiness
  ├── <PlanGate feature="tax_reports" />
  │   ├── Free: "Tax Readiness Reports are available on paid plans. Upgrade to access..."
  │   └── Paid:
  │       ├── <DateRangeSelector /> (Starter: limited to quarterly ranges)
  │       ├── <StatCard variant="revenue" /> (VAT Collected — green)
  │       ├── <StatCard variant="expense" /> (VAT Paid — orange)
  │       ├── <StatCard variant="debt" /> (VAT Net Owed — red if positive, green if zero)
  │       ├── <StatCard variant="revenue" /> (Taxable Income — green)
  │       ├── <StatCard variant="expense" /> (Deductible Expenses — orange)
  │       ├── <StatCard variant="profit" /> (Estimated Taxable Profit — neutral)
  │       ├── <IncomeBreakdownTable /> (source, amount)
  │       ├── <DeductibleBreakdownTable /> (category, amount, count)
  │       ├── <DisclaimerText />
  │       └── <ExportButtons /> (CSV + PDF)
```

**PlanGate Behavior:**

| Plan | UI |
|---|---|
| Free | Locked: "Upgrade to access quarterly or on-demand tax summaries." + upgrade CTA |
| Starter | Unlocked: quarterly date ranges only (frontend + backend validation) |
| Business | Unlocked: on-demand, any date range |
| Pro | Unlocked: on-demand, any date range |

**Disclaimer Text:**
"This report is informational and does not constitute tax advice or government filing." (ref: 03 §Tax Readiness Reports)

**Export Buttons:**
- "Export CSV" → `POST /api/v1/exports` with `export_type='csv_tax_readiness'`
- "Export PDF" → `POST /api/v1/exports` with `export_type='pdf_tax_readiness'`
- Both use `<ExportButton />` with async job polling (P6-26)

**Acceptance Criteria:**
- [ ] PlanGate locks Free users with upgrade messaging
- [ ] Starter users restricted to quarterly date ranges
- [ ] All 6 StatCards rendered with correct variants
- [ ] Income and deductible breakdown tables displayed
- [ ] Disclaimer text visible at bottom
- [ ] Export CSV and Export PDF buttons functional with async polling

---

### P6-26: Export/PDF Download Buttons with Async Status

**Description:**
Reusable `<ExportButton />` component supporting the full async export lifecycle. Six visual states: ready, plan locked, starting, processing, ready to download, and failed. Uses the `useAsyncJob` hook from P4-35 for polling.

**Component States:**

| State | Visual | Behavior |
|---|---|---|
| Ready | Primary button "Export {type}" | Clicks triggers POST /api/v1/exports |
| Plan locked | Disabled + lock icon + tooltip "Upgrade to export reports" | No action |
| Starting | Spinner | Waiting for 202 response with job_id |
| Processing | Progress indicator | Polls GET /api/v1/jobs/{job_id} every 2s |
| Ready to download | Green "Download" + download icon | href points to file_url |
| Failed | Red "Failed" + retry option | Clicks retries from Ready state |

**Usage Locations:**
- Tax Readiness page (CSV + PDF)
- Invoice detail page (PDF)
- Transaction list page (CSV)

**Download Link Expiry:**
- Shows "Link expires in X days" below download button
- Expiry info from `expires_at` field in export response

**Acceptance Criteria:**
- [ ] All 6 states render correctly
- [ ] Plan locked state shows upgrade tooltip
- [ ] Starting state triggers POST /api/v1/exports
- [ ] Processing state polls job status via useAsyncJob
- [ ] Download state provides file_url
- [ ] Failed state shows retry option
- [ ] Expiry info displayed near download link

---

### P6-27: Budget Alert Notification UI

**Description:**
Notification bell icon in the top navbar with unread count badge. Clicking opens a dropdown panel listing recent notifications with type-based icons, relative timestamps, and click-to-navigate behavior. Supports mark-all-read and periodic polling for new notifications.

**Component Hierarchy:**
```
<NotificationBell /> (in top navbar)
  ├── Unread count badge (from meta.unread_count)
  └── Click → <NotificationDropdown />
      ├── <NotificationItem />[] (type icon, title, message, relative time, unread indicator)
      ├── "Mark all as read" button
      └── Empty state: "No notifications yet."
```

**Notification Type Icons:**

| Type | Icon | Color |
|---|---|---|
| budget_warning | Orange warning triangle | #fa8901 |
| budget_exceeded | Red alert circle | Red |
| export_ready | Green download check | #009e10 |
| invoice_overdue | Red clock | Red |

**Notification Item Click Behavior:**
1. Mark as read: `PATCH /api/v1/notifications/{id}/read`
2. Navigate to relevant page based on `reference_type`:
   - `budget` → `/dashboard/budgets/{reference_id}`
   - `budget_category` → `/dashboard/budgets/{budget_id}`
   - `invoice` → `/dashboard/invoices/{reference_id}`
   - `export` → download URL

**Unread Count Polling:**
- `GET /api/v1/notifications?unread_only=true&limit=1` — just for `meta.unread_count`
- Refetch every 30 seconds via `@tanstack/react-query` refetchInterval

**Budget Alert Message Styling:**
- Warning: "You've used 90% of your Transport budget (180,000 of 200,000 NGN)" — orange styling
- Exceeded: "You've exceeded your Transport budget by 20,000 NGN" — red styling

**Acceptance Criteria:**
- [ ] Notification bell shows unread count badge
- [ ] Dropdown lists notifications with type-based icons
- [ ] Click notification marks as read and navigates to relevant page
- [ ] "Mark all as read" button functional
- [ ] Budget warnings styled orange, exceeded styled red
- [ ] Unread count polled every 30 seconds
- [ ] Empty state: "No notifications yet."
- [ ] Uses color + icon, not color alone

---

## Additional Notes

### Dependency Sequencing
1. **P6-01/P6-02** (budgets + categories) must land before P6-05 (sqlc queries) and P6-11/P6-12/P6-13 (budget API routes)
2. **P6-03** (notifications) must land before P6-14 (budget alert trigger), P6-18/P6-19 (notification API routes), P6-21 (notification worker), P6-27 (notification UI)
3. **P6-04** (exports) must land before P6-16/P6-17 (export API routes), P6-20 (export worker)
4. **P6-06** (dashboard aggregates) and **P6-07** (tax queries) must land before P6-08/P6-09/P6-10/P6-15 (report endpoints)
5. **P6-14** (budget alert trigger) depends on P6-03 (notifications) and P6-05 (budget queries) and must be hooked into the transaction finalization flow
6. **P6-20/P6-21** (workers) depend on P6-04 (exports), P6-03 (notifications), and P4-07 (background_jobs from Phase 4)
7. Frontend work (P6-22–P6-27) depends on corresponding backend routes being operational

### Budget Status Computation Rules
| Category Type | Progress | Status |
|---|---|---|
| Expense | < alert_threshold% | `on_track` |
| Expense | >= alert_threshold% and < 100% | `warning` |
| Expense | >= 100% | `exceeded` |
| Income | < alert_threshold% | `under_target` |
| Income | >= alert_threshold% and < 100% | `on_track` |
| Income | >= 100% | `met` |

Overall budget status = worst status among all categories (priority: `exceeded` > `warning` > `under_target` > `met` > `on_track`).

Ref: 04 §Budgeting Flow With Notifications — budget status values.

### Plan Gating for Tax Reports
| Plan | Tax Report Access |
|---|---|
| Free | No access (optional: 1 annual summary growth experiment) |
| Starter | Quarterly only (enforced by backend date range validation) |
| Business | On-demand / unlimited |
| Pro | On-demand / unlimited |

Ref: 10 §Premium Feature Gates — Tax Readiness Reports, 10 §User-To-Feature Matrix.

### Cross-Cutting Concerns
- **Backend aggregates only**: Dashboard, budget status, cashflow, and tax readiness must use backend aggregate endpoints. Frontend must not scan or aggregate raw transaction datasets (ref: 06 §Dashboard / Report Summaries, 03 §Basic Budgeting, 03 §Tax Readiness Reports).
- **Tenant isolation**: Every aggregate query includes `workspace_id`. Every `/{id}` route checks object ownership (ref: 09 §Authorization And Tenant Isolation).
- **Money as strings**: All monetary values in API responses as decimal strings. Go uses `shopspring/decimal`, Postgres uses `NUMERIC(20,4)` (ref: 05 §Core Model).
- **No SMS**: All notification channels are email, PWA push, or in-app only. Channel model is generic for future WhatsApp (ref: 05 §Notifications, 04 §Budgeting Flow With Notifications).
- **Generated document expiry**: Export PDFs and CSVs have `expires_at` metadata. Not stored forever (ref: 08 §Storage).
- **Budget status is computed, not stored stale**: `GET /api/v1/budgets/{id}/status` recalculates actuals from live transaction aggregates each time (ref: 05 §Budgets — "Budget status should be computed from backend aggregates").
