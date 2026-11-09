# Rekordly v2 Launch Operations

**Prepared:** 7 November 2026  
**Launch authority/support owner:** Founder  
**Target:** 1 December 2026 controlled public beta; invite-only fallback

## 1. Operating model

The founder owns engineering, support and final go/no. This creates a concentration risk. Operations must be simple, documented and automated where possible.

## 2. External readiness record

Founder reports production-capable accounts are available for:

- Frontend hosting
- API/worker hosting
- PostgreSQL
- Object storage
- Email
- Monitoring/error tracking
- AI provider
- Paystack

Before use, verify account ownership, billing, commercial terms, spend limits, MFA and recovery contacts. Never record secret values in Markdown or Git.

## 3. Environment separation

Required environments:

- Local development
- Staging with synthetic/non-production data
- Production

Each environment has separate database, storage, secrets, AI keys/limits and email behavior. Staging must not send real customer messages accidentally.

## 4. Domain and DNS operations

Required:

- `rekordly.com` frontend
- `api.rekordly.com` production API
- `staging-api.rekordly.com` staging API
- Wildcard storefront DNS/TLS for `*.rekordly.com`
- Reserved storefront slugs
- DNS access recovery and documented owner

Custom-domain workflow must include verification, TLS status, retry and disconnect handling. Rekordly does not initially register domains.

## 5. Email and WhatsApp support

Launch support channels:

- Public support email
- WhatsApp support during published hours

Publish:

- Support hours and timezone
- Expected first-response target
- Emergency/security contact path
- What information users should never send through support

Suggested beta targets:

- Critical access/data issue: acknowledge within 2 hours during support hours
- Core workflow blocker: within 8 support hours
- General question: within 2 business days

Do not promise 24/7 support as a solo founder.

## 6. Support workflow

Every request receives:

- Ticket/reference
- Workspace-safe identity verification
- Category and severity
- Reproduction/evidence without asking for passwords/OTPs
- Owner/status
- Resolution or known limitation

Severity:

- **SEV-0:** cross-tenant/security exposure, data loss, widespread corrupt journals/stock
- **SEV-1:** posting, login, export or restore failure affecting multiple users
- **SEV-2:** important workflow failure with workaround
- **SEV-3:** question, cosmetic issue or enhancement

## 7. Incident response

### Immediate actions

1. Detect/receive report.
2. Classify severity.
3. Stop unsafe writes or hide affected module through feature flag.
4. Preserve logs/evidence.
5. Assess tenant/data scope.
6. Communicate factual status.
7. Fix/rollback/forward recover.
8. Reconcile affected journals/stock.
9. Notify affected users and authorities where legally required.
10. Write post-incident review.

Never “fix” financial corruption by directly editing production rows without an auditable recovery plan.

## 8. Monitoring and alerting

Monitor:

- Frontend/API availability
- Error rate and latency
- Authentication/OTP failures
- Database connections/storage
- Queue depth/failures
- Financial posting errors
- Journal imbalance attempts
- Inventory reconciliation failures
- Export/PDF failures
- Backup age/restore status
- AI spend/rate limit/provider failures
- Domain verification/TLS failures

Critical alerts go to the founder through at least two reliable channels where possible.

## 9. Backup and recovery

Before beta:

- Automated database backup enabled
- Retention documented
- Object-storage protection documented
- Isolated restore completed
- Restored tenant access, journals, inventory, attachments and reports verified
- Recovery steps stored outside the production system

Define provider-specific RPO/RTO after infrastructure selection. Do not advertise guarantees not yet measured.

## 10. Deployment and change management

- Main branch is protected by required checks where available.
- Production migrations are reviewed and backed up.
- Use expand/migrate/contract for incompatible changes.
- Deploy during periods when founder can monitor.
- Keep rollback/forward recovery plan.
- Feature-flag incomplete modules.
- Code freeze begins 26 November except critical fixes.
- Release candidate is dated and immutable except documented fixes.

## 11. Security operations

- MFA on provider/registrar/source accounts
- Least-privilege access
- Secret rotation/revocation procedure
- Dependency/container alerts
- Vulnerability reporting contact
- Session revocation capability
- Audit log review
- Data-access/support impersonation policy
- No production database browsing for routine support without reason/audit

## 12. Legal and policy readiness

Founder will use reviewed templates initially. Required before any public beta:

- Privacy policy
- Terms of use
- Beta limitation language
- Data-processing and deletion explanation
- Cookie/analytics disclosure where applicable
- Financial/tax disclaimer
- AI disclosure and confirmation rule
- Support contact
- Pricing/renewal/refund terms before charging
- Storefront merchant/customer responsibility terms

Professional legal review remains recommended before paid/general availability.

## 13. Beta cohort operations

Founder can recruit more than ten beta users/businesses.

Required cohort record:

- Participant name/contact stored securely outside public planning docs
- Segment and use case
- Consent to beta terms
- Expected workflow
- Onboarding date
- Feedback/support history
- Activation and retention status

Target mix:

- Personal users
- Freelancers/service providers
- Inventory businesses
- At least one multi-outlet candidate if available
- At least one accountant/bookkeeper reviewer; target two

## 14. Accountant review plan

None currently secured. By 15 November:

1. Contact Nigerian accountants/bookkeepers serving SMEs.
2. Share deterministic anonymized fixtures, not user data.
3. Request review of chart, journals, VAT/WHT, statements, inventory/GRNI and corrections.
4. Record disagreements/changes.
5. Keep professional reports beta-labelled if review remains incomplete.

## 15. Onboarding operations

- Short beta welcome and limitation statement
- Guided Personal/Business choice
- Synthetic/demo option before real data where helpful
- Clear support link
- Import/template guidance
- First-value checklist
- Consent before receiving research contact

The founder should observe early onboarding sessions rather than relying only on analytics.

## 16. Feedback loop

Collect:

- In-product feedback with safe category/severity
- Scheduled weekly interviews
- Support themes
- Activation/drop-off analytics
- Reconciliation/quality metrics
- Pricing intent after users experience value

Triage:

- Integrity/security defects first
- Activation blockers second
- Repeated high-value usability issues third
- New feature requests remain outside scope until reviewed

## 17. Documentation required at launch

- Getting started
- Personal versus Business spaces
- Record income/expense/transfer
- AI drafts and confirmation
- Invoice/payment basics
- Inventory/procurement docs only if enabled
- Storefront/order docs only if enabled
- Export and downgrade
- Delete account and 60-day grace period
- Privacy/security/support
- Known beta limitations

## 18. Cost controls

Monthly infrastructure/AI budget is under ₦50,000.

Controls:

- Provider hard/soft spend alerts
- Bounded AI credits and input/output size
- Storage/file limits
- Log/backup retention policies
- Worker concurrency bounds
- No unlimited plan language
- Weekly cost-per-active-user review
- Disable noncritical expensive automation before exceeding ceiling

Cost controls must not delete owned records or disable export.

## 19. December 1 go/no meeting

Founder reviews:

- G0/G1 acceptance evidence
- Enabled module list
- Restore proof
- Reconciliation reports
- Security/permissions
- Support and policies
- Known issues
- Cohort readiness
- Monitoring/alerts

Outputs one decision:

- Public controlled beta
- Invite-only beta with named enabled modules
- Delay

Record decision, reasons, build and timestamp.

## 20. Invite-only fallback operations

- Feature flags hide incomplete inventory/procurement/storefront modules.
- Invite list is explicit.
- Users receive exact scope/limitations.
- Support load is capped.
- No paid promise for hidden features.
- Export and safe account deletion remain.
- Weekly go/no reassessment uses acceptance evidence.

## 21. First 72 hours

- Founder actively monitors alerts, support and reconciliation.
- No major new deployment except critical fix.
- Daily backup verification.
- Daily cohort check-in summary.
- Review AI spend and error rate.
- Pause affected module immediately on integrity signal.

## 22. First 30 days

- Weekly retention/activation review
- Weekly cost review
- Weekly known-issue and scope review
- Accountant feedback incorporation
- Pricing interviews after value experience
- Decide whether to broaden access, remain invite-only or revise roadmap
