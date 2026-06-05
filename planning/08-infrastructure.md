# 08 - Rekordly V2 Infrastructure

## Summary

Rekordly V2 should launch with a bootstrapped, low-cost infrastructure plan. The goal is to get a reliable MVP online without committing early to expensive enterprise cloud architecture.

This document defines the MVP deployment stack, environment topology, CI/CD pipeline, worker and queue guardrails, observability, cost controls, and future scale roadmap.

The infrastructure stance is strict:

- No AWS/GCP enterprise-cloud roadmap for the foreseeable future.
- No Kubernetes for MVP.
- No premature Redis.
- No multi-region deployment until real traction proves the need.
- PostgreSQL remains the source of truth for MVP.
- The backend and frontend are deployed separately.

## MVP Stack

### Frontend

- Next.js deployed on Vercel.
- Domain: `rekordly.com`.
- Owns UI, public pages, auth screens, PWA shell, offline queue, and frontend routing.
- Talks only to the Go API for protected business operations.

### Backend API

- Go API deployed as a Dockerized service on Northflank.
- Domain: `api.rekordly.com`.
- Owns protected business logic, auth validation, plan enforcement, financial validation, ledger writes, wallet validation, AI request mediation, and async job creation.

### Background Worker

- Go worker deployed as a separate Dockerized service on Northflank.
- Processes background jobs for PDF generation, exports, notification delivery, heavy AI parsing, and future maintenance tasks.
- Must follow the worker guardrails in this document.

### Database

- PostgreSQL on Northflank for MVP.
- Separate databases per environment.
- PostgreSQL stores tenant data, financial records, ledger entries, plans, usage counters, async jobs, idempotency keys, audit logs, and notification records.

### Queue

- MVP uses a Postgres-backed queue.
- Redis is intentionally delayed until queue pressure, latency, or caching needs are proven.
- Queue consumption must use `SELECT ... FOR UPDATE SKIP LOCKED` or equivalent safe locking.

### Storage

- Generated PDFs and CSV exports can start with provider-managed or app-managed temporary storage during early MVP testing.
- As generated files grow, move to low-cost S3-compatible object storage.
- Generated documents must have expiry metadata and should not be stored forever by default.

### Payments

- Paystack is the primary payment provider for Nigeria-first subscription payments.
- Stripe can remain optional for international expansion.
- Webhook signature verification is mandatory.
- Payment provider keys are separated by environment.

### Notifications

- MVP notification channels: email, PWA push, and in-app notifications.
- SMS is excluded across the app due to cost.
- Notification service must be provider-agnostic so WhatsApp can be added in Phase 2 without rewriting alert logic.

## Environment Topology

### Local Development

Local development must run fully isolated from cloud infrastructure.

- Use Docker Compose to run:
  - Next.js frontend
  - Go API
  - Go worker
  - PostgreSQL
- Local code must never point to staging or production cloud databases.
- Local secrets must be fake or developer-owned.
- Local payment provider keys must use test mode only.
- Local AI keys must use sandbox or developer-limited credentials.
- Local seed data should be fake and safe to reset.

Recommended local services:

| Service | Local Name | Purpose |
|---|---|---|
| Next.js | `rekordly-web` | Frontend app and PWA shell |
| Go API | `rekordly-api` | REST API |
| Go Worker | `rekordly-worker` | Background jobs |
| PostgreSQL | `rekordly-postgres` | Local source of truth |

### Staging

Staging is the review and testing environment.

- Frontend deployed to Vercel preview/staging.
- Backend and worker deployed to Northflank.
- API domain: `staging-api.rekordly.com`.
- Uses its own isolated PostgreSQL database.
- Database is seeded with fake data only.
- Uses Paystack/Stripe test mode.
- Uses AI sandbox keys or strict low-limit AI keys.
- Uses staging-only secrets.
- Must never share credentials, database URLs, object storage buckets, or webhook secrets with production.

Staging should be cheap and lightweight. It exists to validate releases before production, not to mirror production capacity.

### Production

Production is the live MVP environment.

- Frontend domain: `rekordly.com`.
- API domain: `api.rekordly.com`.
- Go API and Go worker run on Northflank for MVP launch.
- Uses production PostgreSQL.
- Uses Paystack live keys.
- Uses AI live keys with strict per-user and per-plan limits.
- Uses production email and push notification providers.
- Production secrets must be locked down and never copied into local or staging.

## CI/CD Pipeline

GitHub Actions is the deployment orchestrator.

### Pull Requests

Every pull request should run:

- Frontend install/build/type checks.
- Go tests.
- Go lint/static checks when configured.
- Docker image build for API.
- Docker image build for worker.
- Database migration dry run or staging migration validation.
- Deploy to staging for review.

Staging deploys must use staging secrets, staging database, staging payment keys, and staging AI keys.

### Merge To Main

Merging to `main` should:

- Reuse or rebuild the tested Docker image.
- Run production database migrations as a pre-deploy step.
- Stop deployment if migrations fail.
- Deploy the Go API.
- Deploy the Go worker.
- Deploy the Next.js frontend.
- Run post-deploy health checks against `GET /api/v1/health` and `GET /api/v1/ready`.

### Database Migrations

Database migrations must be automatic and repeatable.

- Migrations run in CI/CD before deployment.
- Migrations are never run manually as a normal release process.
- Failed migrations block deployment.
- Migration scripts must be versioned.
- Destructive migrations require explicit review and a backup/rollback plan.
- Production migrations must be tenant-safe and avoid long table locks where possible.

## Operational Guardrails

### Worker And Queue Guardrails

The Go worker must protect PostgreSQL from aggressive polling and runaway background jobs.

- Do not use tight infinite polling loops.
- If the queue is empty, sleep for 5 seconds before polling again.
- Use bounded worker pools only.
- Start with exactly 3-5 concurrent goroutines per worker container.
- Do not spawn unbounded goroutines for queue consumption.
- Each job execution must use `context.WithTimeout`.
- AI parsing jobs should time out around 60 seconds.
- PDF and export jobs should have explicit timeouts based on expected size.
- Failed jobs use exponential backoff:
  - Attempt 1 retry after 1 minute.
  - Attempt 2 retry after 5 minutes.
  - Attempt 3 retry after 15 minutes.
- Max retry count is 3.
- After max retries, move the job to a dead letter queue or `failed_jobs` table.
- Failed jobs must not be dropped silently.
- Failed jobs must not retry forever.

### Postgres Queue Rules

- Queue workers should claim jobs using row-level locking such as `SELECT ... FOR UPDATE SKIP LOCKED`.
- Queue indexes must support status, scheduled time, priority, and creation time.
- Jobs must include `workspace_id` when tied to tenant data.
- Job payloads should be small and reference database records instead of embedding large blobs.
- Worker updates must happen in database transactions.

### API Runtime Guardrails

- All financial write requests run inside database transactions.
- Ledger entries must balance before commit.
- Wallet payments must validate available balance transactionally.
- Split payment totals must be validated transactionally.
- Loan repayments must reject overpayment.
- All protected requests resolve `user_id` and `workspace_id`.
- All tenant-owned queries must be workspace-scoped.
- All list endpoints must use cursor pagination and default date scoping.

## Security And Reliability

### Secrets

- Use separate secrets per environment.
- Never reuse production secrets in local or staging.
- Rotate credentials after accidental exposure.
- Store secrets in the deployment provider or GitHub Actions secret store.
- Do not commit `.env` files.

Required secret groups:

- Auth/session signing secrets.
- Database URLs.
- Paystack/Stripe keys and webhook secrets.
- AI provider keys.
- Email provider keys.
- Push notification keys.
- Object storage credentials.

### Network And API Security

- CORS allows only approved frontend origins.
- `rekordly.com` talks to `api.rekordly.com`.
- Staging frontend talks only to `staging-api.rekordly.com`.
- Webhooks must verify provider signatures before processing events.
- API responses include standard rate limit headers.
- Request body limits apply to all endpoints, especially AI and offline sync.
- Admin/internal endpoints must not be exposed publicly without explicit protection.

### Backups And Recovery

- Production PostgreSQL requires automated backups.
- Backup restore should be tested before launch.
- Exported documents should be reproducible where possible.
- Critical financial records are immutable; corrections use voids and reversals.
- Disaster recovery should prioritize restoring PostgreSQL first.

### Health Checks

The Go API must expose:

- `GET /api/v1/health` for process liveness.
- `GET /api/v1/ready` for dependency readiness.

Readiness should check:

- PostgreSQL connectivity.
- Migration state compatibility.
- Required secrets present.
- Queue table reachable.

The worker should expose or log:

- Process liveness.
- Database connectivity.
- Queue polling status.
- Current concurrency.
- Failed job count.

## Observability

Start with provider logs and simple dashboards. Avoid paid observability tools until production usage justifies them.

Track:

- API error rate.
- API latency.
- Database connection failures.
- Slow queries.
- Worker queue depth.
- Oldest pending job age.
- Dead letter queue count.
- Job failure rate.
- AI usage by plan and user.
- AI provider errors.
- Rate-limit events.
- Plan-limit blocks.
- Webhook failures.
- Export/PDF failures.
- Notification delivery failures.
- Migration success/failure status.

Minimum launch alerts:

- API is down.
- Readiness check fails.
- PostgreSQL unreachable.
- Worker not processing jobs.
- Queue backlog is growing.
- DLQ count is above zero.
- AI spend or usage spikes unexpectedly.
- Payment webhook signature failures spike.

## Cost Controls

The infrastructure must be designed around bootstrapping discipline.

- Use free or low-cost tiers until real usage proves the upgrade.
- Keep worker concurrency low at launch.
- Keep AI rate limits strict.
- Keep offline sync batches capped.
- Generate PDFs/exports asynchronously to avoid over-provisioning API containers.
- Avoid SMS entirely in MVP.
- Avoid Redis until PostgreSQL queue pressure is measurable.
- Avoid managed enterprise observability until provider logs are insufficient.
- Avoid multi-region until downtime or latency data proves the need.
- Review provider usage weekly during beta and monthly after launch.

## Future Scale Roadmap

This roadmap replaces expensive enterprise-cloud assumptions with a bootstrapped, cost-conscious path.

### Stage 1: MVP / Launch

Target: `$0/mo` infrastructure where possible.

- Vercel for Next.js frontend.
- Northflank Sandbox/free-tier resources for Go API, Go worker, and PostgreSQL where available.
- Postgres-backed queue.
- Provider logs and basic dashboards.
- No Redis.
- No Kubernetes.
- No AWS/GCP.
- No multi-region.

Important note: free tiers are useful for development, testing, and early launch validation, but commercial use limits must be reviewed before public paid launch.

### Stage 2: Traction / Around 5k Users

Target: approximately `$25/mo`, treated as a budget target rather than a guaranteed bill.

- Keep Vercel for the frontend.
- Move backend API, workers, and PostgreSQL to Railway Hobby or another predictable low-cost Railway plan if Northflank limits become restrictive.
- Monitor Railway usage carefully because billing includes subscription plus resource usage.
- Keep Postgres-backed queue unless queue backlog, row locking, or job latency becomes a real bottleneck.
- Add stricter query indexes before adding new infrastructure.
- Scale vertically before adding distributed services.

Upgrade triggers:

- Northflank free/sandbox limits block production reliability.
- API latency becomes consistently poor.
- Worker backlog regularly exceeds acceptable job delay.
- PostgreSQL CPU/memory/storage becomes constrained.
- Production backups or operational controls require a paid tier.

### Stage 3: Scale / Cost Optimization, Year 2+

Target: roughly `$5-20/mo` to start, depending on selected server size and current provider pricing.

- Move API, workers, PostgreSQL, and Redis to Hetzner low-cost servers managed by Coolify.
- Start with a small Hetzner VPS-style server where practical.
- Move to dedicated/bare-metal servers only when sustained load justifies it.
- Use Coolify as the self-hosted PaaS layer for Docker deployments, SSL, environment variables, service management, and rollbacks.
- Add Redis at this stage for caching and/or queues if Postgres queue pressure is proven.
- Add read replicas only after database read load requires them.
- Keep the frontend on Vercel unless Vercel cost or limits justify moving it too.

Stage 3 requires stronger operational discipline:

- Tested backups.
- Restore drills.
- Server patching.
- Firewall management.
- Disk monitoring.
- Database maintenance.
- Incident response checklist.

The reward is significantly better compute per dollar, but the tradeoff is more operational responsibility.

## Source Notes

Pricing changes often. Re-check all provider pages before launch and before any migration decision.

Checked on 2026-06-03:

- [Northflank Pricing](https://northflank.com/pricing): Sandbox currently lists free services, a free database, and free cron jobs; paid compute also has low-cost small plans.
- [Vercel Hobby Plan](https://vercel.com/docs/plans/hobby): Hobby is free and usage-limited, but restricted to non-commercial personal use, so commercial launch requires plan review.
- [Railway Pricing FAQs](https://docs.railway.com/pricing/faqs): Railway billing includes subscription plus resource usage; the `$25/mo` stage is a budget target, not a guaranteed fixed bill.
- [Coolify Installation](https://coolify.io/docs/get-started/installation): Coolify self-hosting runs on Docker and Docker Compose on your own server.
- [Paystack Pricing](https://paystack.com/pricing): Local transaction pricing should be used in monetization planning; Paystack currently lists local card/online transaction pricing with caps and waived small-transaction fees.

## Phase 2+ Deferred Infrastructure

These are intentionally not part of MVP:

- Redis cache/queue unless proven necessary.
- WhatsApp Business API infrastructure.
- Multi-region deployment.
- Kubernetes.
- Dedicated analytics warehouse.
- Search clusters.
- Advanced event streaming.
- Dedicated read replicas.
- Self-hosted Coolify/Hetzner production before the team is ready to operate it.

## Review Criteria

- Confirms no AWS/GCP enterprise-cloud roadmap.
- Defines local, staging, and production separately.
- Confirms local development never connects to cloud databases.
- Confirms staging uses fake data, test payment keys, and sandbox AI keys.
- Confirms migrations run automatically in CI/CD before deploy.
- Confirms failed migrations block deploy.
- Confirms Go worker and Postgres queue guardrails are included.
- Confirms Redis is delayed until Stage 3 or proven need.
- Confirms no Kubernetes for MVP.
- Confirms no multi-region deployment for MVP.
- Confirms SMS is excluded due to cost.
- Confirms the infrastructure plan remains bootstrapped and cost-conscious.

## Assumptions

- GitHub is the source-control and CI/CD platform.
- MVP deploys API and worker as Dockerized Go services.
- PostgreSQL remains the only required database for MVP.
- Postgres-backed queue is sufficient for launch.
- Vercel and Northflank are the preferred launch providers.
- Railway is the preferred Stage 2 migration option if launch providers become limiting.
- Hetzner plus Coolify is the preferred Stage 3 cost-optimization path.
- Final provider costs are planning estimates and must be rechecked before launch.
