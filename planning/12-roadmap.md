# 12 - Rekordly V2 Roadmap

## Summary

This document converts the Rekordly V2 planning documents into an implementation roadmap.

The roadmap is organized as vertical slices. Each major phase should deliver backend, frontend, data, and integration work for a usable feature area instead of building all backend first and all frontend later.

This reduces integration risk, gives faster visual feedback, and keeps the product grounded in real user flows as implementation progresses.

## Purpose

This document is the build sequence for Rekordly V2.

The MVP priority is a trustworthy finance core, not a full rebuild of every V1 feature. Phase work should stay MVP-bounded and avoid pulling in Post-MVP complexity too early.

Roadmap dates should be assigned after implementation capacity is known. Until then, phases are sequence-based.

## Roadmap Principles

- Financial correctness comes first.
- AI suggests; backend validates; user confirms.
- Backend and frontend are separate from day one.
- Build in vertical slices to reduce integration risk.
- Launch lean and bootstrapped.
- Preserve V1 visual familiarity.
- Backend owns financial truth and plan enforcement.
- Do not ship Post-MVP complexity into MVP by accident.

## Phases

### Phase 0: Planning Closeout And Backlog Setup

Goal: close planning and prepare implementation work.

Work:

- Finalize docs 01-13.
- Fix known SMS inconsistency in `03-feature-map.md` so MVP auth is email OTP only.
- Convert planning docs into epics and implementation tickets.
- Define MVP acceptance checklist.
- Mark Post-MVP features clearly so implementation agents do not accidentally build them during MVP.

Output:

- Approved implementation backlog.
- Planning set complete from `01` through `13`.

### Phase 1: Technical Foundation

Goal: create the empty but deployable technical base.

Work:

- Repo setup for separate Next.js frontend, Go API, Go worker, and PostgreSQL.
- Docker Compose local environment.
- CI/CD with GitHub Actions.
- Database migrations with `golang-migrate/migrate`.
- `sqlc` setup for type-safe PostgreSQL queries.
- Empty frontend app shell.
- Empty Go API app shell.
- Empty Go worker app shell.
- Health and readiness endpoints.
- Local, staging, and production environment separation.

Output:

- Local development stack runs without cloud databases.
- Staging deployment can run empty shells.
- API exposes health/readiness checks.

### Phase 2: Auth, Workspace, & Empty Dashboard

Goal: let users authenticate, enter the app, and land on a V1-inspired empty dashboard.

Backend:

- Email OTP auth.
- JWT/session validation.
- Refresh/logout behavior.
- Workspace creation.
- One workspace per user for MVP.
- Plan limits scaffold.
- Server-side user and workspace resolution for protected requests.

Frontend:

- Login/signup UI.
- Email OTP verification UI.
- Cross-domain auth flow between frontend and API.
- Empty V1-inspired dashboard shell.
- Top navbar, sidebar, mobile drawer navigation.
- Finance Scope Toggle: `All | Business | Personal`.
- Empty states that lead users toward AI/manual transaction entry.

Output:

- User can sign up, verify, log in, and reach the empty dashboard.
- Auth works across the split frontend/API architecture.

### Phase 3: Core Transactions & Manual Entry

Goal: build the financial core with manual entry first, so accounting rules are proven before AI is layered on top.

Backend:

- Transactions API.
- Double-entry ledger.
- Income records.
- Expense records.
- Sales records.
- Purchase records.
- Split payments.
- Personal/business/mixed/transfer `scope_type`.
- Immutability rules.
- Void/reversal flows.
- Idempotency for writes.

Frontend:

- Global Add Transaction Drawer with manual form first.
- Transaction list using shared DataTable.
- StatCards for basic totals.
- Finance Scope Toggle filtering transaction lists and totals.
- Split Payment UI with running totals and remaining balance.
- Scope selector inside the Add Transaction drawer.

Output:

- Users can manually create and review core financial records.
- Ledger-backed financial writes are working.
- Scope filtering and smart defaults are visible.

### Phase 4: Invoices, Wallets, & Loans

Goal: add the MVP business workflows that sit on top of the financial core.

Backend:

- Invoice API.
- Invoice items.
- Invoice finalization/voiding.
- Customer wallets.
- Customer wallet ledger.
- Wallet deposits and payments.
- Simple loans/debts.
- Loan repayments.
- Async PDF generation job.
- Job status endpoint integration.

Frontend:

- Invoice creation and preview UI.
- Invoice payment UI.
- Customer wallet deposit/payment UI.
- Simple Loan tracker UI.
- Loan repayment UI.
- Async job status polling for PDF generation.
- Wallet balance validation messaging.

Output:

- Users can issue invoices, track customer deposits, and track simple debts.
- PDF generation runs through async jobs.

### Phase 5: AI-First Entry

Goal: upgrade creation from manual-first to AI-first while keeping user confirmation and backend validation.

Backend:

- AI parse endpoint.
- Multi-intent parser.
- User context enrichment.
- Input truncation.
- Rate limits.
- AI credit usage.
- AI audit logs.
- Draft confirmation endpoint.
- Backend validation of all confirmed AI drafts.

Frontend:

- Upgrade Add Drawer to AI-first.
- Primary prompt: "Type what happened."
- Multi-draft UI.
- Low-confidence field highlighting.
- User confirmation flow.
- Scope inference display and override.
- Manual fallback remains available.

Output:

- "Type what happened" becomes the primary creation path.
- AI-created drafts never bypass user confirmation or backend financial rules.

### Phase 6: Reports, Budgets, & Tax Readiness

Goal: help users understand their money, budgets, and tax position using backend aggregates.

Backend:

- Dashboard summary aggregates.
- Budget CRUD.
- Budget tracking.
- Budget alert triggers.
- Tax Readiness endpoint.
- VAT collected vs. VAT paid aggregation.
- Taxable income aggregation.
- Tax-deductible expense aggregation.
- PDF/CSV export jobs.

Frontend:

- Dashboard charts and report summaries.
- Budget setup UI.
- Budget status views.
- Tax Readiness summary UI.
- Export/PDF download buttons.
- Async export status handling.
- Budget alert notification UI.

Output:

- Users can view meaningful summaries, budgets, and tax readiness reports.
- Reports use backend aggregate endpoints instead of client-side raw scans.

### Phase 7: PWA, Monetization, & Offline

Goal: make the MVP commercially usable and resilient in weak-network environments.

Backend:

- Paystack subscription webhooks.
- Plan state updates.
- Usage counters.
- Ad event tracking.
- Rewarded ad grant tracking.
- Offline sync/mutation endpoint.
- Idempotency for offline mutations.
- Plan enforcement for offline creation, reports, exports, AI, and ads.

Frontend:

- PWA shell.
- Offline read-only states for Free users.
- Full offline creation/sync states for paid users.
- Paystack checkout UI.
- Subscription/plan UI.
- Free-plan AdSlots.
- Rewarded ad monthly-pool expansion UI.
- Invoice branding gate.
- PlanGate components across locked features.

Output:

- Free and paid plan behavior works end to end.
- Offline behavior matches monetization and sync rules.
- MVP can begin earning revenue without damaging trust.

### Phase 8: Security, QA, Beta

Goal: harden the MVP before public launch.

Work:

- Security hardening from `09-security.md`.
- Tenant isolation tests.
- Object-level authorization tests.
- Property-level authorization tests.
- Financial integrity tests.
- Ledger balance tests.
- Wallet overdraft tests.
- Split payment overpayment tests.
- Loan overpayment tests.
- AI abuse and cost tests.
- Offline sync tests.
- Webhook signature and idempotency tests.
- Dependency vulnerability scanning.
- Backup and restore verification.
- Private beta with staging/fake data first.
- Limited live beta users after staging validation.

Output:

- Production launch candidate.
- Known security, data, and financial correctness risks are tested.

### Phase 9: MVP Launch

Goal: launch the public MVP.

Work:

- Production deploy on Vercel and Northflank.
- Paystack live keys.
- AI live keys with strict limits.
- Production email and PWA push providers.
- Production backups verified.
- Health/readiness monitoring.
- Error, queue, DLQ, webhook, and AI usage monitoring.
- V1 remains available/read-only for old records and CSV exports.

Output:

- Public MVP launch.
- Users can start clean in V2 while still accessing V1 history.

## Post-MVP Future Phase

The following features are intentionally delayed until after MVP launch. They should not block the MVP roadmap.

- WhatsApp Business API integration.
- WhatsApp OTP.
- WhatsApp transaction notifications.
- WhatsApp conversational AI bot.
- Storefront.
- Complex inventory.
- Complex production and product recipes.
- Quotations.
- Complex amortization and interest scheduling.
- Full team roles and permissions.
- Multi-workspace support.
- Advanced imports and migrations.
- Government tax portal auto-filing.
- Advanced multi-currency behavior beyond the gated MVP capability.
- Redis until PostgreSQL queue pressure is proven.
- Hetzner/Coolify migration until usage and cost justify it.
- Advanced analytics warehouse.
- Multi-region infrastructure.

## Launch Acceptance Criteria

- Email OTP works across split frontend/API domains.
- Every protected request resolves `user_id` and `workspace_id`.
- Every tenant query is workspace-scoped.
- Financial writes create balanced ledger entries.
- Finalized financial records are immutable.
- Corrections use voids and reversals.
- AI drafts require user confirmation.
- Wallets cannot go negative.
- Split payments cannot exceed amount due.
- Loan repayments cannot overpay.
- Dashboard uses backend aggregates.
- Budget summaries use backend aggregates.
- Tax Readiness Reports are backend-generated and exportable.
- Free users see ads only in safe placements.
- Paid users see no ads.
- Rewarded ads only expand monthly pools.
- Offline behavior matches plan rules.
- CI/CD runs tests, migrations, and vulnerability scans.
- Production backups are configured and restore-tested.
- Health and readiness checks are live.
- Payment webhooks are signature-verified and idempotent.

## Assumptions

- This is the final planning document before implementation backlog creation.
- Implementation should proceed in vertical slices.
- MVP launch is clean-start V2, with V1 kept read-only for old history and CSV export.
- Exact calendar dates will be assigned after team capacity is known.
- Post-MVP features are not allowed to slip into MVP unless explicitly promoted later.
