# Rekordly v2 Final Planning Package

**Planning deadline:** 8 November 2026  
**Public-beta target:** 1 December 2026  
**Package started:** 7 November 2026
**Current status:** Backend selected; provider tiers and remaining operational checks open

## Authority

This folder is the authoritative, reconciled planning package for Rekordly v2. Earlier research, proposals and delegation artifacts were reconciled into this package and the system blueprint, then removed to prevent competing sources of truth.

Implementation-level user, system, algorithm and state detail lives in `planning/v2-system-blueprint`. That folder extends this package and cannot silently override its locked decisions.

## Locked product direction

- One product serving personal users, freelancers and small-scale businesses.
- Separate Personal and Business financial spaces, with an optional combined owner summary.
- Responsive web/PWA for the December beta.
- Accounting-grade backend with plain-language interfaces.
- Every AI-created financial record requires confirmation.
- Full inventory and procurement are launch blockers.
- Business storefront with Rekordly subdomain and order-request checkout is a launch blocker.
- Existing custom domains are supported; Rekordly does not initially sell domains.
- Online storefront payment collection is deferred.
- December 1 is a controlled public beta, with invite-only fallback when any critical gate fails.

## Architecture decisions

- Go modular monolith is selected for the core API and worker.
- Render is selected initially for API/worker hosting; free is for development/early invite testing, and paid always-on tiers are required before public beta.
- Neon is the initial PostgreSQL provider; production tier follows cold-start, backup/restore and cost measurement.
- Cloudinary is selected for public media and conditionally for authenticated private documents.
- Core MVP uses HTTPS and bounded polling, not WebSockets.

## Package contents

| Document | Purpose | Status |
|---|---|---|
| `01-final-product-requirements.md` | Product scope, personas, requirements and non-goals | Complete draft |
| `02-information-architecture-and-workflows.md` | Navigation and end-to-end user flows | Complete draft |
| `03-accounting-inventory-and-commerce-rulebook.md` | Accounting, costing, procurement, stock and order rules | Complete draft |
| `04-technical-architecture-and-data-model.md` | System boundaries, data model, APIs and infrastructure | Complete draft |
| `05-implementation-backlog-and-milestones.md` | Dependency backlog, estimates and dates | Complete draft |
| `06-acceptance-tests-and-launch-gates.md` | Test matrix and automatic no-go rules | Complete draft |
| `07-pricing-validation-and-metrics.md` | Plans, experiments, activation and retention | Complete draft |
| `08-launch-operations.md` | Providers, support, legal, beta and incident operations | Complete draft |
| `09-final-planning-closeout.md` | Decisions, assumptions, risks and provisional recommendation | Reopened |
| `10-backend-and-deployment-decision.md` | Stack comparison, deployment options and decision record | Go selected; provider tiers pending |
| `11-money-payments-external-parties-and-runtime.md` | Minor-unit money, allocations, guest portal, realtime and selected providers | Authoritative decision |

## Completion rule

Planning is complete only when all eleven documents exist, contradictions with the older plan are explicitly resolved, paid provider tiers and backup/restore operation are recorded, remaining external dependencies are named, and the final closeout declares whether the December 1 target is feasible as public or invite-only beta.
