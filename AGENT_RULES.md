# Rekordly V2 — AGENT_RULES.md

**Constitutional Law for All Development Agents**
**Effective: Phase 1 through Phase 9+**

This document is the supreme law governing all development on Project Rekordly V2. Every agent, every task, every line of code must comply. When in doubt, this document overrides convenience, speed, or assumption.

Violations are not style issues — they are production incidents waiting to happen.

---

## Table of Contents

1. [Directory & Architecture](#1-directory--architecture-phase-1)
2. [Financial & Data Integrity](#2-financial--data-integrity-phase-3--the-immutable-laws)
3. [Backend Performance & Resource Conservation](#3-backend-performance--resource-conservation-phase-1)
4. [AI & LLM Integration](#4-ai--llm-integration-phase-5)
5. [Frontend & UI](#5-frontend--ui-phase-2)
6. [Security & Privacy](#6-security--privacy-phase-2-phase-8-focus)
7. [Execution, Evaluation & Logging](#7-execution-evaluation--logging-all-phases)

---

## 1. Directory & Architecture (Phase 1+)

### DO

- **DO** keep all planning and reference documents strictly in the `/planning` folder.
- **DO** write ALL implementation code, configurations, scripts, migrations, and tests strictly inside the `/implementation` folder and its subdirectories:
  - `/implementation/api/` — Go API server (Gin framework)
  - `/implementation/worker/` — Go background worker
  - `/implementation/web/` — Next.js frontend application
- **DO** build in vertical slices: Data → API → UI together for each feature. No horizontal silos where all backend is built first and all frontend later.
- **DO** keep evaluation artifacts (phase evaluation logs, self-checks) in the `/evaluation` directory with the naming convention `phase-X.md`.
- **DO** reference planning documents by their document number and title (e.g., "per doc 13-tech-stack-and-libraries.md") when making architectural decisions.
- **DO** maintain the separation between the Go API (`api.rekordly.com`) and the Next.js frontend (`rekordly.com`) from day one. They are separate deployable units.
- **DO** keep the Go worker as a separate deployable service from the Go API. Workers consume the Postgres-backed queue; they are not part of the API process.
- **DO** use Docker Compose for local development. The local stack must include: Next.js frontend, Go API, Go worker, and PostgreSQL.
- **DO** ensure local development never connects to staging or production databases.

### DON'T

- **DON'T** mix documentation with executable code. `/planning` is read-only reference. `/implementation` is executable.
- **DON'T** build all backend first then all frontend. Vertical slice execution means each phase delivers a complete Data → API → UI slice for a feature area.
- **DON'T** put frontend code in the API directory or API code in the frontend directory.
- **DON'T** create utility or shared packages outside the established directory structure without explicit approval.
- **DON'T** bypass Docker Compose for local development. "Works on my machine" is not acceptable.
- **DON'T** point local code at staging or production databases. Local secrets must be fake or developer-owned.
- **DON'T** deploy without running migrations. Migrations are a mandatory pre-deploy CI/CD step.
- **DON'T** run migrations manually as part of the normal release process. Migrations must be automated in CI/CD.
- **DON'T** create files or directories that do not map to the established structure without documenting the rationale in the worklog.

---

## 2. Financial & Data Integrity (Phase 3+ — The Immutable Laws)

These rules are non-negotiable from the moment financial logic is introduced. They apply to every agent, every task, and every code review for the rest of the project lifecycle. Violations here are the most dangerous category of bug — they corrupt money.

### 2.1 Money Representation

#### DO

- **DO** use `shopspring/decimal` for ALL money values in Go. Every field representing a monetary amount must be `decimal.Decimal`, not `float64`, not `int` cents, not `string` parsed as float.
- **DO** use `NUMERIC(20,4)` for ALL monetary columns in PostgreSQL. This gives 16 digits before the decimal and 4 digits after, sufficient for Nigerian Naira and any sub-unit precision.
- **DO** serialize money as decimal strings at the API boundary (JSON). Example: `"amount": "15000.5000"`. This prevents floating-point corruption during JSON serialization/deserialization.
- **DO** validate that incoming decimal strings from the API are well-formed before converting to `shopspring/decimal`. Reject ambiguous floats, scientific notation, NaN, Infinity.
- **DO** use `react-hook-form` + `zod` with `z.string()` for money input on the frontend. Parse and display as strings. Never parse money into JavaScript `number` (which is float64).

#### DON'T

- **DON'T** use `float64` for money. Not in Go. Not in TypeScript. Not in SQL. Not in JSON payloads. Not in calculations. Not in comparisons. Not ever.
- **DON'T** use `float` or `double` PostgreSQL column types for any monetary value.
- **DON'T** use JavaScript `number` type for monetary values in frontend state. Use string representation.
- **DON'T** perform arithmetic on money in JavaScript. The Go backend is the only place where financial calculations happen. The frontend sends raw input; the backend computes.
- **DON'T** store monetary amounts as integer cents unless you also enforce the conversion consistently everywhere. The approved approach is `shopspring/decimal` + `NUMERIC(20,4)` + decimal strings.

### 2.2 Workspace (Tenant) Isolation

#### DO

- **DO** scope EVERY database query by `workspace_id`. This is mandatory even though MVP has one workspace per user. The scoping prevents catastrophic cross-tenant data leaks when multi-workspace support is added.
- **DO** include `workspace_id` in every tenant-owned table. Tables that store user-specific business data must have a `workspace_id` column with a foreign key to the `workspaces` table.
- **DO** resolve `workspace_id` from server-side session context on every protected request. The client must never supply `workspace_id` — the backend resolves it from the authenticated session.
- **DO** verify object ownership on every `/{id}` route. A transaction ID must belong to the authenticated user's workspace. An invoice ID must belong to the authenticated user's workspace. A customer wallet must belong to the authenticated user's workspace. A job ID must belong to the authenticated user's workspace or user. An export ID must belong to the authenticated user's workspace or user.
- **DO** reject cross-workspace access with `FORBIDDEN` or `NOT_FOUND` (depending on endpoint behavior).

#### DON'T

- **DON'T** write any SQL query — read or write — that accesses tenant-owned data without a `WHERE workspace_id = $N` clause. No exceptions.
- **DON'T** trust client-supplied `workspace_id`, `user_id`, `plan_id`, `subscription_id`, or any internal status field. These must be resolved server-side.
- **DON'T** allow mass-assignment of protected fields. Map request DTOs to allowed fields explicitly instead of binding directly into database models. Protected fields include: `workspace_id`, `user_id`, `plan_id`, `subscription_id`, `ledger_entries`, `wallet_balance`, `loan_balance`, `paid_amount`, `voided_at`, `voided_by_id`, `created_by_id`, `updated_by_id`, and any internal status fields.
- **DON'T** skip tenant isolation testing. Every `/{id}` route must be tested with a workspace that does not own the resource.

### 2.3 Double-Entry Ledger

#### DO

- **DO** create balanced double-entry ledger entries for every financial write. Every transaction that moves money must produce debit and credit entries that sum to zero.
- **DO** verify that total debits equal total credits before committing the database transaction. If debits ≠ credits, the transaction MUST roll back.
- **DO** perform ledger writes inside database transactions. Financial writes are never atomic at the application level — they must be atomic at the database level.
- **DO** include the ledger in the same database transaction as the primary financial record creation. Do not create a transaction record then create ledger entries in a separate call.

#### DON'T

- **DON'T** commit a financial write without balanced ledger entries. An unbalanced ledger is a corrupted ledger.
- **DON'T** create ledger entries outside of a database transaction.
- **DON'T** allow the frontend to create or modify ledger entries directly. The ledger is backend-owned, backend-validated, and backend-protected.
- **DON'T** skip ledger balance verification in tests. Every financial write test must assert that debits equal credits.

### 2.4 Immutability of Finalized Records

#### DO

- **DO** make finalized financial records immutable. Once a transaction, invoice, payment, wallet ledger entry, or similar record is finalized, it cannot be edited or hard-deleted.
- **DO** use the Void/Reversal pattern for corrections:
  - Mark the original record with `voided_at` and `voided_by_id`.
  - Create a reversing entry that mirrors the original with opposite amounts.
  - Both the void and the reversal must create balanced ledger entries.
- **DO** keep voided records visible in history with clear status indicators. Voided does not mean invisible.
- **DO** require explicit user confirmation for all void/reversal operations. This is a destructive action from the user's perspective.

#### DON'T

- **DON'T** allow direct `UPDATE` or `DELETE` on finalized financial records. No `PATCH /api/v1/transactions/{id}` on a finalized transaction. No `DELETE /api/v1/transactions/{id}` ever.
- **DON'T** hard-delete finalized transactions, invoices, payments, wallet ledger entries, or loan records.
- **DON'T** skip the void/reversal flow for corrections. There is no shortcut.
- **DON'T** allow AI to finalize, void, or reverse records without explicit user confirmation.

### 2.5 Wallet, Invoice, Split Payment, and Loan Constraints

#### DO

- **DO** enforce that customer wallet balances cannot go negative. Every wallet payment must validate available balance transactionally before committing.
- **DO** enforce that the sum of split payment rows cannot exceed the amount due on a sale or invoice. Validate transactionally.
- **DO** enforce that loan repayments cannot reduce the loan balance below zero. Reject overpayment.
- **DO** validate wallet deposits, payments, and ledger writes transactionally.
- **DO** credit customer liabilities (not revenue) when a wallet deposit is made.

#### DON'T

- **DON'T** allow negative wallet balances under any circumstances.
- **DON'T** allow overpayment on invoices or sales.
- **DON'T** allow overpayment on loans.
- **DON'T** skip balance validation because "the frontend already checks." The backend is the enforcement boundary. Frontend validation is UX guidance only.

---

## 3. Backend Performance & Resource Conservation (Phase 1+)

**Priority: Prevent memory leaks, disk wastage, and resource exhaustion.**

Rekordly is a financial SaaS that will run on bootstrapped infrastructure. Wasted memory, unbounded queries, and disk bloat directly translate to higher costs and outages. These rules exist to keep the system lean and stable.

### 3.1 Query Bounding & Pagination

#### DO

- **DO** use cursor pagination for ALL financial list endpoints. Paginate by `occurred_at` + `id` (or equivalent business date + `id`) for deterministic ordering.
- **DO** default all financial list endpoints to a 30-day or current-month date window unless explicit `from` and `to` filters are provided by the client.
- **DO** use `SELECT ... FOR UPDATE SKIP LOCKED` for Postgres-backed queue job claims. This prevents lock contention and double-processing.
- **DO** limit the maximum page size on all list endpoints (e.g., max 100 records per page).

#### DON'T

- **DON'T** return unbounded query results. No `SELECT * FROM transactions WHERE workspace_id = $1` without pagination and date scoping.
- **DON'T** use offset pagination (`OFFSET/LIMIT`) for financial record lists. Offset pagination degrades on large datasets and can return duplicate or missing rows under concurrent writes.
- **DON'T** allow clients to request unrestricted date ranges. Default scoping must apply unless the client explicitly requests a wider range.
- **DON'T** load entire tables into memory for aggregation. Use SQL aggregate functions (`SUM`, `COUNT`, `AVG`) at the database level. Dashboard and report summaries must use backend aggregate endpoints, not client-side raw data scans.

### 3.2 Memory Leak Prevention

#### DO

- **DO** use `context.WithTimeout` for ALL external calls — database queries, LLM API calls, HTTP requests to third-party services. If a provider hangs, the context must cancel, and resources must be released.
- **DO** close HTTP response bodies. Always `defer resp.Body.Close()`.
- **DO** release database connections back to the pool. Use `pgxpool` which handles this automatically for most patterns, but be careful with raw connection acquisition.
- **DO** close `rows` objects from database queries. Always `defer rows.Close()`.
- **DO** set read deadlines and write deadlines on long-running connections.
- **DO** use `slog` structured logging with bounded buffer sizes. Do not buffer unlimited log entries in memory.

#### DON'T

- **DON'T** make external calls without a context timeout. An unbounded HTTP call to an LLM provider can hang forever and leak a goroutine.
- **DON'T** accumulate results in memory without bounds. Process records in streams or batches, not by loading the entire result set into a slice.
- **DON'T** store large blobs (PDFs, images, raw LLM prompts/responses) in Go memory for longer than the request requires. Stream to storage, then release.
- **DON'T** use `goroutine` leaks: every goroutine must have a clear exit condition. Use channels, contexts, or `sync.WaitGroup` to ensure goroutines complete.

### 3.3 Disk Wastage Prevention

#### DO

- **DO** store only structured metadata in the database. Large binary objects (PDFs, CSV exports, images) must be stored in S3-compatible object storage, with only the URL/reference stored in the database.
- **DO** implement log rotation. Application logs must not grow unbounded on disk. Use structured logging (`log/slog`) and ensure log files are rotated or shipped to external storage.
- **DO** truncate LLM prompts and responses before storing audit metadata. Store only the first N characters of prompts/responses for debugging, plus token counts and cost metadata. Do not store full raw prompts unless explicitly required for a compliance reason.
- **DO** set expiry metadata on generated files (PDFs, CSV exports). Old files should be cleaned up automatically.
- **DO** use connection pooling (`pgxpool`) with strict `MaxConns` limits to prevent connection count from growing unbounded and consuming database resources.

#### DON'T

- **DON'T** store raw LLM prompts, full LLM responses, or large JSON blobs in the database without truncation. This causes uncontrolled disk growth.
- **DON'T** store PDF binary data, CSV content, or image data directly in PostgreSQL columns. Store a reference (S3 URL or object key) instead.
- **DON'T** keep temporary files on disk without a cleanup mechanism. Generated files must have a lifecycle.
- **DON'T** log unmasked PII, full request bodies, or full response bodies. Logs must be structured, bounded, and PII-masked.
- **DON'T** store duplicate data when a reference will do. Job payloads should be small and reference database records instead of embedding large blobs.

### 3.4 Connection Pooling

#### DO

- **DO** use `pgxpool` for all database connections. `pgxpool` is the approved connection pooler.
- **DO** configure `MaxConns` explicitly. Start with a sensible default (e.g., 10-25 connections per API instance) based on the database tier.
- **DO** configure `MinConns` to maintain a baseline of warm connections.
- **DO** set connection lifetime and idle timeout to prevent stale connections.
- **DO** monitor pool usage metrics: active connections, idle connections, wait count, wait duration.

#### DON'T

- **DON'T** use raw `pgx` connections without the pool for normal query patterns.
- **DON'T** set `MaxConns` to unlimited. Unbounded connections will exhaust PostgreSQL's connection limit and take down the database.
- **DON'T** share a single `pgxpool.Pool` across multiple services. Each service (API, worker) should have its own pool with its own limits.
- **DON'T** hold database connections for longer than the query requires. Do not open a connection, do slow computation, then execute the query. Open, query, release.

### 3.5 Worker Guardrails

#### DO

- **DO** use bounded worker pools. Start with exactly 3-5 concurrent goroutines per worker container.
- **DO** sleep when the queue is empty. If `SELECT ... FOR UPDATE SKIP LOCKED` returns no rows, sleep for at least 5 seconds before polling again.
- **DO** use exponential backoff for retries:
  - Attempt 1: retry after 1 minute
  - Attempt 2: retry after 5 minutes
  - Attempt 3: retry after 15 minutes
- **DO** enforce a maximum retry count of 3. After 3 failures, move the job to a Dead Letter Queue (DLQ) or `failed_jobs` table.
- **DO** use `context.WithTimeout` for every job execution. AI parsing jobs should time out around 60 seconds. PDF and export jobs should have explicit timeouts based on expected size.
- **DO** log worker health: process liveness, database connectivity, queue polling status, current concurrency, and failed job count.

#### DON'T

- **DON'T** use tight infinite polling loops. `for {}` without `time.Sleep` when the queue is empty will peg a CPU core and hammer PostgreSQL.
- **DON'T** spawn unbounded goroutines for queue consumption. Every worker has a fixed pool size.
- **DON'T** retry failed jobs indefinitely. The max is 3 retries with exponential backoff.
- **DON'T** drop failed jobs silently. Every exhausted job must be recorded in `failed_jobs` or DLQ for investigation.
- **DON'T** embed large payloads in job records. Job payloads should be small and reference database records (e.g., `invoice_id`, `export_id`) instead of embedding full document data.

### 3.6 Idempotency

#### DO

- **DO** require `Idempotency-Key` header on all mutation endpoints, especially:
  - `POST /api/v1/transactions` (transaction creation)
  - `POST /api/v1/payments` (payment processing)
  - `POST /api/v1/sync/mutations` (offline sync)
  - `POST /api/v1/invoices/{id}/finalize` (invoice finalization)
  - `POST /api/v1/customers/{id}/wallet/deposits` (wallet deposits)
  - `POST /api/v1/loans/{id}/repayments` (loan repayments)
- **DO** store idempotency keys with a TTL. Keys should expire after a reasonable window (e.g., 24-48 hours).
- **DO** return the original response for duplicate idempotency keys. Do not re-process the mutation.
- **DO** return `409 Conflict` or `IDEMPOTENCY_CONFLICT` if a different payload is sent with the same key.

#### DON'T

- **DON'T** allow duplicate records from the same idempotency key. This is especially critical for offline sync where network retries are expected.
- **DON'T** skip idempotency checks on payment, wallet, or ledger mutations.
- **DON'T** trust the client to enforce idempotency. The server must check.

---

## 4. AI & LLM Integration (Phase 5+)

**Priority: Prevent infinite loops, cost spikes, and unvalidated financial writes from AI.**

AI is a suggestion layer, not a trusted execution layer. The LLM can hallucinate amounts, invent categories, and misclassify scope. Every piece of AI output must be treated as adversarial input until validated.

### 4.1 Trigger Discipline (Prevent Infinite Loops)

#### DO

- **DO** trigger LLM calls only by:
  1. Explicit user action (user types text and submits), OR
  2. A single valid job dequeued from the Postgres job queue.
- **DO** use the async job pattern for complex AI parsing that exceeds synchronous timeout limits.
- **DO** enforce exponential backoff on AI job retries, same as any other worker job (1min → 5min → 15min, max 3 retries).

#### DON'T

- **DON'T** auto-retry LLM calls in a tight loop. If the LLM provider returns an error, apply exponential backoff. Do not immediately retry.
- **DON'T** create feedback loops where AI output triggers another AI call without user intervention.
- **DON'T** use AI to validate AI output. Backend Go code validates AI drafts, not another LLM call.
- **DON'T** create background processes that continuously poll for data to send to the LLM without an explicit triggering event.

### 4.2 Strict Timeouts

#### DO

- **DO** use `context.WithTimeout` on every LLM API call. The recommended timeout is 60 seconds for standard parsing. If the provider hangs, the context cancels and the request fails gracefully.
- **DO** return a clear error to the user when the LLM call times out. Suggest they try again or use manual entry.
- **DO** release all resources (HTTP connections, goroutines) when the context cancels.

#### DON'T

- **DON'T** make LLM calls without a context timeout. An unbounded LLM call can hang indefinitely and leak goroutines.
- **DON'T** leak goroutines when the context cancels. Ensure all cleanup runs in `defer` blocks.
- **DON'T** retry timed-out LLM calls immediately. Apply the same exponential backoff as other failures.

### 4.3 Input Truncation

#### DO

- **DO** enforce hard character/token limits on user input before sending to the LLM. Define a maximum input length (e.g., 2000 characters) and truncate or reject inputs that exceed it.
- **DO** enforce request body size limits on AI endpoints. Large request bodies increase cost and latency.
- **DO** log when input is truncated (without logging the truncated content).

#### DON'T

- **DON'T** send unbounded user input to the LLM. Every character sent to the LLM costs money and increases the attack surface for prompt injection.
- **DON'T** concatenate large context datasets into the LLM prompt. Use summarized/aggregated data for context enrichment.
- **DON'T** include full financial histories in AI prompts. Include only the minimum context needed for classification (recent categories, common counterparties, user preferences).

### 4.4 Output Validation (The Untrusted Output Rule)

#### DO

- **DO** treat ALL LLM output as completely untrusted. The LLM is an external, non-deterministic system that can return any combination of characters.
- **DO** unmarshal LLM output into strictly typed Go structs. Never pass raw LLM output directly to the database.
- **DO** validate every field of the parsed struct:
  - Amount: must be a valid decimal string, non-negative, within reasonable bounds.
  - Transaction type: must be one of the approved enum values.
  - Currency: must be a valid ISO 4217 code.
  - Date: must be a valid date, not in the future (or within acceptable bounds).
  - Category: must match an existing category in the user's workspace or be flagged as new.
  - Scope type: must be one of `business`, `personal`, `mixed`, `transfer`.
- **DO** highlight low-confidence fields in the UI so the user can review them before confirmation.
- **DO** store AI audit metadata: model version, token counts, latency, and a truncated prompt summary. Do not store full raw prompts unless explicitly required.

#### DON'T

- **DON'T** write LLM output directly to the database. Ever. Under any circumstances.
- **DON'T** allow AI to create finalized financial records. AI creates drafts. Only user confirmation + backend validation creates financial truth.
- **DON'T** allow AI to bypass wallet, loan, split-payment, invoice, tax, or plan validation.
- **DON'T** allow AI to finalize, void, or reverse records without explicit user confirmation.
- **DON'T** trust AI-inferred amounts. Always validate against decimal precision rules (Section 2.1).
- **DON'T** expose raw LLM provider errors to users. Return a generic "AI parsing unavailable, please try manual entry" message.

### 4.5 Memory Conservation for AI Context

#### DO

- **DO** use summarized/aggregated data for AI context enrichment. Instead of loading the last 1000 transactions into memory, query the database for the user's top categories, recent counterparties, and spending patterns.
- **DO** limit the size of AI context payloads. Enforce a maximum context size (in tokens or characters) that balances quality with cost and memory usage.
- **DO** scope AI context to the user's workspace only. Never include data from other users or workspaces in the prompt.

#### DON'T

- **DON'T** load large datasets into memory to build AI context. This wastes memory and increases LLM costs.
- **DON'T** include another user's categories, vendors, customers, or financial history in AI prompts. This is both a security violation and a data leak.
- **DON'T** cache full AI contexts in memory across requests. Each request should build its own minimal context.

### 4.6 Cost Control

#### DO

- **DO** check per-user and per-plan AI credit limits atomically before making the LLM call. The check and the call must be consistent — do not check, then allow a race condition where the user exceeds their limit.
- **DO** decrement the user's AI credit counter atomically with the LLM call. If the call fails, do not decrement; if the call succeeds, do not double-count.
- **DO** enforce plan limits before the LLM call. Free-plan users may have zero AI credits. Pro-plan users may have a monthly cap. Team-plan users may have a higher cap.
- **DO** return `PLAN_LIMIT_REACHED` with a clear message when the user's AI credits are exhausted.
- **DO** track AI usage metrics: calls per user, calls per plan, token usage, cost per user, cost per plan, provider errors.

#### DON'T

- **DON'T** make LLM calls if the user has reached their AI credit limit. The check must happen before the call, not after.
- **DON'T** allow offline AI processing. AI calls require network connectivity and server-side plan enforcement.
- **DON'T** add frontend AI/LLM libraries. The frontend treats AI endpoints as standard JSON request/response endpoints using `axios` and `@tanstack/react-query`. All LLM interaction is handled strictly by the Go backend using `github.com/sashabaranov/go-openai`.
- **DON'T** use Vercel AI SDK or any other frontend AI library.

### 4.7 AI Suggests; User Confirms

#### DO

- **DO** present AI output as a draft for user review. The primary creation flow is:
  1. User types natural language ("Type what happened").
  2. AI parser returns one or more drafts.
  3. User reviews each draft.
  4. User edits uncertain or incorrect fields.
  5. User confirms.
  6. Backend validates and saves.
- **DO** keep manual entry as a fallback. Users must always be able to bypass AI and enter data manually.
- **DO** display the inferred `scope_type` in the confirmation form so the user can verify or override it.

#### DON'T

- **DON'T** auto-finalize financial records from AI output. No exceptions. AI drafts require user confirmation before becoming financial truth.
- **DON'T** auto-save AI-inferred transactions. The user must explicitly confirm.
- **DON'T** hide the fact that a record was AI-assisted. The UI should indicate when a draft was generated by AI.

---

## 5. Frontend & UI (Phase 2+)

### 5.1 Approved Stack

#### DO

- **DO** use Next.js App Router exclusively for the frontend.
- **DO** use `@heroui/react` (HeroUI) for all base UI components. No second UI libraries.
- **DO** use Tailwind CSS for styling.
- **DO** use `zustand` for client-side UI state management.
- **DO** use `@tanstack/react-query` for all backend data fetching and caching.
- **DO** use `axios` for API requests.
- **DO** use `react-hook-form` + `zod` for all complex financial forms, including AI confirmation and invoices.
- **DO** use `@hookform/resolvers` to bridge Zod schemas with React Hook Form.
- **DO** use `recharts` for dashboard and report charts.
- **DO** use `date-fns` for all date manipulations.
- **DO** use `lucide-react` and `@phosphor-icons/react` as the approved icon libraries.
- **DO** use `idb` for managing the offline mutation queue (max 100 items).
- **DO** use `@ducanh2912/next-pwa` for PWA service worker generation.
- **DO** use Figtree for body text, Sora for headings, and Fira Code for mono/technical text.
- **DO** use the approved brand tokens: Primary green `#009e10`, Secondary orange `#fa8901`.

#### DON'T

- **DON'T** install any npm package or Go module not listed in `13-tech-stack-and-libraries.md`. If a package is not listed, request explicit approval before installing.
- **DON'T** use Redux. Zustand is the approved state management solution.
- **DON'T** use Moment.js. `date-fns` is the approved date utility.
- **DON'T** use Material UI, Chakra UI, Ant Design, or any component library other than HeroUI.
- **DON'T** add frontend AI/LLM libraries, including Vercel AI SDK. All LLM interaction is handled by the Go backend.
- **DON'T** use `next-themes` for dark mode unless it is explicitly listed in doc 13. (It is listed in the V1 design stack, so it is approved.)
- **DON'T** use JavaScript `number` for monetary values in frontend state. Use string representation.

### 5.2 Finance Scope Toggle

#### DO

- **DO** implement the Finance Scope Toggle on dashboards and transaction lists: `All | Business | Personal`.
- **DO** default the Scope Toggle to `Business` view.
- **DO** use the Scope Toggle as a view filter for dashboards, transaction lists, budgets, and report summaries.
- **DO** set smart defaults for new records based on the current Scope Toggle state:
  - Viewing `Business` → Add Transaction defaults to `business` scope.
  - Viewing `Personal` → Add Transaction defaults to `personal` scope.
  - Viewing `All` → Add Transaction may default to last-used scope or ask the user to classify.
- **DO** allow users to override `scope_type` directly inside the Add Transaction drawer or form without switching the main dashboard toggle.
- **DO** hide or visually disable business-only actions when in Personal scope view (e.g., Create Invoice, Create Sale, Record Customer Wallet Deposit, Generate Business Tax Report).

#### DON'T

- **DON'T** make the Scope Toggle a hard creation lock. Users must be able to override scope in the creation form.
- **DON'T** require users to switch the main dashboard toggle just to record a transaction of a different scope type.
- **DON'T** allow business-only actions to execute while in Personal scope view without explicit user action to switch context.

### 5.3 Component Standards

#### DO

- **DO** build reusable UI components as defined in `11-design-guide.md`: StatCard, DataTable, GlobalAddDrawer, FormModal/FormDrawer, StatusChip, PlanGate, AdSlot, OfflineBanner, ExportButton, EmptyState, SkeletonLoader.
- **DO** use StatCard with variants: Revenue/success, Expense/warning, Profit/neutral, Debt/liability, Budget status, Tax summary. Include skeleton states.
- **DO** use shared DataTable for: Transactions, Invoices, Customers, Customer wallet ledger, Loans, Payments, Tax reports, Exports. Must support cursor pagination, date filters, Finance Scope Toggle, mobile-friendly layout, loading skeletons, and actionable empty states.
- **DO** make empty states actionable. Never just say "No data." Example: "No business expenses yet. Type what happened to add one."
- **DO** use skeleton loaders that preserve final component dimensions and prevent layout shift. Do not replace the whole dashboard with a tiny centered spinner.
- **DO** use StatusChip for: Paid, Partially paid, Overdue, Draft, Finalized, Voided, Synced, Offline, Stale, Failed. Status chips must use color plus text, not color alone.

#### DON'T

- **DON'T** duplicate add-flow wiring between navbar, sidebar, quick action, and individual pages. Use one global action system.
- **DON'T** place ads near save, pay, send, void, delete, confirm, or submit buttons. Never in transaction confirmation, invoice send, wallet payment, loan repayment, or correction flows.
- **DON'T** show ads to paid users. Ever.
- **DON'T** use spinner-only loading for major dashboard content. Use skeleton loaders that match the expected layout.
- **DON'T** scale font size with viewport width. Keep dashboard panel headings tighter than marketing headings.

### 5.4 Financial UX Rules

#### DO

- **DO** always show currency codes where ambiguity exists.
- **DO** show wallet payment available balance before the user confirms.
- **DO** show running total and remaining balance in split payment rows.
- **DO** require confirmation for all destructive or irreversible actions (void, reverse, delete draft).
- **DO** show voided records in history with clear status.

#### DON'T

- **DON'T** hide balances behind hover-only UI.
- **DON'T** hide payment status behind hover-only UI.
- **DON'T** save mixed records without showing allocation first.
- **DON'T** rely on color alone for status signals. Use icons plus text.

---

## 6. Security & Privacy (Phase 2+, Phase 8+ Focus)

Security is not a phase — it is enforced from Phase 1. Phase 8 is the hardening and audit phase, but every phase must comply with these rules.

### 6.1 Money Safety

#### DO

- **DO** enforce all rules in Section 2 (Financial & Data Integrity). These are security rules, not just data rules.
- **DO** use decimal strings at the API boundary. Reject ambiguous floats, scientific notation, NaN, Infinity.
- **DO** validate on the backend. The frontend may guide UX, but cannot enforce access, plan limits, money rules, wallet rules, or ledger truth.

#### DON'T

- **DON'T** use `float64` for money. This is a security violation, not a style preference.
- **DON'T** trust client-supplied amounts, statuses, plan data, or ledger data. The backend must validate everything.

### 6.2 Cross-Domain CORS

#### DO

- **DO** enforce strict CORS on the Go API. Production must allow only `https://rekordly.com`. Staging must allow only approved staging frontend origins.
- **DO** make CORS configuration environment-specific.
- **DO** reject unknown origins.
- **DO** use strict allowed origins for credentialed requests.
- **DO** add CSRF protection if cookies are used for API authentication. Use token-based or double-submit style defense. `SameSite` cookie settings are defense-in-depth, not the only CSRF control.

#### DON'T

- **DON'T** use wildcard CORS (`*`) on any protected endpoint.
- **DON'T** allow staging origins in production or production origins in staging.
- **DON'T** skip CSRF validation on unsafe methods (`POST`, `PATCH`, `DELETE`) if cookies are used for authentication.

### 6.3 SQL Injection Prevention

#### DO

- **DO** use `sqlc` for all database queries. `sqlc` generates type-safe, parameterized Go code from SQL files. This is the primary defense against SQL injection.
- **DO** use parameterized queries only. No string concatenation for SQL.
- **DO** allowlist user-controlled sort/filter fields before applying them to queries.
- **DO** use code review and static checks to reject unsafe SQL construction.

#### DON'T

- **DON'T** use raw SQL string concatenation with user-supplied input. This is absolutely banned.
- **DON'T** use GORM or any ORM. `sqlc` is the approved query layer.
- **DON'T** trust user-supplied column names, table names, or ORDER BY clauses without allowlisting.
- **DON'T** use dynamic SQL unless it composes only from trusted allowlisted fragments and parameterized values.

### 6.4 PII Masking in Logs

#### DO

- **DO** mask PII in all logs and API error responses:
  - `john@gmail.com` → `j***@gmail.com`
  - `08012345678` → `080****5678`
  - Bank account numbers: show only last few digits when necessary.
- **DO** mask raw secrets, tokens, full OTP values, and full bank details in logs.
- **DO** store only the PII required for product, legal compliance, support, and audit obligations.
- **DO** align data handling with the Nigerian Data Protection Act (NDPA).

#### DON'T

- **DON'T** log full PII, raw secrets, raw tokens, full OTP values, full bank details, or unnecessary raw AI prompts.
- **DON'T** expose implementation details in public API error responses.
- **DON'T** expose raw payment provider error payloads to users.

### 6.5 Idempotency for Offline Sync (Phase 7+)

#### DO

- **DO** require idempotency keys for all offline mutations.
- **DO** cap the offline queue at 100 pending actions. When full, block new offline writes until sync completes.
- **DO** enforce "server wins" for finalized financial records, account balances, wallet balances, loan balances, and finalized invoices.
- **DO** require user resolution for draft conflicts.
- **DO** mark cached dashboards as stale when offline.
- **DO** ensure cached data does not leak across users on shared devices.

#### DON'T

- **DON'T** allow duplicate records from the same idempotency key during offline sync.
- **DON'T** allow the client to overwrite finalized server records. Server wins. Always.
- **DON'T** store long-lived auth secrets in IndexedDB or localStorage.
- **DON'T** store sensitive cached data without minimization.

### 6.6 Webhook Security

#### DO

- **DO** verify webhook signatures before processing any payment provider event.
- **DO** reject webhooks with invalid signatures.
- **DO** process webhooks idempotently. Duplicate provider events must not duplicate subscription updates or payments.
- **DO** log webhook payloads in sanitized form only.

#### DON'T

- **DON'T** process unsigned webhooks. Ever.
- **DON'T** allow duplicate subscription updates or payment records from replayed webhook events.

### 6.7 Authentication & Session Security

#### DO

- **DO** use email OTP only for MVP authentication. SMS is excluded due to cost.
- **DO** make OTPs expire quickly. OTP values must not be stored in plaintext.
- **DO** rate-limit failed OTP attempts and throttle OTP resends.
- **DO** temporarily block verification for emails with excessive failed OTP attempts.
- **DO** use short-lived access sessions. Support refresh and session revocation.
- **DO** use `Secure` cookies in production and `HttpOnly` where applicable.
- **DO** revoke the active session or refresh token on logout.
- **DO** ensure revoked sessions fail on the next protected API request.
- **DO** make tokens/cookies environment-specific.

#### DON'T

- **DON'T** store long-lived auth secrets in `localStorage` or IndexedDB.
- **DON'T** confirm whether an email already exists in OTP request responses.
- **DON'T** log OTP values.
- **DON'T** implement SMS OTP. SMS is excluded from MVP due to cost.

### 6.8 Encryption

#### DO

- **DO** enforce encryption at rest for PostgreSQL, database backups, and object storage.
- **DO** enforce TLS 1.2 or newer for all external traffic and internal service-to-service traffic where supported.
- **DO** encrypt PII at the application level if the hosting/database provider does not provide adequate encryption.
- **DO** use separate secrets for local, staging, and production environments.

#### DON'T

- **DON'T** store sensitive payment card data directly. Prefer payment-provider tokens or references.
- **DON'T** commit `.env` files.
- **DON'T** reuse production secrets in local or staging environments.
- **DON'T** copy production data into local development without explicit anonymization.

---

## 7. Execution, Evaluation & Logging (All Phases)

### 7.1 Round Execution

#### DO

- **DO** limit each Round to a maximum of 10 actionable tasks.
- **DO** complete a Round, stop, and wait for approval before moving to the next Round.
- **DO** break down large features into tasks that fit within the 10-task limit.
- **DO** assign each task a clear, testable acceptance criterion.

#### DON'T

- **DON'T** exceed 10 tasks per Round. If you have 12 tasks, split them across two Rounds.
- **DON'T** proceed to the next Round without approval.
- **DON'T** bundle unrelated work into a single task to bypass the limit.

### 7.2 Progress Logging

#### DO

- **DO** maintain an evaluation log in `/evaluation/phase-X.md` for each phase.
- **DO** update the worklog (`/worklog.md` or equivalent) with concrete, verifiable entries after each task.
- **DO** record: what was done, what was tested, what was deferred, and what needs follow-up.

#### DON'T

- **DON'T** skip progress logging. An unlogged task is an unverified task.
- **DON'T** overwrite previous log entries. Append new entries.
- **DON'T** leave the evaluation log empty at the end of a Round.

### 7.3 Self-Check Audit (Mandatory After Each Round)

After every Round, perform the following self-checks before requesting approval. If any check fails, fix immediately before asking for approval.

#### Financial Safety Check

- [ ] If financial logic was touched: verify `shopspring/decimal` usage (no `float64`).
- [ ] Verify `workspace_id` scoping on all queries.
- [ ] Verify ledger balance (debits == credits) for all financial writes.
- [ ] Verify immutability of finalized records (void/reversal only).
- [ ] Verify wallet balances cannot go negative.
- [ ] Verify split payments cannot exceed amount due.
- [ ] Verify loan repayments cannot overpay.

#### Memory & Disk Check

- [ ] Verify no unbounded queries or array returns (cursor pagination + date scoping).
- [ ] Verify `context.WithTimeout` on all external calls (DB, LLM, HTTP).
- [ ] Verify resources are released properly (HTTP bodies closed, DB rows closed, connections returned to pool).
- [ ] Verify no raw logs, untruncated LLM prompts, or large blobs stored in the database.
- [ ] Verify worker loops include `time.Sleep` when queue is empty.
- [ ] Verify bounded concurrency (3-5 goroutines) in workers.
- [ ] Verify exponential backoff for retries (max 3 retries before DLQ).
- [ ] Verify `Idempotency-Key` required on all mutation endpoints.

#### Dependency Check

- [ ] Confirm no npm packages or Go modules installed that are not listed in `13-tech-stack-and-libraries.md`.
- [ ] If a new dependency was added, confirm it received explicit approval with rationale documented.

#### Architecture Check

- [ ] Confirm all code is inside `/implementation` (no code in `/planning`).
- [ ] Confirm no mixing of docs and code.
- [ ] Confirm vertical slice execution (Data → API → UI built together for the feature area).
- [ ] Confirm alignment with `06-api-architecture.md`, `08-infrastructure.md`, and `09-security.md`.
- [ ] Confirm Go API uses `sqlc` (no ORMs).
- [ ] Confirm Go API uses `pgxpool` for database connections.
- [ ] Confirm Swagger annotations (`swaggo/swag`) on all API endpoints.

### 7.4 Approval Gate

- Each Round ends with a self-evaluation and approval request.
- The approval request must include:
  1. **Task Completion**: List each task with Pass/Fail status.
  2. **Self-Check Results**: Financial, Memory/Disk, Dependency, and Architecture check results.
  3. **Blockers/Bugs**: List any compile errors, failing tests, or logical bugs.
  4. **Deferred Items**: List anything intentionally deferred to a later Round with justification.
- If any self-check fails, fix immediately before requesting approval. Do not submit a Round with known failures.

---

## Appendix: Quick Reference

### The Absolute Never-Ever List

These are the rules that, if violated, can cause the most damage. Memorize them.

| # | Rule | Why |
|---|------|-----|
| 1 | Never use `float64` for money | Floating-point precision loss corrupts financial data |
| 2 | Never skip `workspace_id` on tenant queries | Cross-tenant data leak |
| 3 | Never commit unbalanced ledger entries | Corrupts the accounting system |
| 4 | Never hard-delete or edit finalized financial records | Destroys audit trail and financial truth |
| 5 | Never allow negative wallet balances | Customer money cannot be invented |
| 6 | Never trust AI output directly | LLMs hallucinate; unvalidated AI output can corrupt financial records |
| 7 | Never auto-finalize from AI | AI suggests; user confirms; backend validates |
| 8 | Never use unbounded queries | Memory exhaustion and performance degradation |
| 9 | Never use tight infinite worker loops | CPU pegging and database hammering |
| 10 | Never install unapproved dependencies | Security, stability, and maintenance risk |
| 11 | Never store large blobs in the database | Disk wastage and performance degradation |
| 12 | Never make LLM calls without a context timeout | Goroutine leaks and cost spikes |
| 13 | Never retry LLM calls without exponential backoff | Infinite loops and cost spikes |
| 14 | Never skip idempotency on mutations | Duplicate financial records from retries |
| 15 | Never use wildcard CORS on protected endpoints | Cross-origin attacks |

### Phase Applicability Matrix

| Section | Phase 1 | Phase 2 | Phase 3 | Phase 4 | Phase 5 | Phase 6 | Phase 7 | Phase 8 | Phase 9 |
|---------|---------|---------|---------|---------|---------|---------|---------|---------|---------|
| 1. Directory & Architecture | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 2. Financial & Data Integrity | — | — | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 3. Backend Performance | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 4. AI & LLM Integration | — | — | — | — | ✅ | ✅ | ✅ | ✅ | ✅ |
| 5. Frontend & UI | — | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 6. Security & Privacy | — | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 7. Execution & Evaluation | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

> **Note**: Even if a section is not yet applicable (marked "—"), agents should be aware of its rules to avoid building code that will violate them in later phases. For example, do not use `float64` for an amount field in Phase 1 just because financial logic isn't active until Phase 3.

---

*This document is living law. It must be updated when planning documents change, but the principles — financial integrity, resource conservation, security, and human-in-the-loop AI — are immutable.*
