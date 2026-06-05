# 14 - Rekordly V2 Implementation Backlog

## Summary

This document turns the completed Rekordly V2 planning set into an implementation backlog.

The backlog follows the vertical-slice roadmap in `12-roadmap.md`. Each phase should deliver a usable product slice across backend, frontend, data, and integration instead of building all backend first and all frontend later.

Implementation agents must follow `13-tech-stack-and-libraries.md`. If a dependency is not listed there, it must not be installed without explicit approval.

## Execution Rules

- Build in vertical slices.
- Keep MVP bounded.
- Do not implement Post-MVP Future Phase features unless explicitly promoted.
- Backend owns financial truth, plan enforcement, and security boundaries.
- Frontend preserves the V1 design language from `11-design-guide.md`.
- Every financial write must respect the data model guardrails from `05-data-model.md`.
- Every API must respect `06-api-architecture.md`.
- Every security-sensitive feature must respect `09-security.md`.
- Every monetization surface must respect `10-monetization.md`.

## Phase 0: Planning Closeout And Backlog Setup

Status: ready.

### Tickets

| ID | Work Item | Owner Area | Acceptance Criteria |
|---|---|---|---|
| P0-01 | Confirm planning docs exist from `01` through `14` | Planning | All planning files are present in `planning/` |
| P0-02 | Confirm SMS inconsistency is fixed | Planning | `03-feature-map.md` says email OTP only and SMS excluded |
| P0-03 | Confirm MVP/Post-MVP boundaries | Planning | Roadmap uses `Post-MVP Future Phase`; Phase 2 naming conflict is avoided |
| P0-04 | Confirm strict dependency manifest | Planning | `13-tech-stack-and-libraries.md` contains version-pinned approved dependencies |

### Exit Criteria

- Planning docs are complete.
- Implementation can begin from Phase 1.

## Phase 1: Technical Foundation

Goal: create the empty but deployable technical base.

### Tickets

| ID | Work Item | Owner Area | Acceptance Criteria |
|---|---|---|---|
| P1-01 | Create V2 workspace structure | Repo | Separate folders exist for Next.js frontend, Go API, Go worker, migrations, and local infra |
| P1-02 | Add Docker Compose local stack | Infra | Local stack includes frontend, API, worker, and PostgreSQL; local services do not point to cloud databases |
| P1-03 | Scaffold Go API | Backend | Gin app boots, uses `log/slog`, loads config through Viper, exposes health/readiness |
| P1-04 | Scaffold Go worker | Backend | Worker process boots, loads config, connects to PostgreSQL, exits cleanly on shutdown |
| P1-05 | Add PostgreSQL migration setup | Data | `golang-migrate` structure exists and can run an initial empty migration |
| P1-06 | Add `sqlc` setup | Data | `sqlc` config exists and generated code path is defined |
| P1-07 | Add database connection pool | Backend | API and worker use `pgxpool` |
| P1-08 | Add Swagger foundation | Backend | `swaggo/swag` is configured and Swagger UI can be served by the API |
| P1-09 | Scaffold Next.js frontend | Frontend | App Router shell boots with HeroUI, Tailwind, fonts, and V1-inspired theme tokens |
| P1-10 | Add GitHub Actions skeleton | DevOps | CI runs frontend checks, Go tests, and dependency/vulnerability checks where possible |
| P1-11 | Add environment separation | Infra | Local, staging, and production env names and config loading rules are documented in code/config |

### Exit Criteria

- `docker compose up` can start the local foundation stack.
- API health/readiness endpoints respond.
- Frontend shell renders.
- Worker starts without processing jobs yet.
- CI skeleton exists.

## Phase 2: Auth, Workspace, & Empty Dashboard

Goal: users can authenticate and land in a V1-inspired empty dashboard.

### Tickets

| ID | Work Item | Owner Area | Acceptance Criteria |
|---|---|---|---|
| P2-01 | Add auth tables and migrations | Data | Users, auth identities, sessions, workspaces, workspace members, plans, and usage scaffolds exist |
| P2-02 | Implement email OTP request | Backend | API creates throttled OTP requests without leaking account existence |
| P2-03 | Implement OTP verification | Backend | Valid OTP creates session; expired/invalid OTPs are rejected |
| P2-04 | Implement refresh/logout/session endpoints | Backend | Session lifecycle works and revoked sessions fail protected requests |
| P2-05 | Implement workspace bootstrap | Backend | New user receives one default workspace |
| P2-06 | Implement plan scaffold | Backend | Free/Starter/Business/Pro plan records and basic limit checks exist |
| P2-07 | Build login/signup/OTP UI | Frontend | User can request and verify OTP from the Next.js UI |
| P2-08 | Wire cross-domain auth client | Frontend | Protected dashboard calls include valid session context |
| P2-09 | Build empty dashboard shell | Frontend | Navbar, sidebar, mobile drawer, quick action, and empty content shell match V1 direction |
| P2-10 | Add Finance Scope Toggle | Frontend | Toggle shows `All | Business | Personal`, defaults to Business, and stores local UI state |

### Exit Criteria

- User can sign up, verify, log in, and see an empty dashboard.
- Protected API routes resolve `user_id` and `workspace_id`.
- Finance Scope Toggle is visible.

## Phase 3: Core Transactions & Manual Entry

Goal: prove the financial core before AI is layered on top.

### Tickets

| ID | Work Item | Owner Area | Acceptance Criteria |
|---|---|---|---|
| P3-01 | Add transaction and ledger migrations | Data | Transactions, ledger accounts, ledger entries, allocations, payments, and idempotency tables exist |
| P3-02 | Seed default ledger accounts | Data | Cash, income, expense, receivable, payable, customer liability, tax, equity, and adjustment accounts exist per workspace |
| P3-03 | Implement transaction create API | Backend | Manual income/expense/sale/purchase creation validates decimals and workspace scope |
| P3-04 | Implement balanced ledger writes | Backend | Finalized financial writes fail unless debit and credit entries balance |
| P3-05 | Implement split payment validation | Backend | Payment rows cannot exceed amount due |
| P3-06 | Implement void/reversal flow | Backend | Finalized records cannot be directly mutated or hard-deleted |
| P3-07 | Implement transaction list API | Backend | Cursor pagination and default date scoping are enforced |
| P3-08 | Build Global Add Transaction Drawer | Frontend | Manual form first, with scope selector and basic validation |
| P3-09 | Build transaction DataTable | Frontend | List supports scope toggle, date filters, pagination, skeleton, and actionable empty state |
| P3-10 | Build basic StatCards | Frontend | Totals are fetched from backend summary endpoints and preserve layout while loading |
| P3-11 | Build split payment UI | Frontend | Running total and remaining balance are visible before submit |

### Exit Criteria

- Users can create and view manual core finance records.
- Ledger entries balance.
- Split payment overpayment is blocked.
- Finalized record mutation is blocked.

## Phase 4: Invoices, Wallets, & Loans

Goal: add the MVP business workflows that depend on the transaction core.

### Tickets

| ID | Work Item | Owner Area | Acceptance Criteria |
|---|---|---|---|
| P4-01 | Add invoice migrations | Data | Invoices and invoice items support draft/finalized/voided states |
| P4-02 | Implement invoice API | Backend | Draft, update draft, finalize, void, list, and detail endpoints work |
| P4-03 | Add customer wallet migrations | Data | Customer wallets and wallet ledger tables exist |
| P4-04 | Implement wallet deposit/payment APIs | Backend | Deposits increase liability; wallet payments cannot exceed balance |
| P4-05 | Add simple loan migrations | Data | Loans support direction, principal, balance, counterparty, dates, and status |
| P4-06 | Implement loan APIs | Backend | Loan creation and repayment work; overpayment is rejected |
| P4-07 | Add async PDF job pipeline | Backend/Worker | Invoice PDF request returns job ID and worker generates PDF |
| P4-08 | Build invoice UI | Frontend | Create, preview, finalize, payment, and PDF job polling are usable |
| P4-09 | Build wallet UI | Frontend | Deposit and wallet payment flows show available balance and validation |
| P4-10 | Build simple loan UI | Frontend | Loan tracker and repayment UI are usable |

### Exit Criteria

- Users can issue invoices, track wallets, and track simple debts.
- PDF generation runs asynchronously.
- Wallet and loan safeguards are enforced.

## Phase 5: AI-First Entry

Goal: make "Type what happened" the primary creation experience.

### Tickets

| ID | Work Item | Owner Area | Acceptance Criteria |
|---|---|---|---|
| P5-01 | Add AI draft and audit migrations | Data | AI drafts and audit logs exist and are tenant-scoped |
| P5-02 | Implement AI parse endpoint | Backend | Endpoint enforces plan limits, rate limits, truncation, and audit logging |
| P5-03 | Implement multi-intent response contract | Backend | Parser returns `drafts: []` with confidence and missing fields |
| P5-04 | Add user context enrichment | Backend | Prompt includes last categories, frequent counterparties, and default scope safely |
| P5-05 | Implement AI draft confirmation | Backend | Confirmed drafts pass normal backend finance validation |
| P5-06 | Upgrade Add Drawer to AI-first | Frontend | Main CTA is "Type what happened" with manual fallback |
| P5-07 | Build multi-draft confirmation UI | Frontend | User can confirm, edit, or reject each draft |
| P5-08 | Add low-confidence highlighting | Frontend | Low-confidence fields are visually marked |
| P5-09 | Add scope inference override | Frontend | AI-inferred scope is visible and user can override before save |

### Exit Criteria

- AI entry creates drafts only.
- User confirmation is required.
- Backend validation remains the source of financial truth.

## Phase 6: Reports, Budgets, & Tax Readiness

Goal: help users understand money, budgets, and tax position.

### Tickets

| ID | Work Item | Owner Area | Acceptance Criteria |
|---|---|---|---|
| P6-01 | Implement dashboard summary endpoints | Backend | Dashboard uses aggregate endpoints, not raw client-side scans |
| P6-02 | Add budget migrations and APIs | Backend/Data | Weekly, monthly, yearly budgets support expense limits and income goals |
| P6-03 | Implement budget alert triggers | Backend/Worker | 80% and 100% thresholds can create notification records |
| P6-04 | Implement notification records | Backend/Data | Email, PWA push, and in-app channels are represented; SMS excluded |
| P6-05 | Implement Tax Readiness endpoint | Backend | VAT collected, VAT paid, taxable income, and deductible expenses are aggregated |
| P6-06 | Implement export jobs | Backend/Worker | PDF/CSV export requests return job IDs and complete asynchronously |
| P6-07 | Build dashboard charts | Frontend | Charts use backend summaries and match V1 design direction |
| P6-08 | Build budget setup/status UI | Frontend | Users can create budgets and view target status |
| P6-09 | Build Tax Readiness UI | Frontend | Summary shows VAT, taxable income, deductible expenses, and export buttons |
| P6-10 | Build notification UI | Frontend | In-app budget notifications can be viewed and marked read |

### Exit Criteria

- Reports and budgets use backend aggregates.
- Tax Readiness Reports are exportable.
- Budget alerts are represented without SMS.

## Phase 7: PWA, Monetization, & Offline

Goal: make the MVP commercially usable and resilient offline.

### Tickets

| ID | Work Item | Owner Area | Acceptance Criteria |
|---|---|---|---|
| P7-01 | Implement Paystack webhook endpoint | Backend | Signature verification and idempotent subscription updates work |
| P7-02 | Implement usage counters and plan checks | Backend | Backend enforces limits before writes, AI calls, exports, and sync |
| P7-03 | Add ad event/reward grant tracking | Backend/Data | Rewarded ad grants expand monthly pools only and are idempotent |
| P7-04 | Implement offline sync endpoint | Backend | Mutations are deduped by idempotency keys; server wins for finalized records |
| P7-05 | Add PWA setup | Frontend | Service worker and installable shell are configured |
| P7-06 | Implement offline read-only Free state | Frontend | Free users can view cached data but cannot create offline records |
| P7-07 | Implement paid offline sync UI | Frontend | Paid users can queue drafts and sync when online |
| P7-08 | Build subscription/checkout UI | Frontend | Users can view plans and start Paystack checkout |
| P7-09 | Add Free-plan AdSlots | Frontend | Ads appear only in low-risk placements |
| P7-10 | Add rewarded ad UX | Frontend | Rewarded ads expand monthly limits, not per-action gates |
| P7-11 | Add invoice branding gate | Frontend/Backend | Free invoices include branding; paid invoices remove it |

### Exit Criteria

- Monetization behavior is server-enforced.
- Offline behavior matches plan rules.
- Ads do not interrupt critical financial actions.

## Phase 8: Security, QA, Beta

Goal: harden the MVP before public launch.

### Tickets

| ID | Work Item | Owner Area | Acceptance Criteria |
|---|---|---|---|
| P8-01 | Add tenant isolation tests | QA/Security | Users cannot read or mutate another workspace's records |
| P8-02 | Add property authorization tests | QA/Security | Clients cannot mass-assign protected fields |
| P8-03 | Add financial integrity tests | QA | Ledger imbalance, wallet overdraft, split overpayment, and loan overpayment fail |
| P8-04 | Add AI abuse/cost tests | QA | Rate limits, truncation, and plan limits are enforced |
| P8-05 | Add offline sync tests | QA | Duplicate idempotency keys do not create duplicate records |
| P8-06 | Add webhook tests | QA | Invalid signatures are rejected and duplicate events are idempotent |
| P8-07 | Add vulnerability scans | DevOps | Go and npm high/critical issues block deploy unless approved |
| P8-08 | Verify backups and restore | DevOps | Production backup and restore procedure is tested before launch |
| P8-09 | Run private beta | Product | Beta users validate core transaction, invoice, AI, budget, tax, and monetization flows |

### Exit Criteria

- Production launch candidate is approved.
- Critical data, security, and money risks are tested.

## Phase 9: MVP Launch

Goal: launch the public MVP.

### Tickets

| ID | Work Item | Owner Area | Acceptance Criteria |
|---|---|---|---|
| P9-01 | Prepare production environment | Infra | Vercel, Northflank, Postgres, env vars, domains, and secrets are ready |
| P9-02 | Enable production providers | Infra | Paystack live keys, AI live keys, email, and PWA push are configured |
| P9-03 | Verify monitoring | Infra | Health, readiness, logs, queue, DLQ, AI usage, and webhook monitoring are active |
| P9-04 | Set V1 read-only stance | Product/Ops | V1 remains available for historical view and CSV exports |
| P9-05 | Launch public MVP | Product | Users can create clean V2 accounts and use core MVP flows |

### Exit Criteria

- Public MVP is live.
- V1 historical access remains available.
- Monitoring and backups are active.

## Post-MVP Parking Lot

Do not implement these in MVP unless explicitly promoted:

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
- Redis.
- Hetzner/Coolify migration.
- Advanced analytics warehouse.
- Multi-region infrastructure.

## First Implementation Sprint Recommendation

Start with Phase 1 only.

Recommended Sprint 1 tickets:

- `P1-01` Create V2 workspace structure.
- `P1-02` Add Docker Compose local stack.
- `P1-03` Scaffold Go API.
- `P1-04` Scaffold Go worker.
- `P1-05` Add PostgreSQL migration setup.
- `P1-06` Add `sqlc` setup.
- `P1-09` Scaffold Next.js frontend.

Do not start Auth until the foundation stack can run locally.

## Definition Of Done

Every ticket should include:

- Working implementation.
- Relevant tests or verification.
- No unapproved dependencies.
- No Post-MVP scope creep.
- Updated docs if behavior changes.
- Clear acceptance evidence.

## Assumptions

- Implementation starts with a clean V2 structure inside the current repository.
- Planning files remain in `planning/`.
- The existing V1 `web` folder is reference material unless the user explicitly asks to modify it.
- The strict dependency manifest in `13-tech-stack-and-libraries.md` is binding.
