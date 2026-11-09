# Rekordly v2 Implementation Backlog and Milestones

**Prepared:** 7 November 2026  
**Target:** 1 December 2026 controlled public beta  
**Implementer:** Founder alone  
**Fallback:** Invite-only beta with incomplete modules hidden

## 1. Estimation method

Estimates are productive engineering hours, including implementation, automated tests and basic documentation. They exclude unrelated work, context switching, customer support and recovery from unknown repository problems.

Sizing confidence is low until the code audit and first vertical slice are complete.

### Capacity assumption

The founder reports more than 80 available hours per week. Planning does not treat 80+ hours as sustainable productive output.

For 7–30 November:

- Calendar availability: approximately 3.4 weeks
- Sustainable focused engineering assumption: 45–55 hours/week
- Expected productive capacity: approximately 150–185 hours
- Reserve for deployment, bugs, support and launch operations: 30–40 hours
- Feature-development capacity before December 1: approximately 120–145 hours

This capacity must be recalibrated after the first five working days.

## 2. Scope estimate

| Workstream | Estimated hours |
|---|---:|
| Repository audit and development foundation | 16–24 |
| Identity, workspace, roles and entitlements | 32–48 |
| Ledger, posting, periods and reversals | 60–90 |
| Personal finance, budgets, loans/assets | 45–65 |
| CRM, invoices, bills and payments | 65–95 |
| Catalogue and outlets | 35–50 |
| Inventory movement and weighted-average costing | 55–80 |
| FIFO cost layers and edge cases | 40–60 |
| Procurement, receiving and matching | 60–90 |
| Orders, reservations and fulfilment | 40–60 |
| Storefront, subdomains and customization | 45–70 |
| Custom-domain connection | 20–35 |
| Financial/inventory reports and exports | 50–75 |
| AI drafting and confirmation | 25–40 |
| PWA/offline sync | 30–50 |
| Security, observability, backup and launch operations | 45–65 |
| Integrated acceptance, reconciliation and hardening | 70–110 |
| **Total** | **693–1,007** |

Even with substantial reuse, the selected full scope is not credible as a safe solo-founder public beta by December 1. This is a capacity conclusion, not a product-value judgement.

## 3. Release recommendation

### December 1

Target an **invite-only vertical-slice beta** unless existing code audit demonstrates far more completed, tested functionality than currently evidenced.

Recommended December slice:

- Authentication and Personal/Business workspace separation
- Core ledger/posting engine
- Manual and plain-language draft capture with confirmation
- Income, expense and transfer
- Basic customer/supplier records
- Service/custom invoices and payment recording
- Basic catalogue
- One inventory costing method behind beta flag only if reconciliation passes
- Essential cash, P&L and ledger reports
- Export, audit and backup/restore

Do not publicly claim full inventory/procurement/storefront until their integrated gates pass. Because founder decision 57B makes them launch blockers, the public launch remains blocked while the invite-only fallback may proceed.

### Full selected v2

Plan a staged completion after the vertical slice:

1. Inventory/outlets and weighted average
2. FIFO and expanded traceability
3. Procurement and supplier bills/matching
4. Orders/reservations
5. Storefront/subdomain
6. Custom domains
7. Full reports, offline hardening and broader beta

## 4. Backlog conventions

- **P0-F:** foundation required by every release.
- **P0-V:** December vertical slice.
- **P0-X:** full founder-selected launch scope after vertical slice.
- **P1:** immediate post-launch enhancement.

Every task must have tests and evidence before Done.

## 5. Foundation backlog

| ID | Task | Priority | Depends on | Hours |
|---|---|---|---|---:|
| F-01 | Audit repository, dependencies, current schemas and reusable UI | P0-F | — | 8–12 |
| F-02 | Record architecture decisions and remove obsolete conflicting assumptions | P0-F | F-01 | 4–6 |
| F-03 | Establish local/staging environment and secret handling | P0-F | F-01 | 4–6 |
| F-04 | Establish CI: format, lint, unit, integration and migration checks | P0-F | F-01 | 6–10 |
| F-05 | Define shared minor-unit money, fixed-decimal calculation, currency, ID and time primitives | P0-F | F-02 | 6–8 |
| F-06 | Create Rekordly design tokens and component wrappers | P0-F | F-01 | 10–16 |
| F-07 | Add structured logging, correlation and sensitive-field redaction | P0-F | F-03 | 5–8 |

## 6. Identity, workspace and entitlement backlog

| ID | Task | Priority | Depends on | Hours |
|---|---|---|---|---:|
| I-01 | User, auth identity and session schema | P0-V | F-03,F-05 | 6–9 |
| I-02 | OTP and Google/social authentication | P0-V | I-01 | 8–12 |
| I-03 | Session rotation, logout and revocation | P0-V | I-02 | 5–8 |
| I-04 | Workspace and membership model | P0-V | I-01 | 7–10 |
| I-05 | Personal/Business onboarding and space switcher | P0-V | I-04,F-06 | 10–14 |
| I-06 | Role/permission engine | P0-V | I-04 | 10–14 |
| I-07 | Entitlement/usage-limit engine | P0-V | I-04 | 8–12 |
| I-08 | Paystack subscription adapter | P0-X | I-07 | 10–15 |

## 7. Ledger and financial foundation backlog

| ID | Task | Priority | Depends on | Hours |
|---|---|---|---|---:|
| L-01 | Chart of accounts and system-account templates | P0-V | F-05,I-04 | 8–12 |
| L-02 | Journal entry/line schema and balance constraints | P0-V | L-01 | 8–12 |
| L-03 | Transactional posting engine and idempotency | P0-V | L-02 | 14–20 |
| L-04 | Source-document linkage and drill-down | P0-V | L-03 | 6–10 |
| L-05 | Reversal/void engine | P0-V | L-03 | 10–16 |
| L-06 | Accounting periods and locks | P0-X | L-03,L-05 | 8–12 |
| L-07 | Opening balances | P0-X | L-03 | 8–12 |
| L-08 | Core reconciliation service | P0-V | L-03 | 8–12 |
| L-09 | Property tests for balanced journals/idempotency | P0-V | L-03 | 10–14 |

## 8. Personal money backlog

| ID | Task | Priority | Depends on | Hours |
|---|---|---|---|---:|
| M-01 | Money accounts and categories | P0-V | I-04,L-03 | 8–12 |
| M-02 | Income/expense drafts and confirmation | P0-V | M-01 | 10–14 |
| M-03 | Transfers as atomic linked posting | P0-V | M-01 | 6–9 |
| M-04 | Attachments | P0-V | M-02,F-03 | 6–10 |
| M-05 | Activity list/search/filter | P0-V | M-02,F-06 | 8–12 |
| M-06 | Budgets and category limits | P0-X | M-02 | 10–15 |
| M-07 | Loan borrowed/lent and repayments | P0-X | M-02 | 10–14 |
| M-08 | Investment/asset simple registers | P0-X | M-02 | 10–14 |
| M-09 | Personal dashboard/period comparison | P0-V | M-02 | 10–14 |

## 9. AI capture backlog

| ID | Task | Priority | Depends on | Hours |
|---|---|---|---|---:|
| AI-01 | Typed AI draft schemas | P0-V | M-02 | 5–8 |
| AI-02 | Provider adapter, rate and spend controls | P0-V | AI-01,I-07 | 6–9 |
| AI-03 | Plain-language parsing and clarification | P0-V | AI-02 | 8–12 |
| AI-04 | Confirmation UI and changed-field audit | P0-V | AI-03,F-06 | 6–10 |
| AI-05 | Receipt extraction | P0-X | AI-02,M-04 | 8–12 |
| AI-06 | Ask/explain reports | P1 | Reporting | 10–16 |

## 10. CRM, sales and payables backlog

| ID | Task | Priority | Depends on | Hours |
|---|---|---|---|---:|
| S-01 | Party/customer/supplier/contact model | P0-V | I-04 | 10–14 |
| S-02 | Guest customer and statements projection | P0-V | S-01,L-03 | 8–12 |
| S-03 | Estimate/invoice document model | P0-V | S-01,L-03 | 12–18 |
| S-04 | Custom/service invoice workflow | P0-V | S-03 | 10–14 |
| S-05 | Payment and allocation engine | P0-V | S-03,L-03 | 12–18 |
| S-06 | Partial/split payments | P0-X | S-05 | 8–12 |
| S-07 | Customer advances/wallet liability | P0-X | S-05 | 8–12 |
| S-08 | Invoice/receipt PDF and WhatsApp share | P0-V | S-03,S-05 | 8–12 |
| S-09 | Credit/debit/refund adjustments | P0-X | S-03,L-05 | 10–15 |
| B-01 | Supplier bill model and posting | P0-X | S-01,L-03 | 12–18 |
| B-02 | Bill approval and partial payments | P0-X | B-01,S-05 | 10–14 |
| B-03 | Receivable/payable aging | P0-X | S-05,B-02 | 8–12 |

## 11. Catalogue and inventory backlog

| ID | Task | Priority | Depends on | Hours |
|---|---|---|---|---:|
| C-01 | Products/services/categories | P0-V | I-04 | 10–14 |
| C-02 | Variants/options/SKU/barcode/units | P0-X | C-01 | 12–18 |
| C-03 | Prices, tax and product media | P0-X | C-01 | 10–14 |
| C-04 | CSV product import/export | P0-X | C-02 | 8–12 |
| N-01 | Outlets and stock policy | P0-X | I-04,C-01 | 8–12 |
| N-02 | Immutable stock movement ledger | P0-X | N-01,L-03 | 12–18 |
| N-03 | Opening stock and reconciliation | P0-X | N-02,L-07 | 10–14 |
| N-04 | Weighted-average costing | P0-X | N-02 | 16–24 |
| N-05 | FIFO layers and issue allocations | P0-X | N-02 | 20–30 |
| N-06 | Batch/expiry tracking | P0-X | N-02,C-02 | 12–18 |
| N-07 | Serial/unique identifiers | P0-X | N-02,C-02 | 10–15 |
| N-08 | Transfers/in-transit/variance | P0-X | N-04,N-05 | 14–20 |
| N-09 | Stock count and adjustments | P0-X | N-02 | 12–18 |
| N-10 | Damage/defect/expiry | P0-X | N-06,N-09 | 8–12 |
| N-11 | Returns and original-cost restoration | P0-X | N-04,N-05 | 14–20 |
| N-12 | Low-stock/expiry alerts | P0-X | N-06 | 6–10 |
| N-13 | Inventory/GL reconciliation | P0-X | N-04,N-05,L-08 | 10–14 |

## 12. Procurement backlog

| ID | Task | Priority | Depends on | Hours |
|---|---|---|---|---:|
| P-01 | Purchase request/order model | P0-X | S-01,C-02,N-01 | 12–18 |
| P-02 | PO approval/versioning | P0-X | P-01,I-06 | 8–12 |
| P-03 | Goods receipt/partial receiving | P0-X | P-02,N-02 | 14–20 |
| P-04 | Batch/expiry/serial receiving | P0-X | P-03,N-06,N-07 | 8–12 |
| P-05 | Variance and tolerance controls | P0-X | P-03 | 8–12 |
| P-06 | Landed-cost allocation | P0-X | P-03,N-04,N-05 | 12–18 |
| P-07 | GRNI journal flow | P0-X | P-03,L-03 | 10–14 |
| P-08 | PO/receipt/bill matching | P0-X | P-03,B-01 | 14–20 |
| P-09 | Supplier return | P0-X | P-03,N-11 | 10–14 |

## 13. Orders and storefront backlog

| ID | Task | Priority | Depends on | Hours |
|---|---|---|---|---:|
| O-01 | Order model and state transitions | P0-X | S-01,C-02 | 12–18 |
| O-02 | Reservation concurrency engine | P0-X | O-01,N-02 | 14–20 |
| O-03 | Fulfilment/cancellation stock effects | P0-X | O-02,N-04,N-05 | 12–18 |
| ST-01 | Storefront model/settings/publication | P0-X | C-03 | 8–12 |
| ST-02 | Public catalogue/search/product pages | P0-X | ST-01 | 12–18 |
| ST-03 | Cart and checkout request | P0-X | ST-02,O-01 | 10–15 |
| ST-04 | Rekordly wildcard subdomain routing | P0-X | ST-01,F-03 | 8–12 |
| ST-05 | Branding/templates/policies | P0-X | ST-01,F-06 | 10–15 |
| ST-06 | Order administration | P0-X | ST-03,O-03 | 10–14 |
| ST-07 | Custom-domain verification/TLS | P0-X | ST-04 | 20–35 |
| ST-08 | Expiry grace/disable behavior | P0-X | ST-01,I-07 | 6–9 |

## 14. Reporting and export backlog

| ID | Task | Priority | Depends on | Hours |
|---|---|---|---|---:|
| R-01 | General Ledger and Trial Balance | P0-V | L-03 | 8–12 |
| R-02 | P&L and cash movement | P0-V | R-01 | 8–12 |
| R-03 | Balance Sheet | P0-X | R-01 | 6–10 |
| R-04 | Cash Flow Statement | P0-X | R-01 | 10–15 |
| R-05 | Receivable/payable aging | P0-X | S-05,B-02 | 8–12 |
| R-06 | Inventory valuation/COGS | P0-X | N-13 | 10–15 |
| R-07 | VAT/WHT schedules | P0-X | S-03,B-01 | 10–15 |
| R-08 | Drill-down and report filters | P0-X | R-01 | 8–12 |
| R-09 | CSV/PDF exports | P0-V | R-01 | 10–15 |
| R-10 | Full workspace export | P0-V | All relevant schemas | 10–16 |

## 15. PWA, operations and hardening backlog

| ID | Task | Priority | Depends on | Hours |
|---|---|---|---|---:|
| Q-01 | Responsive shell and supported-browser QA | P0-V | F-06 | 12–18 |
| Q-02 | PWA manifest/install/cache baseline | P0-V | Q-01 | 6–10 |
| Q-03 | Bounded offline draft queue | P0-X | M-02,Q-02 | 16–24 |
| Q-04 | Error monitoring/uptime/alerts | P0-V | F-07 | 6–10 |
| Q-05 | Automated backup and restore rehearsal | P0-V | F-03 | 8–12 |
| Q-06 | Security/tenant/permission test pass | P0-V | I-06 | 12–18 |
| Q-07 | Performance and low-bandwidth pass | P0-X | Integrated app | 10–16 |
| Q-08 | Privacy/terms/support surfaces | P0-V | — | 6–10 |
| Q-09 | Beta analytics with safe payloads | P0-V | Core flows | 6–10 |
| Q-10 | Integrated deterministic fixture suite | P0-X | L,N,P,O | 30–45 |

## 16. Dependency chain

Critical chain for full scope:

`foundation → workspace/permissions → ledger → catalogue/outlets → stock movements → costing → procurement/receiving → orders/reservations → storefront → reports/reconciliation → integrated hardening`

Work outside this chain cannot compensate for a broken upstream invariant.

## 17. Proposed November milestones

### 7–9 November — Audit and foundation

- Complete repository audit
- Lock reuse/rebuild decisions
- Establish CI/staging/secrets
- Implement money primitives/design wrappers foundation
- Re-estimate remaining work with evidence

**Gate:** clean local/staging build and passing foundation checks.

### 10–15 November — Financial vertical slice

- Identity/workspaces
- Ledger/posting/idempotency
- Manual income/expense/transfer
- Core Personal dashboard
- Basic audit/export
- Begin AI draft confirmation

**Gate:** balanced deterministic entries, cross-tenant tests and first export.

### 16–21 November — Business vertical slice

- Customers/suppliers
- Custom/service invoices
- Payments
- Basic catalogue
- GL/Trial Balance/P&L/cash reports
- PDF/WhatsApp sharing

**Gate:** invoice-to-payment reconciles to reports and export.

### 22–26 November — Inventory feasibility slice

- Outlet and movement ledger
- One costing method first
- Opening stock, receipt, sale and return fixtures
- Inventory/GL reconciliation

**Gate:** deterministic inventory fixtures pass. If not, inventory remains hidden.

### 27–30 November — Freeze and beta readiness

- No new scope
- Security, restore, export, supported-browser and failure recovery
- Beta cohort onboarding
- Known issue review
- Go/no-go evidence

**Gate:** public beta only if every selected public module passes; otherwise invite-only vertical slice.

## 18. Full-scope milestone sequence after December 1

Dates must be assigned after the Nov 9 re-estimate.

1. Both costing methods and traceability complete
2. Full procurement/matching
3. Orders/reservations
4. Storefront/subdomain
5. Custom domains
6. Full statements/tax schedules
7. Offline mutation sync
8. Broader public beta

## 19. Definition of Done

A backlog item is Done only when:

- Code is implemented and reviewed by the founder against the rulebook
- Unit/integration tests pass
- Permission and tenant isolation are tested
- Idempotent retry behavior is tested for mutations
- Loading/empty/error/permission/limit states exist
- Responsive supported layouts work
- Audit/source linkage exists where required
- Documentation/API contract is updated
- No reconciliation invariant is broken

## 20. Immediate next actions

1. Run repository/code audit before estimating any task as already complete.
2. Create a single tracked implementation board from this backlog.
3. Implement one vertical path: sign in → workspace → expense → journal → dashboard → export.
4. Measure actual hours and defect rate.
5. Re-estimate all remaining work by November 12 at latest.
6. Recruit accountant reviewer and name beta cohort in parallel.

## 21. Planning conclusion

The complete selected P0 is approximately 693–1,007 productive hours before audit-based reuse adjustments. Available pre-December feature capacity is approximately 120–145 hours. Therefore:

- The full selected scope cannot responsibly be promised for public release on December 1 by one implementer.
- A safe invite-only vertical-slice beta is plausible if foundation work begins immediately and scope remains frozen.
- Public launch requires completion of the full founder-selected blockers or a formal scope/date decision; it cannot be achieved by weakening correctness gates.
