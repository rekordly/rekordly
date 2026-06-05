# 02 - Rekordly V2 Product Vision

## Product Vision

Rekordly v2 is a personal and business finance operating system for small business owners, freelancers, makers, traders, and professionals who need one clear place to understand money movement.

The product should help users answer:

- What did I earn?
- What did I spend?
- What belongs to my business?
- What belongs to me personally?
- Who owes me?
- Who do I owe?
- What is my profit?
- What do I owe in taxes?
- What should I budget for?
- What can AI help me record faster?

V2 should feel simpler, smarter, and more trustworthy than v1. It should preserve the useful business workflows from v1 while redesigning the system around cleaner data, better architecture, offline access, paid plans, and AI-assisted finance entry.

## Core Positioning

Rekordly v2 should be positioned around this idea:

> Type what happened. Rekordly turns it into structured financial records.

A user should be able to write something like:

> I bought fuel for delivery yesterday for 15,000 naira and paid cash.

Rekordly should understand the intent, classify the transaction, ask for missing details if needed, and create the correct expense record.

The product should not only store records. It should help users understand their money.

## Target Users

Primary users:

- Small business owners
- Freelancers and self-employed professionals
- Traders and shop owners
- Makers and production-based businesses
- Service businesses
- Individuals who mix personal and business cash flow

These users often do not have formal accounting systems. Many use notebooks, spreadsheets, WhatsApp business chats, bank alerts, or memory. Rekordly should give them structure without forcing them to think like accountants.

## Product Pillars

### 1. Personal + Business Finance Separation

V2 must clearly distinguish between:

- Business transactions
- Personal transactions
- Mixed transactions
- Transfers

This is a core product shift from v1.

Examples:

- A business sale is business income.
- A salary received by the owner may be personal income.
- Buying a laptop used 70% for business and 30% personally is mixed.
- Moving money from a personal account to a business wallet is a transfer or capital injection, not revenue.

For MVP, each user has one workspace. Personal and business finance live in the same workspace and are separated by transaction type tags, not by separate workspaces.

This separation affects transactions, reports, budgets, dashboards, AI classification, tax views, and account balances.

### 2. Business Operations

V2 should preserve and improve the strongest v1 business workflows:

- Sales
- Invoices
- Quotations
- Purchases
- Expenses
- Income
- Payments
- Customers
- Loans
- Reports
- Tax tracking, including VAT or sales tax on invoices and tax-deductible tagging
- Tax readiness reporting, including VAT summaries, taxable income, and deductible expense aggregation
- Inventory, storefront, production, and product templates for Phase 2

The redesign should reduce complexity, improve navigation, and make common tasks faster.

For MVP, the business operations scope is core finance: income, expenses, sales, purchases, simple loans, customer wallets, AI-assisted entry, basic budgeting, split payments, invoicing, and tax readiness reports. Storefront, quotations, and complex production or inventory workflows should be delayed to Phase 2.

### 3. AI-Assisted Entry

AI should help users create structured records from plain language, documents, and receipts.

Possible AI features:

- Natural-language transaction entry
- Receipt parsing
- Invoice parsing
- Smart expense categorization
- Budget suggestions
- Cash flow explanations
- Report summaries
- Anomaly detection
- Ask my business assistant
- Future expansion includes a WhatsApp Business API integration, allowing users to simply text a WhatsApp bot what happened, such as "Sold 2 bags of rice for 20k", to record transactions natively within their chat app.

AI must be controlled carefully:

- Strict per-plan rate limits
- Input truncation before LLM calls
- No unlimited AI endpoints
- Clear user confirmation before creating financial records
- Audit trail for AI-created or AI-suggested entries

### 4. Budgeting And Planning

V2 should include budgeting as a first-class feature.

Budgeting should support:

- Personal budgets
- Business budgets
- Weekly, monthly, and yearly timeframes
- Category budgets
- Expense limits
- Income goals
- Monthly targets
- Spending alerts
- Cash flow forecasts
- Budget vs actual reports

Budgets must show whether expense limits and income goals are being met for the selected timeframe.

Budgeting should connect naturally to transactions and reports, not feel like a separate tool.

### 5. Currency Handling

For MVP, assume one default currency per workspace.

Even with a single default currency, the data model must store currency codes on financial records so v2 can support multi-currency behavior later without rewriting the ledger.

### 6. PWA And Offline Accessibility

V2 should work well for users with unstable internet.

Offline support should include:

- Creating draft transactions
- Creating draft expenses and income
- Saving draft invoices
- Viewing cached dashboard summaries
- Syncing when online

Offline guardrails:

- Local offline queue must have a hard cap, such as 100 pending actions.
- Finalized financial server records should not be silently overwritten.
- Server wins for balances and finalized invoices.
- Users must resolve draft conflicts manually.

### 7. Subscription And Paid Plans

V2 should be built as a paid SaaS from the beginning.

Possible plans:

- Free or Trial
- Starter
- Business
- Pro

Feature gates may include:

- Number of transactions
- Number of invoices
- Number of customers
- Inventory access
- Production access
- Reports access
- AI credits
- Offline sync depth
- Team members
- Storefront features
- Export features
- Priority support

The system should track plan limits in the backend, not only in the frontend.

## User Experience Goals

The v2 interface should be:

- Clear
- Fast
- Mobile-friendly
- Offline-aware
- Less cluttered than v1
- Designed around daily money entry
- Helpful without feeling overwhelming

The app should separate major workflows:

- Dashboard
- Add transaction
- Business
- Personal
- Reports
- Budget
- AI assistant
- Settings

Inventory, storefront, and production should be introduced as Phase 2 workflows after the MVP proves core finance usage.

The user should always understand whether they are looking at personal finance, business finance, or combined finance.

## Commercial Goals

Rekordly v2 should make money through subscription plans and usage-based AI add-ons.

Possible revenue streams:

- Monthly subscriptions
- Annual subscriptions
- AI credit packs
- Premium reports
- Advanced exports
- Storefront upgrades
- Team seats
- Assisted onboarding or migration for high-value users

The first business goal is to get users to consistently record transactions. Without transaction activity, reports, budgets, AI insights, and subscriptions become weak.

Key product metrics:

- New accounts created
- Onboarding completion rate
- First transaction created
- Weekly active users
- Transactions per active user
- Invoices sent
- AI entries accepted
- Budget usage
- Free-to-paid conversion
- Churn
- Average revenue per user

## V2 Product Principles

- Financial correctness comes before clever UI.
- AI suggests; users confirm.
- Backend owns financial truth.
- Dashboards use aggregated backend endpoints.
- Personal and business money must not be accidentally mixed.
- Offline mode must be useful but bounded.
- Paid-plan limits must be enforced server-side.
- Reports should explain money clearly, not just display charts.
- Users own their data. The app must provide robust CSV and PDF export capabilities.
- The product should start simple but be designed for scale.

## MVP Assumptions

- One workspace per user.
- Personal and business finance live in the same workspace.
- Transaction type tags separate business, personal, mixed, and transfer activity.
- MVP includes core finance, AI-assisted entry, basic budgeting, invoicing, simple loan/debt tracking, customer wallets/advance deposits, and split payments.
- Core finance means income, expenses, sales, purchases, simple loans, and customer wallets.
- WhatsApp integration, complex production, complex inventory, and quotations are Phase 2.
- MVP assumes one default currency per workspace, while storing currency codes in the data model.

## Open Product Questions

These need further discussion before finalizing the v2 spec:

- Which features belong in the free plan?
- Which AI features are safe enough for launch?
- Which reports are required for v2 MVP?
- How much of v1 should be preserved visually?
- What is the first user segment we want to win?
- What exact limits should apply to transactions, invoices, AI credits, exports, and offline sync per plan?
- Should CSV import from v1 be available in Phase 2 or delayed until after paid users request it?
