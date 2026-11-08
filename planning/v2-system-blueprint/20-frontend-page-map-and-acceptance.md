# Rekordly V2 Frontend Page Map and Acceptance Contract

This document complements the system blueprint. The blueprint defines product behavior, data boundaries, APIs, and accounting rules; this document defines what each frontend route must render, which workspace scopes it supports, and the minimum interaction states required before a page is considered complete.

## Global frontend rules

- Workspace selection is client state, not a URL slug or `?workspace` query parameter.
- The Business / Personal / All tab is the only workspace-switching control. The sidebar and header reflect the selected value and never silently reset it.
- Every page must provide loading, empty, error, permission, and offline behavior where the feature supports it.
- Pages must use the shared app shell, HeroUI-compatible UI wrappers, Phosphor duotone icons, and the green-first design tokens.
- Money is displayed and submitted as strings; the API remains responsible for minor-unit conversion and financial validation.
- A placeholder is honest: it describes the page contract and does not claim that data or actions already work.

## Route contract

| Route | Scope | Page responsibility | MVP state |
|---|---|---|---|
| `/dashboard` | Personal, Business, All | Workspace summary, next actions, recent activity, sync/permission status | Shell page |
| `/capture` | Personal, Business | Manual and AI-assisted capture, classification, confirmation, account/category selection | Manual vertical slice |
| `/transactions` | Personal, Business | Filtered activity list, transaction detail, void/correction, record action | Manual vertical slice |
| `/transactions/new` | Personal, Business | Dedicated record form from Add menu | Placeholder |
| `/transactions/import` | Personal, Business | CSV upload, validation preview, duplicate handling, import confirmation | Placeholder |
| `/budgets` | Personal, Business | Budget creation, period/category limits, actual-vs-budget progress | Placeholder |
| `/accounts` | Personal, Business | Cash/bank/wallet accounts, opening balance, archive, reconciliation status | Placeholder |
| `/reports` | Personal, Business, All | Summary cards, trends, filters, export entry point | Placeholder |
| `/reports/tax` | Business, All | Tax-readiness schedules, deductible expenses, VAT/tax-period filters | Placeholder |
| `/sales` | Business | Sales list, status, customer, payment state, create-sale action | Placeholder |
| `/sales/new` | Business | Sale lines, customer/external party, payment status, stock impact | Placeholder |
| `/purchases` | Business | Procurement list, supplier, receiving, payable status | Placeholder |
| `/invoices` | Business | Invoice list, issue/send/remind/status actions | Placeholder |
| `/invoices/new` | Business | Invoice editor, branding, external recipient, share/send | Placeholder |
| `/payments` | Personal, Business | Incoming/outgoing payments, allocations, proof, reconciliation | Placeholder |
| `/sales/payments/new` | Business | Customer payment linked to sale/invoice or external payer | Placeholder |
| `/customers` | Business | Customers and suppliers, balances, statements, external contact status | Placeholder |
| `/customers/new` | Business | Contact creation and invitation/share path | Placeholder |
| `/inventory` | Business | Products, stock, movements, low-stock state, outlet context | Placeholder |
| `/store` | Business | Storefront setup, catalogue visibility, branding, domain state | Placeholder |
| `/loans` | Personal, Business | Loan records, repayments, balances, due dates | Placeholder |
| `/wallets` | Business | Customer deposits/advances, wallet balance, allocation | Placeholder |
| `/split-payments` | Personal, Business | Split payer/recipient workflow, outstanding allocations | Placeholder |
| `/sync` | Personal, Business, All | Offline queue, conflict state, retry and recovery | Placeholder |
| `/billing` | Business | Plan, limits, usage, checkout, downgrade protections | Placeholder |
| `/review` | Business | Review inbox for drafts, exceptions, approvals, and unresolved links | Placeholder |
| `/notifications` | Personal, Business, All | Account, delivery, financial, and workspace notifications | Placeholder |
| `/settings` | Personal, Business, All | Profile, workspace, members, security, integrations, data export/deletion | Placeholder |

## Page completion checklist

1. Route exists and is reachable from the correct shell navigation or action.
2. Active workspace remains unchanged when navigating to the page.
3. Scope and permission rules are visible and enforced.
4. Primary action has a defined success, validation, error, and retry state.
5. Empty state explains what the user can do next.
6. Mobile layout, keyboard access, and screen-reader labels are verified.
7. API contract and frontend query/mutation keys are documented beside the implementation.
8. A route-level test covers the most important acceptance path and one denial/empty edge case.

## Relationship to the other blueprint documents

- Documents 01–03 define authentication, shell behavior, and money rules.
- Documents 04–17 define domain workflows and backend/runtime constraints.
- Document 18 defines states/events; document 19 defines end-to-end acceptance.
- This document is the frontend implementation index that turns those rules into route-level work.
