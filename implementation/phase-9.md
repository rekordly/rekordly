# Phase 9: MVP Launch

**Goal:** Launch the public MVP. Users can start clean in V2 while still accessing V1 history. The product is commercially live with production infrastructure, monitoring, and safety controls.

**Planning References:** `01-v1-overview.md`, `08-infrastructure.md`, `09-security.md`, `12-roadmap.md`, `13-tech-stack-and-libraries.md`

**Build Order:** This phase is DevOps and launch operations. The sequence proceeds from infrastructure provisioning → secrets configuration → V1 transition → health verification → monitoring setup → public launch → post-launch operations.

---

## Section 1: Summary Table

| ID | Work Item | Owner Area | Acceptance Criteria |
|----|-----------|------------|---------------------|
| P9-01 | Production deploy: Vercel (Next.js frontend) | DevOps | `rekordly.com` loads the app shell, login page, and PWA manifest; Lighthouse PWA score ≥ 90. |
| P9-02 | Production deploy: Northflank (Go API + Worker) | DevOps | `api.rekordly.com` health/readiness endpoints return 200; worker processes queue with bounded concurrency. |
| P9-03 | Production PostgreSQL setup on Northflank | DevOps | PostgreSQL 16.x running with encryption at rest, automated daily backups, and all migrations applied. |
| P9-04 | Paystack live keys configuration | DevOps | Live public/secret keys configured; subscription plans created in Paystack; webhook URL set; test transaction verified. |
| P9-05 | AI live keys with strict per-user/per-plan limits | DevOps | OpenAI live key configured; per-plan AI credits and rate limits in feature_limits; daily spend cap and alerts set. |
| P9-06 | Production email provider setup | DevOps | SMTP configured with DKIM/SPF/DMARC; OTP email delivery verified; rate limits on email sending. |
| P9-07 | PWA push notification provider setup | DevOps | VAPID keys configured; push subscription endpoint working; test notification delivered to browser. |
| P9-08 | Production backups configured and restore-tested | DevOps | Daily automated backups with 7/4/3 retention; full restore verified within 30-minute RTO; runbook documented. |
| P9-09 | Health/readiness monitoring setup | DevOps | Uptime monitor pings health endpoint every 60s; alert on 2 consecutive failures; dashboard shows latency/error metrics. |
| P9-10 | Error, queue, DLQ, webhook, AI usage monitoring | DevOps | Alerts configured for 5xx spikes, queue backlog, DLQ growth, webhook failures, AI spend spikes, and plan-limit blocks. |
| P9-11 | V1 read-only transition | DevOps / Backend | V1 writes return 403; V1 login and CSV export still work; V2 launch banner displayed in V1. |
| P9-12 | Production CORS configuration | DevOps / Backend | CORS allows only `rekordly.com` origins; no wildcard on any route; environment-specific enforcement. |
| P9-13 | Production secrets lockdown | DevOps | All secrets in provider stores; no .env files committed; cross-environment isolation verified; no secrets in git history. |
| P9-14 | Post-deploy health checks | DevOps | Automated smoke test script runs after deploy; all endpoints return expected status; rollback procedure documented. |
| P9-15 | Launch announcement / user communication | Product / DevOps | V1 banner, email to users, social media posts, landing page update, help/FAQ page, and support channel all live. |
| P9-16 | Post-launch monitoring runbook | DevOps | Runbook covers health URLs, metric targets, alert response procedures, escalation contacts, and rollback steps. |

---

## Section 2: Detailed Descriptions

---

### P9-01: Production Deploy — Vercel (Next.js Frontend)

**Description:**
Deploy the Next.js frontend to Vercel with custom domain, PWA support, and environment-specific configuration. The frontend owns UI, auth screens, PWA shell, offline queue, and frontend routing. This deployment must serve `rekordly.com` with HTTPS, valid PWA manifest, and proper environment variables pointing to the production Go API. Per Doc 08: Next.js deployed on Vercel; domain: `rekordly.com`; owns UI, public pages, auth screens, PWA shell, offline queue, and frontend routing.

**Technical Details:**

**Vercel Project Setup:**

| Setting | Value |
|---|---|
| Project source | GitHub `main` branch |
| Build command | `npm run build` |
| Output directory | `.next` |
| Framework preset | Next.js |
| Node.js version | `20.x LTS` |

**Custom Domain Configuration:**
1. Add `rekordly.com` domain in Vercel dashboard
2. Configure DNS records at domain registrar:
   - A record or CNAME pointing to Vercel's assigned target
3. SSL/TLS auto-provisioned by Vercel
4. Verify `https://rekordly.com` loads correctly

**Environment Variables (Vercel Dashboard):**

| Variable | Value | Notes |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `https://api.rekordly.com` | Production API endpoint |
| `NEXT_PUBLIC_APP_URL` | `https://rekordly.com` | Production frontend URL |
| `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` | `pk_live_xxx` | Paystack live public key (client-side) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | `BPxxx...` | VAPID public key for push notifications |

**Preview Deployments:**
- PRs automatically deploy previews pointing to `staging-api.rekordly.com`
- Production deployment auto-triggers on merge to `main`

**Verification Checklist:**
1. `rekordly.com` loads the app shell with login page
2. PWA manifest at `/manifest.json` returns valid JSON
3. Service worker registered in browser DevTools
4. Lighthouse PWA audit score ≥ 90
5. HTTPS enforced — HTTP redirects to HTTPS
6. All environment variables accessible (check `/api/v1/health` proxy or client config)
7. Preview deployments work for PRs

**Acceptance Criteria:**
- [ ] `rekordly.com` loads the app shell and login page over HTTPS
- [ ] `manifest.json` served with correct content type and valid PWA configuration
- [ ] Service worker registered and caching resources
- [ ] Lighthouse PWA score ≥ 90
- [ ] Preview deployments enabled for PRs with staging API
- [ ] Production deployment auto-triggers on merge to `main`
- [ ] All environment variables set and accessible

---

### P9-02: Production Deploy — Northflank (Go API + Worker)

**Description:**
Deploy the Go API and Go Worker as Dockerized services on Northflank. The API serves all business logic on `api.rekordly.com`, while the worker processes background jobs (PDF generation, exports, notifications, heavy AI parsing) from the Postgres-backed queue. Both services must have health checks, bounded concurrency, and proper secret injection. Per Doc 08: Go API deployed as Dockerized service on Northflank; Go worker as separate Dockerized service; domain: `api.rekordly.com`.

**Technical Details:**

**Go API Service:**

| Setting | Value |
|---|---|
| Docker image | Built in GitHub Actions, pushed to Northflank container registry |
| Port | `8080` |
| Health check | `GET /api/v1/health` every 30s |
| Readiness check | `GET /api/v1/ready` every 30s |
| Auto-scaling | Min 1, max 3 instances |
| Environment | All secrets from Northflank secret store (see P9-13) |

**Go Worker Service:**

| Setting | Value |
|---|---|
| Docker image | Built in GitHub Actions, pushed to Northflank container registry |
| Public port | None (internal service) |
| Function | Processes Postgres-backed job queue |
| Concurrency | 3-5 goroutines (bounded) |
| Queue sleep | 5 seconds when empty (no tight polling) |
| Job timeout | 60s for AI parsing, 120s for PDF/export |
| Retry backoff | 1min → 5min → 15min |
| Max retries | 3 |
| Failed jobs | Move to `failed_jobs` table (DLQ) |

**Custom Domain Configuration:**
1. Configure `api.rekordly.com` DNS pointing to Northflank API service
2. SSL/TLS auto-provisioned by Northflank
3. Verify `GET https://api.rekordly.com/api/v1/health` returns `200`
4. Verify `GET https://api.rekordly.com/api/v1/ready` returns `200` with database connectivity confirmed

**Worker Guardrails (Ref: Doc 08 §Worker and Queue Guardrails):**
- No tight infinite polling loops
- Sleep 5 seconds when queue is empty
- Bounded worker pool (3-5 goroutines)
- `context.WithTimeout` on every job execution
- Exponential backoff on retry: 1min → 5min → 15min
- Max 3 retries before DLQ
- Failed jobs never dropped silently
- Failed jobs never retry forever

**Verification:**
1. API responds to health/readiness checks
2. API authenticates requests and enforces workspace scoping
3. Worker processes a test job from the queue
4. Worker logs heartbeat every 60 seconds with goroutine count, queue depth, DLQ count
5. API error rate < 1% under normal load

**Acceptance Criteria:**
- [ ] Go API serves `GET /api/v1/health` → 200 and `GET /api/v1/ready` → 200
- [ ] `api.rekordly.com` resolves with valid SSL/TLS
- [ ] Go Worker processes jobs from Postgres-backed queue
- [ ] Worker bounded to 3-5 goroutines
- [ ] Worker sleeps 5s when queue is empty
- [ ] Job timeouts enforced (60s AI, 120s PDF/export)
- [ ] Retry backoff: 1min → 5min → 15min with max 3 retries
- [ ] Failed jobs move to DLQ, not dropped silently
- [ ] Worker logs heartbeat with queue metrics every 60s

---

### P9-03: Production PostgreSQL Setup on Northflank

**Description:**
Provision the production PostgreSQL database on Northflank with encryption at rest, automated backups, network isolation, and all migrations from Phases 1-7 applied. This is the single source of truth for all financial data — tenant data, ledger entries, plans, usage counters, jobs, idempotency keys, audit logs, and notification records. Per Doc 08: PostgreSQL on Northflank for MVP; separate databases per environment; encryption at rest required; automated backups required. Per Doc 09: PostgreSQL must use encryption at rest; all database backups must use encryption at rest.

**Technical Details:**

**Database Provisioning:**

| Setting | Value |
|---|---|
| Provider | Northflank managed PostgreSQL |
| Version | PostgreSQL 16.x |
| Database name | `rekordly_production` |
| Application user | `rekordly_app` |
| User privileges | SELECT, INSERT, UPDATE on application tables; no SUPERUSER |

**Connection Pooling (Go API):**

| Setting | Value |
|---|---|
| Library | `pgxpool` (github.com/jackc/pgx/v5/pgxpool) |
| Max connections | 25 |
| Min connections | 5 |
| Connection timeout | 30 seconds |

**Encryption at Rest:**
- Verify Northflank provides encryption at rest for managed PostgreSQL
- Check provider documentation and confirm encryption is enabled
- If Northflank does not provide it by default, enable it in the database configuration

**Automated Backups:**
- Enable daily automated backups
- 7-day retention for daily backups
- Verify backup schedule in Northflank dashboard

**Network Configuration:**
- Database accessible only from Northflank internal network
- API and worker services can reach the database
- No public IP — database not accessible from the internet
- Connection string stored as secret in Northflank secret store

**Migration Execution:**
- Run `golang-migrate` against production database as CI/CD pre-deploy step
- All migrations from Phases 1-7 applied in order
- Verify `schema_migrations` table shows all version numbers in sequence
- Failed migrations block deployment

**Seed Production Plans:**
Insert plan rows into `plans` table:

| Plan Name | Price | Provider Plan Code |
|---|---|---|
| Free | NGN 0 | (none) |
| Starter | NGN 2,500/mo | `starter_monthly` |
| Business | NGN 6,000/mo | `business_monthly` |
| Pro | NGN 12,000/mo | `pro_monthly` |

Insert corresponding `feature_limits` rows per Doc 10 user-to-feature matrix.

**Acceptance Criteria:**
- [ ] PostgreSQL 16.x running on Northflank with `rekordly_production` database
- [ ] Application user has scoped privileges (no SUPERUSER)
- [ ] Encryption at rest verified/enabled
- [ ] Automated daily backups with 7-day retention configured
- [ ] Database not publicly accessible (internal network only)
- [ ] All migrations from Phases 1-7 applied and verified
- [ ] Plan and feature_limits seed data inserted correctly
- [ ] Connection pooling configured in Go API with pgxpool

---

### P9-04: Paystack Live Keys Configuration

**Description:**
Configure Paystack live keys for production subscription payments. This includes setting up the public key (client-side checkout), secret key (server-side API calls), webhook secret (signature verification), and creating subscription plans in the Paystack dashboard that map to internal plan codes. Per Doc 08: Paystack live keys; payment provider keys separated by environment. Per Doc 09: production secrets must never be used in staging or locally.

**Technical Details:**

**Environment Variables:**

| Variable | Location | Value |
|---|---|---|
| `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` | Vercel env vars | `pk_live_xxx` (client-side checkout) |
| `PAYSTACK_SECRET_KEY` | Northflank API secret store | `sk_live_xxx` (server-side API calls) |
| `PAYSTACK_WEBHOOK_SECRET` | Northflank API secret store | `whk_live_xxx` (signature verification) |

**Paystack Dashboard Configuration:**

| Setting | Value |
|---|---|
| Webhook URL | `https://api.rekordly.com/api/v1/webhooks/payment-provider` |
| Webhook events | `subscription.create`, `subscription.disable`, `subscription.enable`, `charge.success`, `invoice.payment_failed` |

**Subscription Plans in Paystack Dashboard:**

| Plan Name | Plan Code | Amount | Currency | Interval |
|---|---|---|---|---|
| Starter Monthly | `starter_monthly` | 250,000 kobo | NGN | Monthly |
| Business Monthly | `business_monthly` | 600,000 kobo | NGN | Monthly |
| Pro Monthly | `pro_monthly` | 1,200,000 kobo | NGN | Monthly |

**Plan Code Mapping:**
- Map `plan_code` values to `plans.provider_plan_code` column in production database
- Used by `ApplySubscriptionEvent()` to resolve Paystack events to internal plans

**Test Verification:**
1. Process a test live transaction using Paystack test card on staging first
2. Verify webhook delivery to `api.rekordly.com/api/v1/webhooks/payment-provider`
3. Verify signature validation works with live webhook secret
4. Verify subscription state updates in `subscriptions` and `workspaces` tables

**Cross-Environment Isolation (Ref: Doc 09):**
- Never use test keys in production
- Never use live keys in staging or local
- Paystack test mode keys only in staging environment
- Production keys stored only in production secret stores

**Acceptance Criteria:**
- [ ] Live public key configured in Vercel environment variables
- [ ] Live secret key and webhook secret configured in Northflank secret store
- [ ] Webhook URL configured in Paystack dashboard with all 5 event types
- [ ] Three subscription plans created in Paystack with correct amounts and codes
- [ ] Plan codes mapped to `plans.provider_plan_code` in production database
- [ ] Test live transaction processes successfully
- [ ] Webhook delivery and signature verification confirmed
- [ ] No test keys in production; no live keys in staging/local

---

### P9-05: AI Live Keys with Strict Per-User/Per-Plan Limits

**Description:**
Configure the OpenAI live API key with strict per-user and per-plan rate limits, input truncation, and cost monitoring. AI is a cost center that must be tightly controlled from day one — Free users get minimal credits, paid users get more, and all usage is tracked and alertable. Per Doc 08: AI live keys with strict per-user and per-plan limits. Per Doc 09: enforce per-user and per-plan AI rate limits; enforce plan limits before or atomically with provider calls; truncate input before sending to AI provider.

**Technical Details:**

**Environment Variables:**

| Variable | Location | Value |
|---|---|---|
| `OPENAI_API_KEY` | Northflank API secret store | `sk-live-xxx` |

**Per-Plan AI Credit Limits (configured in `feature_limits` table):**

| Plan | AI Credits/Month | Per-Minute Rate Limit |
|---|---|---|
| Free | 10 | 5 requests/min |
| Starter | 100 | 10 requests/min |
| Business | 500 | 20 requests/min |
| Pro | 1000 | 30 requests/min |

**Input Truncation:**
- Max 2000 characters per `POST /api/v1/ai/parse-entry` request
- Truncation happens before sending to OpenAI
- `ai_audit_logs.input_length` stores original length
- Only truncated text sent to provider

**Daily Spend Cap:**
- Configure OpenAI API usage limit in provider dashboard
- Set alert at 80% of monthly budget
- Log AI provider cost per request in `ai_audit_logs`
- Aggregate daily spend per plan tier
- Alert if daily spend exceeds 2x rolling 7-day average

**Cost Monitoring Configuration:**

| Metric | Alert Threshold |
|---|---|
| Daily AI spend | > 2x rolling 7-day average |
| Provider error rate | > 10% over 5 minutes |
| Per-user usage spike | > 3x average daily usage |
| Rate limit events | Spike in 429 responses |

**Sandbox Keys for Staging/Local (Ref: Doc 08):**
- Verify staging uses separate sandbox/low-limit AI keys
- Local development uses developer-limited credentials
- Never use production AI keys in staging or local

**Acceptance Criteria:**
- [ ] OpenAI live key configured in Northflank API secret store
- [ ] Per-plan AI credit limits configured in `feature_limits` table
- [ ] Per-minute rate limits enforced in API middleware
- [ ] Input truncation to 2000 characters before LLM call
- [ ] Daily spend cap and 80% budget alert configured in provider dashboard
- [ ] AI cost per request logged in `ai_audit_logs`
- [ ] Alerts configured for spend spikes and provider errors
- [ ] Staging/local use separate sandbox keys — never production AI key

---

### P9-06: Production Email Provider Setup

**Description:**
Configure the production SMTP email provider for OTP delivery and notifications. Email is the primary authentication channel (MVP uses email OTP, not SMS) and a core notification channel for budget alerts, subscription confirmations, and invoice notifications. Per Doc 08: production email provider. Per Doc 13: `github.com/wneessen/go-mail` v0.4+ for SMTP email delivery.

**Technical Details:**

**Environment Variables:**

| Variable | Location | Value |
|---|---|---|
| `SMTP_HOST` | Northflank API secret store | Production SMTP server hostname |
| `SMTP_PORT` | Northflank API secret store | `587` (TLS) or `465` (SSL) |
| `SMTP_USER` | Northflank API secret store | Authenticated SMTP username |
| `SMTP_PASSWORD` | Northflank API secret store | Authenticated SMTP password |

**Provider:** `github.com/wneessen/go-mail` v0.4+

**Sender Domain Configuration:**
- Configure DKIM record for `rekordly.com` at DNS registrar
- Configure SPF record authorizing SMTP provider to send on behalf of `rekordly.com`
- Configure DMARC record for email authentication policy
- Verify DNS propagation and email authentication (use mail-tester.com or similar)

**Email Templates:**

| Template | Trigger | Key Content |
|---|---|---|
| OTP Verification | `POST /api/v1/auth/request-otp` | 6-digit OTP code, expiry notice, branding |
| Budget Alert | Budget threshold reached | Budget name, current spend, limit, warning level |
| Subscription Confirmation | Successful payment | Plan name, amount, next billing date |
| Subscription Cancellation | `POST /api/v1/billing/cancel` | Effective date, data retention assurance |
| Invoice Sent | Invoice shared | Invoice number, amount, customer name, link |

**Rate Limits:**
- Max 10 OTP emails per address per hour (prevents abuse)
- General email sending rate-limited to prevent spam
- Email queue with retry on provider failure

**Fallback Behavior:**
- If email provider is down: OTP requests should queue and retry with backoff (1min → 5min → 15min)
- Do NOT silently fail — return error to user if email cannot be sent after retries
- Log email delivery failures for monitoring

**Test:**
- Send test OTP email to a real email address
- Verify delivery and formatting (DKIM pass, SPF pass)
- Verify OTP code matches what's stored in the database (hashed)

**Acceptance Criteria:**
- [ ] SMTP credentials configured in Northflank API secret store
- [ ] DKIM, SPF, and DMARC records configured and verified
- [ ] OTP email delivers successfully to real addresses
- [ ] Email authentication passes (DKIM, SPF, DMARC)
- [ ] Rate limiting prevents OTP abuse (max 10/hour per address)
- [ ] Fallback: email queue retries on provider failure with backoff
- [ ] All 5 email templates configured and tested
- [ ] No SMTP credentials in code or environment files

---

### P9-07: PWA Push Notification Provider Setup

**Description:**
Configure Web Push notifications using VAPID keys for server-side push delivery and client-side subscription management. Push notifications are one of the three MVP notification channels (email, PWA push, in-app) for budget alerts, subscription updates, and sync notifications. Per Doc 08: PWA push notification provider. Per Doc 13: `github.com/SherClockHolmes/webpush-go` v1.3+ for server-side, `web-push` v3.6+ for client-side.

**Technical Details:**

**Environment Variables:**

| Variable | Location | Value |
|---|---|---|
| `VAPID_PUBLIC_KEY` | Vercel env vars (prefixed `NEXT_PUBLIC_`) | `BPxxx...` (client-side) |
| `VAPID_PUBLIC_KEY` | Northflank API secret store | `BPxxx...` (server-side) |
| `VAPID_PRIVATE_KEY` | Northflank API secret store | `xxx...` (server-side only) |
| `VAPID_SUBJECT` | Northflank API secret store | `mailto:hello@rekordly.com` |

**Key Generation:**
```bash
npx web-push generate-vapid-keys
```
- Store public key in both Vercel and Northflank
- Store private key ONLY in Northflank (never client-facing)

**Server-Side:** `github.com/SherClockHolmes/webpush-go` v1.3+
- Used by Go API to send push notifications
- Subscriptions stored in `notification_deliveries` table with `channel = 'pwa_push'`

**Client-Side:** `web-push` v3.6+
- Used by Next.js frontend to register push subscriptions
- Service worker handles incoming push events and displays notifications

**Push Subscription Endpoint:**

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | /api/v1/notifications/push/subscribe | Required | Register browser push subscription |

**Request Payload:**
```json
{
  "endpoint": "https://fcm.googleapis.com/fcm/send/xxx",
  "keys": {
    "p256dh": "BNxxx...",
    "auth": "xxx..."
  }
}
```

**Processing:**
1. Store subscription endpoint and keys for the authenticated user
2. When a notification needs to be sent via push, use `webpush-go` to send to all registered subscriptions for the user
3. Track delivery status in `notification_deliveries` table

**Graceful Failure:**
- If push delivery fails (expired subscription, revoked permission): mark `notification_deliveries.status = 'failed'`
- Fall back to in-app notification (always delivered)
- Do not retry failed push deliveries indefinitely

**Test:**
1. Subscribe a browser to push notifications
2. Send test push notification from Go API
3. Verify notification appears in browser
4. Verify `notification_deliveries` record created with `channel = 'pwa_push'`, `status = 'delivered'`

**Acceptance Criteria:**
- [ ] VAPID keys generated and stored correctly (public in Vercel + Northflank, private only in Northflank)
- [ ] Push subscription endpoint stores browser subscription data
- [ ] Test push notification delivered to subscribed browser
- [ ] `notification_deliveries` records created with correct channel and status
- [ ] Failed push deliveries fall back to in-app notification
- [ ] Private key never exposed to client-side code

---

### P9-08: Production Backups Configured and Restore-Tested

**Description:**
Configure automated daily backups for the production PostgreSQL database with proper retention, encryption, and a verified restore procedure. The restore must be tested before launch to ensure RTO targets are met and data integrity is maintained. Per Doc 08: production PostgreSQL requires automated backups; backup restore should be tested before launch; disaster recovery prioritizes restoring PostgreSQL first. Per Doc 09: database backups are required for production; backups must be encrypted.

**Technical Details:**

**Backup Configuration:**

| Setting | Value |
|---|---|
| Frequency | Daily (automated) |
| Retention | 7 daily + 4 weekly + 3 monthly |
| Encryption | All backup files encrypted at rest |
| Monitoring | Alert if daily backup fails or is missed |
| Provider | Northflank backup mechanism |

**Restore Test Procedure (Pre-Launch):**

| Step | Action | Verification |
|---|---|---|
| 1 | Trigger manual backup via Northflank | Backup file exists in storage with timestamp |
| 2 | Select backup for restore | Backup selected in Northflank dashboard |
| 3 | Restore to new temporary database instance | Fresh PostgreSQL running from backup |
| 4 | Verify row counts on critical tables | `SELECT COUNT(*)` matches production on: transactions, ledger_entries, invoices, payments, customer_wallets, customer_wallet_ledger, loans, users, workspaces, subscriptions |
| 5 | Verify application connectivity | API connects to restored DB; `GET /api/v1/health` → 200; `GET /api/v1/ready` → 200 |
| 6 | Verify sample user data | Sample user can authenticate and see their data |
| 7 | Measure restore time | Must complete within RTO target: < 30 minutes |

**Restore Procedure Runbook:**

1. Log into Northflank dashboard
2. Navigate to `rekordly_production` database
3. Select "Backups" tab
4. Choose backup by timestamp
5. Click "Restore to new instance"
6. Wait for restore to complete
7. Note the new instance connection string
8. Update Northflank API service environment variable `DATABASE_URL` to point to restored instance
9. Restart API service
10. Verify health/readiness endpoints
11. Verify sample user can log in
12. If restored instance is healthy, decommission old instance

**RTO Target:**
- < 30 minutes from backup selection to API serving requests against restored data

**Acceptance Criteria:**
- [ ] Automated daily backups configured with 7/4/3 retention schedule
- [ ] All backup files encrypted at rest
- [ ] Backup failure alerting configured
- [ ] Full restore to temporary instance succeeds
- [ ] Row counts on all 10 critical tables match between production and restored backup
- [ ] Application connects and serves health checks against restored database
- [ ] Sample user can authenticate and see their data on restored instance
- [ ] Restore completes within 30-minute RTO target
- [ ] Restore procedure documented in runbook with exact steps

---

### P9-09: Health/Readiness Monitoring Setup

**Description:**
Configure uptime monitoring and dashboards for the production API, worker, and frontend. Health checks confirm process availability; readiness checks confirm all dependencies (PostgreSQL, queue table, secrets) are reachable. The worker exposes liveness through structured logs. Uptime monitoring pings the health endpoint and alerts on consecutive failures. Per Doc 08: health checks confirm API process availability; readiness checks confirm required dependencies are reachable; worker exposes process liveness, database connectivity, queue polling status, current concurrency, failed job count.

**Technical Details:**

**Monitoring Endpoints:**

| Endpoint | Type | Success Response |
|---|---|---|
| `GET /api/v1/health` | Liveness | `200 { "status": "ok", "timestamp": "..." }` |
| `GET /api/v1/ready` | Readiness | `200 { "status": "ready", "checks": { "database": "ok", "migrations": "ok", "secrets": "ok", "queue": "ok" } }` |
| `GET /api/v1/ready` | Readiness (failure) | `503 { "status": "degraded", "checks": { "database": "failed", ... } }` |

**Readiness Checks:**

| Check | What It Verifies |
|---|---|
| database | PostgreSQL connectivity via `SELECT 1` |
| migrations | `schema_migrations` table has latest version |
| secrets | Required environment variables are present and non-empty |
| queue | `jobs` table is reachable and queryable |

**Worker Liveness:**
- Worker logs structured heartbeat every 60 seconds:
```json
{
  "level": "info",
  "msg": "worker_heartbeat",
  "goroutines": 3,
  "queue_depth": 0,
  "dlq_count": 0,
  "jobs_processed_today": 47
}
```

**Uptime Monitor Configuration:**

| Setting | Value |
|---|---|
| Target | `GET https://api.rekordly.com/api/v1/health` |
| Interval | Every 60 seconds |
| Alert condition | 2 consecutive failures |
| Notification | Team channel (Slack/Discord/email) |

**Dashboard Metrics (Northflank):**

| Metric | Display |
|---|---|
| Request rate | Requests per second per endpoint group |
| Error rate | 4xx and 5xx responses per endpoint |
| Latency | p50, p95, p99 per endpoint group |
| CPU usage | Per container |
| Memory usage | Per container |
| Connection pool | Active/idle connections to PostgreSQL |

**Frontend Uptime:**
- External monitor pings `GET https://rekordly.com` every 60 seconds
- Verifies HTTP 200 and basic HTML content

**Acceptance Criteria:**
- [ ] Health endpoint returns 200 when API process is running
- [ ] Readiness endpoint returns 200 when all dependencies are reachable
- [ ] Readiness endpoint returns 503 with failing check details when dependencies are down
- [ ] Worker logs heartbeat every 60 seconds with queue metrics
- [ ] Uptime monitor configured to ping health endpoint every 60s
- [ ] Alert fires on 2 consecutive health check failures
- [ ] Northflank dashboard shows request rate, error rate, latency, CPU/memory

---

### P9-10: Error, Queue, DLQ, Webhook, AI Usage Monitoring

**Description:**
Configure monitoring dashboards and alerts for the key operational metrics that indicate system health issues. Per Doc 08: minimum launch alerts include API down, readiness check fails, PostgreSQL unreachable, worker not processing, queue backlog growing, DLQ count > 0, AI spend/usage spikes, webhook signature failure spikes. This work item creates the alerting rules and dashboard panels that the on-call engineer will monitor post-launch.

**Technical Details:**

**Monitoring Dashboards and Alerts:**

| Metric | Alert Threshold | Severity |
|---|---|---|
| API 5xx error rate | > 5% over 5 minutes | Critical |
| API p95 latency | > 2s for any financial endpoint | Warning |
| Queue depth (pending) | > 100 pending jobs OR oldest > 10 minutes | Warning |
| DLQ count | > 0 (any exhausted job is an incident) | Critical |
| Webhook signature failures | > 3 in 5 minutes | Critical |
| Unprocessed webhook events | Events older than 5 minutes | Warning |
| AI daily spend | > 2x rolling 7-day average | Warning |
| AI provider error rate | > 10% over 5 minutes | Critical |
| AI rate-limit events | Spike (3x normal) | Warning |
| Plan-limit blocks | Unexpected spike per feature | Info |
| Export/PDF job failure rate | > 5% | Warning |
| Notification delivery failures | > 10% over 5 minutes | Warning |

**Data Sources for Alerts:**

| Metric | Data Source |
|---|---|
| API error rate / latency | API response logs / APM |
| Queue depth / DLQ | `jobs` and `failed_jobs` tables |
| Webhook events | `webhook_events` table |
| AI usage | `ai_audit_logs` table |
| Plan-limit blocks | Error log `PLAN_LIMIT_REACHED` frequency |
| Export/PDF failures | Job status in `jobs` table |

**Alert Response Summary (details in P9-16 Runbook):**

| Alert | First Response |
|---|---|
| API 5xx spike | Check Northflank container logs → restart container → escalate if restart fails within 5 min |
| Queue backlog | Increase worker concurrency temporarily → investigate stuck jobs |
| DLQ growth | Inspect `failed_jobs` table → fix and re-queue or mark resolved |
| AI spend spike | Check `ai_audit_logs` for anomalous per-user usage → apply rate limit override if abuse |
| Webhook failures | Verify Paystack dashboard → check webhook URL reachability → check signature logs |

**Acceptance Criteria:**
- [ ] All 12+ alert rules configured with correct thresholds
- [ ] Critical alerts send immediate notifications (Slack/email)
- [ ] Warning alerts send notifications within 5 minutes
- [ ] Dashboard panels created for API error rate, latency, queue depth, DLQ, AI spend, webhook status
- [ ] Alert response procedures documented in runbook (P9-16)
- [ ] Test alert fires correctly when threshold is exceeded

---

### P9-11: V1 Read-Only Transition

**Description:**
Transition the existing V1 application to read-only mode when V2 launches. V1 remains available for users to view old financial history and export CSVs, but no new data can be created. This is a pragmatic migration stance — V2 starts with a clean database, and a future self-service CSV import will allow users to bring V1 data into V2 at their own pace. Per Doc 01/12: V1 becomes read-only when V2 launches; existing users can still log in to V1 to view old financial history and export CSVs; V2 starts with a clean database; no automated V1→V2 migration.

**Technical Details:**

**V1 Read-Only Flag:**
- Add environment variable `V1_READ_ONLY=true` to V1 deployment
- When set, all V1 write endpoints (POST, PATCH, DELETE) return `403` with message:
  > "Rekordly V1 is now read-only. Please use Rekordly V2 at rekordly.com for new records."

**V1 Read-Only Behavior:**

| Capability | Status |
|---|---|
| Login | Active — existing users can log in |
| View financial history | Active — all records viewable |
| CSV export | Active — users can export their data |
| Create new records | Blocked — all write endpoints return 403 |
| Edit existing records | Blocked |
| Delete records | Blocked |

**V1 Banner:**
Add persistent banner to V1 UI:
> "Rekordly V2 is live! Start fresh at rekordly.com. Your V1 data remains accessible here for viewing and export."

- Banner appears on all V1 pages after login
- Banner includes link to `rekordly.com`
- Banner cannot be dismissed — it's persistent

**V1 Database:**
- V1 PostgreSQL database remains running
- No new writes accepted after read-only flag is set
- Database backups continue
- No schema changes to V1 database

**CSV Export Path:**
- V1 CSV export functionality remains operational
- Users can export transactions, invoices, customers, and other data
- Exported CSVs will be compatible with the future V2 CSV import feature
- This is the primary data migration path for users who want their V1 data in V2

**Timeline:**
- V1 read-only mode activated on V2 launch day
- No rollback to writable V1 mode planned

**No Automated Data Migration:**
- V2 starts with a clean database
- No database-to-database migration scripts
- No automated V1→V2 data transfer
- Future: self-service CSV import in V2 (post-MVP)

**Acceptance Criteria:**
- [ ] `V1_READ_ONLY=true` flag blocks all V1 write endpoints with 403
- [ ] V1 login remains functional for existing users
- [ ] V1 CSV export remains functional
- [ ] Persistent V2 launch banner displayed on all V1 pages
- [ ] V1 database remains running with continued backups
- [ ] No automated data migration scripts created
- [ ] Banner links to `rekordly.com` for V2 sign-up

---

### P9-12: Production CORS Configuration

**Description:**
Configure CORS in the Go API to allow only approved production frontend origins. This is critical for the split-architecture security model — `rekordly.com` must be able to call `api.rekordly.com`, but no other origin should be allowed. Per Doc 08/09: production must allow only approved production frontend origins; no wildcard CORS on protected endpoints; CORS config must be environment-specific; unknown origins must be rejected.

**Technical Details:**

**CORS Configuration (via `github.com/gin-contrib/cors` v1.5+):**

| Setting | Production Value | Staging Value | Local Value |
|---|---|---|---|
| AllowOrigins | `["https://rekordly.com", "https://www.rekordly.com"]` | `["https://staging.rekordly.com"]` | `["http://localhost:3000"]` |
| AllowMethods | `["GET", "POST", "PATCH", "DELETE", "OPTIONS"]` | Same | Same |
| AllowHeaders | `["Authorization", "Content-Type", "Idempotency-Key", "X-CSRF-Token", "X-Request-ID"]` | Same | Same |
| ExposeHeaders | `["X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset", "X-Request-ID"]` | Same | Same |
| AllowCredentials | `true` | `true` | `true` |
| MaxAge | `86400` (24 hours) | `86400` | `3600` |

**Strict Rejection Rules:**
1. Any request with `Origin` not in the allowed list must be rejected for credentialed routes
2. Non-credentialed routes still enforce origin allowlist
3. `Access-Control-Allow-Origin: *` must NEVER appear in any production response
4. No cross-environment origin leakage — staging origin never allowed in production

**Preflight Handling:**
- `OPTIONS` preflight from allowed origin → returns `200` with `Access-Control-Allow-Methods`, `Access-Control-Allow-Headers`, `Access-Control-Max-Age`
- `OPTIONS` preflight from disallowed origin → returns `403`

**Implementation:**
```go
import "github.com/gin-contrib/cors"

config := cors.Config{
    AllowOrigins:     []string{"https://rekordly.com", "https://www.rekordly.com"},
    AllowMethods:     []string{"GET", "POST", "PATCH", "DELETE", "OPTIONS"},
    AllowHeaders:     []string{"Authorization", "Content-Type", "Idempotency-Key", "X-CSRF-Token", "X-Request-ID"},
    ExposeHeaders:    []string{"X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset", "X-Request-ID"},
    AllowCredentials: true,
    MaxAge:           24 * time.Hour,
}
router.Use(cors.New(config))
```

**Verification:**
1. `curl -H "Origin: https://rekordly.com" https://api.rekordly.com/api/v1/health` → `Access-Control-Allow-Origin: https://rekordly.com` in response
2. `curl -H "Origin: https://evil.com" https://api.rekordly.com/api/v1/health` → no `Access-Control-Allow-Origin` header
3. `curl -H "Origin: https://staging.rekordly.com" https://api.rekordly.com/api/v1/health` → rejected (staging origin not in production allowlist)

**Acceptance Criteria:**
- [ ] CORS allows only `rekordly.com` and `www.rekordly.com` in production
- [ ] Staging allows only `staging.rekordly.com`
- [ ] Local allows only `localhost:3000`
- [ ] No `Access-Control-Allow-Origin: *` on any route
- [ ] Disallowed origins receive no CORS headers
- [ ] Preflight requests handled correctly
- [ ] Credentials allowed for approved origins
- [ ] Exposed headers include rate limit headers

---

### P9-13: Production Secrets Lockdown

**Description:**
Verify that all production secrets are stored in deployment provider secret stores (not in code, not in `.env` files, not in git history), that cross-environment isolation is enforced, and that no secrets are accidentally committed or leaked. Per Doc 08/09: secrets must be stored in deployment provider secret stores or GitHub Actions secrets; do not commit `.env` files; rotate secrets after suspected exposure; production secrets must never be used locally or in staging.

**Technical Details:**

**Secret Storage Locations:**

| Secret Group | Vercel (Frontend) | Northflank (API) | Northflank (Worker) | GitHub Actions |
|---|---|---|---|---|
| `JWT_SIGNING_KEY` | — | Yes | Yes | — |
| `SESSION_SECRET` | — | Yes | Yes | — |
| `DATABASE_URL` | — | Yes | Yes | Yes (migration step only) |
| `PAYSTACK_SECRET_KEY` | — | Yes | — | — |
| `PAYSTACK_WEBHOOK_SECRET` | — | Yes | — | — |
| `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` | Yes | — | — | — |
| `OPENAI_API_KEY` | — | Yes | Yes | — |
| `SMTP_HOST` | — | Yes | Yes | — |
| `SMTP_PORT` | — | Yes | Yes | — |
| `SMTP_USER` | — | Yes | Yes | — |
| `SMTP_PASSWORD` | — | Yes | Yes | — |
| `VAPID_PUBLIC_KEY` | Yes (NEXT_PUBLIC_) | Yes | — | — |
| `VAPID_PRIVATE_KEY` | — | Yes | Yes | — |
| `VAPID_SUBJECT` | — | Yes | — | — |
| `S3_ACCESS_KEY` | — | Yes | Yes | — |
| `S3_SECRET_KEY` | — | Yes | Yes | — |
| `S3_BUCKET` | — | Yes | Yes | — |
| `S3_REGION` | — | Yes | Yes | — |
| `NORTHFLANK_API_TOKEN` | — | — | — | Yes |
| `VERCEL_TOKEN` | — | — | — | Yes |

**Cross-Environment Isolation Rules:**

| Rule | Enforcement |
|---|---|
| Production secrets never in staging | Separate Northflank projects with isolated secret stores |
| Production secrets never in local | Local uses fake/developer-owned credentials |
| Staging secrets never in production | Same isolation mechanism |
| No `.env` files committed | `.gitignore` includes `*.env`, `.env*`; CI checks for committed env files |
| Rotate on exposure | Document rotation procedure for each secret group |

**Rotation Plan:**

| Secret Group | Rotation Procedure |
|---|---|
| JWT_SIGNING_KEY | Generate new key → update in Northflank → restart API → all existing sessions invalidated |
| DATABASE_URL | Rotate via Northflank → update connection string → restart services |
| Paystack keys | Rotate in Paystack dashboard → update in Northflank → verify webhooks still work |
| OpenAI key | Rotate in OpenAI dashboard → update in Northflank → verify AI endpoint works |
| SMTP credentials | Rotate with provider → update in Northflank → send test email |
| VAPID keys | Regenerate → update in Vercel + Northflank → all existing push subscriptions invalidated |

**Git History Audit:**
```bash
git log -p | rg -i 'sk_live|pk_live|password|secret|smtp_pass|api_key.*='
```
- Must return zero results on production branch history
- If secrets found: rotate immediately, use `git filter-branch` or BFG Repo-Cleaner if necessary

**Acceptance Criteria:**
- [ ] All secrets stored in deployment provider secret stores (Vercel, Northflank, GitHub Actions)
- [ ] No `.env` files in git repository (verified via `.gitignore` and CI check)
- [ ] Cross-environment isolation enforced — production secrets not in staging/local
- [ ] Staging secrets not in production
- [ ] Git history contains no secrets (audit command returns zero results)
- [ ] Rotation procedure documented for each secret group
- [ ] Local development uses fake/developer-owned credentials only

---

### P9-14: Post-Deploy Health Checks

**Description:**
Configure automated post-deployment health checks in GitHub Actions that run after every production deployment. These checks verify that the API, frontend, and PWA are all functioning correctly. If any check fails, the team is alerted and the manual rollback procedure is initiated. Per Doc 08: post-deploy health checks against `GET /api/v1/health` and `GET /api/v1/ready`; failed migrations block deploy.

**Technical Details:**

**Automated Post-Deploy Checks in GitHub Actions:**

| # | Check | Command | Expected Result |
|---|---|---|---|
| 1 | API health | `curl -sf https://api.rekordly.com/api/v1/health` | `200 { "status": "ok" }` |
| 2 | API readiness | `curl -sf https://api.rekordly.com/api/v1/ready` | `200 { "status": "ready" }` with all checks `"ok"` |
| 3 | Frontend loads | `curl -sf https://rekordly.com` | `200` (HTML response) |
| 4 | PWA manifest | `curl -sf https://rekordly.com/manifest.json` | Valid JSON with PWA fields |

**Smoke Test Script: `scripts/smoke-test.sh`**

| Step | Action | Asserts |
|---|---|---|
| 1 | Request OTP | `POST /api/v1/auth/request-otp` → 200 or 429 (rate limited) |
| 2 | Create transaction | `POST /api/v1/transactions` with test data → 201 |
| 3 | List transactions | `GET /api/v1/transactions` → 200 with cursor pagination |
| 4 | Create invoice | `POST /api/v1/invoices` → 201 |
| 5 | Finalize invoice | `POST /api/v1/invoices/{id}/finalize` → 200 |
| 6 | Request PDF | `POST /api/v1/invoices/{id}/pdf` → 202 with job_id |
| 7 | Check job status | `GET /api/v1/jobs/{id}` → 200 or 202 |
| 8 | Create budget | `POST /api/v1/budgets` → 201 |
| 9 | Dashboard summary | `GET /api/v1/dashboard/summary` → 200 |
| 10 | Plan endpoint | `GET /api/v1/plan` → 200 with plan data |
| 11 | Usage endpoint | `GET /api/v1/usage` → 200 with usage data |

Each step:
- Asserts expected HTTP status code
- Asserts response structure matches expected JSON schema
- Fails fast on unexpected status codes

**Rollback Trigger:**
- If any health check fails, GitHub Actions sends alert to team channel
- Manual rollback procedure documented in runbook:
  1. Tag current production container images (if not already tagged)
  2. Redeploy previous container image tag via Northflank
  3. Run database migration rollback only if necessary (destructive migrations require manual review)
  4. Verify health checks pass after rollback

**Acceptance Criteria:**
- [ ] All 4 basic health checks run automatically after deployment
- [ ] Smoke test script runs all 11 steps with assertions
- [ ] Failed health checks trigger alert to team channel
- [ ] Manual rollback procedure documented
- [ ] Smoke test completes within 2 minutes
- [ ] Smoke test uses a dedicated test account (not real user data)

---

### P9-15: Launch Announcement / User Communication

**Description:**
Execute the launch communication plan to inform existing V1 users and the public about V2. This includes in-app banners, email campaigns, social media, landing page updates, documentation, and support channels. Per Doc 01: V2 starts clean; users create new account or workspace; future self-service CSV import will allow V1 export → V2 import. Per Doc 12: users can start clean in V2 while still accessing V1 history.

**Technical Details:**

**Communication Channels:**

| Channel | Content | Timing |
|---|---|---|
| V1 in-app banner | V2 launch announcement with link to `rekordly.com` | Deployed with V1 read-only transition (P9-11) |
| Email to V1 users | V2 highlights, sign-up link, V1 data access info, CSV export instructions | Launch day |
| Twitter/X | Launch announcement with key screenshots | Launch day |
| LinkedIn | Launch announcement with product overview | Launch day |
| Landing page | V2 features, pricing, sign-up CTA | Updated before launch |
| Help/FAQ page | V2 signup, V1 data access, plan comparison, offline behavior, export instructions | Published before launch |
| Support channel | Open email/chat for launch issues | Active before and after launch |

**Email Content (to V1 users):**

Subject: "Rekordly V2 is here — AI-first finance tracking"

Body:
- Brief V2 highlights: AI-powered entry, personal/business finance split, offline support, subscription plans
- Link to sign up: `https://rekordly.com`
- Reassurance: "Your V1 data remains accessible at [V1 URL] for viewing and export"
- CSV export instructions: "Export your V1 data as CSV for future import into V2"
- Support contact for questions

**Landing Page Updates:**
- V2 feature highlights with screenshots
- Pricing table matching Doc 10 matrix
- Sign-up CTA (primary green button)
- "AI-first entry — just type what happened" hero message

**Help/FAQ Page Content:**
- How to sign up for V2
- How V1 data access works (read-only, CSV export)
- Plan comparison (Free vs. Starter vs. Business vs. Pro)
- Offline behavior (Free: read-only, Paid: full sync)
- How to export from V1 for future import into V2
- Contact support

**First 48 Hours:**
- Elevated monitoring per P9-16 runbook
- Support channel staffed for quick response
- Known issues tracked and communicated

**Acceptance Criteria:**
- [ ] V1 in-app banner deployed with V2 launch message and link
- [ ] Email sent to all V1 registered users
- [ ] Social media posts published on Twitter/X and LinkedIn
- [ ] Landing page updated with V2 features, pricing, and sign-up CTA
- [ ] Help/FAQ page published covering all required topics
- [ ] Support channel open and staffed for launch period
- [ ] First 48 hours have elevated monitoring

---

### P9-16: Post-Launch Monitoring Runbook

**Description:**
Write the operational runbook for post-launch monitoring, covering health check URLs, key metrics, alert response procedures, escalation contacts, rollback procedures, and daily/weekly review cadences. This runbook is the on-call engineer's primary reference during the critical first weeks after launch. Per Doc 08: start with provider logs and simple dashboards; track API error rate, latency, queue depth, DLQ, AI usage, rate-limit events, webhook failures, export failures; minimum launch alerts defined.

**Technical Details:**

**Runbook Document:** `docs/runbooks/post-launch.md`

**Section 1: Health Check URLs**

| Service | URL | Expected Response |
|---|---|---|
| API liveness | `GET https://api.rekordly.com/api/v1/health` | `200 { "status": "ok" }` |
| API readiness | `GET https://api.rekordly.com/api/v1/ready` | `200 { "status": "ready" }` |
| Frontend | `GET https://rekordly.com` | `200` (HTML) |
| PWA manifest | `GET https://rekordly.com/manifest.json` | Valid JSON |

**Section 2: Key Metrics (First 48 Hours)**

| Metric | Target | Alert If |
|---|---|---|
| API error rate | < 1% | > 5% over 5 minutes |
| API p95 latency | < 500ms | > 2s |
| Signup conversion rate | Monitor (no baseline) | — |
| OTP delivery success rate | > 95% | < 90% |
| Paystack webhook success | 100% | Any failure |
| AI parse success rate | > 90% | < 80% |
| Offline sync success rate | > 95% | < 90% |
| Plan upgrade conversion | Monitor | — |
| Ad event tracking accuracy | Monitor | Discrepancy detected |

**Section 3: Alert Response Procedures**

| Alert | Response |
|---|---|
| API down | 1. Check Northflank container logs → 2. Restart container → 3. Escalate if restart fails within 5 min |
| Database unreachable | 1. Check Northflank PostgreSQL status → 2. Restore from backup if needed (P9-08 runbook) |
| Queue backlog growing | 1. Increase worker concurrency temporarily → 2. Investigate stuck jobs → 3. Clear DLQ if resolved |
| DLQ growth | 1. Inspect `failed_jobs` table → 2. Fix root cause → 3. Re-queue or mark resolved |
| AI spend spike | 1. Check `ai_audit_logs` for anomalous per-user usage → 2. Apply rate limit override if abuse → 3. Review feature_limits |
| Webhook failures | 1. Verify Paystack dashboard for outages → 2. Check webhook URL reachability → 3. Check signature validation logs |
| OTP delivery failure | 1. Check SMTP provider status → 2. Verify DNS records (DKIM/SPF/DMARC) → 3. Retry queue functioning? |

**Section 4: Escalation Contacts**

| Role | Contact | Availability |
|---|---|---|
| On-call engineer | [configured in alerting system] | 24/7 (launch week) |
| Infrastructure owner | [direct contact] | Business hours + on-call |
| Product owner | [direct contact] | Business hours |

**Section 5: Rollback Procedure**

1. Tag current production container images (if not already tagged)
2. On critical failure: redeploy previous tagged image via Northflank
3. If database migration rollback needed:
   - Destructive migrations require manual review and explicit approval
   - Non-destructive migrations can be rolled back using `golang-migrate down`
4. Verify health checks pass after rollback
5. Communicate rollback to team
6. Investigate root cause before next deploy attempt

**Section 6: Review Cadences**

| Cadence | Activities |
|---|---|
| Daily (first week) | Review error logs, DLQ, AI spend, signup funnel, support tickets |
| Weekly (ongoing) | Review provider usage and costs, backup verification, dependency vulnerability scan results |
| Monthly | Review and update runbook, review alert thresholds, review plan limits vs. actual usage |

**Acceptance Criteria:**
- [ ] Runbook written and reviewed before launch day
- [ ] All health check URLs documented and verified
- [ ] Key metrics with targets and alert thresholds documented
- [ ] Alert response procedures for all 7+ alert types documented
- [ ] Escalation contacts defined
- [ ] Rollback procedure documented with exact steps
- [ ] Daily and weekly review cadences established
- [ ] Runbook accessible to on-call engineer

---

## Dependencies and Sequencing

1. **P9-01–P9-02 (Vercel and Northflank deployment)** are the foundation — must be provisioned first.
2. **P9-03 (PostgreSQL)** must exist before API/worker can start — deploy immediately after compute.
3. **P9-04–P9-05 (Paystack and AI live keys)** must be configured before any monetization or AI features can work in production.
4. **P9-06–P9-07 (Email and push providers)** must be configured before OTP auth and notifications work.
5. **P9-08 (Backup verification)** should be completed before accepting real user data.
6. **P9-09–P9-10 (Health monitoring and observability)** must be active before launch traffic arrives.
7. **P9-11 (V1 read-only transition)** happens on launch day, after V2 is verified healthy.
8. **P9-12–P9-13 (CORS and secrets)** should be verified as part of deployment but called out explicitly.
9. **P9-14 (Post-deploy health checks)** runs automatically after deployment and on an ongoing schedule.
10. **P9-15 (Launch announcement)** goes out only after all health checks pass and monitoring is confirmed.
11. **P9-16 (Post-launch runbook)** must be written and reviewed before launch day.

## Launch Day Sequence

1. Final CI/CD deployment to production (P9-01–P9-02)
2. Run production migrations (P9-03)
3. Verify all secrets and keys are in place (P9-04–P9-05, P9-07, P9-13)
4. Run post-deploy health checks (P9-14)
5. Verify backup is working (P9-08)
6. Confirm monitoring and alerts are live (P9-09–P9-10)
7. Activate V1 read-only mode (P9-11)
8. Confirm CORS is locked to production origins (P9-12)
9. Send launch communications (P9-15)
10. Monitor closely for 48 hours per runbook (P9-16)

## Key Rules (Cross-Referenced from Planning Docs)

- **Production secrets must never be used locally or in staging** (Doc 08/09).
- **Paystack live keys only in production; test keys only in staging/local** (Doc 08).
- **AI keys with strict per-user and per-plan limits** (Doc 08/09).
- **V1 remains read-only for old records and CSV exports** (Doc 01/12).
- **V2 starts with a clean database — no automated V1→V2 migration** (Doc 01).
- **CORS allows only `rekordly.com` ↔ `api.rekordly.com`** (Doc 06/08/09).
- **Health and readiness checks are live** (Doc 08/12).
- **Production backups are configured and restore-tested** (Doc 08/09/12).
- **Failed migrations block deployment** (Doc 08).
- **All external traffic uses TLS 1.2+** (Doc 09).
- **Payment webhooks are signature-verified and idempotent** (Doc 06/09/12).
- **No SMS in MVP** (Doc 04/08/09).
- **No Redis until proven necessary** (Doc 08).
- **No Kubernetes for MVP** (Doc 08).
