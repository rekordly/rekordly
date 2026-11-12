# Rekordly v2 Operational Runbooks (Blueprint 17)

## 1. Environment Separation
- **Local**: Synthetic fixtures only (`ENVIRONMENT=local`, local Docker PostgreSQL). Never connects to production hosts.
- **CI**: Ephemeral PostgreSQL container (`ENVIRONMENT=test`), deterministic mocks only.
- **Staging**: Separate Neon branch, Cloudinary folder, Resend test mode, Paystack test keys, labelled staging origins.
- **Production**: Render paid always-on `rekordly-api` + separate paid `rekordly-worker` + Neon production PostgreSQL + independent encrypted logical backups.

## 2. Secret Inventory (No Secret Values)
| Secret | Owner | Consumer | Rotation Cadence | Recovery Path |
|---|---|---|---|---|
| `DATABASE_URL` | Platform | API, Worker, Migrate | 90 days / incident | Neon console role rotation |
| `JWT_SIGNING_SECRET` | Security | API, Worker | 90 days / incident | Overlap verification window or deliberate session revocation |
| `RESEND_API_KEY` & `EMAIL_WEBHOOK_SECRET` | Comms | API, Worker | 90 days | Resend dashboard |
| `PAYSTACK_SECRET_KEY` & `PAYSTACK_WEBHOOK_SECRET` | Billing | API | 90 days | Paystack dashboard |
| `CLOUDINARY_API_KEY` & `CLOUDINARY_API_SECRET` | Storage | API, Worker | 90 days | Cloudinary console |
| `GEMINI_API_KEY` & `DEEPSEEK_API_KEY` | AI | API | 90 days | Google AI Studio / DeepSeek |
| `ADMIN_OPS_TOKEN` | Ops | API `/admin/ops` | 30 days / personnel change | Reissue in Render env |

## 3. Secret Rotation Procedure
1. Create new secret version in provider.
2. Deploy overlap/dual verification where supported.
3. Verify health (`/health/ready`) and provider calls.
4. Revoke old secret in provider.
5. Confirm old secret fails safely.
6. Record rotation in audit/inventory.

## 4. Deployment & Rollback Sequence
1. Verify staging smoke tests and financial reconciliation.
2. Verify latest PostgreSQL logical backup checksum.
3. Run compatible expand migration (`rekordly-migrate`).
4. Deploy `rekordly-worker`, then `rekordly-api`, then Next.js frontend.
5. Verify `/health/live`, `/health/ready`, and `POST /v1/admin/ops/reconcile`.
6. **Rollback**: Only if previous release is schema/state compatible. Otherwise, enable kill switch / `read_only` maintenance mode, preserve reads/exports, and forward-fix. Never restore an old DB snapshot over live user transactions.

## 5. Incident Response Runbooks
- **SEV-0 Cross-Tenant / Security Incident**: Immediately set maintenance mode to `emergency_security_lock` via `PUT /v1/admin/ops/maintenance`, revoke affected sessions, preserve audit/forensic state, notify affected owners.
- **Accounting / Stock Reconciliation Failure**: Enable kill switch on affected write flag, run `POST /v1/admin/ops/reconcile`, use reviewed domain reversals/adjustments only (never edit posted ledger rows).
- **Provider Outage (Cloudinary / Resend / AI / Paystack)**: API/worker degrade gracefully per Blueprint 17 §12 — financial posting remains independent of email/PDFs; AI falls back to manual entry; Paystack pauses checkout/verification safely.
- **Backup & Restore**: Restore PostgreSQL + Cloudinary inventory into isolated environment, replay `deletion_tombstones`, run `POST /v1/admin/ops/backups/rehearse`, verify RPO/RTO and zero unbalanced journals before promoting.

## 6. December Controlled Beta Go / No-Go Checklist
- [ ] Render paid `rekordly-api` and `rekordly-worker` active
- [ ] Neon production pool & independent logical backup verified
- [ ] Isolated restore + deletion tombstone replay rehearsed
- [ ] MFA enabled on GitHub, Render, Neon, Cloudinary, Resend, Paystack
- [ ] Privacy policy, terms, support hours (Africa/Lagos), and beta limitations published
