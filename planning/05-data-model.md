# 05 - Rekordly V2 Data Model

## Summary

This document defines the MVP data-model direction for Rekordly v2.

The model is PostgreSQL-first. It keeps `transactions` as the user-facing financial concept while adding an accounting-safe double-entry ledger underneath. This allows the MVP to remain simple in the UI while preserving the foundation needed for future balance sheets, cash flow statements, and stronger financial reporting.

The model must stay MVP-bounded while supporting future true financial statements. Storefront, complex inventory, complex production, quotations, WhatsApp, complex amortization, and advanced assets remain Phase 2.

## Core Model

- Tenant scope: all tenant-owned records require `workspace_id`; MVP has one workspace per user.
- Money: use Postgres `NUMERIC(20,4)` and Go decimal types; never `float64`.
- Currency: store `currency_code` on all financial records; MVP uses one default workspace currency.
- User-facing transactions: keep `transactions` as the main product concept for income, expense, sale, purchase, wallet deposit, wallet payment, loan repayment, and transfer activity.
- Double-entry ledger: add `ledger_accounts` and `ledger_entries` below transactions. Every finalized financial action must produce balanced debit and credit entries.
- Immutability: finalized transactions, invoices, payments, and wallet ledger entries are never hard-deleted or directly edited. Use `voided_at`, `voided_by_id`, and reversing entries for corrections.
- Extensibility: add `metadata JSONB` to transactions, invoices, customers, and budgets for AI metadata, custom tags, source context, and future non-critical attributes.

## Entity Groups

### Identity And Workspace

Core tables:

- `users`
- `auth_identities`
- `sessions`
- `workspaces`
- `workspace_members`

MVP behavior:

- One user has one workspace.
- Model should not block future team or multi-workspace support.
- Auth model supports email OTP for MVP.
- SMS is excluded due to cost.
- Provider design should allow future WhatsApp OTP without rewriting the auth flow.

### Plans And Usage

Core tables:

- `plans`
- `subscriptions`
- `usage_counters`
- `feature_limits`

Purpose:

- Backend enforces limits for transactions, invoices, loans, wallet deposits, AI credits, exports, offline sync, and reports.
- Frontend can hide locked UI, but backend remains the source of enforcement truth.

### Customers And Counterparties

Core tables:

- `customers`
- Flexible counterparty references for vendors, borrowers, lenders, and manual transaction participants.

Customer model notes:

- `customers` includes `metadata JSONB`.
- Customers can own wallet balances.
- Counterparty support should cover MVP finance needs without modeling Phase 2 complexity.

### Transactions

`transactions` is the primary user-facing financial activity table.

Required fields:

- `id`
- `workspace_id`
- `type`
- `scope_type`
- `status`
- `amount`
- `currency_code`
- `occurred_at`
- `category`
- `tax_deductible`
- `source_type`
- `source_id`
- `metadata JSONB`
- `voided_at`
- `voided_by_id`
- `created_by_id`
- `created_at`
- `updated_at`

Supported `scope_type` values:

- `business`
- `personal`
- `mixed`
- `transfer`

Rules:

- Finalized transactions are immutable.
- Corrections use reversals.
- All transaction reads must be tenant-scoped.
- List views must be paginated.
- AI-created transaction drafts are not saved as finalized transactions until confirmed by the user.

### Ledger

The double-entry ledger is the accounting backbone under user-facing transactions.

Core tables:

- `ledger_accounts`
- `ledger_entries`

`ledger_accounts` should define accounts such as:

- Cash
- Income
- Expense
- Receivable
- Payable
- Customer liability
- Tax
- Owner equity
- Adjustment

`ledger_entries` links to `transaction_id` and records:

- `workspace_id`
- `transaction_id`
- `ledger_account_id`
- `debit_amount`
- `credit_amount`
- `currency_code`
- `entry_date`
- `created_at`

Rules:

- Every finalized financial transaction must create ledger entries.
- Total debits must equal total credits before commit.
- Ledger entries are immutable after finalization.
- Corrections use reversing ledger entries.

Example:

- Customer wallet deposit:
  - Debit cash.
  - Credit customer liabilities.

This preserves the ability to generate a true balance sheet and cash flow statement later without rewriting the core data model.

### Allocations

Core table:

- `transaction_allocations`

Purpose:

- Supports mixed personal/business transactions.
- Stores allocation by amount and/or percentage.
- Allocation totals must equal the transaction total.
- Allocations must remain linked to the original transaction for reporting.

### Payments And Split Payments

Core table:

- `payments`

Purpose:

- Supports multiple payment rows per sale, invoice, purchase, loan, wallet, or transaction context.
- Enables split payments.

Fields should include:

- `workspace_id`
- `amount`
- `currency_code`
- `method`
- `paid_at`
- Context reference fields for sale, invoice, purchase, loan, wallet, or transaction use.

Supported MVP payment methods:

- Cash
- Transfer
- POS
- Wallet

Rules:

- Total payment rows cannot exceed amount due.
- Wallet payment rows require transactional wallet balance validation.
- Finalized payments are immutable.
- Corrections use voids and reversing entries.

### Invoices

Core tables:

- `invoices`
- `invoice_items`

Required invoice fields:

- `workspace_id`
- `customer_id`
- `issue_date`
- `due_date`
- `status`
- `subtotal`
- `tax_amount`
- `discount_amount`
- `total_amount`
- `paid_amount`
- `balance_amount`
- `currency_code`
- `metadata JSONB`
- `voided_at`
- `voided_by_id`

Rules:

- Finalized invoices are immutable.
- Corrections use voids, reversals, or future credit notes.
- Invoice payment state is derived from payment rows and ledger activity.
- Backend-generated PDF metadata should be represented through export/document records, not screenshot-style artifacts.

### Sales And Purchases

Core tables:

- `sales`
- `sale_items`
- `purchases`
- `purchase_items`

Rules:

- MVP avoids complex inventory coupling.
- Settlement is handled through payment rows and ledger entries.
- Sales can link to invoices where needed.
- Purchases support business expense tracking without complex stock workflows.

### Customer Wallets

Core tables:

- `customer_wallets`
- `customer_wallet_ledger`

Purpose:

- Tracks advance deposits and store credit.
- Separates customer liability from revenue.

Rules:

- `customer_wallets` stores cached current balance.
- `customer_wallet_ledger` records deposits, wallet payments, reversals, and adjustments.
- Wallet ledger entries are immutable after finalization.
- No negative wallet balances.
- Deposits credit customer liabilities, not revenue.
- Wallet balance updates must happen transactionally.

### Simple Loans / Debts

Core table:

- `loans`

Purpose:

- Tracks money borrowed as liabilities.
- Tracks money lent as receivables.

Fields should include:

- `workspace_id`
- `direction`
- `principal_amount`
- `current_balance`
- `counterparty_id` or counterparty details
- `start_date`
- `due_date`
- `status`
- `currency_code`

Rules:

- Repayments are linked transactions/payments with ledger entries.
- Loan repayments cannot reduce the loan balance below zero unless rejected as overpayment.
- No amortization.
- No compound interest.
- No repayment schedules in MVP.

### Budgets

Core tables:

- `budgets`
- `budget_categories`

Required support:

- Personal and business budget scope.
- Weekly, monthly, and yearly timeframe.
- Expense limits.
- Income goals.
- Alert thresholds.
- `metadata JSONB`.

Rules:

- Budget status should be computed from backend aggregates.
- Budget notifications use a generic notification service.
- SMS is excluded due to cost.

### AI And Audit

Core tables:

- `ai_entry_drafts`
- `ai_audit_logs`

Purpose:

- `ai_entry_drafts` stores unconfirmed AI suggestions.
- `ai_audit_logs` stores provider/model metadata, truncated input length, confidence, created record reference, and confirmation status.

Rules:

- AI drafts are not financial truth until confirmed.
- Store only necessary prompt metadata.
- Avoid storing unnecessary sensitive prompt content.
- AI usage should integrate with plan usage counters.

### Offline Sync

Core tables:

- `client_mutations`
- `idempotency_keys`

Purpose:

- Dedupe offline submissions.
- Protect retry flows.
- Support PWA sync without duplicate records.

Fields should include:

- `workspace_id`
- `user_id`
- `client_request_id`
- `status`
- `created_record_type`
- `created_record_id`
- timestamps

Rules:

- Server wins for finalized financial records, balances, wallets, loans, and invoices.
- Offline writes require idempotency keys.
- Client queues are capped in the frontend, but backend must still dedupe safely.

### Notifications

Core tables:

- `notification_preferences`
- `notifications`
- `notification_deliveries`

MVP channels:

- Email
- PWA push
- In-app

Rules:

- SMS is excluded due to cost.
- Channel model must be generic so WhatsApp can be added in Phase 2.
- Budget threshold alerts should use the same notification model.

### Exports / Documents

Core tables:

- `exports`
- `generated_documents`

Purpose:

- Track CSV/PDF generation jobs.
- Track file location, expiry, requested_by, status, and plan usage.
- Support user data ownership and export portability.

## Guardrails

- Every tenant-owned table has `workspace_id`.
- Every financial query is tenant-scoped.
- List queries are paginated.
- Money uses decimals only.
- Finalized financial rows are immutable.
- Finalized transactions, invoices, payments, and wallet ledger entries are never hard-deleted or directly updated.
- Corrections use voids and reversing ledger entries.
- Ledger entries must balance before commit.
- Wallet balance updates happen transactionally.
- Split payment totals are validated transactionally.
- Loan repayments cannot reduce balance below zero unless rejected as overpayment.
- AI drafts require user confirmation.
- Offline writes require idempotency keys.
- `metadata JSONB` is for extensibility, not core financial truth.

## Phase 2 Exclusions

The following are not part of the MVP data model design:

- Storefront
- Complex inventory
- Complex production
- Quotations
- WhatsApp Business API integration
- Complex amortization and interest schedules
- Advanced asset management
- Multi-workspace behavior beyond future-safe workspace modeling

## Review Criteria

- Confirm transactions remain user-facing while ledger entries provide accounting truth.
- Confirm wallet deposits debit cash and credit customer liabilities.
- Confirm finalized records cannot be hard-deleted or directly mutated.
- Confirm `metadata JSONB` exists on transactions, invoices, customers, and budgets.
- Confirm the model supports personal, business, mixed, and transfer classification.
- Confirm split payments are represented.
- Confirm customer wallets are represented.
- Confirm simple loans are represented without amortization.
- Confirm budgets are represented with alert thresholds.
- Confirm AI drafts and audit logs are represented.
- Confirm offline sync and idempotency are represented.
- Confirm notifications are generic-channel ready.
- Confirm plans, usage, and exports are represented.
- Confirm no Phase 2 schema is designed for storefront, complex inventory, complex production, quotations, WhatsApp, or amortization.

## Validated Assumptions

- PostgreSQL is the MVP database.
- MVP has one workspace per user.
- MVP stores currency codes even with one default workspace currency.
- V2 starts clean, with no automated v1 database migration.
- Future CSV import can map v1 exports into v2 later.
- MVP auth uses email OTP, not SMS.
