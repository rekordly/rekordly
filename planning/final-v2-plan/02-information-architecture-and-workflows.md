# Rekordly v2 Information Architecture and Workflows

**Prepared:** 7 November 2026  
**Status:** Authoritative planning draft  
**Depends on:** `01-final-product-requirements.md`

## 1. Navigation principles

- Show navigation for the active space and user role.
- Do not expose accounting jargon as the default personal experience.
- Keep a persistent space switcher for Personal and Business.
- Make Add/Record globally available.
- Keep approval/review work visible as an inbox, not hidden inside modules.
- Use responsive navigation: bottom navigation plus More on small screens; sidebar on larger screens.
- Never combine personal and business records merely because one person owns both spaces.

## 2. Global shell

### Persistent elements

- Space switcher
- Global Add action
- Search
- Review/approval inbox
- Notifications
- Help/support
- Profile and subscription
- Sync/offline state

### Mobile primary navigation

Personal:

1. Home
2. Activity
3. Add
4. Budgets
5. More

Business:

1. Home
2. Sales
3. Add
4. Inventory
5. More

### Desktop Business navigation

1. Home
2. Money
3. Sales
4. Purchases
5. Inventory
6. Storefront
7. Contacts
8. Reports
9. Review
10. Settings

## 3. Personal information architecture

### Home

- Inflow, outflow and remaining
- Account balances
- Spending categories
- Budget status
- Recent activity
- Alerts and insights

### Activity

- All records
- Income
- Expenses
- Transfers
- Loans
- Investments
- Assets
- Drafts/needs review

### Budgets

- Active budgets
- Category limits
- Income goals
- Budget versus actual

### Reports

- Spending by category
- Income versus expense
- Cash movement
- Period comparison
- Export

### More

- Accounts
- Categories
- Attachments
- Import
- Settings
- Subscription
- Support

## 4. Business information architecture

### Home

- Cash position
- Sales and expenses
- Receivables/payables
- Low stock and expiring stock
- Orders needing action
- Procurement requiring approval/receipt
- Review inbox
- Recent activity

### Money

- Accounts
- Transactions
- Income/expenses
- Payments
- Transfers
- Journals
- Reconciliation/import

### Sales

- Overview
- Orders
- Estimates/proformas
- Invoices
- Receipts/payments
- Customer deposits/wallets
- Returns/adjustments

### Purchases

- Overview
- Purchase requests
- Purchase orders
- Goods receipts
- Supplier bills
- Supplier payments
- Returns to supplier

### Inventory

- Overview
- Products/services
- Categories/collections
- Stock by outlet
- Movements
- Transfers
- Batches/expiry
- Serial/unique identifiers
- Counts/adjustments
- Damaged/defective/expired

### Storefront

- Overview/status
- Appearance
- Catalogue visibility
- Orders
- Policies/contact
- Subdomain
- Custom domain

### Contacts

- Customers
- Suppliers
- Organization contacts
- Statements

### Reports

- Profit and Loss
- Balance Sheet
- Cash Flow
- Trial Balance
- General Ledger
- Cash movement
- Receivables/payables aging
- Inventory valuation/COGS
- VAT/WHT schedules
- Budget versus actual
- Exports

### Review

- AI drafts
- Import matches/duplicates
- Purchase approvals
- Receiving variances
- Bill approvals
- Stock adjustments/count variances
- Corrections/reversals

### Settings

- Business profile
- Users/roles
- Outlets
- Chart of accounts
- Tax/currency
- Invoice/document numbering
- Inventory policy
- Storefront/domain
- Subscription/add-ons
- Audit log
- Data/export/deletion

## 5. Core workflow: onboarding

1. User authenticates by OTP or social sign-in.
2. User selects Personal, Freelancer, Small Business or Growing Business.
3. Product explains which spaces will be created.
4. User confirms Personal, Business or both where eligible.
5. Personal setup creates currency, first account and default categories.
6. Business setup creates business profile, accounting start, costing method and first outlet.
7. Optional opening balances/stock are imported or skipped.
8. User records the first activity.
9. Product shows the resulting summary and source-to-report explanation.
10. Checklist directs the next valuable action.

Acceptance outcome: the user records three entries and understands at least one resulting summary.

## 6. Core workflow: manual money record

1. User chooses Add.
2. Chooses income, expense, transfer or advanced record.
3. Selects Personal/Business scope when launched from the combined shell.
4. Enters amount, account and date.
5. For Business, chooses what the money is for: invoice/sale, supplier bill/purchase, customer or supplier advance, loan, owner movement, tax, transfer, other, or not yet known.
6. Selects/creates the counterparty and links one or more open documents when relevant.
7. Allocates the amount across documents; any remainder must be explicitly treated as deposit/advance, other income/expense or suspense.
8. Selects category/account only for portions not already determined by linked source documents, then adds evidence.
9. System previews allocation, remaining amount and balance/report/accounting effects.
10. User confirms.
11. Backend validates permissions, plan, allocation limits and double-entry balance.
12. Payment, allocations, document balances and journal post atomically.
13. UI returns confirmation and links to the payment, sources and history.

Failures remain editable drafts; they never appear as posted totals.

## 7. Core workflow: AI/plain-language record

1. User types or chats what happened.
2. AI produces a structured draft only.
3. System resolves space, type, amount, account, category, date and counterparty.
4. Missing/uncertain fields are highlighted.
5. User edits or answers clarification.
6. Confirmation screen shows accounting and operational effects.
7. User explicitly confirms.
8. Backend performs the same deterministic validation/posting path as manual entry.
9. Audit stores entry method and changed-field names, not sensitive prompt text in analytics.

AI never owns balances or posting logic.

## 8. Core workflow: CSV import

1. User uploads supported CSV.
2. System validates size/encoding and previews rows.
3. User maps date, description, debit/credit or amount, currency and account.
4. System proposes type/category/counterparty.
5. Duplicate engine marks exact and probable matches.
6. User reviews excluded, matched and new rows.
7. Import creates a batch of drafts.
8. User confirms batch or selected drafts.
9. Backend posts atomically per record and reports partial failures without duplication.

## 9. Core workflow: invoice to payment

1. User selects or creates a customer contact; the customer is not required to have a Rekordly account.
2. Adds catalogue products and/or custom service lines.
3. Applies quantity, price, discount, VAT, currency and due date.
4. Saves estimate/proforma or issues invoice.
5. Issued invoice posts receivable/revenue according to accounting rules.
6. User shares PDF/public document link, including WhatsApp share; guest viewing does not require registration.
7. Recipient may optionally create an account and claim the relationship through verification.
8. Payment is recorded as full, partial, split across methods or allocated across several invoices.
9. Payment reduces receivable and updates cash/bank/wallet; excess becomes an explicit customer deposit, never accidental income.
10. Receipt becomes available through the same guest-safe portal.
11. Refund/correction uses an adjustment document and audit trail.

## 10. Core workflow: supplier bill to payment

1. User selects or creates a supplier contact; the supplier is not required to have a Rekordly account.
2. Creates bill manually or from received procurement.
3. Adds lines, accounts/items, tax, due date and evidence.
4. Bill remains draft until approval.
5. Approval posts expense/inventory and payable effects.
6. Partial/split payment, including one payment allocated across several bills, reduces payable.
7. Payables aging and supplier statement update.
8. Cancellation after posting requires reversal, not deletion.

Supplier POs and remittance advice can be shared through guest-safe links. Registration is optional.

## 11. Core workflow: purchase order and receiving

1. User creates purchase request or PO draft.
2. Selects supplier, destination outlet, items, quantities, expected costs and dates.
3. Applies discount, VAT and expected landed/additional cost.
4. Authorized user approves.
5. PO may be shared/sent; no stock or payable exists yet.
6. Receiver records full or partial receipt.
7. Receiver enters actual quantities, cost variance, batches, expiry and identifiers.
8. Variance requires reason and permission.
9. Receipt posts stock movement and inventory value.
10. Supplier bill is entered/matched.
11. PO, receipt and bill comparison shows unmatched differences.
12. Returns to supplier reference receipt/cost.
13. PO closes only when quantity and workflow rules are satisfied.

## 12. Core workflow: inventory sale

1. User selects outlet and customer/Guest.
2. Searches/scans product or chooses category.
3. Selects variant and quantity.
4. System checks available stock and negative-stock policy.
5. Cart calculates price, discount, VAT and total.
6. Confirmation posts sale/invoice, stock movement and COGS atomically.
7. Payment may be immediate, partial, split or deferred.
8. Return references the original sale and restores eligible stock/value.

## 13. Core workflow: storefront order

1. Visitor opens Rekordly subdomain or verified custom domain.
2. Browses/searches visible catalogue.
3. Adds available variants to cart.
4. Provides contact and delivery/request information.
5. Submits checkout request; stock is not reserved yet.
6. Business reviews price, stock and fulfilment details.
7. Merchant confirms; system reserves stock atomically.
8. Order moves through processing and ready states.
9. Fulfilment/dispatch deducts stock and releases reservation.
10. Cancellation releases reservation.
11. Any sale/invoice/payment record follows the configured business workflow.

Initial storefront does not collect online payment.

## 14. Core workflow: outlet transfer

1. Sender creates transfer request.
2. Authorized user approves when required.
3. Dispatch reduces available stock at source and marks quantity in transit.
4. Destination receives full/partial quantity.
5. Variance/damage requires reason.
6. Receipt increases destination stock.
7. Total company inventory value remains unchanged except explicit variance accounting.
8. Cost layers/average values move according to costing policy.

## 15. Core workflow: stock count and adjustment

1. User starts count for outlet/scope.
2. System snapshots expected quantity without exposing it when blind count is enabled.
3. Staff records counted quantity.
4. System calculates variance.
5. Variance requires reason and approval.
6. Approved adjustment posts stock movement and accounting effect.
7. Count and approval remain auditable.

## 16. Core workflow: return, damage and expiry

### Customer return

- Reference original sale/order.
- Record returned quantity and condition.
- Restock only saleable items.
- Use original cost where determinable.
- Issue refund/credit resolution separately.

### Damage/defective/expiry

- Select outlet, product, batch/identifier and quantity.
- Require reason/evidence and permission.
- Remove from available stock through explicit movement.
- Post loss/write-off accounting effect.

### Supplier return

- Reference receipt and supplier.
- Remove eligible stock at receipt cost.
- Create supplier debit/credit resolution.

## 17. Core workflow: corrections and period locks

1. User opens confirmed source document.
2. Chooses correct/void with reason.
3. If period is open, system creates reversal and replacement where applicable.
4. If period is locked, original remains untouched and adjustment posts in an open period with reference.
5. Related stock, receivable/payable and payment effects reverse consistently.
6. Audit shows original, reversal, replacement, actor and timestamps.

## 18. Core workflow: custom domain

1. Paid Business enters domain purchased elsewhere.
2. System supplies required DNS records.
3. Merchant updates registrar DNS.
4. Rekordly periodically verifies ownership/routing.
5. After verification, certificate is provisioned.
6. Domain moves through pending, verifying, active, error and disconnected states.
7. Rekordly subdomain remains available as fallback.
8. On entitlement expiry, grace period begins before custom domain/storefront disablement.

## 19. Core workflow: downgrade and deletion

### Downgrade/expiry

- Preserve read/export access.
- Block new paid-only operations after grace rules.
- Keep owned records and attachments.
- Disable public storefront after stated grace period without deleting commerce data.

### Explicit deletion

1. User requests deletion and reauthenticates.
2. Product explains consequences and offers export.
3. Deletion enters 60-day recoverable state.
4. Reminders are sent before final deletion.
5. User may cancel during grace period.
6. Permanent deletion runs after grace, subject to lawful retention.

## 20. Empty, loading, error and permission states

Every major page must define:

- First-use empty state with one primary action
- Loading/skeleton state
- No-results/filter state
- Offline/cached state
- Permission-denied state
- Plan-limit state
- Recoverable validation failure
- Service failure with retry/reference
- Archived/read-only state

Financial operations must never rely on a spinner with ambiguous completion. Return a durable success/failure result and make retry idempotent.

## 21. Responsive support matrix

### Required

- Current Chrome/Edge desktop
- Current Chrome Android
- Current Safari iPhone/iPad
- Current Firefox desktop for core journeys
- Keyboard navigation for desktop forms
- Touch targets and usable tables/cards on small screens

Large tables may use responsive cards or focused detail views; horizontal overflow cannot hide required actions or totals.

## 22. Workflow analytics

Track event names and safe metadata only:

- Onboarding started/completed
- First account/entry created
- Draft created/edited/confirmed
- Import mapped/reviewed/completed
- Invoice issued/payment recorded
- PO approved/receipt posted/bill matched
- Order requested/confirmed/fulfilled/cancelled
- Stock count/variance approved
- Report viewed/exported
- Domain verification state
- Limit reached/upgrade viewed
- Support requested

Never send raw narration, names, amounts, document contents or attachment data to product analytics.
