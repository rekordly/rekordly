# Ready-to-Paste Antigravity Prompt — Task 03

Work on Rekordly V2 task 03: Feature Map Frontend Foundation.

Before changing code, read:

- `AGENT_RULES.md`
- `tasks/03-antigravity-feature-map-frontend-task.md`
- `planning/03-feature-map.md`
- `planning/final-v2-plan/01-final-product-requirements.md`
- `planning/final-v2-plan/02-information-architecture-and-workflows.md`
- `planning/v2-system-blueprint/02-app-shell-navigation-and-permissions.md`
- `planning/v2-system-blueprint/03-money-capture-classification-and-confirmation.md`
- `planning/v2-system-blueprint/04-sales-invoicing-and-payments.md`
- `planning/v2-system-blueprint/05-procurement-inventory-and-storefront.md`
- `planning/v2-system-blueprint/10-personal-finance-budgets-loans-assets-and-investments.md`
- `planning/v2-system-blueprint/13-plans-billing-entitlements-and-downgrades.md`
- `planning/11-design-guide.md`

Create the frontend feature foundation only. Build a typed feature registry and route/page scaffolds for AI capture, income, expenses, sales, purchases, invoices, payments, loans/debt, customer deposits/wallets, split payments, budgets, reports/tax readiness, offline drafts/sync and plan limits.

Every page must have a real title, active-space context, one primary action, an actionable empty state, and honest loading/unavailable/plan-locked states where appropriate. Do not show invented balances, transactions, financial totals or fake API success. Keep Personal, Business and All presentation separate.

Use existing HeroUI v3 wrappers and Phosphor icons with `weight="duotone"`. Follow the current Rekordly/Kero compact typography and field conventions. Do not add a UI library, heavy shadows, arbitrary gradients or dominant orange.

Allowed implementation files:

- `implementation/web/src/lib/features/**`
- `implementation/web/src/components/features/**`
- feature route files under `implementation/web/src/app/(protected)/**`

Do not edit:

- `implementation/web/src/app/(auth)/**`
- `implementation/web/src/app/(protected)/layout.tsx`
- `implementation/web/src/components/layout/**`
- `implementation/web/src/components/ui/**`
- `implementation/web/src/lib/api/**`
- `implementation/web/src/lib/auth/**`
- `implementation/web/src/app/globals.css`
- any Go, SQL, Docker, worker or planning file

Do not invent backend endpoint contracts, response shapes or permission names. Do not persist sensitive data. Do not use JavaScript floating-point arithmetic for money; display money examples as strings only.

Work in a separate branch/worktree. Do not merge into `master`. Commit the work separately. Before handoff run:

```text
npm run lint
npm run type-check
npm test
npm run build
```

Verify desktop and mobile widths with no horizontal overflow. Return the branch/worktree name, commit hash, changed files, routes added, registry design, test/build results, screenshots and unresolved API assumptions. Confirm auth, session, app shell, shared UI and backend files were untouched.
