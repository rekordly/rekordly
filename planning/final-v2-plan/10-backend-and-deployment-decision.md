# Rekordly v2 Backend and Deployment Decision

**Prepared:** 7 November 2026  
**Decision status:** Core backend selected; provider tiers/cost verification pending  
**Decision deadline:** 8 November 2026  
**Launch target:** 1 December 2026

## 1. Correction to the earlier plan

The backend language, framework and production hosting provider have **not** been selected. Earlier references to Go, Gin, Northflank or Vercel were proposals, not founder decisions.

The repository currently contains only a small Go foundation: configuration, a health endpoint, Docker setup and a worker that connects to PostgreSQL. It contains no ledger, inventory, invoicing or other financial-domain implementation. Switching now is inexpensive; switching after financial modules are built will not be.

## 2. Decisions that should not be mixed together

1. **Application shape:** modular monolith, PostgreSQL and a separate background worker.
2. **Backend stack:** Rust, Go, NestJS, Fastify or FastAPI.
3. **Deployment model:** managed container platform, VPS, serverless or Kubernetes.
4. **Hosting vendor:** Railway, Render, Northflank, Fly.io or another verified provider.

Rekordly should lock the application shape now. Stack and vendor remain open until the decision gate in section 12.

## 3. Non-negotiable requirements for every stack

The language does not create accounting correctness. Every candidate must implement the same controls:

- PostgreSQL transactions for each financial command.
- Integer minor units for posted monetary totals/ledger lines, with fixed-decimal rates, quantities and unit-cost intermediates as specified in document 11.
- Balanced double-entry journals before commit.
- Immutable confirmed records with reversal/correction workflows.
- Workspace scoping on every tenant-owned query.
- Idempotency for all financial mutations and offline replay.
- Transactional stock quantity, valuation and ledger effects.
- Bounded background work, timeouts, retry limits and dead-letter visibility.
- Schema validation at every API and AI boundary.
- Integration, concurrency, property/invariant and cross-tenant tests.
- One API container, one worker container and one migration command from the same backend codebase.

## 4. Normalized candidates

The fair comparison is:

| Candidate | Concrete stack evaluated |
|---|---|
| Rust | Axum + Tokio + SQLx |
| Go | `net/http` or Chi/Gin + pgx + sqlc |
| NestJS | NestJS modular monolith + Node adapter or Fastify adapter + PostgreSQL query layer |
| Fastify | Direct Fastify + TypeScript + JSON Schema/type provider + PostgreSQL query layer |
| FastAPI | FastAPI + Pydantic + SQLAlchemy Core/asyncpg or equivalent |

NestJS and Fastify are not mutually exclusive technologies: NestJS can run on a Fastify adapter. Direct Fastify means choosing the HTTP framework without Nest's modules, dependency injection and application conventions.

## 5. Weighted decision matrix

Scores are 1 (weak for this project) to 5 (strong). They measure December delivery risk for a solo founder, not which technology is universally best.

| Criterion | Weight | Rust | Go | NestJS | Fastify | FastAPI |
|---|---:|---:|---:|---:|---:|---:|
| Delivery speed before December 1 | 25% | 2 | 4 | 5 | 5 | 5 |
| Financial invariant safety | 20% | 5 | 5 | 4 | 4 | 3 |
| Solo-founder maintainability | 15% | 2 | 4 | 5 | 3 | 4 |
| Libraries/integrations/hiring | 10% | 3 | 4 | 5 | 5 | 5 |
| Workers and concurrency | 10% | 5 | 5 | 4 | 4 | 4 |
| Deployment simplicity/cost | 10% | 3 | 5 | 4 | 4 | 4 |
| Runtime performance/efficiency | 5% | 5 | 5 | 3 | 4 | 3 |
| AI/data tooling | 5% | 3 | 3 | 4 | 4 | 5 |
| **Weighted result** | **100%** | **3.30** | **4.40** | **4.45** | **4.20** | **4.15** |

The 0.05 difference between NestJS and Go is not decision-grade evidence. The correct choice depends more on the founder's fluency and measured implementation speed than on theoretical benchmarks.

## 6. Candidate findings

### Rust with Axum, Tokio and SQLx

**Strongest when:** the founder is already productive in Rust and wants the most compile-time protection and resource efficiency.

Advantages:

- Strong ownership and type system eliminate broad classes of memory and concurrency errors.
- Excellent throughput and low memory use for APIs and workers.
- SQLx can check statically written SQL against the schema during development/CI.
- Enums and domain types can model financial states precisely.
- One compiled artifact and predictable container runtime.

Risks for Rekordly now:

- Highest learning and debugging cost if Rust is not already a fluent production language.
- Async ownership, lifetimes and error design can slow ordinary product work.
- Many SaaS integrations have JavaScript/Python-first examples; more adapter code may be required.
- PDF, email, payment and AI SDK choices need earlier validation.
- Rust safety does not prevent wrong accounting rules or incorrect SQL transactions.

Decision rule: choose Rust only if the founder can build the benchmark slice in no more than 125% of the fastest candidate's time and can explain/maintain the resulting async and database code without agent dependence.

### Go with pgx and sqlc

**Strongest when:** predictable operations, explicit transactions and a small production surface matter more than full-stack language reuse.

Advantages:

- Simple concurrency and cancellation model for API and worker workloads.
- Low memory, fast startup, compact containers and straightforward deployment.
- Explicit SQL with sqlc and pgx suits transaction-heavy accounting logic.
- Mature standard library and easy-to-debug production binaries.
- Existing repository scaffold already uses Go, although little code is preserved.

Risks:

- More manual application structure and repetitive mapping/validation code.
- Nil/error handling and primitive types require disciplined domain wrappers.
- Less shared code with the TypeScript frontend.
- AI and SaaS libraries may trail JavaScript/Python, though HTTP APIs remove most blocking concerns.

Decision rule: choose Go if the benchmark slice is at least as fast as NestJS within 15%, and its explicitness feels easier to maintain.

### NestJS

**Strongest when:** TypeScript is the founder's fastest language and the project benefits from enforced module boundaries.

Advantages:

- Modules, providers, guards, pipes and interceptors provide a strong modular-monolith structure.
- Excellent ecosystem for authentication, email, payments, validation, OpenAPI and testing.
- Same language across frontend, API and worker reduces context switching.
- Clear capability modules fit Ledger, Sales, Inventory, Purchasing and Commerce boundaries.
- Adapter choice does not need to dominate the decision; database work will dominate most Rekordly requests.

Risks:

- Decorators, dependency injection and framework conventions create abstraction overhead.
- Easy to produce large services or circular module dependencies without strict boundaries.
- Node has higher baseline memory than Go/Rust, and CPU-heavy PDF/report work must be isolated or delegated.
- JavaScript `number` must never be used for money; decimal strings and a decimal library are mandatory.

Current framework note: official Nest documentation recommends its newer Node adapter for new Nest v12.3 projects and reports it slightly ahead of the Fastify adapter in its benchmark. The framework is expected to change its default in v13. This must be rechecked against the exact version at implementation time.

Decision rule: choose NestJS if TypeScript materially shortens the benchmark slice and the module/test structure remains understandable.

### Direct Fastify

**Strongest when:** the founder wants TypeScript speed with a thinner framework than NestJS.

Advantages:

- Fast, lightweight HTTP layer with a strong plugin model.
- JSON Schema validation and serialization can be efficient and explicit.
- Less framework ceremony than NestJS.
- Broad Node ecosystem and easy SaaS integration.

Risks:

- Rekordly must design its own module, dependency, transaction and cross-cutting conventions.
- Plugin/type-provider choices can make TypeScript inference inconsistent.
- Schema coercion needs care for money, dates and booleans.
- A thin framework can become an unstructured application as the financial domain grows.

Decision rule: select direct Fastify only if the founder prefers manual architecture and writes a module-boundary template before feature work.

### FastAPI

**Strongest when:** Python is the founder's fastest language or AI/data workloads dominate the application.

Advantages:

- Very fast API development, excellent request/response schemas and generated documentation.
- Best access to Python AI, document and data libraries.
- Clear async support for I/O-heavy routes.
- Good choice for a later specialized AI/import service if one becomes necessary.

Risks:

- Dynamic runtime makes disciplined typing and invariant tests more important.
- CPU-heavy tasks and careless blocking calls can stall async workers.
- Deployment often needs more tuning around processes, memory and job workers.
- The core product is transaction-heavy accounting, not an ML pipeline.

Decision rule: use FastAPI for the core only if Python is clearly the founder's fastest reliable production stack. Otherwise keep it as a possible future AI/document sidecar, not an MVP service.

## 7. Founder decision

**Go is selected for the core backend.**

Evidence: the founder can deploy Go, has NestJS experience, prefers explicit/manual structure and will not trade December scope for learning Rust. NestJS/Fastify, Rust and FastAPI are not part of the launch architecture. A Python AI sidecar is not needed because Go can call provider APIs over HTTP.

## 8. Technology-neutral application architecture

Whichever stack wins, use:

- A capability-based modular monolith.
- One repository/backend codebase producing an API process, worker process and migration command.
- PostgreSQL as the financial source of truth.
- PostgreSQL outbox/job tables initially; no Redis/Kafka until measured need.
- Object storage for PDFs, images and imports.
- OpenAPI contract consumed by the Next.js frontend.
- Separate deployable frontend, API and worker.
- No microservices before the December beta.

## 9. Deployment-model comparison

| Model | Delivery speed | Operations burden | Cost control | Fit now |
|---|---:|---:|---:|---|
| Managed container PaaS | High | Low | Medium | **Recommended** |
| Single VPS + Docker Compose | Medium | High | High | Later, if cost demands and operations are owned |
| Serverless functions for core API | Medium | Medium | Variable | Not recommended for core transactions/worker |
| Managed Kubernetes | Low | Very high | Low at beta scale | Reject for MVP |

The production shape should be:

- Next.js frontend on a managed web platform or container.
- Always-on API container.
- Always-on or safely autoscaled worker container.
- Managed PostgreSQL with automated backups and tested restore.
- S3-compatible object storage.
- DNS/edge provider capable of wildcard storefront subdomains and customer-domain TLS.
- Separate staging and production data.

Avoid placing financial transactions and background processing entirely inside short-lived frontend/serverless functions. Long reports, imports, AI calls, PDFs and domain verification belong in the worker.

## 10. Hosting candidates as of 7 November 2026

Provider details and prices are time-sensitive and must be rechecked before purchase.

### Railway

- Fast developer experience for container services, environments, private networking and PostgreSQL.
- Usage pricing plus plan minimum; current documentation lists Hobby at US$5 and Pro at US$20, with plan payment counting toward usage.
- API and continuous worker can be persistent services; scheduled work can be cron services.
- Backups/PITR, pooling and high availability must be explicitly enabled and priced.
- Railway states it does not currently publish an uptime SLA for its database offering; this is acceptable for controlled beta only with independent backup/restore discipline.

### Render

- Clear web-service, background-worker and managed-PostgreSQL model.
- Supports Node, Python, Go, Rust and Docker, so it does not constrain the stack choice.
- Current entry paid compute is listed from US$7 per service; separate API and worker plus database must be budgeted together.
- Automatic TLS, custom domains and wildcard domains are documented.
- Simple operational model, but multiple always-on services can exceed a very small budget quickly.

### Northflank

- Supports services, jobs, databases, secrets, pipelines, backups and custom domains in one platform.
- Current Sandbox advertises up to US$20/month of resources across two services, two jobs and one database, but production guarantees and limits must be verified.
- Pay-as-you-go compute is flexible; pricing is in US dollars and exchange-rate/VAT risk applies.
- Richer platform surface than Railway/Render, which can be useful or add unnecessary configuration for one founder.

### Fly.io

- Efficient machines and process deployment with good geographic control.
- More infrastructure choices and operational responsibility than the simplest PaaS options.
- Current fully managed PostgreSQL starts materially higher than the smallest app machines, which may conflict with the launch budget.
- Use only if its regional/runtime advantages justify the added operational work.

### VPS

- A small VPS can be cheaper and can run API/worker together, but the founder owns patching, firewall, monitoring, database operations, backup verification and recovery.
- Do not self-host the only production database on the same single VPS for the public beta.

## 11. Provisional deployment recommendation

Use a **managed container PaaS for the beta**, but do not lock the vendor until a budget and capability check is recorded.

Provisional order for evaluation:

1. Railway — fastest setup and low initial usage cost.
2. Render — clearest conventional service/worker/database model.
3. Northflank — evaluate if its included Sandbox resources and wildcard/custom-domain workflow are suitable.
4. Fly.io — evaluate only if region placement or machine control becomes decisive.

This ordering is not a purchase decision. Provider selection must include an actual monthly estimate for API, worker, PostgreSQL, backups, storage, egress, frontend, email, monitoring and taxes/FX.

## 12. Implementation verification gate: one proof, not a rewrite contest

The founder has selected Go. Time-box verification to one working day; do **not** build five implementations or reopen the framework comparison without a failed Go proof.

### Step A — founder fluency declaration (15 minutes)

Rank Rust, Go, TypeScript and Python by recent production competence. A language that requires learning fundamentals cannot win a December launch decision.

### Step B — build the Go proof (maximum 3 hours)

Implement the same disposable vertical proof:

1. Parse an expense request containing a decimal string.
2. Validate workspace and idempotency key.
3. In one PostgreSQL transaction, create source record plus balanced debit/credit lines.
4. Roll back an intentionally unbalanced command.
5. Return the original result for an idempotent retry.
6. Enqueue an outbox job.
7. Test the happy path, rollback and duplicate retry.

Measure active implementation time, test clarity, debugging friction, memory at idle and container size. Delete neither proof until the decision is recorded.

### Step C — Go acceptance

Accept the Go foundation when it:

- passes every invariant;
- is fastest to implement and understand;
- requires the least agent-generated code the founder cannot personally maintain;
- has no blocker for PDF, payments, email, object storage or AI calls.

### Step D — provider estimate

Deploy only the winning proof to the top two hosting candidates, record cold/warm behavior, database connectivity, logs, migration flow, worker behavior, backup/restore flow and estimated monthly bill.

## 13. Questions the founder still needs to answer

1. Which language can you debug without an agent: Rust, Go, TypeScript or Python?
2. Have you shipped and operated a production service in any of them?
3. Do you prefer explicit/manual structure (Go/Fastify/Rust) or enforced framework conventions (NestJS)?
4. Are you willing to trade December scope for Rust learning and long-term ownership?
5. Which international cards/payment methods can reliably pay the hosting provider?
6. Is the under-₦50,000 ceiling for infrastructure alone, or infrastructure plus email, AI and monitoring?

## 14. Decision record template

Complete this before implementation continues:

| Decision | Selection | Evidence | Date/owner |
|---|---|---|---|
| Core backend | Go modular monolith | Founder answers and repository scaffold | Founder, 7 Nov 2026 |
| HTTP framework/adapter | Go; exact router remains implementation verification | Small routing/middleware spike | Founder |
| Database/query layer | PostgreSQL + pgxpool + sqlc | Explicit SQL/transaction preference | Founder, 7 Nov 2026 |
| Worker library/pattern | Separate Go worker + PostgreSQL outbox/jobs | Existing scaffold; job proof pending | Founder |
| Frontend host | Pending | Build/domain/cost check | Founder |
| API/worker host | Render selected; paid tier before public beta | Free limitations and measured cost check | Founder |
| PostgreSQL host/tier | Neon selected initially; production tier pending | Pool/cold-start/restore/cost test | Founder |
| Object storage | Cloudinary for media; conditional for private documents | Authenticated delivery/retention check | Founder |

## 15. Sources checked

- NestJS performance and adapters: <https://docs.nestjs.com/techniques/performance>
- NestJS Fastify migration: <https://docs.nestjs.com/recipes/fastify-migration>
- Go database transactions and pooling: <https://go.dev/doc/database/execute-transactions> and <https://go.dev/doc/database/manage-connections>
- Fastify validation/serialization and plugins: <https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/> and <https://fastify.dev/docs/latest/Reference/Plugins/>
- FastAPI async and deployment: <https://fastapi.tiangolo.com/async/> and <https://fastapi.tiangolo.com/deployment/>
- Axum/Tokio/SQLx: <https://docs.rs/axum/latest/axum/extract/>, <https://tokio.rs/tokio/tutorial>, and <https://docs.rs/crate/sqlx/latest>
- Railway services, PostgreSQL and pricing: <https://docs.railway.com/build-deploy>, <https://docs.railway.com/databases/postgresql>, and <https://docs.railway.com/pricing>
- Render services, workers, PostgreSQL and pricing: <https://render.com/docs/service-types>, <https://render.com/docs/background-workers>, <https://render.com/docs/postgresql>, and <https://render.com/pricing>
- Northflank PostgreSQL and pricing: <https://northflank.com/docs/v1/application/databases-and-persistence/deploy-databases-on-northflank/deploy-postgresql-on-northflank> and <https://northflank.com/pricing>
- Fly.io pricing: <https://fly.io/pricing/>

