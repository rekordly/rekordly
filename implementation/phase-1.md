# Phase 1: Technical Foundation

## Goal

Create the empty but deployable technical base. By the end of Phase 1, the local development stack runs without cloud databases, staging deployment can run empty shells, and the API exposes health/readiness checks.

**Ref:** Doc 12 §Phase 1, Doc 08 §Local Development, Doc 13 §Runtime Environment Requirements

---

## Section 1: Summary Table

| ID | Work Item | Owner Area | Acceptance Criteria |
|----|-----------|------------|---------------------|
| P1-01 | Go API module initialization | Backend | `go.mod` exists with all approved dependencies at min versions; empty Gin server compiles and starts on `:8080`. |
| P1-02 | Go Worker module initialization | Backend | Worker `go.mod` exists; skeleton process connects to Postgres and polls `jobs` table with `FOR UPDATE SKIP LOCKED`; graceful shutdown on signals. |
| P1-03 | PostgreSQL migrations setup with golang-migrate | Data | `golang-migrate` CLI configured; migration files follow naming pattern; `make migrate-up/down/force` targets work; CI validates migrations. |
| P1-04 | sqlc configuration for type-safe queries | Data | `sqlc.yaml` configured with pgx/v5; monetary columns map to `shopspring/decimal.Decimal`; `make sqlc-generate` runs; no ORM. |
| P1-05 | Migration 001: `users` table | Data | `users` table created with UUID PK, unique email, display name, avatar, default currency, timestamps. |
| P1-06 | Migration 002: `auth_identities` table | Data | `auth_identities` table with provider-based auth; OTP hash (never plaintext), expiry, attempt tracking, lockout, resend throttle columns. |
| P1-07 | Migration 003: `sessions` table | Data | `sessions` table with refresh token hash, user agent, IP, expiry, revocation support; indexed for fast lookup. |
| P1-08 | Migration 004: `workspaces` table | Data | `workspaces` table with name, owner FK, default currency; one workspace per user for MVP. |
| P1-09 | Migration 005: `workspace_members` table | Data | `workspace_members` table with role column (MVP: always 'owner'); unique constraint on workspace+user. |
| P1-10 | Migration 006: `plans` table | Data | `plans` table seeded with Free/Starter/Business/Pro rows with NGN monthly prices from Doc 10. |
| P1-11 | Migration 007: `subscriptions` table | Data | `subscriptions` table with workspace FK, plan FK, status, period dates, Paystack fields. |
| P1-12 | Migration 008: `usage_counters` table | Data | `usage_counters` table with counter_type, period, count; unique constraint on workspace+type+period. |
| P1-13 | Migration 009: `feature_limits` table | Data | `feature_limits` table seeded per plan from Doc 10; maps feature keys to limit values. |
| P1-14 | Migration 010: `jobs` table (Postgres-backed queue) | Data | `jobs` table with status, payload, attempts, retry fields; indexed for `FOR UPDATE SKIP LOCKED` polling. |
| P1-15 | Health endpoint: `GET /api/v1/health` | Backend | Returns `200` with status JSON; no auth required; includes rate limit headers. |
| P1-16 | Readiness endpoint: `GET /api/v1/ready` | Backend | Checks Postgres, migration state, required secrets; returns `200` or `503` with check details. |
| P1-17 | Go Worker skeleton | Backend | Polls `jobs` table with sleep-on-empty; bounded concurrency (3-5 goroutines); exponential backoff; max 3 retries; graceful shutdown. |
| P1-18 | Docker Compose for local dev | DevOps | Four services (postgres, api, worker, web); local DB with fake credentials; no cloud DB access. |
| P1-19 | Next.js frontend shell initialization | Frontend | Next.js App Router with all approved deps; brand tokens in Tailwind; fonts via Next font system. |
| P1-20 | Brand tokens and design system setup | Frontend | Tailwind config with brand colors; HeroUI + next-themes provider; light/dark mode CSS variables. |
| P1-21 | Environment configuration (Go — Viper) | Backend | Viper config for both API and Worker; required env vars validated at startup; fails fast on missing. |
| P1-22 | Environment configuration (Next.js — .env) | Frontend | `.env.local` (gitignored) and `.env.example` (committed) with API URLs; no secrets with `NEXT_PUBLIC_`. |
| P1-23 | Response envelope middleware | Backend | All API responses wrapped in `{data, error, meta}` envelope; error code constants defined; rate limit headers present. |
| P1-24 | CI/CD pipeline (GitHub Actions) | DevOps | PR jobs for build/test/lint/docker/migrate; merge-to-main deploys with migration pre-step; post-deploy health checks. |
| P1-25 | Dependency vulnerability scanning | DevOps | `npm audit` + `govulncheck` in CI; blocks on critical/high vulnerabilities; lockfiles committed. |
| P1-26 | Makefile / task runner | DevOps | Root Makefile with dev, migrate, sqlc, test, lint, build targets; all use Docker Compose for DB. |

---

## Section 2: Detailed Descriptions

### P1-01: Go API Module Initialization

**Description:**
Initialize the Go API module as the foundation for the entire backend. This creates the `api/` directory with a standard Go project layout, initializes `go.mod` with the module path `github.com/rekordly/rekordly-api`, and installs all approved backend dependencies from Doc 13. The API server is the primary security boundary for Rekordly V2 — it owns protected business logic, auth validation, plan enforcement, financial validation, ledger writes, and AI request mediation.

**Technical Details:**
- Module path: `github.com/rekordly/rekordly-api`
- Go version: `>= 1.22` (required for enhanced routing support and `log/slog`)
- Directory structure: `cmd/api/`, `internal/`, `migrations/`, `sqlc/queries/`
- Approved dependencies (from Doc 13):

  | Category | Dependency | Min Version |
  |----------|-----------|-------------|
  | Web Framework | `github.com/gin-gonic/gin` | `v1.9+` |
  | CORS Middleware | `github.com/gin-contrib/cors` | `v1.5+` |
  | Validation | `github.com/go-playground/validator/v10` | `v10.16+` |
  | Postgres Driver | `github.com/jackc/pgx/v5` | `v5.5+` |
  | Connection Pool | `github.com/jackc/pgx/v5/pgxpool` | `v5.5+` |
  | Decimal Math | `github.com/shopspring/decimal` | `v1.3+` |
  | JWT | `github.com/golang-jwt/jwt/v5` | `v5.2+` |
  | UUID | `github.com/google/uuid` | `v1.6+` |
  | Crypto | `golang.org/x/crypto` | `latest` |
  | LLM Client | `github.com/sashabaranov/go-openai` | `v1.20+` |
  | Email | `github.com/wneessen/go-mail` | `v0.4+` |
  | Web Push | `github.com/SherClockHolmes/webpush-go` | `v1.3+` |
  | HTTP Client | `github.com/go-resty/resty` | `v2.11+` |
  | Swagger | `github.com/swaggo/swag` | `v1.16+` |
  | Swagger Gin | `github.com/swaggo/gin-swagger` | `v1.6+` |
  | PDF | `github.com/go-pdf/fpdf` | `v0.8+` |
  | Config | `github.com/spf13/viper` | `v1.18+` |
  | Testing | `github.com/stretchr/testify` | `v1.8+` |

- CLI tools (not in `go.mod`): `github.com/sqlc-dev/sqlc v1.25+`, `github.com/golang-migrate/migrate/v4 v4.17+`
- No ORM — specifically no GORM (Doc 13 §Backend Rules)

**Acceptance Criteria:**
- [ ] `api/go.mod` exists with module name `github.com/rekordly/rekordly-api`
- [ ] Go version `>= 1.22` specified
- [ ] All approved dependencies declared at minimum versions in `go.mod`
- [ ] `go.sum` is committed
- [ ] `cmd/api/main.go` compiles and starts an empty Gin server on `:8080`
- [ ] Directory layout follows `cmd/api/`, `internal/`, `migrations/`, `sqlc/`
- [ ] No unapproved dependencies present (no GORM, no Redis libraries)
- [ ] `go vet ./...` passes with no warnings

---

### P1-02: Go Worker Module Initialization

**Description:**
Initialize the Go Worker module as the background job processor. The worker runs as a separate Dockerized service on Northflank and processes async jobs for PDF generation, CSV exports, notification delivery, heavy AI parsing, and future maintenance tasks. It follows strict guardrails from Doc 08: bounded concurrency, sleep-on-empty polling, exponential backoff, and max retry limits.

**Technical Details:**
- Module path: `github.com/rekordly/rekordly-worker`
- Go version: `>= 1.22`
- Directory structure: `cmd/worker/`, `internal/`
- Approved dependencies (subset of API deps — worker does not need HTTP routing or Swagger):

  | Category | Dependency | Min Version |
  |----------|-----------|-------------|
  | Postgres Driver | `github.com/jackc/pgx/v5` | `v5.5+` |
  | Connection Pool | `github.com/jackc/pgx/v5/pgxpool` | `v5.5+` |
  | Decimal Math | `github.com/shopspring/decimal` | `v1.3+` |
  | Config | `github.com/spf13/viper` | `v1.18+` |
  | Testing | `github.com/stretchr/testify` | `v1.8+` |

- Worker uses `SELECT ... FOR UPDATE SKIP LOCKED` for queue consumption (Ref: Doc 08 §Postgres Queue Rules)
- Graceful shutdown: finish in-flight jobs on SIGINT/SIGTERM, then exit

**Acceptance Criteria:**
- [ ] `worker/go.mod` exists with module name `github.com/rekordly/rekordly-worker`
- [ ] Go version `>= 1.22` specified
- [ ] All approved worker dependencies declared at minimum versions
- [ ] `cmd/worker/main.go` compiles and starts a skeleton worker process
- [ ] Worker connects to Postgres via `pgxpool` on startup
- [ ] Worker polls `jobs` table using `SELECT ... FOR UPDATE SKIP LOCKED`
- [ ] Worker exits gracefully on SIGINT/SIGTERM
- [ ] No unapproved dependencies present

---

### P1-03: PostgreSQL Migrations Setup with golang-migrate

**Description:**
Configure the database migration system using `golang-migrate/migrate v4.17+`. Migrations are the only mechanism for schema changes — they must be automatic, repeatable, and versioned. Failed migrations block deployment in CI/CD (Ref: Doc 08 §Database Migrations). Destructive migrations require explicit review and a backup/rollback plan.

**Technical Details:**
- CLI tool: `golang-migrate/migrate v4.17+`
- Migration directory: `api/migrations/`
- Naming pattern: `{6-digit-sequence}_{descriptive_name}.up.sql` and `.down.sql`
- Example: `000001_users.up.sql` / `000001_users.down.sql`
- CI pipeline step validates migrations on every PR against a Postgres service container
- Failed migrations block deploy (Ref: Doc 08 §Merge To Main)
- Production migrations run in CI/CD before deployment, never manually
- Migration ordering must respect FK dependencies (see Sequencing Notes below)

**Makefile Targets:**
- `make migrate-up` — runs `migrate -path api/migrations -database $DATABASE_URL up`
- `make migrate-down` — rolls back one step
- `make migrate-force` — handles dirty state
- `make migrate-create name=<name>` — creates new up/down migration files

**Acceptance Criteria:**
- [ ] `golang-migrate` CLI is installed and configured
- [ ] Migration files exist under `api/migrations/` with correct naming pattern
- [ ] `make migrate-up` applies all migrations successfully against local Postgres
- [ ] `make migrate-down` rolls back one step
- [ ] `make migrate-force` handles dirty state
- [ ] CI pipeline step validates migrations against a Postgres service container
- [ ] Each migration has both `.up.sql` and `.down.sql` files

---

### P1-04: sqlc Configuration for Type-Safe Queries

**Description:**
Configure `sqlc` to generate type-safe Go code from SQL queries. This replaces the need for an ORM — all database access goes through sqlc-generated code using parameterized queries only (Ref: Doc 13 §Backend Rules, Doc 09 §Injection Prevention). Monetary columns must map to `shopspring/decimal.Decimal`, never `float64`.

**Technical Details:**
- `sqlc.yaml` at `api/sqlc.yaml`
- Configuration:

```yaml
version: "2"
sql:
  - engine: "postgresql"
    database:
      uri: ""  # resolved at generate time from migrations
    schema: "migrations/"
    queries: "sqlc/queries/"
    gen:
      go:
        package: "db"
        out: "internal/db"
        sql_package: "pgx/v5"
        emit_json_tags: true
        emit_empty_slices: true
        overrides:
          - db_type: "numeric"
            go_type: "github.com/shopspring/decimal.Decimal"
          - db_type: "numeric(20,4)"
            go_type: "github.com/shopspring/decimal.Decimal"
```

- `sqlc/queries/` directory exists with at least one placeholder `.sql` file
- `make sqlc-generate` runs `sqlc generate` and commits output to `internal/db/`
- No ORM is used; all DB access goes through sqlc-generated code

**Acceptance Criteria:**
- [ ] `api/sqlc.yaml` exists with correct configuration
- [ ] `sql.queries` points to `sqlc/queries/` directory
- [ ] `sql.schema` points to `migrations/` directory
- [ ] All monetary columns map to `shopspring/decimal.Decimal` (never `float64`)
- [ ] `sqlc/queries/` directory exists with at least one placeholder `.sql` file
- [ ] `make sqlc-generate` runs successfully and produces Go code in `internal/db/`
- [ ] No ORM or GORM is used anywhere

---

### P1-05: Migration 001: `users` Table

**Description:**
Create the `users` table as the core identity entity. Every user in Rekordly V2 starts here. The table stores email, display name, avatar, and default currency. Email is unique and serves as the primary user-facing identifier. This is the first migration and has no FK dependencies on other tables.

**Table Schema:**

| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Unique user identifier |
| `email` | `VARCHAR(255)` | `NOT NULL UNIQUE` | Login identifier; must be unique |
| `display_name` | `VARCHAR(255)` | nullable | User's display name |
| `avatar_url` | `TEXT` | nullable | Profile picture URL |
| `default_currency_code` | `CHAR(3)` | `NOT NULL DEFAULT 'NGN'` | Default workspace currency; MVP is NGN |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` | Record creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` | Last update timestamp |

**Indexes:**

| Index | Definition | Rationale |
|-------|-----------|-----------|
| `idx_users_email` | `UNIQUE ON users(email)` | Fast email lookup for auth; enforces uniqueness |
| `users_pkey` | `ON users(id)` | Primary key index (automatic) |

**Acceptance Criteria:**
- [ ] File `api/migrations/000001_users.up.sql` exists
- [ ] File `api/migrations/000001_users.down.sql` drops the table
- [ ] `make migrate-up` creates the `users` table with all columns and constraints
- [ ] Email uniqueness constraint works (inserting duplicate email fails)
- [ ] Default values for `id`, `default_currency_code`, `created_at`, `updated_at` work

---

### P1-06: Migration 002: `auth_identities` Table

**Description:**
Create the `auth_identities` table to support provider-based authentication. MVP uses `email_otp` as the only provider, but the schema is extensible for future `whatsapp_otp` without rewriting the auth flow (Ref: Doc 09 §OTP Rules). OTP values are stored as bcrypt hashes — never in plaintext. The table tracks OTP expiry, failed attempt count, and lockout state for brute-force protection.

**Table Schema:**

| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Unique identity identifier |
| `user_id` | `UUID` | `NOT NULL REFERENCES users(id) ON DELETE CASCADE` | Owning user |
| `provider` | `VARCHAR(50)` | `NOT NULL` | Auth provider (`'email_otp'` for MVP, extensible to `'whatsapp_otp'`) |
| `provider_identifier` | `VARCHAR(255)` | `NOT NULL` | Email address for email_otp; phone for whatsapp |
| `otp_hash` | `VARCHAR(255)` | nullable | Bcrypt-hashed OTP value — never plaintext (Ref: Doc 09 §OTP Rules) |
| `otp_expires_at` | `TIMESTAMPTZ` | nullable | OTP must expire quickly (Ref: Doc 09 §OTP Rules) |
| `otp_attempts` | `INT` | `NOT NULL DEFAULT 0` | Tracks failed attempts for lockout (Ref: Doc 09 §OTP Rules) |
| `otp_last_requested_at` | `TIMESTAMPTZ` | nullable | For resend throttling (Ref: Doc 09 §OTP Rules) |
| `otp_locked_until` | `TIMESTAMPTZ` | nullable | Excessive failed attempts temporarily block verification (Ref: Doc 09 §OTP Rules) |
| `verified` | `BOOLEAN` | `NOT NULL DEFAULT FALSE` | Whether the user has verified this identity |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` | Record creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` | Last update timestamp |

**Indexes:**

| Index | Definition | Rationale |
|-------|-----------|-----------|
| `idx_auth_identities_user_provider` | `UNIQUE ON auth_identities(user_id, provider)` | One identity per provider per user |
| `idx_auth_identities_provider_lookup` | `ON auth_identities(provider, provider_identifier)` | Fast lookup during OTP verification |

**Foreign Keys:**

| FK | References | On Delete |
|----|-----------|-----------|
| `user_id` | `users(id)` | `CASCADE` |

**Acceptance Criteria:**
- [ ] File `api/migrations/000002_auth_identities.up.sql` exists
- [ ] File `api/migrations/000002_auth_identities.down.sql` drops the table
- [ ] `otp_hash` column exists for storing bcrypt-hashed OTP (never plaintext)
- [ ] `otp_expires_at`, `otp_attempts`, `otp_last_requested_at`, `otp_locked_until` columns exist
- [ ] Unique constraint on `(user_id, provider)` works
- [ ] Provider column allows `'email_otp'` and future `'whatsapp_otp'` values

---

### P1-07: Migration 003: `sessions` Table

**Description:**
Create the `sessions` table for managing authenticated user sessions. Supports short-lived access tokens and longer-lived refresh tokens with explicit revocation. Session tokens/cookies must be environment-specific and `Secure` in production (Ref: Doc 09 §Session Rules). Revoked sessions must fail on the next protected API request.

**Table Schema:**

| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Unique session identifier |
| `user_id` | `UUID` | `NOT NULL REFERENCES users(id) ON DELETE CASCADE` | Owning user |
| `workspace_id` | `UUID` | `NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE` | Active workspace context (FK added after workspaces migration) |
| `refresh_token_hash` | `VARCHAR(255)` | `NOT NULL` | Hashed refresh token for rotation |
| `user_agent` | `TEXT` | nullable | Browser/device identification |
| `ip_address` | `INET` | nullable | Client IP for audit |
| `expires_at` | `TIMESTAMPTZ` | `NOT NULL` | Session expiry time |
| `revoked_at` | `TIMESTAMPTZ` | nullable | When session was revoked (NULL = active) |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` | Session creation timestamp |

**Indexes:**

| Index | Definition | Rationale |
|-------|-----------|-----------|
| `idx_sessions_user_id` | `ON sessions(user_id)` | List sessions for a user |
| `idx_sessions_refresh_token` | `ON sessions(refresh_token_hash)` | Fast refresh token lookup |
| `idx_sessions_expires` | `ON sessions(expires_at)` | Cleanup expired sessions |

**Foreign Keys:**

| FK | References | On Delete |
|----|-----------|-----------|
| `user_id` | `users(id)` | `CASCADE` |
| `workspace_id` | `workspaces(id)` | `CASCADE` |

**Acceptance Criteria:**
- [ ] File `api/migrations/000003_sessions.up.sql` exists (or renumbered per sequencing)
- [ ] File `api/migrations/000003_sessions.down.sql` drops the table
- [ ] `refresh_token_hash` column stores hashed refresh tokens
- [ ] `revoked_at` column supports session revocation
- [ ] `expires_at` column enforces finite session lifetime
- [ ] FK to `workspaces(id)` is valid (requires workspaces migration first)

---

### P1-08: Migration 004: `workspaces` Table

**Description:**
Create the `workspaces` table as the tenant-scoping entity. Every tenant-owned record in the system requires `workspace_id`. MVP supports one workspace per user, but the model must not block future multi-workspace support (Ref: Doc 05 §Identity And Workspace). The `workspace_id` remains mandatory on all tenant data to avoid future tenant-model rewrites.

**Table Schema:**

| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Unique workspace identifier |
| `name` | `VARCHAR(255)` | `NOT NULL` | Workspace display name |
| `owner_id` | `UUID` | `NOT NULL REFERENCES users(id)` | Workspace owner |
| `default_currency_code` | `CHAR(3)` | `NOT NULL DEFAULT 'NGN'` | Default workspace currency; MVP is NGN |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` | Record creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` | Last update timestamp |

**Indexes:**

| Index | Definition | Rationale |
|-------|-----------|-----------|
| `idx_workspaces_owner_id` | `ON workspaces(owner_id)` | Find workspace by owner |

**Foreign Keys:**

| FK | References | On Delete |
|----|-----------|-----------|
| `owner_id` | `users(id)` | (no cascade — user deletion should not silently drop workspace) |

**Acceptance Criteria:**
- [ ] File `api/migrations/000004_workspaces.up.sql` exists (or renumbered per sequencing)
- [ ] File `api/migrations/000004_workspaces.down.sql` drops the table
- [ ] `owner_id` FK to `users(id)` is valid
- [ ] Default `default_currency_code` is `'NGN'`
- [ ] Table design does not block future multi-workspace support

---

### P1-09: Migration 005: `workspace_members` Table

**Description:**
Create the `workspace_members` table to track workspace membership and roles. MVP always assigns the `'owner'` role, but the `role` column is extensible for future team roles and permissions (Ref: Doc 05 §Identity And Workspace). The unique constraint on `(workspace_id, user_id)` prevents duplicate membership.

**Table Schema:**

| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Unique membership identifier |
| `workspace_id` | `UUID` | `NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE` | Owning workspace |
| `user_id` | `UUID` | `NOT NULL REFERENCES users(id) ON DELETE CASCADE` | Member user |
| `role` | `VARCHAR(50)` | `NOT NULL DEFAULT 'owner'` | Member role (MVP: always `'owner'`) |
| `joined_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` | When user joined workspace |

**Indexes:**

| Index | Definition | Rationale |
|-------|-----------|-----------|
| `idx_workspace_members_workspace_user` | `UNIQUE ON workspace_members(workspace_id, user_id)` | Prevent duplicate membership |

**Foreign Keys:**

| FK | References | On Delete |
|----|-----------|-----------|
| `workspace_id` | `workspaces(id)` | `CASCADE` |
| `user_id` | `users(id)` | `CASCADE` |

**Acceptance Criteria:**
- [ ] File `api/migrations/000005_workspace_members.up.sql` exists (or renumbered)
- [ ] File `api/migrations/000005_workspace_members.down.sql` drops the table
- [ ] Unique constraint on `(workspace_id, user_id)` works
- [ ] `role` column defaults to `'owner'` and supports future role values

---

### P1-10: Migration 006: `plans` Table

**Description:**
Create the `plans` table to define subscription tiers. Seeded with four rows matching Doc 10 §Subscription Plans: Free (NGN 0), Starter (NGN 2,500/mo), Business (NGN 6,000/mo), Pro (NGN 12,000/mo). The table stores price information in `NUMERIC(20,4)` — never float (Ref: Doc 09 §Money Rules). Paystack and Stripe price IDs are nullable for future integration.

**Table Schema:**

| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Unique plan identifier |
| `name` | `VARCHAR(50)` | `NOT NULL UNIQUE` | Plan name: `'free'`, `'starter'`, `'business'`, `'pro'` |
| `price_monthly_ngn` | `NUMERIC(20,4)` | `NOT NULL DEFAULT 0` | Monthly price in NGN |
| `price_annual_ngn` | `NUMERIC(20,4)` | `NOT NULL DEFAULT 0` | Annual price in NGN |
| `stripe_price_id` | `VARCHAR(255)` | nullable | Future Stripe integration |
| `paystack_plan_code` | `VARCHAR(255)` | nullable | Paystack plan code |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` | Record creation timestamp |

**Seed Data:**

| name | price_monthly_ngn | price_annual_ngn |
|------|-------------------|-------------------|
| `'free'` | `0` | `0` |
| `'starter'` | `2500.0000` | `25000.0000` |
| `'business'` | `6000.0000` | `60000.0000` |
| `'pro'` | `12000.0000` | `120000.0000` |

**Acceptance Criteria:**
- [ ] File `api/migrations/000006_plans.up.sql` exists with seed data
- [ ] File `api/migrations/000006_plans.down.sql` drops the table
- [ ] Four plan rows are inserted matching Doc 10 pricing
- [ ] `name` column has UNIQUE constraint
- [ ] All money columns use `NUMERIC(20,4)`, never float

---

### P1-11: Migration 007: `subscriptions` Table

**Description:**
Create the `subscriptions` table to track workspace plan subscriptions. Links a workspace to a plan with status tracking and billing period dates. Supports Paystack subscription codes for webhook-based subscription management. Status values allow tracking of active, past_due, cancelled, and expired subscriptions.

**Table Schema:**

| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Unique subscription identifier |
| `workspace_id` | `UUID` | `NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE` | Subscribing workspace |
| `plan_id` | `UUID` | `NOT NULL REFERENCES plans(id) ON DELETE CASCADE` | Active plan |
| `status` | `VARCHAR(50)` | `NOT NULL DEFAULT 'active'` | `'active'`, `'past_due'`, `'cancelled'`, `'expired'` |
| `current_period_start` | `TIMESTAMPTZ` | `NOT NULL` | Billing period start |
| `current_period_end` | `TIMESTAMPTZ` | `NOT NULL` | Billing period end |
| `paystack_subscription_code` | `VARCHAR(255)` | nullable | Paystack reference |
| `paystack_email_token` | `VARCHAR(255)` | nullable | Paystack email token |
| `cancelled_at` | `TIMESTAMPTZ` | nullable | When subscription was cancelled |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` | Record creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` | Last update timestamp |

**Indexes:**

| Index | Definition | Rationale |
|-------|-----------|-----------|
| `idx_subscriptions_workspace_id` | `ON subscriptions(workspace_id)` | Find subscription by workspace |
| `idx_subscriptions_status` | `ON subscriptions(status)` | Filter by subscription status |

**Acceptance Criteria:**
- [ ] File `api/migrations/000007_subscriptions.up.sql` exists
- [ ] File `api/migrations/000007_subscriptions.down.sql` drops the table
- [ ] FK to `workspaces(id)` and `plans(id)` are valid
- [ ] Status column supports required values
- [ ] Billing period columns enforce `NOT NULL`

---

### P1-12: Migration 008: `usage_counters` Table

**Description:**
Create the `usage_counters` table to track per-workspace usage metrics for plan enforcement. Backend enforces limits for transactions, invoices, loans, wallet deposits, AI credits, exports, offline sync depth, and reports (Ref: Doc 10 §Product And API Implications). The unique constraint on `(workspace_id, counter_type, period_start)` ensures one counter per type per billing period.

**Table Schema:**

| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Unique counter identifier |
| `workspace_id` | `UUID` | `NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE` | Owning workspace |
| `counter_type` | `VARCHAR(100)` | `NOT NULL` | `'transactions'`, `'ai_credits'`, `'exports'`, `'invoices'`, `'wallet_deposits'`, `'loans'` |
| `period_start` | `DATE` | `NOT NULL` | Billing period start date |
| `period_end` | `DATE` | `NOT NULL` | Billing period end date |
| `count` | `INT` | `NOT NULL DEFAULT 0` | Current usage count |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` | Record creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` | Last update timestamp |

**Indexes:**

| Index | Definition | Rationale |
|-------|-----------|-----------|
| `idx_usage_counters_workspace_type_period` | `UNIQUE ON usage_counters(workspace_id, counter_type, period_start)` | One counter per type per period |

**Acceptance Criteria:**
- [ ] File `api/migrations/000008_usage_counters.up.sql` exists
- [ ] File `api/migrations/000008_usage_counters.down.sql` drops the table
- [ ] Unique constraint prevents duplicate counters per workspace/type/period
- [ ] `counter_type` supports all required usage types

---

### P1-13: Migration 009: `feature_limits` Table

**Description:**
Create the `feature_limits` table to map plan-specific feature limits. This table is the source of truth for what each plan allows. Backend checks these limits before write operations, AI calls, and exports. The unique constraint on `(plan_id, feature_key)` ensures one limit per feature per plan. Seed data maps plan limits from Doc 10 §User-To-Feature Matrix using placeholder values where exact numbers are TBD.

**Table Schema:**

| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Unique limit identifier |
| `plan_id` | `UUID` | `NOT NULL REFERENCES plans(id) ON DELETE CASCADE` | Owning plan |
| `feature_key` | `VARCHAR(100)` | `NOT NULL` | `'transactions_per_month'`, `'ai_credits_per_month'`, `'exports_per_month'`, `'invoices_per_month'`, `'offline_queue_depth'`, `'tax_reports'`, `'multi_currency'`, `'invoice_branding_removal'` |
| `limit_value` | `INT` | `NOT NULL DEFAULT 0` | 0 = unlimited or not applicable; `-1` = not available |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` | Record creation timestamp |

**Indexes:**

| Index | Definition | Rationale |
|-------|-----------|-----------|
| `idx_feature_limits_plan_feature` | `UNIQUE ON feature_limits(plan_id, feature_key)` | One limit per feature per plan |

**Acceptance Criteria:**
- [ ] File `api/migrations/000009_feature_limits.up.sql` exists with seed data
- [ ] File `api/migrations/000009_feature_limits.down.sql` drops the table
- [ ] Seed data aligns with Doc 10 placeholder limits
- [ ] Unique constraint prevents duplicate feature limits per plan
- [ ] `limit_value` convention: 0 = unlimited, -1 = not available

---

### P1-14: Migration 010: `jobs` Table (Postgres-Backed Queue)

**Description:**
Create the `jobs` table as the Postgres-backed queue for async job processing. The Go worker polls this table using `SELECT ... FOR UPDATE SKIP LOCKED` (Ref: Doc 08 §Postgres Queue Rules). Jobs support PDF generation, CSV exports, AI parsing, and notification delivery. Failed jobs use exponential backoff with max 3 retries before moving to `status = 'failed'` (the dead letter queue). The partial index on `(status, scheduled_at)` ensures efficient queue polling.

**Table Schema:**

| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Unique job identifier |
| `workspace_id` | `UUID` | nullable | Some system jobs may not be tenant-scoped |
| `job_type` | `VARCHAR(100)` | `NOT NULL` | `'pdf_generation'`, `'export_csv'`, `'ai_parse'`, `'notification'` |
| `status` | `VARCHAR(50)` | `NOT NULL DEFAULT 'pending'` | `'pending'`, `'processing'`, `'completed'`, `'failed'` |
| `payload` | `JSONB` | `NOT NULL DEFAULT '{}'` | Job-specific data; should reference DB records, not embed large blobs |
| `attempts` | `INT` | `NOT NULL DEFAULT 0` | Current retry count |
| `max_attempts` | `INT` | `NOT NULL DEFAULT 3` | Maximum retries before marking failed |
| `scheduled_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` | When to execute the job (for delayed retries) |
| `started_at` | `TIMESTAMPTZ` | nullable | When job started processing |
| `completed_at` | `TIMESTAMPTZ` | nullable | When job completed |
| `next_retry_at` | `TIMESTAMPTZ` | nullable | Next retry time (exponential backoff) |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` | Job creation timestamp |

**Indexes:**

| Index | Definition | Rationale |
|-------|-----------|-----------|
| `idx_jobs_status_scheduled` | `ON jobs(status, scheduled_at) WHERE status = 'pending'` | Efficient `FOR UPDATE SKIP LOCKED` polling of pending jobs |
| `idx_jobs_workspace` | `ON jobs(workspace_id)` | List jobs by workspace |

**Acceptance Criteria:**
- [ ] File `api/migrations/000010_jobs.up.sql` exists
- [ ] File `api/migrations/000010_jobs.down.sql` drops the table
- [ ] Partial index on `(status, scheduled_at) WHERE status = 'pending'` supports `FOR UPDATE SKIP LOCKED`
- [ ] `payload` is `JSONB` for flexible job data
- [ ] `max_attempts` defaults to 3
- [ ] `workspace_id` is nullable for system jobs

---

### P1-15: Health Endpoint: `GET /api/v1/health`

**Description:**
Implement the health endpoint to confirm API process liveness. This is a lightweight check that does not verify dependencies — it simply confirms the Gin server is responding. Used by infrastructure (load balancers, Kubernetes, Northflank) to determine if the API process is alive. No authentication required. Includes rate limit headers per cross-cutting rules from Doc 06.

**Endpoint:**

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/v1/health` | None | Confirms API process liveness |

**Response Envelope (200 OK):**

```json
{
  "data": {
    "status": "ok",
    "timestamp": "2025-01-15T10:30:00Z"
  },
  "meta": {}
}
```

**Response Headers:**
- `X-RateLimit-Limit`
- `X-RateLimit-Remaining`
- `X-RateLimit-Reset`

**Security Considerations:**
- No authentication required — this is a public endpoint (Ref: Doc 06 §System)
- Must not expose internal implementation details
- Rate limit headers present even though health is unauthenticated (Ref: Doc 06 §Cross-Cutting Rules)

**Acceptance Criteria:**
- [ ] Route `GET /api/v1/health` is registered on Gin router
- [ ] Returns `200 OK` with standard envelope `{ "data": { "status": "ok", "timestamp": "..." }, "meta": {} }`
- [ ] No authentication required
- [ ] No dependency checks (Postgres, etc.)
- [ ] Rate limit headers present in response
- [ ] Does not expose implementation details

---

### P1-16: Readiness Endpoint: `GET /api/v1/ready`

**Description:**
Implement the readiness endpoint to confirm the API can serve traffic. Unlike the health endpoint, readiness checks critical dependencies: PostgreSQL connectivity, migration state compatibility, and required secrets. Returns `503 Service Unavailable` if any check fails. Used by CI/CD post-deploy health checks and infrastructure to determine if the API should receive traffic.

**Endpoint:**

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/v1/ready` | None | Confirms API dependency readiness |

**Response Envelope (200 OK):**

```json
{
  "data": {
    "status": "ready",
    "checks": {
      "postgres": "ok",
      "migrations": "ok",
      "secrets": "ok"
    }
  },
  "meta": {}
}
```

**Response Envelope (503 Service Unavailable):**

```json
{
  "data": null,
  "error": {
    "code": "SERVICE_UNAVAILABLE",
    "message": "Service not ready: postgres connection failed"
  },
  "meta": {}
}
```

**Readiness Checks:**
1. PostgreSQL connectivity via `pgxpool.Ping()`
2. Migration state compatibility — confirms expected migration version matches latest applied
3. Required secrets present — `DATABASE_URL`, `JWT_SIGNING_SECRET` are non-empty in Viper config

**Security Considerations:**
- No authentication required — public endpoint
- Error messages must not expose secrets or connection details
- Checks confirm minimum operational requirements (Ref: Doc 08 §Health Checks)

**Acceptance Criteria:**
- [ ] Route `GET /api/v1/ready` is registered on Gin router
- [ ] Returns `200 OK` when all checks pass
- [ ] Returns `503 Service Unavailable` with error code `SERVICE_UNAVAILABLE` when any check fails
- [ ] Checks PostgreSQL connectivity, migration state, and required secrets
- [ ] Error messages do not expose sensitive information

---

### P1-17: Go Worker Skeleton

**Description:**
Implement the Go worker skeleton that processes background jobs from the Postgres-backed queue. The worker follows strict guardrails from Doc 08: no tight polling loops (sleep 5 seconds when queue is empty), bounded concurrency (3-5 goroutines), exponential backoff on failures, max 3 retries, and graceful shutdown. Each job execution uses `context.WithTimeout` to prevent runaway processing.

**Behavior/Processing Steps:**
1. Connect to Postgres via `pgxpool` on startup
2. Poll `jobs` table using `SELECT * FROM jobs WHERE status = 'pending' AND scheduled_at <= now() ORDER BY scheduled_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED`
3. If a job is found, execute a no-op handler that marks it completed
4. If no job found, sleep 5 seconds before next poll (Ref: Doc 08 §Worker Guardrails)
5. Use bounded concurrency of 3-5 goroutines (Ref: Doc 08)
6. Each job uses `context.WithTimeout` — AI parsing jobs timeout at ~60s, PDF/export jobs have explicit timeouts (Ref: Doc 08)
7. Failed jobs use exponential backoff: attempt 1 retry after 1 min, attempt 2 after 5 min, attempt 3 after 15 min
8. Max retries = 3. After max retries, set `status = 'failed'` (dead letter queue)
9. Graceful shutdown on SIGINT/SIGTERM — finish in-flight jobs, then exit

**Worker Observability (Ref: Doc 08 §Health Checks):**
- Process liveness logging
- Database connectivity logging
- Queue polling status logging
- Current concurrency logging
- Failed job count logging

**Security Considerations:**
- Worker has database access but no public HTTP endpoints
- Job payloads should reference database records, not embed large blobs (Ref: Doc 08 §Postgres Queue Rules)
- Worker updates happen in database transactions (Ref: Doc 08 §Postgres Queue Rules)

**Acceptance Criteria:**
- [ ] Worker connects to Postgres via `pgxpool` on startup
- [ ] Polls `jobs` table with `SELECT ... FOR UPDATE SKIP LOCKED`
- [ ] Sleeps 5 seconds when queue is empty (no tight polling loop)
- [ ] Uses bounded concurrency of 3-5 goroutines
- [ ] Each job uses `context.WithTimeout`
- [ ] Failed jobs use exponential backoff (1min, 5min, 15min)
- [ ] Max 3 retries; exhausted jobs move to `status = 'failed'`
- [ ] Graceful shutdown on SIGINT/SIGTERM — in-flight jobs complete before exit
- [ ] Worker logs: liveness, DB connectivity, polling status, concurrency, failed count

---

### P1-18: Docker Compose for Local Dev

**Description:**
Create the Docker Compose configuration for fully isolated local development. Local development must never point to staging or production cloud databases (Ref: Doc 08 §Local Development). All four services run in Docker containers connected via a shared network. Local secrets must be fake or developer-owned. Local payment provider keys must use test mode only. Local AI keys must use sandbox or developer-limited credentials.

**Configuration Details:**

| Service | Container Name | Image/Build | Port | Environment |
|---------|---------------|-------------|------|-------------|
| `rekordly-postgres` | `rekordly-postgres` | `postgres:16-alpine` | `5432:5432` | `POSTGRES_DB=rekordly`, `POSTGRES_USER=rekordly`, `POSTGRES_PASSWORD=rekordly_local` |
| `rekordly-api` | `rekordly-api` | build `./api` | `8080:8080` | env_file `.env.local` |
| `rekordly-worker` | `rekordly-worker` | build `./worker` | (none) | env_file `.env.local` |
| `rekordly-web` | `rekordly-web` | build `./web` | `3000:3000` | env_file `.env.local` |

- PostgreSQL volume: `pgdata:/var/lib/postgresql/data`
- PostgreSQL healthcheck: `pg_isready`
- Network: `rekordly-net`
- API and Worker depend on Postgres (healthy)
- Web depends on API

**Acceptance Criteria:**
- [ ] `docker-compose.yml` exists at repo root
- [ ] Four services defined: postgres, api, worker, web
- [ ] Postgres uses `postgres:16-alpine` with fake local credentials
- [ ] Postgres healthcheck uses `pg_isready`
- [ ] API and Worker depend on healthy Postgres
- [ ] Web depends on API
- [ ] `docker compose up` starts all services
- [ ] Local code never connects to staging or production databases

---

### P1-19: Next.js Frontend Shell Initialization

**Description:**
Initialize the Next.js frontend project with App Router and all approved dependencies from Doc 13. This creates the `web/` directory with the project structure that will host all V2 UI: public pages, auth screens, dashboard, PWA shell, and offline queue. The frontend uses HeroUI components, Tailwind CSS, and Zustand for state management. No frontend AI/LLM libraries — all LLM interaction is handled by the Go backend (Ref: Doc 13 §Frontend Rules).

**Technical Details:**
- Framework: Next.js App Router `v14.2+`
- React: `v18.3+`
- `next.config.ts` sets `output: 'standalone'`
- Approved dependencies (from Doc 13):

  | Category | Dependency | Min Version |
  |----------|-----------|-------------|
  | UI Library | `@heroui/react` | `v2.3+` |
  | Styling | `tailwindcss` | `v3.4+` |
  | Icons | `lucide-react` | `v0.350+` |
  | Icons | `@phosphor-icons/react` | `v2.0+` |
  | Client State | `zustand` | `v4.5+` |
  | Server State | `@tanstack/react-query` | `v5.28+` |
  | HTTP Client | `axios` | `v1.6+` |
  | Form Logic | `react-hook-form` | `v7.51+` |
  | Validation | `zod` | `v3.22+` |
  | Form/Zod Bridge | `@hookform/resolvers` | `v3.3+` |
  | Charts | `recharts` | `v2.12+` |
  | Date Utilities | `date-fns` | `v3.6+` |
  | Themes | `next-themes` | latest |

- **Banned dependencies:** Redux, Moment.js, Material UI, any frontend AI/LLM libraries including Vercel AI SDK (Ref: Doc 13 §Frontend Rules)
- Fonts configured via Next font system: Figtree (body), Sora (headings), Fira Code (mono)

**Acceptance Criteria:**
- [ ] Next.js App Router project at `web/` with `next v14.2+`
- [ ] `package.json` includes all approved dependencies at minimum versions
- [ ] No banned dependencies present (Redux, Moment.js, Material UI, frontend AI/LLM)
- [ ] `next.config.ts` sets `output: 'standalone'`
- [ ] Font configuration: Figtree, Sora, Fira Code via Next font system
- [ ] `npm run build` succeeds
- [ ] `npm run dev` starts dev server on `:3000`

---

### P1-20: Brand Tokens and Design System Setup

**Description:**
Configure the Tailwind CSS design system with approved brand tokens from Doc 11. This preserves V1's visual identity while establishing a consistent token system for the entire frontend. HeroUI provider wraps the app with `next-themes` `ThemeProvider` for light/dark mode support. Color usage rules from Doc 11 §Color Usage must be followed: green for primary/success, orange for secondary/warning, red for destructive/overdue.

**Design Tokens (Ref: Doc 11 §Approved brand tokens):**

| Token | Value | Usage |
|-------|-------|-------|
| `colors.primary` | `#009e10` | Primary actions, active nav, revenue, success, brand focus |
| `colors.secondary` | `#fa8901` | Secondary emphasis, expenses, warning accents |
| `colors.dark.card` | `#121212` | Dark mode card/background surface |
| `colors.light.bg` | `#FAFFFB` | Light brand background |
| `colors.dark.bg` | `#010501` | Dark brand background |

**Font Configuration:**

| Role | Font |
|------|------|
| Sans/body/UI | Figtree |
| Heading/financial titles | Sora |
| Mono/technical | Fira Code |

**Global CSS:**
- CSS variables for light/dark mode
- Global resets and base styles in `globals.css`
- No decorative gradients
- No overuse of green/orange-only charts

**Acceptance Criteria:**
- [ ] Tailwind config extends with all brand tokens from Doc 11
- [ ] CSS variables set up for light/dark mode
- [ ] HeroUI provider wraps `app/layout.tsx` with `next-themes` `ThemeProvider`
- [ ] Global CSS resets and base styles in `globals.css`
- [ ] Font configuration: Figtree (body), Sora (headings), Fira Code (mono)
- [ ] Light/dark mode toggle works

---

### P1-21: Environment Configuration (Go — Viper)

**Description:**
Configure Viper for environment variable management in both the API and Worker modules. The app fails fast if required vars are missing at startup. Production never uses `.env` files (Ref: Doc 09 §Secrets). Config is environment-specific — CORS, database URLs, and API keys must differ between local, staging, and production.

**Configuration Variables:**

| Variable | Type | Default | Required | Purpose |
|----------|------|---------|----------|---------|
| `DATABASE_URL` | string | — | Yes | PostgreSQL connection string |
| `JWT_SIGNING_SECRET` | string | — | Yes | JWT signing key |
| `JWT_ACCESS_TTL` | duration | `15m` | No | Access token time-to-live |
| `JWT_REFRESH_TTL` | duration | `7d` | No | Refresh token time-to-live |
| `PORT` | int | `8080` | No | API server port |
| `CORS_ALLOWED_ORIGINS` | comma-separated | — | Yes | Approved frontend origins |
| `SMTP_HOST` | string | — | Phase 2+ | Email server host |
| `SMTP_PORT` | int | — | Phase 2+ | Email server port |
| `SMTP_USER` | string | — | Phase 2+ | Email auth user |
| `SMTP_PASSWORD` | string | — | Phase 2+ | Email auth password |
| `OPENAI_API_KEY` | string | — | Phase 2+ | AI provider key |
| `ENVIRONMENT` | string | `local` | No | `local`, `staging`, `production` |

**Behavior:**
- Viper reads `.env` in local dev only
- Production never uses `.env` files (Ref: Doc 09 §Secrets)
- App fails fast if required vars are missing at startup

**Acceptance Criteria:**
- [ ] Viper is configured in both `api/` and `worker/` modules
- [ ] All required env vars are validated at startup; app exits if missing
- [ ] Default values work for optional vars
- [ ] `.env` is read in local dev only
- [ ] `ENVIRONMENT` variable controls behavior differences

---

### P1-22: Environment Configuration (Next.js — .env)

**Description:**
Set up environment configuration for the Next.js frontend. `.env.local` is gitignored and contains actual values. `.env.example` is committed with placeholder values. No secret keys are exposed with `NEXT_PUBLIC_` prefix. Secrets are separate per environment (Ref: Doc 09 §Secrets).

**Configuration Variables:**

| Variable | Example (Local) | Example (Production) | Purpose |
|----------|-----------------|---------------------|---------|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8080/api/v1` | `https://api.rekordly.com/api/v1` | Backend API base URL |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | `https://rekordly.com` | Frontend app URL |

**Acceptance Criteria:**
- [ ] `.env.local` exists at `web/` and is gitignored
- [ ] `.env.example` exists at `web/` and is committed with placeholder values
- [ ] `NEXT_PUBLIC_API_URL` points to correct backend per environment
- [ ] No secret keys exposed with `NEXT_PUBLIC_` prefix
- [ ] Environment-specific URLs are correct

---

### P1-23: Response Envelope Middleware

**Description:**
Implement the Gin middleware that wraps all API responses into the standard envelope format from Doc 06 §Cross-Cutting Rules. Every response — success or error — uses the same structure. Error codes are defined as constants for consistent frontend error handling. All responses include rate limit headers (placeholder values in Phase 1; actual rate limiting wired in Phase 2).

**Response Envelope:**

```json
{
  "data": "<payload or null>",
  "error": "<null or { 'code': '<ERROR_CODE>', 'message': '<human-readable>' }>",
  "meta": "<pagination object or empty object>"
}
```

**Error Code Constants:**
- `UNAUTHORIZED`
- `FORBIDDEN`
- `VALIDATION_ERROR`
- `PLAN_LIMIT_REACHED`
- `RATE_LIMITED`
- `CONFLICT`
- `IDEMPOTENCY_CONFLICT`
- `INSUFFICIENT_WALLET_BALANCE`
- `OVERPAYMENT_NOT_ALLOWED`
- `JOB_NOT_READY`

**Response Headers (all responses):**
- `X-RateLimit-Limit`
- `X-RateLimit-Remaining`
- `X-RateLimit-Reset`

**Security Considerations:**
- Error messages must not expose implementation details (Ref: Doc 09 §Security Principles)
- Do not expose raw provider errors, stack traces, or internal IDs in error messages

**Acceptance Criteria:**
- [ ] Gin middleware wraps all responses into `{ "data", "error", "meta" }` envelope
- [ ] Success responses set `data` to payload, `error` to null
- [ ] Error responses set `data` to null, `error` to `{ "code", "message" }`
- [ ] All error code constants are defined and used consistently
- [ ] All responses include `X-RateLimit-*` headers (placeholder values)
- [ ] Error messages do not expose implementation details

---

### P1-24: CI/CD Pipeline (GitHub Actions)

**Description:**
Set up the CI/CD pipeline using GitHub Actions as the deployment orchestrator (Ref: Doc 08 §CI/CD Pipeline). Every PR runs build, test, lint, Docker build, and migration validation. Merge to `main` runs production migrations as a pre-deploy step, then deploys all services. Failed migrations block deployment. Post-deploy health checks verify the API is ready.

**Configuration Details:**

**PR Jobs:**
1. `web-install-build`: `cd web && npm ci && npm run build && npm run lint`
2. `api-test`: `cd api && go test ./... && go vet ./...`
3. `worker-test`: `cd worker && go test ./...`
4. `api-docker-build`: build Docker image for `rekordly-api`
5. `worker-docker-build`: build Docker image for `rekordly-worker`
6. `migrate-dry-run`: run migrations against a CI Postgres service container
7. `deploy-staging`: deploy to staging using staging secrets

**Merge to `main` Jobs:**
1. Reuse tested Docker images
2. Run production DB migrations as pre-deploy step
3. Stop deployment if migrations fail
4. Deploy API + Worker + Web
5. Post-deploy health checks against `GET /api/v1/health` and `GET /api/v1/ready`

**Acceptance Criteria:**
- [ ] `.github/workflows/ci.yml` runs on every PR and merge to `main`
- [ ] PR jobs: frontend build/test/lint, Go test/vet, Docker builds, migration dry run, staging deploy
- [ ] Merge-to-main: production migrations, deploy, health checks
- [ ] Failed migrations block deployment
- [ ] Post-deploy health checks verify `GET /api/v1/health` and `GET /api/v1/ready`
- [ ] Staging uses staging secrets, staging DB, test payment keys

---

### P1-25: Dependency Vulnerability Scanning

**Description:**
Set up automated dependency vulnerability scanning in CI to catch security issues before deployment (Ref: Doc 09 §Supply Chain Security). Frontend uses `npm audit`; Go uses `govulncheck`. CI blocks on critical or high-severity vulnerabilities unless explicitly reviewed and accepted with mitigation. Lockfiles are committed and dependency updates are reviewed intentionally.

**Configuration Details:**
- `npm audit` for Next.js dependencies — blocks on critical or high
- `govulncheck ./...` for Go API and Worker — blocks on critical or high
- Lockfiles (`go.sum`, `package-lock.json`) are committed
- Docker images scanned before production deployment when practical

**Acceptance Criteria:**
- [ ] CI pipeline includes `npm audit` step for Next.js
- [ ] CI pipeline includes `govulncheck ./...` step for Go API and Worker
- [ ] Pipeline blocks on critical or high vulnerabilities
- [ ] Lockfiles are committed
- [ ] Scanning runs on every PR

---

### P1-26: Makefile / Task Runner

**Description:**
Create a root Makefile that provides convenient targets for common development tasks. All targets use Docker Compose for the database — never cloud databases (Ref: Doc 08 §Local Development). This ensures developers can run the full stack locally with simple commands.

**Makefile Targets:**

| Target | Command |
|--------|---------|
| `make dev` | Starts Docker Compose (all services) |
| `make down` | Stops Docker Compose |
| `make migrate-up` | Runs `migrate -path api/migrations -database $DATABASE_URL up` |
| `make migrate-down` | Rolls back one migration step |
| `make migrate-create name=<name>` | Creates new up/down migration files |
| `make sqlc-generate` | Runs `sqlc generate` and commits output |
| `make api-test` | Runs `cd api && go test ./...` |
| `make worker-test` | Runs `cd worker && go test ./...` |
| `make web-test` | Runs `cd web && npm test` |
| `make lint` | Runs all linters |
| `make build-all` | Builds all Docker images |

**Acceptance Criteria:**
- [ ] Root `Makefile` exists with all listed targets
- [ ] `make dev` starts all Docker Compose services
- [ ] `make down` stops all services
- [ ] `make migrate-up/down/create` work with local Docker Postgres
- [ ] `make sqlc-generate` produces Go code in `internal/db/`
- [ ] `make api-test`, `make worker-test`, `make web-test` run tests
- [ ] All targets use Docker Compose for DB, not cloud databases

---

## Dependency / Sequencing Notes

1. **P1-05 through P1-09** (identity/workspace migrations) must run in order. Recommended order: `users` (001) → `workspaces` (002) → `workspace_members` (003) → `auth_identities` (004) → `sessions` (005) → `plans` (006) → `subscriptions` (007) → `usage_counters` (008) → `feature_limits` (009) → `jobs` (010). The sessions FK to `workspaces(id)` must be valid.
2. **P1-04** (sqlc) depends on P1-05+ migrations existing so that the schema can be introspected.
3. **P1-15 and P1-16** (health/ready) depend on P1-01 (Go API shell) and P1-21 (Viper config with `DATABASE_URL`).
4. **P1-17** (worker skeleton) depends on P1-02 (worker module) and P1-14 (jobs table).
5. **P1-18** (Docker Compose) depends on P1-01, P1-02, and P1-19 being structurally complete so containers can build.
6. **P1-24** (CI/CD) can be set up in parallel with migrations but depends on P1-18 for Docker builds to work.
7. **P1-19 and P1-20** (frontend shell) are independent of backend work and can start immediately.
8. **P1-13** (feature_limits) seed data should align with Doc 10 placeholder limits. Exact values can be refined later; the structure must be correct.
