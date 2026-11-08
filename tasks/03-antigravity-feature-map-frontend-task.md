# Antigravity Task — Feature Map Frontend Foundation (03)

## Objective

Convert the approved Rekordly V2 feature map into a coherent frontend feature surface: typed feature metadata, route/page scaffolds, and actionable empty states that are ready for vertical-slice API wiring later.

This is a frontend foundation task. It is not permission to invent backend contracts or implement all accounting logic in one pass.

## Required reading

- `AGENT_RULES.md`
- `planning/03-feature-map.md` (historical feature inventory)
- `planning/final-v2-plan/01-final-product-requirements.md`
- `planning/final-v2-plan/02-information-architecture-and-workflows.md`
- `planning/v2-system-blueprint/02-app-shell-navigation-and-permissions.md`
- `planning/v2-system-blueprint/03-money-capture-classification-and-confirmation.md`
- `planning/v2-system-blueprint/04-sales-invoicing-and-payments.md`
- `planning/v2-system-blueprint/05-procurement-inventory-and-storefront.md`
- `planning/v2-system-blueprint/10-personal-finance-budgets-loans-assets-and-investments.md`
- `planning/v2-system-blueprint/13-plans-billing-entitlements-and-downgrades.md`
- `planning/11-design-guide.md`

## Scope

Build only under `implementation/web/**`:

1. Create a typed feature registry for the MVP surfaces:
   - AI “Type what happened” capture;
   - income and expenses;
   - sales and purchases;
   - invoices and payments;
   - simple loans/debt;
   - customer deposits/wallets;
   - split payments;
   - budgets;
   - reports/tax readiness;
   - offline drafts/sync status;
   - subscription/plan limits.
2. Add route/page scaffolds for feature surfaces that do not yet exist.
3. Every scaffold must have a clear page title, active-space context, one primary action, useful empty state, and honest loading/unavailable/plan-locked states where relevant.
4. Do not show fake financial totals, balances, transactions or API success claims.
5. Keep Personal, Business and All presentation distinct.
6. Keep all domain metadata in a registry so the future sidebar, More menu, search and Universal Add can consume the same source.

## Design and implementation rules

- Use existing HeroUI v3 wrappers and Phosphor icons with `weight="duotone"`.
- Follow the existing Rekordly/Kero field, spacing and typography conventions.
- No new UI library, shadow-heavy cards, arbitrary gradients or dominant orange.
- Do not edit the shared auth layout, session guards, API client, global CSS or app shell; the primary agent owns those files.
- Do not change Go, SQL, Docker, worker or planning files.
- Do not invent endpoints, response shapes or permission names. Use typed placeholders at integration boundaries.
- Do not use JavaScript floating-point arithmetic for money. Keep money examples as display strings only.
- Do not persist sensitive data in localStorage or IndexedDB.

## Suggested file boundary

- `src/lib/features/feature-registry.ts`
- `src/components/features/**`
- `src/app/(protected)/**` feature routes, excluding the protected layout and dashboard shell owned by the primary agent

## Acceptance criteria

- `npm run lint` passes.
- `npm run type-check` passes.
- `npm test` passes without weakening existing auth/session tests.
- `npm run build` passes.
- Desktop and mobile routes render without horizontal overflow.
- Feature registry is the single source for labels, routes, space availability, action labels and feature status.
- Empty states are actionable and do not claim unimplemented functionality is complete.
- No files outside the allowed frontend boundary are changed.

## Handoff

Return the branch/worktree name, commit hash, changed files, routes added, registry design, tests/build output, screenshots at desktop/mobile widths, and any API contracts that still need backend confirmation. Do not merge into `master`; the primary agent will review and integrate the work.
