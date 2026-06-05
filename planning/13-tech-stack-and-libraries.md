# 13 - Rekordly V2 Tech Stack And Libraries

## Summary

This document is the strict, version-pinned dependency manifest for Rekordly V2 implementation.

If a package, library, framework, or runtime dependency is not listed here, it must not be installed or added without explicit approval. This rule exists to keep the rebuild focused, secure, affordable, and maintainable.

## Runtime Environment Requirements

| Runtime | Required Version | Notes |
|---|---:|---|
| Go | `>= 1.22` | Required for enhanced routing support and `log/slog` usage |
| Node.js | `>= 20.x LTS` | Required for the Next.js frontend toolchain |
| PostgreSQL | `>= 16.x` | Required database baseline for MVP |

## Backend (Go) - Strict Dependencies

### Core API & Routing

| Category | Approved Dependency | Min Version | Purpose |
|---|---|---:|---|
| Web Framework | `github.com/gin-gonic/gin` | `v1.9+` | HTTP API routing and middleware |
| CORS Middleware | `github.com/gin-contrib/cors` | `v1.5+` | Cross-domain auth handling |
| Validation | `github.com/go-playground/validator/v10` | `v10.16+` | Request payload validation |

### Database & Data Integrity

| Category | Approved Dependency | Min Version | Purpose |
|---|---|---:|---|
| Postgres Driver | `github.com/jackc/pgx/v5` | `v5.5+` | PostgreSQL access |
| Connection Pool | `github.com/jackc/pgx/v5/pgxpool` | `v5.5+` | Concurrency-safe connection pooling |
| SQL Compiler | `github.com/sqlc-dev/sqlc` | `v1.25+` | Type-safe query generation; no ORMs |
| Migrations CLI | `github.com/golang-migrate/migrate/v4` | `v4.17+` | Database schema migrations |
| Decimal Math | `github.com/shopspring/decimal` | `v1.3+` | Strict money/financial calculations; never `float64` |

### Auth, Security & Identity

| Category | Approved Dependency | Min Version | Purpose |
|---|---|---:|---|
| JWT | `github.com/golang-jwt/jwt/v5` | `v5.2+` | Session token management |
| UUID | `github.com/google/uuid` | `v1.6+` | Unique identifier generation |
| Bcrypt | `golang.org/x/crypto/bcrypt` | `latest` | Password/secret hashing if needed |

### Integrations & Communication

| Category | Approved Dependency | Min Version | Purpose |
|---|---|---:|---|
| LLM/AI Client | `github.com/sashabaranov/go-openai` | `v1.20+` | OpenAI/LLM provider abstraction |
| Email Sending | `github.com/wneessen/go-mail` | `v0.4+` | SMTP email delivery for OTP and notifications |
| Web Push | `github.com/SherClockHolmes/webpush-go` | `v1.3+` | PWA push notification delivery |
| HTTP Client | `github.com/go-resty/resty` | `v2.11+` | Paystack/webhook outgoing requests |

### API Documentation

| Category | Approved Dependency | Min Version | Purpose |
|---|---|---:|---|
| API Docs / Swagger | `github.com/swaggo/swag` | `v1.16+` | Auto-generates OpenAPI/Swagger docs from Go annotations |
| Swagger Middleware | `github.com/swaggo/gin-swagger` | `v1.6+` | Serves the Swagger UI on the Go API |

### Infrastructure & Utilities

| Category | Approved Dependency | Min Version | Purpose |
|---|---|---:|---|
| PDF Generation | `github.com/go-pdf/fpdf` | `v0.8+` | Backend invoice/report PDF generation |
| Env/Config | `github.com/spf13/viper` | `v1.18+` | Environment variable management |
| Logging | `log/slog` | Go `1.21+` | Structured logging; standard library |
| Testing | `github.com/stretchr/testify` | `v1.8+` | Assertion and mock testing |

### Backend Rules

- Use `pgxpool` for all database connections.
- Use `sqlc` for type-safe queries. No ORMs and no GORM.
- Use parameterized queries only.
- Use `shopspring/decimal` for all money math. Never use `float64`.
- Use `go-mail` for email OTP delivery.
- Use `go-openai` for AI provider integration.
- Use `webpush-go` for PWA push notifications.
- Use `swaggo/swag` annotations on all API endpoints.
- Generate and serve Swagger UI so frontend developers and AI agents can read the API contract easily.
- Use `log/slog` for structured logging.
- Avoid adding Redis libraries until Redis is explicitly promoted from Post-MVP.

## Frontend (Next.js / React) - Strict Dependencies

### Core Framework & UI

| Category | Approved Dependency | Min Version | Purpose |
|---|---|---:|---|
| Framework | `next` | `v14.2+` | App Router, SSR, API routes |
| React Core | `react`, `react-dom` | `v18.3+` | UI rendering |
| UI Library | `@heroui/react` | `v2.3+` | Component system; V2/HeroUI |
| Styling | `tailwindcss` | `v3.4+` | Utility-first CSS |
| Icons | `lucide-react` | `v0.350+` | Primary icon set |
| Icons | `@phosphor-icons/react` | `v2.0+` | Flexible icon set alongside Lucide |
| Fonts | Next font system | Built-in | Figtree and Sora loading |

### State, Data & Forms

| Category | Approved Dependency | Min Version | Purpose |
|---|---|---:|---|
| Client State | `zustand` | `v4.5+` | Global UI state management |
| Server State | `@tanstack/react-query` | `v5.28+` | Backend data fetching/caching |
| HTTP Client | `axios` | `v1.6+` | API requests |
| Form Logic | `react-hook-form` | `v7.51+` | Complex form state management |
| Validation | `zod` | `v3.22+` | Schema validation for frontend and backend compatibility |
| Form/Zod Bridge | `@hookform/resolvers` | `v3.3+` | Connects Zod to React Hook Form |

### Visualizations & Utilities

| Category | Approved Dependency | Min Version | Purpose |
|---|---|---:|---|
| Charts | `recharts` | `v2.12+` | Dashboard/report charts |
| Date Utilities | `date-fns` | `v3.6+` | Budget/report timeframe calculations |

### PWA & Offline

| Category | Approved Dependency | Min Version | Purpose |
|---|---|---:|---|
| PWA Framework | `@ducanh2912/next-pwa` | `v5.6+` | Service worker generation |
| Offline DB | `idb` | `v8.0+` | IndexedDB wrapper for offline queue/caching |
| Web Push Client | `web-push` | `v3.6+` | Frontend push notification registration |

### Frontend Rules

- Use Next.js App Router exclusively.
- Use `@heroui/react` for all base UI components. No second UI libraries.
- Use `react-hook-form` + `zod` for all complex financial forms, including AI confirmation and invoices.
- Use `@tanstack/react-query` for all backend data fetching.
- Use `axios` for API requests.
- Use `idb` for managing the offline mutation queue with a max of 100 items.
- Use `date-fns` for all date manipulations, including weekly, monthly, and yearly budgets.
- Use `lucide-react` and `@phosphor-icons/react` as the approved icon libraries.
- Do not add frontend AI/LLM libraries, including Vercel AI SDK.
- The frontend treats AI parsing endpoints as standard JSON request/response endpoints using `axios` and `@tanstack/react-query`.
- All LLM interaction is handled strictly by the Go backend using `github.com/sashabaranov/go-openai`.
- Do not add Redux.
- Do not add Moment.js.
- Do not add Material UI.

## Infrastructure / DevOps

| Category | Approved Tooling | Min Version | Purpose |
|---|---|---:|---|
| Containerization | Docker & Docker Compose | `v2.24+` | Local development environment |
| CI/CD | GitHub Actions | Latest | Automated testing/deployment |
| Migrations | `golang-migrate` CLI | `v4.17+` | Executing database migrations |

### Infrastructure Rules

- Local development must use Docker Compose.
- CI/CD must run through GitHub Actions.
- Database migrations must use `golang-migrate`.
- Failed migrations must block deployment.

## Dependency Approval Rule

If it is not listed in this document, do not install it without explicit approval.

Approval requires stating:

- The exact package name.
- Why it is needed.
- Why existing dependencies are insufficient.
- Its security and maintenance status.

## Review Criteria

- Runtime requirements are present.
- Backend dependencies include approved minimum versions and purposes.
- Backend API documentation dependencies are included.
- Backend rules require Swagger annotations and served Swagger UI.
- Frontend dependencies include approved minimum versions and purposes.
- `@phosphor-icons/react` is included alongside `lucide-react`.
- Frontend rules ban frontend AI/LLM libraries.
- Go backend remains the only layer allowed to call LLM providers.
- Infrastructure tooling includes approved minimum versions and purposes.
- Dependency approval rule remains present and strict.

## Assumptions

- Go is the backend language.
- Next.js is the frontend framework.
- PostgreSQL is the database.
- The MVP uses a Postgres-backed queue.
- Redis remains Post-MVP until explicitly approved.
- Implementation agents must request approval before adding anything not listed here.
