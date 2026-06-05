# 03 - Rekordly V2 Feature Map

## Summary

This document maps Rekordly v2 MVP features only.

The MVP includes core finance, invoicing, simple loan/debt tracking, customer wallets/advance deposits, split payments, basic budgeting, tax readiness reports, AI-assisted entry, authentication, PWA/offline capabilities, and subscription enforcement.

Storefront, complex inventory, complex production, quotations, advanced asset workflows, and complex amortization or interest scheduling remain Phase 2. They are listed only as deferred capabilities and must not receive API endpoint or data model design in this document.

## MVP Core Features

### AI-Assisted Entry

AI-assisted entry is the primary way users add financial activity.

The main interaction is natural language:

> Type what happened.

The user writes a short description, and Rekordly turns it into a structured draft.

MVP behavior:

- Parse user text into draft income, expense, sale, purchase, invoice draft, loan/debt, deposit, or payment records.
- Ask for missing information when required.
- Show the parsed result in a confirmation/manual form before saving.
- Let the user edit category, amount, date, transaction type, counterparty, payment method, and notes before submission.
- Save only after explicit user confirmation.
- Keep traditional manual forms as the fallback and confirmation step.
- MVP AI entry is via the web app only. Architecture must allow a future WhatsApp channel to submit text to the same AI parsing backend.

Required guardrails:

- Enforce strict AI rate limits per user and plan.
- Truncate user input before sending it to any LLM provider.
- Do not allow unlimited or anonymous AI parsing.
- Keep an audit trail for AI-created or AI-suggested records.
- Treat AI output as a suggestion, never as financial truth until the user confirms.

### Core Finance

Core finance covers income, expenses, sales, and purchases.

All MVP finance records must support transaction type classification:

- Business
- Personal
- Mixed
- Transfer

#### Income

Income tracking should support personal and business income.

Required capabilities:

- Record amount, category, payment status, date, notes, and currency.
- Distinguish business income from personal income.
- Support income goals through budgeting.
- Support manual and AI-assisted creation.

#### Expenses

Expense tracking should support personal, business, mixed, and transfer-related outflows.

Required capabilities:

- Record amount, category, payment status, date, notes, and currency.
- Mark whether an expense is tax deductible.
- Support business/personal allocation for mixed transactions.
- Support manual and AI-assisted creation.

#### Sales

Sales record business revenue from customer-facing transactions.

Required capabilities:

- Record customer, amount, payment status, VAT or sales tax where applicable, discounts, notes, and currency.
- Support full, partial, and split payments.
- Support customer wallet payments.
- Support PDF/CSV export path.
- Use backend aggregate endpoints for sale summaries.

#### Purchases

Purchases record business buying and vendor spending.

Required capabilities:

- Record vendor, amount, payment status, date, notes, and currency.
- Support tax-deductible tagging where applicable.
- Support manual and AI-assisted creation.
- Avoid complex inventory coupling in MVP.

### Invoicing

Invoicing supports customer billing and payment tracking.

Required capabilities:

- Create, edit, send/download, mark paid, mark partially paid, cancel, and export invoices.
- Include customer details, line items, taxes, discounts, payment status, due dates, and currency code.
- Support full, partial, and split payments.
- Support customer wallet payments.
- Generate invoice PDFs from the Go backend.
- Use aggregate backend endpoints for invoice dashboard summaries.

### Simple Loans / Debt Tracker

Simple loans track money borrowed and money lent without complex lending calculations.

Required capabilities:

- Track money borrowed as liabilities.
- Track money lent to others as receivables.
- Store principal, counterparty, direction, start date, due date, status, notes, and currency.
- Link repayments through standard transactions using a `loan_id` tag or reference.
- Reduce loan balance by validated linked repayments.

MVP exclusions:

- No automated amortization.
- No compound interest calculations.
- No interest schedule generation.
- Interest is recorded manually as a normal income or expense transaction.

### Customer Wallets & Advance Deposits

Customer wallets track advance payments and store credit.

Required capabilities:

- Give customers a wallet balance.
- Record money received without an immediate sale as a deposit.
- Increase the customer wallet balance when a valid deposit is recorded.
- Treat deposits as trust/liability balances, not revenue.
- Allow wallet balances to pay for future sales or invoices.
- Reject wallet payments above the customer wallet balance.
- Prevent negative customer wallets.

Required validation:

- Backend must validate wallet balance before applying a wallet payment.
- Wallet payment portions in split payments must also pass balance validation.
- Wallet balances must be treated as server-side financial truth.

### Split Payments

Split payments allow a sale or invoice to be settled with multiple payment methods.

Required capabilities:

- Allow one sale or invoice payment to contain multiple payment records.
- Each payment record must have an amount and method.
- Supported MVP methods include cash, transfer, POS, and wallet.
- Let users add multiple payment methods at the point of sale before submitting.
- Recalculate paid amount and outstanding balance from the payment records.

Required validation:

- The sum of payment records must not exceed the amount due.
- Wallet payment portions must not exceed the available wallet balance.
- Backend validation must enforce totals even if the frontend validation is bypassed.

### Basic Budgeting

Budgeting helps users track planned income and spending.

Required capabilities:

- Support personal budgets.
- Support business budgets.
- Support weekly, monthly, and yearly timeframes.
- Track category-level expense limits.
- Track income goals.
- Show target status, such as on track, exceeded, under target, or met.
- Compare budget targets against actual transaction activity.
- Use backend aggregate calculations, not raw client-side transaction scans.

### Tax Readiness Reports

Tax readiness reports help users and their accountants prepare for tax season using data already captured in Rekordly.

Required capabilities:

- Generate VAT collected vs. VAT paid summaries.
- Calculate total taxable income from tagged income, sales, and invoice data.
- Calculate total tax-deductible expenses from user-tagged deductible expenses.
- Use backend aggregate endpoints, not client-side scans of raw transaction history.
- Export reports as PDF and CSV.
- Respect plan limits before generating reports or exports.

MVP exclusions:

- No auto-filing with FIRS.
- No direct submission to any government tax portal.
- No guarantee that Rekordly replaces a qualified accountant or tax adviser.

## Cross-Cutting Features

### Authentication

V2 uses a split frontend/backend architecture.

Required capabilities:

- Next.js owns login and signup UI on `rekordly.com`.
- The Go API lives on `api.rekordly.com`.
- The Go API validates every protected request.
- Protected routes and actions require authenticated user context.
- MVP will use email OTP only. SMS is excluded due to cost, and the architecture must allow a WhatsApp OTP provider to be swapped in later without rewriting the auth flow.
- `06-api-architecture.md` must define CORS, cookie/JWT/session refresh, logout, CSRF, allowed origins, token expiry, and session revocation rules.

### PWA/Offline

V2 should support useful offline work without unbounded local state.

Required capabilities:

- Allow offline drafts for income, expenses, sales, purchases, invoices, loans, deposits, and payments.
- Cap the offline queue at 100 pending actions.
- Block new offline actions when the queue is full until sync completes.
- Show cached dashboard summaries when offline if available.
- Clearly mark cached dashboard data as stale.
- Sync queued drafts when the user returns online.

Conflict rules:

- Server wins for finalized financial records.
- Server wins for balances.
- Server wins for wallet balances.
- Server wins for loan balances.
- Server wins for finalized invoices.
- Draft conflicts require user resolution.

### Subscription/Plan Enforcement

V2 should enforce paid-plan limits from the backend.

Required capabilities:

- Enforce limits for transactions.
- Enforce limits for invoices.
- Enforce limits for loan records.
- Enforce limits for wallet deposits.
- Enforce limits for AI credits.
- Enforce limits for exports.
- Enforce limits for offline sync depth.
- Enforce limits for reports and plan-only features.

Rules:

- Frontend may hide locked UI, but cannot be trusted for enforcement.
- Backend plan checks happen before write operations.
- Backend plan checks happen before AI calls.
- Failed plan checks should return clear upgrade or limit-reached messaging.

## User-To-Feature Matrix

Use placeholder limits until pricing is finalized.

| Feature | Free | Starter | Business | Pro |
|---|---:|---:|---:|---:|
| Transactions | X/mo | X/mo | X/mo | X/mo |
| AI-assisted entries | Y credits/mo | Y credits/mo | Y credits/mo | Y credits/mo |
| Income/expense tracking | Yes | Yes | Yes | Yes |
| Sales/purchases | Limited | Yes | Yes | Yes |
| Invoicing | Limited | Yes | Yes | Yes |
| Invoice PDF export | Limited | Yes | Yes | Yes |
| CSV export | Limited | Yes | Yes | Yes |
| Basic budgeting | Limited | Yes | Yes | Yes |
| Tax reports | No access or 1 annual summary | Quarterly | On-demand/unlimited | On-demand/unlimited |
| Simple loan tracking | Limited | Yes | Yes | Yes |
| Customer wallets/deposits | Limited | Yes | Yes | Yes |
| Split payments | Yes | Yes | Yes | Yes |
| Personal/business split | Yes | Yes | Yes | Yes |
| Offline queue depth | Small | Medium | Larger | Largest |
| Dashboard/report summaries | Basic | Standard | Advanced | Advanced |
| Team members | No | No | Placeholder | Placeholder |
| Priority support | No | No | Placeholder | Placeholder |

## Phase 2 Deferred

The following features are known future capabilities, but they are not part of the MVP feature design. Do not design API endpoints, schemas, or workflows for these in the MVP architecture documents.

- Storefront
- Complex inventory management
- Complex production and product recipes
- Quotations
- Complex amortization and interest scheduling
- Owner equity
- Fixed assets
- Digital assets
- Securities
- Advanced imports/migrations
- Multi-workspace support
- Advanced multi-currency behavior
- Team roles and permissions beyond placeholder plan support
- WhatsApp Business API integration, including WhatsApp OTP/verification codes, transaction notifications such as payment receipts and invoice links, and a conversational AI bot that lets users record transactions directly in WhatsApp.

## Test / Review Criteria

Use this checklist to review the feature map:

- Confirm no Phase 2 endpoints, tables, models, or workflows are designed.
- Confirm loans are included only as simple debt tracking, not amortization.
- Confirm customer wallets cannot go negative.
- Confirm split payments cannot exceed amount due.
- Confirm AI-assisted entry is the primary transaction creation path.
- Confirm manual forms are fallback and confirmation tools.
- Confirm MVP finance features respect personal, business, mixed, and transfer classification.
- Confirm auth reflects the Vercel/Go cross-domain split.
- Confirm offline queue, server-wins conflicts, AI cost limits, and server-side plan enforcement are included.

## Assumptions

- MVP has one workspace per user.
- Personal and business finance live in the same workspace.
- MVP uses one default currency per workspace but stores currency codes.
- Placeholder plan limits are acceptable until pricing is finalized.
- Storefront, complex production, complex inventory, quotations, and complex amortization remain Phase 2.
