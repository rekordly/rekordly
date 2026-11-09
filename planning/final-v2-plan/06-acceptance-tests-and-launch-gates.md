# Rekordly v2 Acceptance Tests and Launch Gates

**Prepared:** 7 November 2026  
**Owner:** Founder  
**Purpose:** define objective evidence required for public or invite-only beta

## 1. Gate levels

- **G0 — Automatic public no-go:** failure blocks public access.
- **G1 — Module gate:** failure requires hiding/disabling that module.
- **G2 — Beta issue:** may ship only when documented, bounded and communicated.

No known G0 failure may be accepted by founder discretion under decision 26A.

## 2. Evidence requirements

Each test record must contain:

- Test ID and build/commit
- Environment
- Date and tester
- Preconditions/data fixture
- Expected and observed result
- Pass/fail
- Logs/screenshots/report exports where relevant
- Linked defect and retest evidence

“Worked once” is not sufficient for concurrency, retry, restore or reconciliation gates.

## 3. Identity and tenant isolation

| ID | Test | Level | Pass condition |
|---|---|---|---|
| SEC-01 | Access another workspace record by guessed ID | G0 | Denied without revealing data/existence beyond safe response |
| SEC-02 | Cross-workspace list/filter/export | G0 | Only authorized workspace data returned |
| SEC-03 | Expired/revoked session | G0 | Protected actions denied immediately per revocation design |
| SEC-04 | OTP replay/rate abuse | G0 | Replay rejected; rate limits and safe messaging work |
| SEC-05 | Role permission bypass via direct API | G0 | Server denies action regardless of hidden UI |
| SEC-06 | Outlet-restricted staff accesses another outlet | G0 | Query and mutation denied |
| SEC-07 | Admin removes staff access mid-session | G0 | Subsequent protected action denied |
| SEC-08 | Logs/analytics inspection | G0 | No OTP, token, raw financial narration or forbidden sensitive values |

## 4. Ledger and money

| ID | Test | Level | Pass condition |
|---|---|---|---|
| LED-01 | Every posting fixture balances | G0 | Debits equal credits exactly in base currency |
| LED-02 | Decimal precision/rounding | G0 | No floating-point drift; documented totals match |
| LED-03 | Duplicate command retry | G0 | One record/journal only; same durable response returned |
| LED-04 | Income and immediate expense | G0 | Accounts and cash summary reconcile |
| LED-05 | Transfer between own accounts | G0 | No income/expense created; both balances reconcile |
| LED-06 | Credit invoice then payment | G0 | Revenue/AR then cash/AR entries reconcile |
| LED-07 | Partial and split payment | G0 | Paid/outstanding derived correctly; no overpayment |
| LED-08 | Customer deposit application | G0 | Liability created/reduced; no premature revenue |
| LED-09 | Supplier bill then payment | G0 | Expense/AP then AP/cash entries reconcile |
| LED-10 | Void/reversal and replacement | G0 | Original immutable; net and audit trail correct |
| LED-11 | Locked-period correction | G0 | Original unchanged; open-period adjustment references source |
| LED-12 | Report drill-down | G1 | Total traces to journal/source documents |

## 5. Personal finance

| ID | Test | Level | Pass condition |
|---|---|---|---|
| PER-01 | Personal onboarding to first entry | G1 | Completed without accounting knowledge |
| PER-02 | Three entries activation | G1 | Dashboard accurately reflects entries |
| PER-03 | Category budget | G1 | Actuals and limit state calculate correctly |
| PER-04 | Mixed personal/business suggestion | G1 | Separate records require confirmation; books remain separate |
| PER-05 | Loan repayment | G1 | Principal balance and cash effect correct |
| PER-06 | Period comparison | G1 | Filters/timezone boundaries correct |

## 6. AI confirmation

| ID | Test | Level | Pass condition |
|---|---|---|---|
| AI-01 | Clear expense sentence | G1 | Correct structured draft; nothing posted |
| AI-02 | Missing amount/account/date | G1 | Missing fields requested/highlighted |
| AI-03 | Ambiguous category/counterparty | G1 | Uncertainty visible; user chooses |
| AI-04 | Attempt prompt injection in narration/attachment | G0 | Treated as data; cannot change system authority |
| AI-05 | Direct AI post attempt | G0 | Impossible; confirmation command requires user action |
| AI-06 | Plan/rate limit | G1 | Provider call blocked before spend; clear fallback |
| AI-07 | Provider timeout/failure | G1 | Draft not posted; manual entry remains available |
| AI-08 | Edit draft then confirm | G1 | Confirmed values match edits; audit records changed field names |

## 7. Sales, invoices and payments

| ID | Test | Level | Pass condition |
|---|---|---|---|
| SAL-01 | Guest custom-service sale | G1 | No customer creation required; totals correct |
| SAL-02 | Estimate to invoice | G1 | Version/source preserved; no duplicate revenue |
| SAL-03 | Invoice VAT/discount | G0 | Calculation and journal match configured ordering |
| SAL-04 | Payment greater than due | G0 | Rejected or explicit deposit path used |
| SAL-05 | Split cash/transfer/wallet | G0 | Allocations and accounts reconcile |
| SAL-06 | Wallet above available balance | G0 | Rejected transactionally |
| SAL-07 | PDF/WhatsApp share | G1 | Correct immutable document snapshot; no unauthorized access |
| SAL-08 | Credit/refund adjustment | G0 | Revenue/tax/AR/cash effects reconcile; original preserved |

## 8. Catalogue and inventory

Run costing-sensitive cases separately under FIFO and weighted average.

| ID | Test | Level | Pass condition |
|---|---|---|---|
| INV-01 | Opening stock | G0 | Quantity/value/GL reconcile |
| INV-02 | Two receipts at different costs | G0 | Layers or average calculated exactly |
| INV-03 | Partial sale across costs | G0 | Quantity, COGS and inventory correct |
| INV-04 | Duplicate receipt retry | G0 | One receipt/movement/journal only |
| INV-05 | Concurrent sales for last stock | G0 | No oversell under default policy |
| INV-06 | Negative-stock disabled | G0 | Issue rejected atomically |
| INV-07 | Batch/expiry/serial rules | G1 | Required identity captured; duplicate serial blocked |
| INV-08 | Outlet transfer | G0 | Source, in-transit, destination and cost reconcile |
| INV-09 | Partial transfer receipt/variance | G0 | Explicit variance; company value treatment correct |
| INV-10 | Customer return | G0 | Eligible stock restored at correct original cost |
| INV-11 | Supplier return | G0 | Quantity/value/payable-credit effects reconcile |
| INV-12 | Damage/expiry | G0 | Stock/value decrease and loss journal reconcile |
| INV-13 | Stock count variance | G0 | Approval, movement and accounting effect correct |
| INV-14 | Backdated invalid movement | G0 | Rejected or controlled recalculation; no corrupted layers |
| INV-15 | Inventory valuation to GL | G0 | Exact reconciliation by period/outlet |
| INV-16 | Costing method change after movement | G0 | Blocked without controlled migration |

## 9. Procurement

| ID | Test | Level | Pass condition |
|---|---|---|---|
| PRO-01 | PO approval | G1 | Version frozen; no stock/payable posted |
| PRO-02 | Partial receiving | G0 | Received/remaining quantities correct |
| PRO-03 | Quantity/cost variance | G1 | Reason/permission required; comparison retained |
| PRO-04 | Receipt before bill | G0 | Inventory/GRNI correct |
| PRO-05 | Bill matched to receipt | G0 | GRNI/AP/tax correct; no duplicate inventory |
| PRO-06 | Landed-cost allocation | G0 | Allocation totals exactly; valuation/GL reconcile |
| PRO-07 | Over-receipt tolerance | G1 | Unauthorized excess blocked |
| PRO-08 | PO/receipt/bill comparison | G1 | All linked quantities/values visible and accurate |
| PRO-09 | Reverse consumed receipt | G0 | Unsafe reversal blocked with required correction path |
| PRO-10 | Supplier return | G0 | Receipt cost and supplier balance resolution correct |

## 10. Storefront and orders

| ID | Test | Level | Pass condition |
|---|---|---|---|
| STO-01 | Published subdomain resolution | G1 | Correct active storefront; unknown/reserved slug safe |
| STO-02 | Tenant host isolation | G0 | Host cannot expose another store/admin data |
| STO-03 | Checkout request | G1 | Order request created; no stock reserved |
| STO-04 | Confirm order | G0 | Stock revalidated and reserved atomically |
| STO-05 | Concurrent confirmations | G0 | Available stock not exceeded |
| STO-06 | Quantity/outlet modification | G0 | Reservation changes atomically or rolls back |
| STO-07 | Cancellation | G0 | Reservation fully released once |
| STO-08 | Fulfilment retry | G0 | Stock/COGS deducted once; reservation resolved |
| STO-09 | Custom-domain verification | G1 | Unverified domain cannot route; active domain has valid TLS |
| STO-10 | Business expiry grace | G1 | Store disabled after grace; admin records/export retained |
| STO-11 | Mobile low-bandwidth storefront | G1 | Core browse/cart/request journey usable |

## 11. Reports and exports

| ID | Test | Level | Pass condition |
|---|---|---|---|
| REP-01 | Trial Balance | G0 | Balances and totals reconcile to journals |
| REP-02 | P&L | G0 | Revenue/COGS/expense fixture matches expected output |
| REP-03 | Balance Sheet | G0 | Assets = liabilities + equity |
| REP-04 | Cash Flow | G0 | Fixture reconciles to cash-account movement |
| REP-05 | AR/AP aging | G1 | Allocations, dates and outstanding balances correct |
| REP-06 | Inventory valuation/COGS | G0 | Subledger and GL reconcile under both costing methods |
| REP-07 | VAT/WHT schedule | G1 | Source documents/tax basis traceable; limitations shown |
| REP-08 | CSV/PDF parity | G1 | Same filters/as-of/basis/totals |
| REP-09 | Full export | G0 | Complete readable owned data; totals reconcile |
| REP-10 | Downgraded user export | G0 | Export remains available |

## 12. Offline and retry behavior

| ID | Test | Level | Pass condition |
|---|---|---|---|
| OFF-01 | Offline draft creation | G1 | Draft clearly pending; not counted as posted |
| OFF-02 | Reconnect sync | G1 | Current server validation applied; one result |
| OFF-03 | Duplicate sync retry | G0 | No duplicate financial/stock effect |
| OFF-04 | Permission removed while offline | G0 | Sync denied; draft retained for review/export |
| OFF-05 | Balance/stock changed while offline | G0 | Stale command rejected/needs review, not blindly posted |
| OFF-06 | Queue cap | G1 | New offline actions blocked clearly at configured bound |

## 13. Responsive and accessibility

| ID | Test | Level | Pass condition |
|---|---|---|---|
| UX-01 | Personal core journey on mobile Safari/Chrome | G1 | No hidden required controls/totals |
| UX-02 | Business invoice/payment on mobile | G1 | Complete without desktop |
| UX-03 | Procurement/receiving on supported mobile | G1 | Tables/forms usable or responsive alternate provided |
| UX-04 | Desktop keyboard flow | G1 | Core forms/dialogs usable with visible focus |
| UX-05 | Error/empty/loading/permission states | G1 | Every public module has defined states |
| UX-06 | Money/date readability | G0 | No clipped/misleading amounts, currency or effective dates |

## 14. Backup, restore and deployment

| ID | Test | Level | Pass condition |
|---|---|---|---|
| OPS-01 | Automated backup exists | G0 | Recent backup visible and protected |
| OPS-02 | Restore rehearsal | G0 | Isolated restore succeeds and reconciles fixtures/attachments |
| OPS-03 | Forward migration | G0 | Staging migration succeeds with reconciliation checks |
| OPS-04 | Failed deploy rollback/forward recovery | G0 | Service restored without corrupting data |
| OPS-05 | Monitoring outage/error | G0 | Founder receives actionable alert |
| OPS-06 | Queue failure/retry | G1 | Bounded retries and failure visibility; no duplicate posting |
| OPS-07 | Secret scan/log review | G0 | No production secret committed or logged |

## 15. Pricing, entitlement and retention

| ID | Test | Level | Pass condition |
|---|---|---|---|
| ENT-01 | Limit enforced through API bypass attempt | G0 | Server rejects over-limit creation |
| ENT-02 | Limit reached | G1 | Existing records remain readable/exportable |
| ENT-03 | Business expiry | G1 | Paid creation pauses per policy; history remains |
| ENT-04 | Subscription expiry versus deletion | G0 | Expiry never starts deletion timer |
| ENT-05 | Explicit deletion request | G0 | Reauthentication, export offer and 60-day recoverable state |
| ENT-06 | Cancel deletion during grace | G0 | Account restored safely |
| ENT-07 | Final deletion | G0 | Executes only after grace/lawful-retention rules; audit evidence retained appropriately |

## 16. Beta cohort acceptance

Before public beta:

- At least five named beta users/businesses complete onboarding.
- At least three complete the core money journey without founder intervention.
- At least two Business users complete invoice-to-payment.
- Any public inventory module is exercised by at least two businesses with reconciliation.
- At least one accountant/bookkeeper reviews deterministic report fixtures; target two.
- All critical support issues are classified and resolved/bounded.

If accountant review is missing, full professional statements remain invite-only/beta-labelled.

## 17. Public go/no-go checklist

Public beta is Go only when:

- All G0 tests pass on the release candidate.
- Every public module's G1 tests pass.
- Backup restore evidence exists.
- Privacy, terms, limitations and support contact are published.
- Monitoring and incident ownership work.
- Known issues do not threaten money, stock, privacy or access.
- Founder signs a dated go/no-go record.

## 18. Invite-only fallback

Invite-only beta may proceed when:

- All G0 tests for enabled modules pass.
- Incomplete modules are inaccessible, not merely labelled beta.
- Users are told the exact scope and limitations.
- Data export and support remain available.
- Feature flags prevent accidental use of unfinished accounting/stock paths.

Invite-only does not permit cross-tenant exposure, unbalanced journals, corrupt stock, missing restore or silent AI posting.

## 19. Exit criteria for broader launch

- Full founder-selected P0 modules pass their G0/G1 suites.
- At least two weeks of beta usage show no unresolved reconciliation failure.
- Retention/activation signals justify operational expansion.
- Support load is sustainable for the founder.
- Accountant review is complete for professional reports.
- Pricing and limits are communicated without trapping owned data.
