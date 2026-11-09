# Rekordly v2 Final Planning Closeout

**Originally closed:** 7 November 2026  
**Reopened:** 7 November 2026 for backend, money representation, external-party and deployment decisions  
**Planning deadline:** 8 November 2026  
**Target milestone:** 1 December 2026  
**Decision owner:** Founder

## 1. Closeout status

The Rekordly v2 product, scope, workflow, accounting, pricing and launch planning is substantially complete. Go, the minor-unit money model, payment allocations, guest document access and initial providers are now selected in documents 10 and 11. Full operational closeout is pending paid provider sizing, independent backup/restore rehearsal and remaining launch evidence.

This means product direction, features, pricing hypotheses, workflows, accounting/inventory rules, technical architecture, backlog, test gates and launch operations are explicitly documented.

It does **not** mean the full selected scope is feasible for public release by December 1. Current capacity analysis concludes it is not credible as a safe solo-founder public beta unless the repository audit discovers substantial already-completed, tested functionality.

## 2. Authoritative package

The following documents control implementation planning:

1. `README.md`
2. `01-final-product-requirements.md`
3. `02-information-architecture-and-workflows.md`
4. `03-accounting-inventory-and-commerce-rulebook.md`
5. `04-technical-architecture-and-data-model.md`
6. `05-implementation-backlog-and-milestones.md`
7. `06-acceptance-tests-and-launch-gates.md`
8. `07-pricing-validation-and-metrics.md`
9. `08-launch-operations.md`
10. This closeout
11. `10-backend-and-deployment-decision.md`
12. `11-money-payments-external-parties-and-runtime.md`

Older planning files remain evidence/history. Where they conflict, this package controls.

## 3. Locked product decisions

- Serve personal users, freelancers and small-scale businesses.
- One account may use separate Personal and Business spaces.
- Freelancer defaults to both spaces.
- Business includes an optional owner Personal space and combined summary without merging ledgers.
- Responsive web/PWA is the December client.
- Reuse suitable design/components; rebuild financial core.
- Use a Rekordly design system with modern HeroUI v3 and shadcn/ui primitives behind wrappers.
- Accrual Business accounting with separate cash-movement view.
- Every AI-created financial record requires user confirmation.
- Confirmed records use reversal/adjustment history, never silent edits.
- Full inventory, procurement and first storefront are desired launch blockers.
- Businesses choose FIFO or weighted-average costing before first posted stock movement.
- Storefront begins with order-request checkout, not online payment collection.
- Business receives a Rekordly subdomain; paid custom-domain connection is supported.
- Rekordly does not initially sell/register domains.
- December is a controlled public-beta target with invite-only fallback.
- No ads; never sell financial data; preserve read/export access after downgrade.
- Explicit deletion request begins a 60-day recoverable grace period; subscription expiry does not.

## 4. Commercial baseline

December beta is free and bounded.

Post-beta hypotheses:

| Plan | Monthly | Annual |
|---|---:|---:|
| Free | ₦0 | ₦0 |
| Personal Plus | ₦1,500 | ₦15,000 |
| Business | ₦5,000 | ₦50,000 |

Paystack is the first intended subscription provider. Prices and limits require behavioral beta validation before becoming permanent.

## 5. Scope and capacity conclusion

Estimated selected scope:

- **693–1,007 productive hours** before audit-based reuse adjustments

Expected pre-December feature capacity:

- **120–145 productive feature hours** after operational reserve

Therefore:

- Full selected scope is not responsibly promiseable by December 1 for one implementer.
- A safe financial vertical-slice invite-only beta is plausible.
- Public beta is allowed only if all public modules pass their G0/G1 gates.
- Incomplete modules must be hidden, not exposed with weakened safeguards.
- Because full inventory/procurement were selected as public-launch blockers, public launch remains blocked until those requirements pass or the founder formally revises scope/date.

## 6. Recommended December vertical slice

- Authentication and workspace separation
- Ledger/posting/idempotency
- Manual and AI-draft-confirmed income, expense and transfer
- Personal dashboard/basic budgets as capacity permits
- Customers/suppliers
- Custom/service invoice and payment
- Basic catalogue
- Core GL/Trial Balance/P&L/cash reports
- Export, audit, monitoring and successful restore

Inventory may enter invite-only beta only after deterministic quantity/value/GL fixtures pass. Procurement/storefront remain hidden until integrated gates pass.

## 7. Automatic no-go rules

No public or invite-only module may ship with:

- Cross-tenant exposure
- Unbalanced journals or floating-point money
- Silent editing/deletion of confirmed records
- Inventory quantity/value/GL mismatch
- Failed costing fixtures for the enabled method
- Overselling/stuck reservations
- Missing/unreconciled export
- Missing successful restore
- AI posting without confirmation
- Critical permission bypass
- Missing privacy/terms/support contact

## 8. External dependencies

### Required

- Recruit at least one Nigerian accountant/bookkeeper by 15 November; target two.
- Name and onboard the initial beta cohort from more than ten available candidates.
- Verify provider ownership/billing/MFA/spend controls without exposing secrets.
- Publish support hours/contact.
- Publish privacy, terms, beta/financial/AI limitations.

### Known risk

No accountant reviewer is currently secured. Until reviewed, professional financial/tax reports must remain controlled beta outputs with limitations.

## 9. Assumptions requiring implementation audit

- Current repository contains reusable design/components.
- Rebuilding the financial core is preferable to preserving existing unsafe behavior.
- Hosting can support wildcard subdomains and custom-domain TLS workflow within budget.
- HeroUI v3/shadcn versions selected during implementation are stable and compatible.
- Under-₦50,000 monthly budget can support bounded beta usage.
- More than ten beta candidates can be converted into active testers.

The repository audit may change estimates, not the financial invariants.

## 10. Research closeout

General competitor research is sufficient to begin implementation. Further competitor investigation is justified only by a specific unresolved design or commercial question.

Completed benchmark areas include:

- Bookkeeping/accounting automation
- Retail/inventory/storefront workflows
- Professional accounting/reporting
- Procurement/ERP architecture
- WhatsApp accounting model
- Pricing and packaging patterns

Rekordly should now learn primarily from its beta users and its own integrity/retention evidence.

## 11. Implementation start gate

Implementation may begin when:

1. Repository/code audit is complete.
2. Local and staging environments run.
3. CI and migration baseline work.
4. Shared money/time/ID primitives are selected.
5. First tracked vertical-slice backlog is created from doc 05.
6. No old planning document is used to reintroduce deferred/conflicting architecture.

## 12. First implementation objective

Build and verify one end-to-end slice:

`sign in → create workspace → add expense → confirm → balanced journal → dashboard update → source drill-down → export`

This slice validates architecture, throughput and defect rate before broader estimates are trusted.

## 13. Re-estimation rule

By 12 November at latest:

- Record actual hours for first slice.
- Identify reusable versus rewritten code.
- Update backlog ranges.
- Decide December enabled modules.
- Decide public versus invite-only trajectory.

No scope should be added before this re-estimate.

## 14. Planning definition-of-done audit

| Requirement | Evidence | Status |
|---|---|---|
| Competitor research | Planning docs 21–27 | Complete enough for implementation |
| Product/customer decisions | Docs 28–30 and final PRD | Complete |
| Feature grouping | Doc 29 and final PRD | Complete |
| Pricing/packaging | Doc 29 and final doc 07 | Complete as test hypothesis |
| Information architecture/workflows | Final doc 02 | Complete draft |
| Accounting/inventory rules | Final doc 03 | Complete draft; accountant review pending |
| Technical implications/data model | Final doc 04 | Complete draft; repository audit pending |
| Backend and deployment selection | Final docs 10–11 | Go/Render/Neon selected; production tiers and measured cost pending |
| Money/payment/external-party model | Final doc 11 | Complete decision |
| Prioritized backlog/milestones | Final doc 05 | Complete; re-estimate required after first slice |
| Acceptance tests/go-no-go | Final doc 06 | Complete |
| Launch operations | Final doc 08 | Complete; external actions pending |
| Final recommendation | This document | Complete |

## 15. Final recommendation

Start implementation immediately with the financial vertical slice and repository audit.

Treat December 1 as:

- **Invite-only beta by default**, based on current capacity evidence.
- Upgrade to controlled public beta only when all enabled public modules pass acceptance gates.
- Do not market full inventory/procurement/storefront before those integrated workflows reconcile and pass.

Planning remains open only for provider sizing, backup/restore evidence and any explicit founder changes. Backend selection is closed: Go is authoritative. Product scope changes still require an explicit capacity, dependency and launch-impact decision.
