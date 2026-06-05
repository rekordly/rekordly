# 11 - Rekordly V2 Design Guide

## Summary

This document defines the frontend design guide for Rekordly V2.

V2 should preserve the familiar V1 visual language while improving structure, loading states, empty states, Personal vs. Business scope behavior, and AI-first transaction entry.

The goal is not to make Rekordly feel like a completely different app. The goal is to make it feel like a polished continuation of V1: same brand foundation, smoother reusable flows, clearer financial state, and fewer scattered one-off UI patterns.

## Purpose

This guide defines the visual and interaction rules for the V2 frontend.

V2 should follow V1 visually, with targeted UX and architecture improvements:

- Preserve the brand identity.
- Preserve the dashboard shell.
- Preserve the quick-action habit.
- Improve creation flows.
- Standardize loading, empty, offline, and plan-gated states.
- Make Personal vs. Business finance separation visible and easy to control.

This document is not an API or schema document. It describes how the frontend should feel and behave.

## V1 Design Inventory

V1 design references:

- `web/tailwind.config.js`
- `web/src/config/fonts.ts`
- `web/src/app/dashboard/layout.tsx`

V1 design stack:

- HeroUI component system.
- Tailwind styling.
- `next-themes` light/dark support.
- Figtree body font.
- Sora heading font.
- Fira Code mono font.
- Top dashboard navbar.
- Left desktop sidebar.
- Mobile drawer navigation.
- Floating quick action button.
- Cards, chips, tables, drawers, modals, and skeleton loaders.

V1 visual strengths to preserve:

- Green/orange brand personality.
- Compact finance dashboard feel.
- Large clear stat cards.
- Rounded dashboard cards.
- Dense but readable transaction lists.
- Fast access to common actions.
- Sidebar-driven business navigation.
- Light/dark theme support.

V1 issues to improve:

- Drawer and modal ownership is scattered across navbar, sidebar, quick action, and individual pages.
- Add-income and add-expense flows are duplicated.
- Manual forms compete with a future AI-first flow instead of being unified under it.
- Empty states are not consistently actionable.
- Loading states exist, but V2 needs stricter skeleton sizing to prevent layout shift.
- Personal vs. Business scope needs to become a first-class UI control.

## Key Design Direction

### Preserve V1 Visual Identity

V2 should keep:

- HeroUI.
- Tailwind.
- Light/dark theme support.
- Dashboard shell.
- Green/orange brand system.
- Rounded card language.
- Compact financial summaries.
- Quick action entry pattern.

Approved brand tokens:

| Token | Value | Usage |
|---|---:|---|
| Primary green | `#009e10` | Primary actions, active nav, revenue, success, brand focus |
| Secondary orange | `#fa8901` | Secondary emphasis, expenses, warning accents |
| Dark card | `#121212` | Dark mode card/background surface |
| Light background | `#FAFFFB` | Light brand background |
| Dark background | `#010501` | Dark brand background |

Approved fonts:

| Role | Font |
|---|---|
| Sans/body/UI | Figtree |
| Heading/financial titles | Sora |
| Mono/technical | Fira Code |

### Improve V1 Structure

V2 should improve the underlying frontend architecture without making the interface feel alien.

Required improvements:

- Replace scattered drawer/modal ownership with one global action system.
- Use one global AI-first Add Transaction drawer.
- Keep manual forms as fallback and confirmation inside standardized drawers/modals.
- Centralize reusable components for forms, tables, stat cards, empty states, skeletons, plan gates, ads, offline banners, and export actions.
- Avoid duplicating add-flow wiring between navbar, sidebar, quick action, and individual pages.

## Personal vs. Business Scope UI

Personal vs. Business separation is a core V2 product behavior and must be obvious in the interface.

### Finance Scope Toggle

Dashboards and transaction lists must include a prominent Finance Scope Toggle.

Recommended pattern:

```text
All | Business | Personal
```

The toggle may be implemented as:

- Segmented control.
- Tabs.
- Compact button group.

Default view:

- `Business`

Primary purpose:

- The Scope Toggle is a view filter.
- It filters dashboards, transaction lists, budgets, and report summaries.

Filtered data should use `scope_type`:

- `business`
- `personal`
- `mixed`
- `transfer`

Recommended behavior:

- `Business` view shows business records and relevant mixed/transfer context where needed.
- `Personal` view shows personal records and relevant mixed/transfer context where needed.
- `All` view shows combined activity with clear scope labels.

### Smart Defaults For Creation

The current Scope Toggle state sets a smart default for new records.

Examples:

- If the user is viewing `Business`, Add Transaction defaults to `business`.
- If the user is viewing `Personal`, Add Transaction defaults to `personal`.
- If the user is viewing `All`, Add Transaction may default to the user's last-used scope or ask the AI/manual form to classify it.

Crucial rule:

- Users must always be able to override `scope_type` directly inside the Add Transaction drawer or form.
- Users must not have to switch the main dashboard toggle just to record a different type of transaction.

This prevents clunky workflows such as leaving the Business dashboard just to record a personal grocery expense.

### Scope Indicators In Lists

Lists should visually distinguish scope.

Acceptable patterns:

- Subtle colored dot next to category.
- Small scope icon.
- Compact scope chip.
- Scope label in metadata row.

Recommended mapping:

- Business: primary green dot/chip.
- Personal: blue or neutral dot/chip.
- Mixed: orange dot/chip.
- Transfer: gray or purple dot/chip.

Scope indicators should be visible without overwhelming transaction lists.

### Business-Only Actions In Personal View

When the user is in Personal scope view, business-only actions should be hidden or visually disabled.

Examples of business-only actions:

- Create invoice.
- Create sale.
- Record customer wallet deposit.
- Generate business tax report.

If disabled, explain why in a tooltip or short helper text:

```text
Switch to Business view to create an invoice.
```

The goal is to prevent accidental crossover between personal and business workflows.

## Brand Tokens And Typography

### Color Usage

Use green for:

- Primary actions.
- Active nav.
- Revenue.
- Success states.
- Confirmed positive financial state.

Use orange for:

- Secondary emphasis.
- Expense accents.
- Warning accents where appropriate.
- Mixed-scope indicators.

Use red for:

- Destructive actions.
- Overdue states.
- Negative balances.
- Failed sync.
- Failed payment.
- Voids and irreversible confirmation warnings.

Use blue, purple, teal, and other accents for:

- Charts.
- Category markers.
- Secondary report distinctions.

Avoid:

- One-note palettes.
- Overusing decorative gradients.
- Making every financial chart green/orange only.
- Placing red and green status labels without text/icons for accessibility.

### Typography Rules

- Use Figtree for body text and UI labels.
- Use Sora for headings, stat card titles, and financial summaries.
- Use Fira Code only for IDs, codes, debug/dev text, or machine-like references.
- Do not scale font size with viewport width.
- Do not use negative letter spacing in compact app UI.
- Keep dashboard panel headings tighter than marketing headings.
- Long labels must wrap cleanly on mobile.
- Buttons must not rely on tiny text to communicate critical actions.

## Layout System

### Dashboard Shell

Desktop:

- Top navbar.
- Left sidebar.
- Scrollable main content area.
- Main content padding similar to V1.
- Floating quick action button.

Mobile:

- Top navbar.
- Drawer navigation.
- Floating quick action button.
- Lists should be card-like or horizontally scrollable with labels.

### Quick Action

Preserve the quick action habit from V1.

In V2, the quick action button should open the global Add Transaction drawer.

The first prompt should be:

```text
Type what happened
```

Manual entry options should be available inside the drawer, not scattered across unrelated menus.

### Dashboard Composition

Dashboard screens should be practical and finance-first.

Use:

- Stat cards.
- Small charts.
- Summary tables.
- Scope toggle.
- Date filters.
- Clear action buttons.

Avoid:

- Marketing-style hero sections inside the app dashboard.
- Decorative card-heavy sections that do not help decisions.
- Nested cards inside cards unless the inner card is a repeated item or modal content.

## Core Components

### StatCard

Preserve the V1 StatCard style, but standardize variants.

Required variants:

- Revenue/success.
- Expense/warning.
- Profit/neutral.
- Debt/liability.
- Budget status.
- Tax summary.

Rules:

- Include a skeleton state.
- Preserve dimensions while loading.
- Show currency and timeframe where relevant.
- Support scope-filtered values.

### DataTable

Use a shared DataTable for:

- Transactions.
- Invoices.
- Customers.
- Customer wallet ledger.
- Loans.
- Payments.
- Tax reports.
- Exports.

Rules:

- Must support cursor pagination.
- Must support date filters.
- Must support Finance Scope Toggle where relevant.
- Must support mobile-friendly layout.
- Must show loading skeletons.
- Must show actionable empty states.

### GlobalAddDrawer

GlobalAddDrawer is the primary creation surface.

Required behavior:

- AI-first text input.
- Manual fallback.
- Multi-draft confirmation.
- Scope type selector.
- Low-confidence field highlighting.
- Plan limit messaging.
- Offline state handling.
- Validation summaries.

### FormModal / FormDrawer

Forms should share:

- Validation state.
- Loading state.
- Dirty-state confirmation.
- Error display.
- Success feedback.
- Submit button behavior.
- Cancel behavior.

### StatusChip

Use StatusChip for:

- Paid.
- Partially paid.
- Overdue.
- Draft.
- Finalized.
- Voided.
- Synced.
- Offline.
- Stale.
- Failed.

Status chips must use color plus text, not color alone.

### PlanGate

PlanGate should handle:

- Locked feature messaging.
- Upgrade prompts.
- Usage limits.
- Rewarded ad expansion prompts for Free users.

PlanGate must not be the only enforcement layer. Backend remains the source of truth.

### AdSlot

AdSlot is Free-plan only.

Rules:

- Low-risk placements only.
- Never near save, pay, send, void, delete, confirm, or submit buttons.
- Never in transaction confirmation, invoice send, wallet payment, loan repayment, or correction flows.
- Paid users never see ads.

### OfflineBanner

OfflineBanner should communicate:

- Online.
- Offline read-only.
- Offline drafts pending sync.
- Syncing.
- Sync failed.
- Cached dashboard stale.

Free users:

- Read-only offline messaging.

Paid users:

- Full offline creation/sync messaging.

### ExportButton

ExportButton must support async jobs.

States:

- Ready.
- Plan locked.
- Starting.
- Processing.
- Ready to download.
- Failed.

### EmptyState

Empty states must be actionable.

They must never only say:

```text
No data.
```

Good examples:

```text
No business expenses yet. Type what happened to add one.
```

```text
No invoices yet. Create your first invoice when you are ready to bill a customer.
```

```text
No tax report yet. Add VAT and deductible tags, then generate a Tax Readiness Report.
```

Rules:

- Use the AI-first entry flow as the primary call-to-action where relevant.
- Use manual fallback for structured business documents such as invoices.
- Empty states should explain the next useful action.
- Empty states should respect plan gates.

### SkeletonLoader

Skeleton loaders are required while waiting for backend aggregate endpoints.

Required for:

- StatCard.
- DataTable.
- Dashboard summary panels.
- Detail pages.
- Forms with async defaults.

Rules:

- Preserve final component dimensions.
- Prevent layout shift.
- Avoid spinner-only loading for major dashboard content.
- Use skeletons that match the expected layout.
- Do not replace the whole dashboard with a tiny centered spinner unless the entire page truly has no renderable shell.

## AI-First Entry UX

AI-assisted entry is the primary creation experience.

Primary CTA:

```text
Type what happened
```

Flow:

1. User opens Add Transaction.
2. User types natural language.
3. AI parser returns one or more drafts.
4. User reviews each draft.
5. User edits uncertain fields.
6. User confirms.
7. Backend validates and saves.

AI must infer:

- Transaction type.
- Amount.
- Currency.
- Date.
- Category.
- Counterparty.
- Payment method.
- `scope_type`: Business, Personal, Mixed, Transfer.

Scope inference examples:

- "Bought fuel for delivery" suggests Business.
- "Bought groceries" suggests Personal.
- "Bought laptop 70 percent business and 30 percent personal" suggests Mixed.
- "Moved money from my personal account to business" suggests Transfer.

Rules:

- Inferred scope appears in the confirmation form.
- User can verify or override scope before saving.
- Low-confidence fields should be highlighted.
- AI output is a suggestion, not financial truth.
- User confirmation is required before saving.

## Financial UX Rules

- Always show currency codes where ambiguity exists.
- Never hide balances behind hover-only UI.
- Never hide payment status behind hover-only UI.
- Mixed records must show allocation before saving.
- Wallet payment must show available wallet balance.
- Split payment rows must show running total and remaining balance.
- Tax Readiness Reports must clearly show VAT collected, VAT paid, taxable income, and deductible expenses.
- Voided records should remain visible in history with clear status.
- Failed sync records should show recovery action.
- In Personal scope, business-only actions should be disabled or hidden.
- Financial correction flows require confirmation.
- Destructive or irreversible actions require confirmation.

## Monetization UX Rules

- Free users may see display ads only in low-risk areas.
- Paid users never see ads.
- Rewarded ads only expand monthly pools.
- Rewarded ads must not be per-action gates.
- Free users get read-only offline state.
- Paid users get full offline creation and sync.
- Free invoices show Rekordly branding.
- Paid invoices remove Rekordly branding.
- Tax report gates must explain the plan requirement clearly.
- AI Assistant gates must explain the plan requirement clearly.
- Upgrade prompts should be clear without being hostile.

## Accessibility And Responsiveness

Accessibility rules:

- Controls must be keyboard-accessible.
- Focus states must be visible.
- Color cannot be the only status signal.
- Use icons plus text for unfamiliar states.
- Form errors must be associated with fields.
- Destructive actions require confirmation.

Responsive rules:

- No text overlap on mobile.
- Tables must degrade into mobile cards or horizontal scroll with clear labels.
- Buttons must keep stable dimensions across loading states.
- Stat cards must preserve layout while loading.
- Filter controls must wrap cleanly.
- Scope toggle must remain reachable on mobile.

## Phase 2 UI Exclusions

Do not design MVP screens for:

- Storefront.
- Complex inventory.
- Complex production.
- Quotations.
- WhatsApp UI.
- Advanced team roles.
- Advanced multi-workspace switching.

These may appear as future navigation placeholders only if needed, but they should not distract from MVP finance flows.

## Test / Review Criteria

- Preserves V1 colors, fonts, HeroUI, Tailwind, dashboard shell, and quick action pattern.
- Defines Finance Scope Toggle as a view filter and smart default, not a hard creation lock.
- Users can override `scope_type` inside Add Transaction without switching dashboard scope.
- Business-only actions are hidden or disabled in Personal scope.
- Empty states are actionable and AI-first.
- Skeleton loaders prevent layout shift for stat cards and tables.
- AI-first Add Transaction remains the primary creation flow.
- Manual forms remain fallback and confirmation tools.
- Financial statuses are visible and text-labeled.
- Ads are banned from critical financial flows.
- Mobile behavior is defined for navigation, forms, tables, and dashboards.
- The guide does not introduce Phase 2 workflows as MVP screens.

## Assumptions

- V2 frontend uses Next.js.
- V2 frontend uses Tailwind.
- V2 frontend uses HeroUI.
- V2 frontend uses Zustand for client UI state where appropriate.
- V2 uses lucide icons where possible.
- V1 look and feel is the baseline.
- V2 can improve architecture and consistency without changing the brand identity.
- Storefront, complex production, complex inventory, quotations, WhatsApp UI, and advanced team/role UI remain Phase 2 unless promoted later.
