# Rekordly v2 Final Product Requirements

**Version:** Planning baseline 1.0  
**Prepared:** 7 November 2026  
**Target:** Controlled public beta on 1 December 2026  
**Owner:** Founder  
**Status:** Authoritative draft

## 1. Product vision

Rekordly helps people record money, understand where it goes and operate a small business without requiring accounting knowledge.

Long-term vision:

> Run your entire business from one app.

December beta promise:

> Record personal and business money, manage customers, suppliers and stock, accept storefront orders, and keep trustworthy reports in one place.

The December promise must describe shipped behavior. The long-term vision must not be presented as proof that deferred payroll, manufacturing, lending, tax filing or native mobile apps exist.

## 2. Target users

### 2.1 Personal user

Wants to know:

- What money came in?
- What was spent?
- Where did it go?
- What remains across cash, bank and wallets?
- Is spending changing over time?
- Is the user staying within personal limits and budgets?

### 2.2 Freelancer

Needs personal tracking plus:

- Separate business records
- Customers and invoices
- Service/custom sales without inventory
- Payment and outstanding-balance tracking
- Expenses, evidence and tax-ready exports
- A combined owner overview without mixing personal and business ledgers

### 2.3 Small-scale business

Needs:

- Customers, suppliers, invoices and bills
- Products, variants and multiple outlets
- Procurement, partial receiving, batches and expiry
- Orders and a simple online storefront
- Staff permissions and approvals
- Accrual reports, cash visibility and audit history

### 2.4 Explicitly deferred customer types

- Payroll-led organizations
- Manufacturers requiring bills of materials and production planning
- Complex enterprise groups and consolidated multi-entity accounting
- Businesses requiring native Android/iOS apps at launch
- Businesses requiring automatic tax filing or regulated custody/lending

## 3. Product principles

1. **Plain language outside, accounting correctness underneath.**
2. **Personal and Business remain separate books.**
3. **Every AI-created financial record requires confirmation.**
4. **Confirmed records are corrected through reversal/void history, not silent replacement.**
5. **Operational actions explain their stock, cash, receivable/payable and ledger effects.**
6. **Users always retain read and export access to owned financial history.**
7. **Free limits stop new usage, not access to existing records.**
8. **No advertising or sale of financial data.**
9. **Critical integrity failures block public launch.**
10. **Responsive mobile and desktop web are first-class; native apps are not launch requirements.**

## 4. Workspace model

### 4.1 Account

One authenticated person account may own or access:

- One Personal space
- One or more Business spaces, subject to entitlement
- Business spaces owned by others through invitations

### 4.2 Personal space

Contains personal accounts, transactions, categories, budgets, loans, investments, assets, reports and attachments.

### 4.3 Business space

Contains business accounting, operational records, users, outlets, customers, suppliers, catalogue, inventory, procurement, invoices, bills, payments, storefront and orders.

### 4.4 Combined owner view

May show personal and business summaries side by side. It must not:

- Merge ledgers
- Treat owner drawings as personal income without an explicit corresponding personal record
- Treat owner contributions as business revenue
- Combine tax or profit reports

Cross-space suggestions must be confirmed as two linked records.

## 5. Onboarding requirements

### 5.1 Role selection

The user chooses Personal, Freelancer, Small Business or Growing/General Business. The choice configures defaults and navigation; it does not permanently restrict later upgrades.

### 5.2 Space selection

- Personal creates Personal only.
- Freelancer creates Personal and Business by default.
- Business creates Business and offers optional Personal.
- User may add an eligible space later.

### 5.3 Required Personal setup

- Name and locale
- Base currency
- At least one cash/bank/wallet account
- Optional starting balance
- Default categories
- First income/expense walkthrough

### 5.4 Required Business setup

- Business name and type
- Base currency and accounting start date
- Accrual basis with cash-movement reporting
- Inventory costing policy: FIFO or weighted average
- First outlet
- Tax/VAT settings with honest disclaimers
- Invoice numbering
- Optional opening balances and opening stock

After the first posted stock movement, costing policy is immutable unless a controlled migration is designed and executed.

## 6. Authentication and access

### P0 requirements

- Email or phone OTP
- Google/social sign-in
- Secure session refresh and revocation
- Logout all sessions
- Rate limits and abuse controls
- Owner, staff, accountant/bookkeeper roles
- Granular permissions for finance, inventory, procurement, orders and approvals
- Outlet-level access
- Audit of permission and role changes

No secret, OTP or session token may enter logs, analytics or AI prompts.

## 7. Personal finance requirements

### 7.1 Accounts

- Cash, bank and mobile-wallet accounts
- Opening balances
- Active/archived state
- Transfers between owned accounts
- Reconciled balance derived from confirmed records

### 7.2 Money records

- Income
- Expense
- Transfer
- Loan borrowed/lent
- Loan repayment
- Investment contribution/purchase and income
- Asset purchase/disposal record
- Personal/business/mixed classification
- Category, date, counterparty, notes, tags and evidence

### 7.3 Budgets and insight

- Weekly, monthly and annual budgets
- Category spending limits
- Income goals
- Budget versus actual
- Weekly/monthly category analysis
- Period comparisons
- Neutral alerts without shame/scoring
- Dashboard: inflow, outflow, remaining, account balances and major categories

Savings goals are P1, not P0.

## 8. Capture requirements

### 8.1 Entry modes

- Universal Add action
- Simple quick form
- Structured form for advanced records
- Plain-language AI/chat drafting
- CSV import with mapping and duplicate review
- Offline drafts for eligible paid entitlements

### 8.2 AI rules

- Output is always a draft.
- Show record type, scope, amount, currency, account, category, date, counterparty and accounting effect.
- Highlight uncertainty and missing fields.
- Require explicit confirmation for every financial record.
- Preserve the original user input and resulting draft metadata in audit-safe form, subject to privacy retention.
- Never silently post, delete, reverse, pay, receive stock or send a purchase order.
- Respect workspace, role and action permissions.

## 9. Customer, supplier and contact requirements

### Customers

- Guest/walk-in customer
- Person or organization customer
- Multiple contacts for an organization
- Opening balance and statement
- Invoice, payment, purchase and order history
- Amount due and aging

### Suppliers

- Supplier profile and contacts
- Opening balance and statement
- Purchase orders, receipts, bills and payment history
- Amount payable and aging

Customer and supplier deletion is prohibited after financial use; archive instead.

## 10. Sales, estimates and invoicing

### P0

- Custom/service sale without catalogue creation
- Product sale linked to catalogue and stock rules
- Estimate/proforma
- Convert estimate to invoice/order
- Invoice line items, VAT, discounts, currency, terms and due date
- Guest or registered customer
- Draft, issued, partial, paid, overdue, cancelled and void states
- Cash, transfer, POS and wallet methods
- Split and partial payments
- Customer advance deposits as liabilities, not revenue
- Invoice and receipt PDF
- WhatsApp share link/prepared message
- Refund, debit and credit-note resolution with accounting history

No payment total may exceed the outstanding amount. No wallet payment may exceed the wallet liability balance.

## 11. Supplier bills and payables

### P0

- Draft and approved supplier bill
- Supplier, reference, date, due date, currency and attachment
- Lines, expense/inventory account, tax and additional cost
- Unpaid, partial, paid, overdue, cancelled and void states
- Partial/split payments
- Approval before payment
- Payables aging and supplier statement
- Bill may originate from procurement receipt but remains a distinct accounting document

## 12. Catalogue requirements

### P0

- Products and services
- Categories and collections
- Images
- SKU, barcode and QR code
- Variants/options
- Units of measure
- Retail, wholesale and cost price
- Tax behavior
- Active, draft and archived state
- Stock/non-stock designation
- Identifiers/custom fields
- CSV import/export

An archived product remains visible on historical documents.

## 13. Inventory requirements

### 13.1 Location and quantity

- Multiple outlets
- Stock on hand
- Reserved stock
- Available stock = on hand minus reserved
- Opening stock through an audited opening movement
- Immutable stock movement ledger

### 13.2 Costing

Each Business chooses FIFO or weighted average before the first posted movement.

- FIFO consumes the oldest eligible cost layers.
- Weighted average recalculates the outlet/product-variant average after eligible receipts.
- Transfers preserve total company inventory value while moving cost appropriately between outlets.
- Returns reference original cost where possible.
- Backdating cannot silently invalidate later cost layers; it must be rejected or trigger a controlled recalculation with audit evidence.

### 13.3 Controls

- Negative stock is blocked by default.
- Administrator may enable negative stock with prominent warnings and audit history.
- Adjustments require reason and permission.
- Stock counts produce variance records and approval.
- Damaged, defective and expired stock use explicit movements and accounting effects.
- Batch/lot, expiry and unique/serial identifier tracking are supported.
- Low-stock and expiry alerts are supported.

## 14. Procurement requirements

### P0 lifecycle

`purchase request → purchase order → approval → supplier dispatch → partial/full receipt → supplier bill → payment → close`

Required behavior:

- Draft, approved, sent, partial, completed, cancelled and void states
- Supplier and destination outlet
- Expected date, terms, currency, discount, VAT and additional/landed cost
- Partial receipt
- Variance reason when received quantity/cost differs
- Batch, expiry and identifiers during receiving
- Return to supplier
- PO/receipt/bill comparison
- Approval and audit history
- Receipt increases stock; PO alone does not
- Supplier bill creates the payable/accounting obligation; payment settles it

AI may prepare a purchase-order draft but confirmation is mandatory before approval or sending.

## 15. Storefront and order requirements

### 15.1 Storefront

- Optional per Business
- Default `businessname.rekordly.com` address
- Catalogue, collections, search and product pages
- Variant and available-stock display
- Cart and checkout request
- Guest contact and delivery details
- Logo, colours, cover image, contact details, policies and limited templates
- No launch-time online payment collection

### 15.2 Custom domains

- Paid Business entitlement/add-on
- Domain purchased elsewhere
- DNS ownership verification
- Automatic SSL
- Clear activation/error state
- Rekordly does not initially register or own domains

### 15.3 Orders

- Pending request, confirmed, processing, ready, fulfilled, cancelled
- Checkout request does not reserve stock
- Merchant confirmation reserves stock
- Fulfilment/dispatch permanently deducts stock
- Cancellation releases reservation
- Quantity changes recalculate reservation atomically
- Every transition is permissioned and audited

## 16. Accounting and reporting requirements

### P0 accounting foundation

- Backend-owned double-entry journal
- Decimal/fixed-precision money; no floating point
- Accrual basis for Business reports
- Separate cash-movement view
- Chart of accounts
- Automatic journals from sales, bills, payments, inventory and procurement
- Controlled manual journal
- Period close and lock
- Open-period correction for locked-period errors
- Source-document drill-down

### P0 reports

- General Ledger
- Trial Balance
- Profit and Loss
- Balance Sheet
- Cash Flow Statement
- Cash movement
- Receivables and payables aging
- Customer and supplier statements
- Inventory valuation and COGS
- Budget versus actual
- VAT collected versus paid
- WHT/tax evidence schedules
- Accountant-ready CSV/PDF export

Reports are tax-ready information, not automatic filing or professional tax advice.

## 17. Team and administration

### P0

- Owner plus staff invitations
- Owner, administrator, sales, inventory/procurement, finance and accountant role templates
- Granular action permissions
- Outlet restrictions
- Approval thresholds/hooks
- User/session revocation
- Audit log
- Business branding, numbering, currency, tax and document settings
- Usage and plan-limit view

## 18. Subscription and packaging requirements

### Beta

- Free controlled beta
- No advertising
- Usage limits and spend controls
- Export remains available

### Post-beta test prices

- Free: ₦0
- Personal Plus: ₦1,500/month or ₦15,000/year
- Business: ₦5,000/month or ₦50,000/year
- Paystack is the first subscription provider

Business includes one optional owner Personal space, one Business space, owner plus two staff, two outlets, one storefront and one Rekordly subdomain. Add-ons and detailed limits follow document 29 until replaced by validated pricing.

## 19. Offline and PWA requirements

- Installable responsive PWA
- Modern mobile and desktop browsers
- Cached read-only summaries/history for Free
- Bounded offline draft queue for eligible paid plans
- Visible offline, pending, syncing, failed and synced states
- Server remains authority for balances, finalized records, inventory and permissions
- Draft conflict resolution
- No native Android/iOS launch requirement

## 20. Export, downgrade and deletion

- CSV/PDF exports according to record/report type
- Full workspace export
- Read-only access and export after downgrade
- Paid-only creation/configuration may pause
- Storefront receives a grace period, then becomes unavailable without deleting business records
- Subscription expiry never triggers deletion
- Explicit deletion request starts a 60-day recoverable grace period
- Warn repeatedly and offer export
- Permanently delete after grace period, subject to lawful retention requirements

## 21. Analytics and privacy

Analytics may record event type, feature, latency bucket, error code and plan state. Analytics must not contain:

- Financial narration
- Customer/supplier names
- Raw amounts
- Receipt images
- OTPs or credentials
- AI prompt content containing financial details

## 22. P0 non-goals

- Native Android/iOS apps
- Live bank feeds
- Automatic tax filing
- Payroll and HR
- Manufacturing/production recipes
- Consolidated multi-entity accounting
- Online storefront payment collection
- Domain registration/reselling
- Full website builder
- Silent AI posting
- Lending, custody or credit scoring
- Bulk marketing campaigns

## 23. Activation and success

### Activation

A user records at least three entries and sees a useful income/spending summary. For Business, secondary activation is completing one operational loop such as invoice-to-payment, PO-to-receipt or storefront-request-to-confirmed-order.

### Beta success signals

- Records activity in at least three different weeks
- Correction rate and AI draft edit rate decline
- Users can trace report totals to source documents
- Inventory subledger reconciles to valuation and general ledger
- Businesses successfully complete orders and procurement without support intervention
- Export succeeds and reconciles
- At least one accountant/bookkeeper validates deterministic report fixtures

## 24. Automatic no-go conditions

Public beta is blocked if any of the following is true:

- Cross-tenant data exposure
- Unbalanced journal path
- Money stored/calculated with floating point
- Confirmed records can be silently edited/deleted
- Inventory quantity/value does not reconcile
- FIFO or weighted-average test fixtures fail
- Reservations can oversell or remain stuck after cancellation
- Export is unavailable or unreconciled
- Backup restore has not succeeded
- AI can post without confirmation
- Critical permissions can be bypassed
- Supported mobile/desktop core journeys are unusable
- Privacy, terms or support contact is absent

Fallback: invite-only beta with unsafe/incomplete modules hidden, or revise the date. Quality gates are not removed.

## 25. Open external dependencies

- Recruit at least one Nigerian accountant/bookkeeper by 15 November; target two.
- Name the first beta cohort from the founder's pool of more than ten candidates.
- Verify hosting, email, monitoring, AI and Paystack accounts without recording secrets in Markdown.
- Confirm legal/privacy templates are suitable for beta and identify later professional review.
- Re-estimate productive solo-founder capacity; reported availability is not equivalent to sustainable development throughput.
