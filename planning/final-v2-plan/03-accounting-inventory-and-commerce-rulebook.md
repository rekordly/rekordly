# Rekordly v2 Accounting, Inventory and Commerce Rulebook

**Prepared:** 7 November 2026  
**Status:** Authoritative planning draft  
**Applies to:** every confirmed financial, stock, procurement and order operation

## 1. Purpose

This document defines financial and inventory truth. UI labels may be simplified, but implementations must not invent behavior that contradicts these rules.

## 2. Invariants

1. Every posted journal balances: total debits equal total credits in workspace base currency.
2. Posted monetary totals and journal lines use signed integer currency minor units; high-precision rates, quantities and unit-cost calculations use fixed decimals. Binary floating point is forbidden.
3. Posted records are immutable. Corrections create linked reversals/adjustments/replacements.
4. Operational documents and their journals share durable source references.
5. Stock quantity changes only through immutable stock movements.
6. Inventory value changes reconcile to inventory subledger and General Ledger.
7. Reserved stock is not deducted stock.
8. Purchase orders do not create stock or payables.
9. Goods receipts create stock; supplier bills create payables.
10. Storefront checkout requests do not reserve stock.
11. Confirmed orders reserve stock; fulfilment deducts stock.
12. AI may prepare drafts but cannot post any financial or stock record.
13. Every write endpoint is idempotent for a declared request/idempotency key.
14. Workspace, currency, outlet and permissions are validated server-side.
15. Personal and Business ledgers never merge.

## 3. Core states

### Financial document states

- `draft`
- `pending_review`
- `approved`
- `posted`
- `partially_settled`
- `settled`
- `overdue`
- `cancelled` — allowed only before posting
- `reversed` — posted record neutralized by linked reversal
- `voided` — invalidated with auditable accounting treatment

State labels may vary by document, but a posted document cannot return to draft.

### Stock document states

- `draft`
- `pending_approval`
- `approved`
- `in_progress`
- `partially_completed`
- `completed`
- `cancelled`
- `reversed`

## 4. Accounting basis

Business spaces use accrual accounting:

- Revenue is recognized when a valid sale/invoice is posted, not merely when cash arrives.
- Expense or inventory is recognized when the valid bill/receipt rules require it, not merely when paid.
- Receivables and payables track unsettled obligations.
- Cash-movement reporting separately shows actual cash/bank/wallet activity.

Personal spaces present cash-oriented summaries but still model transfers, loans, assets and liabilities correctly.

## 5. Base and transaction currencies

- Every workspace has one base currency.
- A document may use an enabled transaction currency.
- Store original amount, currency and exchange rate.
- Store base-currency amount used by journals.
- Posted exchange rate is immutable.
- Settlements at a different rate create realized exchange gain/loss.
- Reporting translation does not rewrite source documents.

P0 may restrict exchange-rate entry to manual values if a reliable feed is not ready.

## 6. Minimum chart of accounts

### Assets

- Cash on Hand
- Bank Accounts
- Mobile Wallets
- Accounts Receivable
- Inventory
- Customer Advances Clearing/other configured asset where required
- Loans Receivable
- Fixed/Other Assets
- Input VAT/Recoverable Tax

### Liabilities

- Accounts Payable
- Customer Deposits/Wallet Liability
- Loans Payable
- Output VAT/Tax Payable
- Other Current Liabilities

### Equity

- Owner Capital/Contributions
- Owner Drawings
- Retained Earnings/Opening Balance Equity

### Income

- Sales Revenue
- Service Revenue
- Other Income
- Interest/Investment Income

### Expenses

- Cost of Goods Sold
- Operating Expense categories
- Inventory Loss/Damage/Expiry
- Interest Expense
- Exchange Gain/Loss

Businesses may add accounts, but system-controlled accounts cannot be deleted while referenced.

## 7. Journal matrix

### Cash income/service sale

| Debit | Credit |
|---|---|
| Cash/Bank/Wallet asset | Revenue |
| — | Output VAT when applicable |

### Credit invoice

| Debit | Credit |
|---|---|
| Accounts Receivable | Revenue |
| — | Output VAT when applicable |

### Customer payment

| Debit | Credit |
|---|---|
| Cash/Bank | Accounts Receivable |

### Customer advance deposit

| Debit | Credit |
|---|---|
| Cash/Bank | Customer Deposit Liability |

Applying advance to invoice:

| Debit | Credit |
|---|---|
| Customer Deposit Liability | Accounts Receivable |

### Immediate expense

| Debit | Credit |
|---|---|
| Expense and Input VAT where applicable | Cash/Bank |

### Supplier bill for operating expense

| Debit | Credit |
|---|---|
| Expense and Input VAT where applicable | Accounts Payable |

### Supplier payment

| Debit | Credit |
|---|---|
| Accounts Payable | Cash/Bank |

### Inventory receipt before supplier bill

If goods are received before bill:

| Debit | Credit |
|---|---|
| Inventory | Goods Received Not Invoiced (GRNI) |

When supplier bill is matched:

| Debit | Credit |
|---|---|
| GRNI | Accounts Payable |
| Input VAT/eligible landed-cost accounts | Accounts Payable or relevant clearing |

If receipt and bill post together, the system may use a single equivalent compound journal while preserving distinct receipt and bill documents.

### Inventory sale

Revenue side follows cash or receivable sale. Cost side:

| Debit | Credit |
|---|---|
| Cost of Goods Sold | Inventory |

### Owner contribution

| Debit | Credit |
|---|---|
| Cash/Bank/Asset | Owner Capital |

### Owner drawing

| Debit | Credit |
|---|---|
| Owner Drawings | Cash/Bank/Inventory as applicable |

Inventory drawings must also reduce stock at cost; they are not customer revenue.

### Loan borrowed

| Debit | Credit |
|---|---|
| Cash/Bank | Loan Payable |

Principal repayment:

| Debit | Credit |
|---|---|
| Loan Payable | Cash/Bank |

Interest:

| Debit | Credit |
|---|---|
| Interest Expense | Cash/Bank or Interest Payable |

### Money lent

| Debit | Credit |
|---|---|
| Loan Receivable | Cash/Bank |

Principal received:

| Debit | Credit |
|---|---|
| Cash/Bank | Loan Receivable |

## 8. Payment rules

- A payment is a separate record linked to its document/counterparty.
- A payment may allocate to one document, several documents or remain explicitly unallocated.
- Sum of active payments cannot exceed amount due unless explicit customer advance logic receives the excess.
- Partial payments update paid and outstanding amounts from payment records; totals are never manually stored as independent truth.
- Split payment creates multiple payment allocations under one settlement action.
- Multi-document allocation distributes one payment across several invoices/bills; split method distributes settlement across several money accounts. These are independent concepts and may coexist.
- Unidentified receipts/payments post to a controlled suspense/clearing account and must appear in a resolution queue.
- Customer overpayment becomes a customer-deposit liability only with explicit confirmation.
- Supplier prepayment becomes a supplier-advance asset and may reference a PO, but a PO alone is not a payable.
- Reversing a payment restores the outstanding balance.
- Payment method does not determine accounting by label alone; it maps to a configured asset/liability account.
- “Later” creates or retains receivable/payable; it is not a zero-value payment.

## 8.1 Money representation and rounding

- Final monetary amounts use `BIGINT` minor units plus ISO currency and minor-unit exponent.
- API minor-unit integers are serialized as strings to avoid JavaScript safe-integer loss.
- Major-unit user inputs remain validated strings and are converted exactly on the server.
- Currency precision is metadata, not a universal assumption of two decimal places.
- Rates, fractional unit costs and weighted-average calculations use fixed-precision decimal arithmetic.
- Round once at the defined posting/document boundary and allocate residuals deterministically.
- Debit and credit minor-unit sums must be identical integers before commit.
- Checked arithmetic must reject overflow.

## 9. Tax and discount ordering

Default line calculation:

1. Quantity × unit price = gross line amount.
2. Line discount reduces taxable base when legally/configurationally appropriate.
3. Tax applies to the configured taxable base.
4. Document-level discount is allocated deterministically across eligible lines.
5. Rounding occurs at documented currency precision.
6. Sum of rounded line totals must equal document total; residual rounding uses an explicit deterministic allocation.

Tax-inclusive and tax-exclusive prices must be explicit. Changing tax configuration does not rewrite posted documents.

## 10. Inventory identity

Inventory is tracked by:

- Business workspace
- Outlet/location
- Product variant
- Optional batch/lot
- Optional serial/unique identifier
- Movement date and posted sequence

Serial-controlled items cannot have duplicate active serial identifiers in the same business.

## 11. Inventory quantities

For each outlet/variant:

- `on_hand` = posted inbound minus posted outbound movements
- `reserved` = active confirmed-order reservations not released/fulfilled
- `available` = on_hand minus reserved
- `in_transit` = dispatched transfer quantity not yet received/returned

These are derived from ledgers/reservations or transactionally maintained projections that can be rebuilt and reconciled.

## 12. Stock movement types

- Opening stock
- Procurement receipt
- Customer sale/fulfilment
- Customer return
- Supplier return
- Transfer dispatch
- Transfer receipt
- Transfer variance
- Positive adjustment
- Negative adjustment
- Stock count variance
- Damage
- Defective
- Expiry
- Owner drawing/internal consumption
- Reversal

Each movement requires source type/id, actor, outlet, variant, quantity, timestamp, costing reference and reason where applicable.

## 13. Weighted-average costing

Weighted average is maintained per outlet and product variant unless architecture explicitly adopts one company-wide pool.

On receipt:

`new average = (existing quantity × existing average + received quantity × eligible received unit cost) ÷ new quantity`

Rules:

- Use pre-receipt non-negative quantity/value.
- Eligible landed cost is allocated consistently to received units.
- Outbound issues use the average cost effective at posting.
- Returns referencing an original sale restore original issued cost where possible; otherwise use current policy with explicit limitation.
- Negative stock complicates average cost and is why it is blocked by default.
- Recalculation caused by permitted backdating must be deterministic and auditable.

## 14. FIFO costing

FIFO maintains immutable receipt cost layers per outlet/variant:

- Layer quantity received
- Quantity remaining
- Unit cost including allocated eligible landed cost
- Receipt source/date/sequence
- Batch/expiry/identifier association where applicable

Outbound issues consume oldest eligible layer first. One issue may reference multiple layers. Returns restore referenced consumed cost when determinable. Transfers carry the actual consumed layers to destination rather than revaluing them.

## 15. Costing-policy controls

- Costing method is chosen during Business inventory setup.
- After first posted stock movement, ordinary users cannot change it.
- A future controlled migration must close a period, snapshot/reconcile stock, generate migration evidence and prevent history rewriting.
- All costing calculations run server-side.
- Inventory valuation report must tie to Inventory control-account balance.

## 16. Negative stock

Default: prohibited.

Optional administrator override:

- Explicit business setting
- Warning before activation
- Permission restricted
- Every negative issue prominently flagged
- Reports expose negative quantities and provisional cost implications
- Subsequent receipts must resolve provisional costing deterministically

If robust negative-stock costing is not implemented and tested for both FIFO and weighted average, the override must remain disabled in P0 despite the planned setting.

## 17. Purchase-order rules

- PO is a commercial commitment, not a stock or accounting posting.
- Approval freezes commercial terms into a version; changes require amendment/version history.
- Ordered, received, returned and billed quantities are separately derived.
- Receipt cannot exceed tolerance without variance permission.
- PO cancellation cannot erase existing receipts/bills.
- PO closes only when remaining obligations are resolved.

## 18. Goods-receipt rules

- Receipt requires destination outlet.
- Product, variant, quantity and unit cost/source are required.
- Batch/expiry/serial requirements follow product tracking policy.
- Partial receipt is supported.
- Quantity/cost variance requires reason.
- Receipt posts stock and Inventory/GRNI accounting atomically.
- Duplicate receipt requests are idempotently rejected/replayed.
- Reversal is prohibited after downstream consumption unless a controlled corrective chain handles dependent cost layers.

## 19. Landed/additional cost

Eligible procurement costs may include freight, clearing or other configured landed costs.

- Cost must be assigned to a receipt/batch.
- Allocation basis must be explicit: quantity, value, weight or manual allocation.
- Allocation total equals landed-cost total.
- Eligible amount capitalizes into inventory; non-eligible amount posts to expense.
- Posted allocation changes require adjustment, not silent recalculation.

## 20. Supplier-bill matching

Three-way comparison displays:

- PO ordered quantity/price
- Receipt quantity/accepted cost
- Bill quantity/price/tax

Mismatch does not silently mutate another document. Tolerance rules determine whether approval is allowed. Approved mismatch records reason, actor and resulting accounting adjustment.

## 21. Reservations and storefront orders

### Checkout request

- Does not reserve or deduct stock.
- Revalidates availability when merchant attempts confirmation.

### Confirmation

- Creates reservations atomically per outlet/variant.
- Fails cleanly if insufficient available stock under policy.
- Idempotency prevents duplicate reservations.

### Modification

- Quantity increase reserves additional stock atomically.
- Quantity decrease releases difference.
- Outlet change releases old reservation only when new reservation succeeds.

### Fulfilment

- Converts reservation to outbound stock movement.
- Deducts on-hand and reserved quantities consistently.
- Posts COGS when the sale/accounting event requires it.

### Cancellation

- Releases active reservation.
- Does not reverse already fulfilled quantity; fulfilled returns use return workflow.

## 22. Outlet transfers

- Approval optional by policy, but source permission is required.
- Dispatch consumes source stock/cost and creates in-transit record.
- Destination receipt creates destination layers/average from transferred cost.
- Partial receipt supported.
- Shortage/damage produces explicit variance and accounting treatment.
- Transfer does not create company revenue or expense except recorded variance/loss.

## 23. Stock counts and adjustments

- Count scope freezes or records movement cutoff/version.
- Blind counts may hide expected quantity.
- Variance is calculated, never manually entered as truth.
- Approval posts explicit adjustment movement.
- Positive variance credits configured inventory-gain/adjustment account.
- Negative variance debits inventory-loss/adjustment account.
- Large variance thresholds may require higher approval.

## 24. Customer returns

- Reference original sale where possible.
- Separate commercial refund/credit decision from physical stock condition.
- Saleable return increases stock at original issued cost.
- Damaged return goes to non-saleable status/location or immediate write-off.
- Revenue/tax/receivable resolution uses credit/refund document.
- Returning stock does not itself prove cash was refunded.

## 25. Supplier returns

- Reference original receipt/bill where possible.
- Remove stock at the relevant receipt/layer cost.
- Reduce payable or create supplier credit/debit balance through linked accounting document.
- Prevent return quantity exceeding eligible received/remaining quantity.

## 26. Damage, defect and expiry

- Identify outlet, variant, batch/serial and quantity.
- Require reason and actor.
- Remove from saleable stock.
- Debit Inventory Loss/Damage/Expiry; credit Inventory.
- Reversal requires evidence and cannot resurrect consumed serials incorrectly.

## 27. Backdating

Backdating is restricted because it affects balances, costing and reports.

- User needs permission.
- Date cannot fall in a locked period.
- Inventory backdating must not create impossible negative historical stock or invalid consumed layers.
- Weighted-average/FIFO downstream effects must be recalculated deterministically or posting is rejected.
- Audit records entered-at and effective-at timestamps.

P0 may safely restrict inventory backdating more than ordinary cash/expense backdating.

## 28. Period close and locks

- Close validates balanced journals and inventory/GL reconciliation.
- Lock prevents new/changed effective dates in the period.
- Unlock requires elevated permission, reason and audit event.
- Corrections normally post in current open period referencing the original.
- Reports show lock and adjustment status.

## 29. Reversal graph

A reversal must consider dependent effects:

- Invoice ↔ receivable ↔ payments
- Sale ↔ stock issue ↔ COGS
- Receipt ↔ cost layers ↔ supplier bill/GRNI
- Order ↔ reservation ↔ fulfilment
- Transfer dispatch ↔ in-transit ↔ receipt

If a downstream dependency makes direct reversal unsafe, the system blocks it and directs the user to the required sequence. Never orphan payment allocations, reservations, cost layers or journals.

## 30. Opening balances and opening stock

- Opening balances use a dated, auditable opening batch.
- Debits and credits must balance through Opening Balance Equity or documented source accounts.
- Opening customer/supplier balances create corresponding receivable/payable subledger entries.
- Opening stock requires outlet, variant, quantity and cost; FIFO also requires opening layers.
- Opening records cannot be silently edited after later activity; use controlled adjustment.

## 31. Personal/business linkage

Suggested cross-space examples:

- Owner contributes personal bank money to Business.
- Business pays owner drawing.
- Owner pays business expense personally.

For an owner who has authority to both spaces, a mixed expense is a single explicit, atomic owner command. It never merges journals: each workspace keeps its own record and expense category. The paying workspace posts its expense portion and a Due-from receivable for the other portion; the owing workspace posts its expense portion and a Due-to payable. A later reimbursement may be partial, but atomically posts `Dr Due-to / Cr cash` in the owing workspace and `Dr cash / Cr Due-from` in the paying workspace. Row locking, a settlement version and idempotency prevent duplicate or excessive settlement.

## 32. Data and reconciliation reports

Required internal reconciliations:

- Journal debits = credits
- Accounts Receivable control = customer receivable subledger
- Accounts Payable control = supplier payable subledger
- Inventory GL = inventory valuation subledger
- Customer deposits liability = customer wallet/advance subledger
- Loan controls = loan subledgers
- Stock on hand = movement ledger aggregation
- Reserved stock = active reservation aggregation
- Order fulfilment quantities = linked stock issues
- PO received/billed totals = linked receipts/bills

Reconciliation failures are critical incidents and public-launch blockers.

## 33. Idempotency and concurrency

- Client supplies idempotency key for every financial/stock command.
- Server stores command outcome and returns the same result for safe retry.
- Balance, available stock and permission checks occur inside the posting transaction.
- Use database constraints/locking to prevent overselling, double payment, duplicate receipt and duplicate serial identifiers.
- Async jobs may generate PDFs/notifications but cannot become the sole authority for financial posting.

## 34. Required deterministic fixtures

At minimum, automated fixtures must cover both FIFO and weighted average:

1. Opening stock then full sale
2. Two receipts at different costs then partial sale
3. Partial receipt and supplier bill mismatch
4. Transfer between outlets then sale
5. Customer return after sale
6. Supplier return after receipt
7. Damage/expiry write-off
8. Storefront reservation, cancellation and fulfilment
9. Partial/split payment
10. Customer deposit applied to invoice
11. Backdated attempt into open and locked periods
12. Reversal with dependent payment/stock effects
13. Negative-stock attempt
14. Stock count variance
15. Landed-cost allocation

Each fixture asserts quantities, reservations, cost layers/average, journal lines, subledger balances and financial statements.

## 35. Accountant review boundary

At least one Nigerian accountant/bookkeeper must review:

- Chart-of-account defaults
- Journal matrix
- VAT/WHT presentation
- GRNI and landed-cost handling
- Opening balances
- Period locks and reversals
- Trial Balance, P&L, Balance Sheet and Cash Flow fixtures

Until reviewed, professional reports remain beta outputs with appropriate limitation language.
