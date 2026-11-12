# Rekordly v2 Go/No-Go

- **Decision**: **GO for Controlled Invite-Only Beta** (Delay broad public paid launch until Render/Neon production provisioning + legal sign-off complete)
- **Date/time/timezone**: 2026-11-12 14:15 WAT (Africa/Lagos)
- **Founder/approver**: Founder / Engineering Lead
- **Frontend/API/worker build**: `0324830` + Blueprint 19 acceptance matrix
- **Database schema/migration**: `000057_blueprint_18_catalogue_review_and_consumption.sql`
- **Environment/provider tiers**: Local Docker verified (`rekordly-api`, `rekordly-worker`, `rekordly-postgres`, `rekordly-mailpit`); `render.yaml` & CI/CD ready for Staging/Production
- **Enabled modules/flags**: Core Identity/Workspaces/Exports/Deletion, Personal Finance, AI/Imports (draft-only), Sales/Payments, Inventory/Procurement, Storefront/Domains, Offline Cached Read & Drafts (`draft_only`). Disabled: `offline.queued_writes.enabled=false`, `billing.paid_checkout.enabled=false` (`controlled_beta`).
- **G0 summary**: All automated G0 gates (`G0-01` through `G0-05`) **passed** with zero tenant leaks, zero unbalanced journals, and verified deletion recovery.
- **G1 summary**: Enabled modules **passed**; `offline.queued_writes.enabled` and `billing.paid_checkout.enabled` remain safely disabled server-side.
- **Backup/restore**: Automated logical backup rehearsal & deletion tombstone replay verified (`status=verified`).
- **Reconciliation**: Zero unbalanced posted journals (`unbalanced_journals_count=0`).
- **Security/privacy/legal/support**: Redaction, CSV formula sanitization, recent-auth step-up, and scoped support access verified; external legal review pending before broad public launch.
- **Known G2 issues/workarounds**: Documented in [known-issues.md](./known-issues.md).
- **Cohort/support/cost capacity**: Bounded `controlled_beta` cohort; Africa/Lagos support hours published.
- **Decision reasons**: All G0 integrity, security, ownership, and recoverability invariants are proven green on the release candidate; broad public paid launch awaits external Render/Neon provisioning and legal sign-off.
- **Next review date**: 2026-12-01
