# Phase 5: AI-First Entry

**Goal:** Upgrade creation from manual-first to AI-first while keeping user confirmation and backend validation. "Type what happened" becomes the primary creation path. AI-created drafts never bypass user confirmation or backend financial rules.

**Depends on:** Phase 3 (Core Transactions & Manual Entry) — the manual forms, transaction types, payments, and ledger must be fully operational as the confirmation/fallback surface. Phase 4 (Invoices, Wallets, & Loans) — AI must be able to draft invoices, wallet deposits, loan records, and repayments.

**References:**
- AI features: `07-ai-features.md`
- Data model: `05-data-model.md` (§AI And Audit)
- API architecture: `06-api-architecture.md` (§AI-Assisted Entry)
- User flows: `04-user-flows.md` (§AI-Assisted Entry Flow)
- Feature map: `03-feature-map.md` (§AI-Assisted Entry)
- Design guide: `11-design-guide.md` (§AI-First Entry UX, §GlobalAddDrawer)
- Roadmap: `12-roadmap.md` (Phase 5)
- Tech stack: `13-tech-stack-and-libraries.md`
- Security: `09-security.md` (§AI Security)
- Monetization: `10-monetization.md` (§AI Entry Vs AI Assistant, §AI credit usage)

---

## Section 1: Summary Table

| ID | Work Item | Owner Area | Acceptance Criteria |
|----|-----------|------------|---------------------|
| P5-01 | AI Entry Drafts Migration | Data | Migration creates `ai_entry_drafts` table with draft_type enum, field_confidence JSONB, overall_confidence, missing_fields, expiry, and workspace+user scoping. |
| P5-02 | AI Audit Logs Migration | Data | Migration creates `ai_audit_logs` table with provider/model metadata, input_length, truncated flag, confirmation tracking, and duration_ms. |
| P5-03 | sqlc Queries — AI Entry Drafts | Backend | Draft CRUD queries: Create, GetByID, ConfirmDraft, RejectDraft, ExpireDrafts — all workspace+user scoped. |
| P5-04 | sqlc Queries — AI Audit Logs | Backend | Audit log queries: CreateAuditLog, GetAuditLogsByWorkspace — workspace-scoped with minimal metadata storage. |
| P5-05 | POST /api/v1/ai/parse-entry | Backend | Multi-intent AI parser: checks plan/rate limits, truncates input, enriches context, calls LLM with JSON schema, validates output, stores drafts+audit log. |
| P5-06 | POST /api/v1/ai/drafts/{id}/confirm | Backend | Confirms draft by validating with normal finance rules per draft_type, creates financial record in tx, updates draft+audit status. |
| P5-07 | AI Rate Limiting Middleware | Backend | Per-user and per-plan rate limits on /ai/* routes; returns 429 RATE_LIMITED or 403 PLAN_LIMIT_REACHED with standard headers. |
| P5-08 | AI Credit Usage Tracking | Backend | Increments usage_counters atomically before LLM call; rejects if credit limit would be exceeded. |
| P5-09 | Input Truncation Enforcement | Backend | Truncates user input to configurable max (default 1000 chars) before LLM call; stores truncated flag and original input_length. |
| P5-10 | Upgrade Add Drawer to AI-First | Frontend | GlobalAddDrawer primary input is "Type what happened" with Parse button; multi-draft cards; scope inference chips; manual fallback link; plan limit messaging. |
| P5-11 | AI Draft Confirmation Form | Frontend | Per-draft-type Zod schema form pre-filled from extracted_fields; missing fields highlighted; submit calls confirm endpoint; handles 422 inline. |
| P5-12 | Confidence Visualization | Frontend | Yellow border on fields with confidence < 0.7; missing fields get yellow border + fill-in prompt; overall confidence badge uses color + text. |

---

## Section 2: Detailed Descriptions

### P5-01: AI Entry Drafts Migration

**Description:**
Create the `ai_entry_drafts` table to store unconfirmed AI suggestions before they become financial truth. Each draft represents a single detected intent (e.g., one expense, one loan repayment). Drafts have a 1-hour expiry to prevent stale suggestions from accumulating. The `field_confidence` JSONB stores per-field confidence scores, enabling the frontend to highlight uncertain fields.

**Technical Details:**

**Table: `ai_entry_drafts`**

| Column | Type | Constraints | Purpose |
|---|---|---|---|
| id | UUID | PK DEFAULT gen_random_uuid() | Primary key |
| workspace_id | UUID | NOT NULL FK → workspaces(id) ON DELETE CASCADE | Tenant scoping |
| user_id | UUID | NOT NULL FK → users(id) | User who triggered the parse |
| draft_type | VARCHAR(30) | NOT NULL | income, expense, sale, purchase, invoice, wallet_deposit, loan, loan_repayment, transfer |
| extracted_fields | JSONB | NOT NULL DEFAULT '{}' | AI-extracted field values |
| missing_fields | TEXT[] | DEFAULT '{}' | Fields AI couldn't determine |
| field_confidence | JSONB | DEFAULT '{}' | Per-field confidence scores (0.0–1.0) |
| overall_confidence | NUMERIC(3,2) | | Aggregate confidence (0.00–1.00) |
| warnings | TEXT[] | DEFAULT '{}' | AI-generated warnings |
| normalized_text | TEXT | | Cleaned version of user input |
| scope_type | VARCHAR(10) | | business, personal, mixed, transfer |
| status | VARCHAR(20) | NOT NULL DEFAULT 'pending' | pending, confirmed, rejected, expired |
| confirmed_record_type | VARCHAR(50) | | e.g. 'transaction', 'invoice', 'loan' |
| confirmed_record_id | UUID | | ID of the created financial record |
| raw_input | TEXT | NOT NULL | Original user text |
| input_length | INT | NOT NULL | Original input length before truncation |
| truncated | BOOLEAN | NOT NULL DEFAULT false | Whether input was truncated |
| provider | VARCHAR(50) | NOT NULL | LLM provider (e.g. 'openai') |
| model | VARCHAR(100) | NOT NULL | LLM model (e.g. 'gpt-4o') |
| created_at | TIMESTAMPTZ | DEFAULT now() | Creation timestamp |
| expires_at | TIMESTAMPTZ | DEFAULT now() + interval '1 hour' | Auto-expiry for pending drafts |

**Indexes:**
- `idx_ai_drafts_workspace_user` ON (workspace_id, user_id, created_at DESC) — user's draft history
- `idx_ai_drafts_status` ON (status) WHERE status = 'pending' — filter active drafts (partial index)
- `idx_ai_drafts_expires` ON (expires_at) WHERE status = 'pending' — expiry cleanup query (partial index)

**Acceptance Criteria:**
- [ ] Migration creates `ai_entry_drafts` table with all columns
- [ ] `draft_type` supports: income, expense, sale, purchase, invoice, wallet_deposit, loan, loan_repayment, transfer
- [ ] `field_confidence` JSONB column exists for per-field scores
- [ ] `expires_at` defaults to 1 hour from creation
- [ ] All queries workspace-scoped AND user-scoped

---

### P5-02: AI Audit Logs Migration

**Description:**
Create the `ai_audit_logs` table to store provider/model metadata, truncated input length, confidence, confirmation status, and duration for every AI interaction. Stores only necessary prompt metadata — avoids keeping sensitive raw prompts unless explicitly needed.

**Technical Details:**

**Table: `ai_audit_logs`**

| Column | Type | Constraints | Purpose |
|---|---|---|---|
| id | UUID | PK DEFAULT gen_random_uuid() | Primary key |
| workspace_id | UUID | NOT NULL FK → workspaces(id) ON DELETE CASCADE | Tenant scoping |
| user_id | UUID | NOT NULL FK → users(id) | User who made the request |
| draft_id | UUID | FK → ai_entry_drafts(id) | Linked draft (nullable for failed parses) |
| provider | VARCHAR(50) | NOT NULL | LLM provider |
| model | VARCHAR(100) | NOT NULL | LLM model |
| input_length | INT | NOT NULL | Original input length |
| input_truncated | BOOLEAN | NOT NULL DEFAULT false | Whether input was truncated |
| draft_type | VARCHAR(30) | | Detected intent type |
| overall_confidence | NUMERIC(3,2) | | Confidence score |
| confirmed | BOOLEAN | DEFAULT false | Whether user confirmed the draft |
| confirmed_record_type | VARCHAR(50) | | Type of confirmed record |
| confirmed_record_id | UUID | | ID of confirmed record |
| error_occurred | BOOLEAN | DEFAULT false | Whether the parse failed |
| error_type | VARCHAR(100) | | Error classification |
| duration_ms | INT | | LLM call duration in milliseconds |
| created_at | TIMESTAMPTZ | DEFAULT now() | Creation timestamp |

**Indexes:**
- `idx_ai_audit_workspace_user` ON (workspace_id, user_id, created_at DESC) — audit history per user
- `idx_ai_audit_draft_id` ON (draft_id) — link back to draft

**Privacy Considerations:**
- Store only necessary prompt metadata (ref: 05 §AI And Audit)
- Avoid storing sensitive raw prompts unless explicitly needed (ref: 07 §Cost And Safety Guardrails)
- No full LLM request/response payloads stored

**Acceptance Criteria:**
- [ ] Migration creates `ai_audit_logs` table with all columns
- [ ] `duration_ms` tracks LLM call latency
- [ ] `input_truncated` flag stored alongside original `input_length`
- [ ] Confirmation tracking via `confirmed`, `confirmed_record_type`, `confirmed_record_id`
- [ ] No raw prompt content stored

---

### P5-03: sqlc Queries — AI Entry Drafts

**Description:**
Generate type-safe sqlc queries for AI entry draft lifecycle: create, read, confirm, reject, and expire. All queries enforce both workspace_id and user_id scoping.

**Queries:**

| Name | Operation | Key Details |
|---|---|---|
| `CreateDraft` | INSERT | All AI-extracted fields + raw_input + provider/model; RETURNING * |
| `GetDraftByID` | SELECT | WHERE id = $1 AND workspace_id = $2 AND user_id = $3 |
| `ConfirmDraft` | UPDATE | SET status='confirmed', confirmed_record_type, confirmed_record_id WHERE id AND workspace_id AND user_id AND status='pending'; RETURNING * |
| `RejectDraft` | UPDATE | SET status='rejected' WHERE id AND workspace_id AND user_id AND status='pending' |
| `ExpireDrafts` | UPDATE | SET status='expired' WHERE status='pending' AND expires_at < now() — periodic cleanup |

**File:** `queries/ai_entry_drafts.sql`

**Acceptance Criteria:**
- [ ] All queries include workspace_id AND user_id in WHERE clause
- [ ] `ConfirmDraft` only operates on `status='pending'` drafts
- [ ] `RejectDraft` only operates on `status='pending'` drafts
- [ ] `ExpireDrafts` available for periodic cleanup job

---

### P5-04: sqlc Queries — AI Audit Logs

**Description:**
Generate sqlc queries for AI audit log creation and retrieval. Audit logs provide a traceable record of every AI interaction for cost tracking, abuse detection, and compliance.

**Queries:**

| Name | Operation | Key Details |
|---|---|---|
| `CreateAuditLog` | INSERT | All fields including duration_ms, error tracking, confirmation status; RETURNING * |
| `GetAuditLogsByWorkspace` | SELECT | WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT $2 |

**File:** `queries/ai_audit_logs.sql`

**Acceptance Criteria:**
- [ ] `CreateAuditLog` stores all required metadata fields
- [ ] `GetAuditLogsByWorkspace` ordered by created_at DESC with LIMIT
- [ ] All queries workspace-scoped

---

### P5-05: POST /api/v1/ai/parse-entry

**Description:**
The primary AI endpoint that accepts free-text user input and returns one or more structured drafts. Implements the full AI flow: authentication → plan check → rate limit → truncation → credit increment → context enrichment → LLM call → output validation → draft storage → audit logging. Supports multi-intent parsing where a single input produces multiple drafts.

**Endpoint:** `POST /api/v1/ai/parse-entry`

| Attribute | Value |
|---|---|
| Method | POST |
| Path | `/api/v1/ai/parse-entry` |
| Auth | Required (user + workspace) |

**Request Payload:**
```json
{
  "text": "Bought fuel 5k and paid 10k to Segun for loan",
  "context": {
    "currency_code": "NGN"
  }
}
```

**Response Envelope:**
```json
{
  "data": {
    "drafts": [
      {
        "id": "uuid",
        "draft_type": "expense",
        "extracted_fields": {
          "amount": "5000.0000",
          "currency_code": "NGN",
          "category": "Transport/Fuel",
          "date": "2025-01-20",
          "payment_method": "cash",
          "notes": "Bought fuel for delivery"
        },
        "missing_fields": [],
        "field_confidence": {
          "amount": 0.95,
          "category": 0.85,
          "date": 0.70,
          "payment_method": 0.60
        },
        "overall_confidence": 0.78,
        "warnings": ["Date inferred as today due to ambiguity"],
        "normalized_text": "Bought fuel 5k for delivery",
        "scope_type": "business"
      },
      {
        "id": "uuid",
        "draft_type": "loan_repayment",
        "extracted_fields": {
          "amount": "10000.0000",
          "currency_code": "NGN",
          "counterparty_name": "Segun",
          "date": "2025-01-20"
        },
        "missing_fields": ["loan_id"],
        "field_confidence": {
          "amount": 0.95,
          "counterparty_name": 0.80,
          "loan_id": 0.0
        },
        "overall_confidence": 0.58,
        "warnings": ["Could not identify which loan this repayment applies to"],
        "normalized_text": "Paid 10k to Segun for loan",
        "scope_type": "business"
      }
    ]
  }
}
```

**Behavior/Processing Steps (in order):**
1. **Authenticate** — resolve `user_id` and `workspace_id` from session
2. **Check plan limits** — if no remaining AI credits, return `403 PLAN_LIMIT_REACHED` with `{"error":{"code":"PLAN_LIMIT_REACHED","message":"AI credit limit reached for this billing period. Upgrade your plan for more credits."}}` (ref: 07 §AI Flow step 3, 10 §AI Entry credit limits)
3. **Check per-user rate limit** — if exceeded, return `429 RATE_LIMITED` with standard rate limit headers (ref: 07 §Cost And Safety Guardrails)
4. **Truncate input** — enforce max input length (configurable, default 1000 chars). Set `truncated=true` if cut (ref: 07 §Cost And Safety Guardrails, 09 §AI Security)
5. **Increment AI credit usage counter** atomically before or with the provider call (ref: 07 §Cost And Safety Guardrails)
6. **Enrich with user context** — query last 10 categories, top 5 frequent vendors/customers, default workspace scope. Context must be tenant-scoped and minimized (ref: 07 §Prompt / Response Contract, 09 §AI Security)
7. **Call LLM** via `github.com/sashabaranov/go-openai` (ref: 13 §LLM/AI Client) with strict JSON schema output mode. Use provider abstraction for swappability (ref: 07 §Architecture Rules)
8. **Validate AI output** with backend schemas — never trust model output directly (ref: 07 §Architecture Rules, 09 §AI Security)
9. **Create `ai_entry_drafts` rows** — one per detected intent; create `ai_audit_log` row
10. **Return response** with all drafts

**Security Considerations:**
- No anonymous AI calls (ref: 09 §AI Security)
- Enriched context is tenant-scoped and minimized — no cross-tenant data leakage (ref: 09 §AI Security)
- Never expose raw provider errors to users (ref: 07 §Architecture Rules)
- AI output validated with backend schemas; money as decimal strings only (ref: 07 §Architecture Rules)
- AI suggests scope — does not decide it (ref: 07 §Response Shape)

**Nigerian Shorthand Parsing (LLM Prompt Instructions):**
- `5k` = 5,000; `20k` = 20,000; `1m` = 1,000,000
- `TFare` → Transport category
- Payment methods: `POS`, `Transfer`, `cash`, `wallet`
- Currency: `Naira`, `naira`, `NGN` → workspace default currency when appropriate
- Dates: `yesterday`, `last week` → parsed relative dates

**Acceptance Criteria:**
- [ ] Returns 403 PLAN_LIMIT_REACHED when AI credits exhausted
- [ ] Returns 429 RATE_LIMITED when per-user rate limit exceeded
- [ ] Input truncated at configurable max length (default 1000 chars)
- [ ] AI credit incremented atomically before LLM call
- [ ] Context enrichment is tenant-scoped (last 10 categories, top 5 vendors/customers)
- [ ] Multi-intent inputs produce multiple drafts in response
- [ ] All monetary values as decimal strings
- [ ] AI suggests scope_type but does not decide it
- [ ] Raw provider errors not exposed to users
- [ ] Audit log created with duration_ms

---

### P5-06: POST /api/v1/ai/drafts/{id}/confirm

**Description:**
Confirm an AI draft, converting it into a real financial record. Validates the confirmed payload with the same finance rules as manual entry for the corresponding `draft_type`. Creates the financial record (transaction + ledger, invoice, wallet deposit, loan, etc.) within a single database transaction. If validation fails, the draft remains `pending` so the user can correct and re-confirm.

**Endpoint:** `POST /api/v1/ai/drafts/{id}/confirm`

| Attribute | Value |
|---|---|
| Method | POST |
| Path | `/api/v1/ai/drafts/{id}/confirm` |
| Auth | Required (user + workspace) |

**Request Payload:**
```json
{
  "confirmed_fields": {
    "amount": "5000.0000",
    "currency_code": "NGN",
    "category": "Transport/Fuel",
    "date": "2025-01-20",
    "payment_method": "cash",
    "scope_type": "business",
    "notes": "Bought fuel for delivery"
  },
  "loan_id": "uuid-if-loan-repayment"
}
```

**Response Envelope:**
```json
{
  "data": {
    "draft": {
      "id": "uuid",
      "status": "confirmed",
      "confirmed_record_type": "transaction",
      "confirmed_record_id": "uuid"
    },
    "record": { "...full created financial record..." }
  }
}
```

**Behavior/Processing Steps:**
1. Validate draft belongs to user's workspace AND `user_id` AND `status = 'pending'`
2. Validate confirmed payload with **normal finance rules** per `draft_type`:

| draft_type | Validation follows | Creates |
|---|---|---|
| `income` | POST /api/v1/transactions | Transaction (type=income) + ledger entries |
| `expense` | POST /api/v1/transactions | Transaction (type=expense) + ledger entries |
| `sale` | POST /api/v1/sales | Sale record + payment + ledger entries |
| `purchase` | POST /api/v1/purchases | Purchase record + ledger entries |
| `invoice` | POST /api/v1/invoices | Invoice (draft status) + invoice items |
| `wallet_deposit` | POST /api/v1/customers/{id}/wallet/deposits | Wallet ledger entry + payment + ledger entries |
| `loan` | POST /api/v1/loans | Loan record + ledger entries |
| `loan_repayment` | POST /api/v1/loans/{id}/repayments | Loan balance update + transaction + payment + ledger entries |
| `transfer` | POST /api/v1/transactions (mixed scope) | Transaction (scope_type=transfer/mixed) + allocations + ledger entries |

3. If validation passes, create the financial record within a single database transaction
4. Update `ai_entry_drafts`: `status='confirmed'`, `confirmed_record_type`, `confirmed_record_id`
5. Create `ai_audit_logs`: `confirmed=true`, `confirmed_record_type`, `confirmed_record_id`
6. Return response

**Error Handling:**
- If validation fails → return `422 VALIDATION_ERROR` with specific field errors; draft remains `pending`
- If draft expired/rejected → return `422 VALIDATION_ERROR`

**Security Considerations:**
- AI cannot bypass wallet, loan, split-payment, invoice, tax, or plan validation (ref: 09 §AI Security)
- Same validation as manual entry — AI confirmation is just another entry path
- Draft ownership validated via workspace_id + user_id

**Acceptance Criteria:**
- [ ] Validates draft belongs to workspace + user and is `pending`
- [ ] Applies same validation as manual entry per draft_type
- [ ] Creates financial record in single DB transaction
- [ ] Updates draft status to `confirmed` with record references
- [ ] Creates audit log entry with `confirmed=true`
- [ ] Returns 422 VALIDATION_ERROR on validation failure — draft remains pending
- [ ] Loan repayment confirmation rejects overpayment
- [ ] Wallet deposit confirmation validates balance transactionally

---

### P5-07: AI Rate Limiting Middleware

**Description:**
Gin middleware enforcing per-user and per-plan AI rate limits on all routes under `/api/v1/ai/*`. Tracks request counts per user in the `usage_counters` table. Returns 429 for short-window rate limits and 403 for plan credit exhaustion.

**Technical Details:**

**Implementation:**
- Tracks per `user_id` in `usage_counters` table (keyed by `workspace_id`, `counter_type='ai_credits'`, `period=YYYY-MM`)
- Two-tier checking:
  1. **Per-plan limit**: Current billing period AI credits vs. plan limit (Free=Limited, Starter=Standard, Business=Higher, Pro=Highest per 10 §User-To-Feature Matrix)
  2. **Per-user short-window rate limit**: Max 10 requests per minute per user using in-memory sliding window or Postgres counter

**Response Codes:**

| Condition | HTTP Status | Error Code | Message |
|---|---|---|---|
| Plan limit reached | 403 | `PLAN_LIMIT_REACHED` | "AI credit limit reached for this billing period. Upgrade your plan for more credits." |
| Rate limited | 429 | `RATE_LIMITED` | "Too many AI requests. Please wait a moment before trying again." |

**Security Considerations:**
- Rate limiting required on AI endpoints (ref: 09 §API Abuse Protection)
- AI endpoints have strict per-user and per-plan rate limits (ref: 06 §Cross-Cutting Rules)
- All responses include `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

**Acceptance Criteria:**
- [ ] Returns 429 RATE_LIMITED when short-window rate exceeded
- [ ] Returns 403 PLAN_LIMIT_REACHED when plan credits exhausted
- [ ] Rate limit headers present in all responses
- [ ] Per-user tracking prevents abuse from single accounts

---

### P5-08: AI Credit Usage Tracking

**Description:**
Service function `IncrementAICreditUsage(workspaceID, userID uuid) error` that atomically increments the AI credit counter before or with the LLM provider call. If incrementing would exceed the plan limit, the function returns an error before the LLM call is made, ensuring no AI credit is consumed without counting and no AI call is made without credit available.

**Technical Details:**

**Implementation:**
- Updates `usage_counters` table: `counter_type='ai_credits'`, `period=YYYY-MM`
- Increments `count` by 1 (or by number of drafts generated)
- Runs within the same transaction context as the AI parse request
- If increment would exceed plan limit → returns error before LLM call

**Atomicity Guarantee:**
- Credit check and increment happen before the LLM call
- If the LLM call fails, the credit is still consumed (prevents retry abuse)
- Alternative: credit increment within the same DB transaction as draft creation

**Acceptance Criteria:**
- [ ] Increments usage_counters before LLM call
- [ ] Rejects request if increment would exceed plan limit
- [ ] Operates within same transaction context as parse request
- [ ] No AI call made without credit available

---

### P5-09: Input Truncation Enforcement

**Description:**
Middleware/utility function `TruncateAIInput(text string, maxLen int) (string, bool)` that enforces a configurable maximum input length before the LLM call. Stores the original input length and truncation flag for audit purposes.

**Technical Details:**

**Configuration:**
- Default `maxLen = 1000` characters
- Configurable via environment variable `AI_INPUT_MAX_LENGTH`

**Behavior:**
- If `len(text) > maxLen`: truncates to `maxLen`, returns `(truncatedText, true)`
- If `len(text) <= maxLen`: returns `(text, false)`
- `truncated` flag stored in `ai_entry_drafts.truncated`
- Original `input_length` stored before truncation in `ai_entry_drafts.input_length`
- `input_truncated` flag stored in `ai_audit_logs.input_truncated`

**Acceptance Criteria:**
- [ ] Truncates input to configurable max length
- [ ] Returns truncation flag
- [ ] Original input_length stored before truncation
- [ ] Truncation flag propagated to both drafts and audit logs

---

### P5-10: Upgrade Add Drawer to AI-First

**Description:**
Upgrade the existing `<GlobalAddDrawer />` component (from Phase 3) to AI-first mode. The primary interaction becomes a large text input with placeholder "Type what happened" (ref: 07 §Primary Feature, 11 §AI-First Entry UX). Below the input, a "Parse" button triggers the AI parse endpoint. When multiple drafts are returned, each renders as an independent `<AIDraftCard />` with confirm/reject actions. Manual entry remains available via a fallback link.

**Component Hierarchy:**
```
<GlobalAddDrawer />
  ├── <AITextInput /> ("Type what happened" prompt)
  │   ├── Large textarea, auto-focus on drawer open
  │   └── "Parse" button (primary green #009e10)
  ├── <AIDraftCard />[] (multi-draft list)
  │   ├── Draft type label (e.g. "Expense", "Loan Repayment")
  │   ├── Extracted fields summary (amount, category, counterparty)
  │   ├── Overall confidence indicator badge
  │   ├── <ScopeChip /> (AI-suggested scope: business=green, personal=blue, mixed=orange, transfer=purple)
  │   ├── Expand/collapse to <AIDraftConfirmationForm />
  │   └── "Confirm" | "Reject" buttons (independent per card)
  ├── <ManualFallbackLink /> ("Enter manually" → switches to Phase 3 manual form)
  └── <PlanLimitMessage /> (shown on PLAN_LIMIT_REACHED or RATE_LIMITED)
```

**State Definitions:**

| State | Visual |
|---|---|
| idle | Empty textarea, auto-focused |
| loading | "Analyzing your entry..." with skeleton |
| success | Draft cards rendered |
| plan_limited | "AI credits used up this month. Upgrade for more, or enter manually." with upgrade link |
| rate_limited | "Please wait a moment before trying again." |

**Scope Inference Display:**
- Shows inferred `scope_type` as colored chip with "AI suggested" label
- User can override via scope selector dropdown (ref: 11 §AI-First Entry UX — "Inferred scope appears in the confirmation form, User can verify or override scope before saving")

**Design Tokens:**
- Parse button: primary green `#009e10` (ref: 11 §Brand Tokens)
- Scope chips: business=green (#009e10), personal=blue, mixed=orange (#fa8901), transfer=purple (ref: 11 §Scope Indicators In Lists)
- Font: Figtree for body/UI, Sora for financial amounts (ref: 11 §Typography)

**Acceptance Criteria:**
- [ ] Primary input is "Type what happened" textarea, auto-focused
- [ ] "Parse" button calls POST /api/v1/ai/parse-entry
- [ ] Multiple drafts render as independent cards
- [ ] Each card has independent Confirm/Reject buttons
- [ ] Scope inference shown as colored chip with "AI suggested" label
- [ ] User can override scope before confirming
- [ ] "Enter manually" link switches to Phase 3 manual form
- [ ] PLAN_LIMIT_REACHED shows upgrade messaging
- [ ] RATE_LIMITED shows wait messaging

---

### P5-11: AI Draft Confirmation Form

**Description:**
Per-draft confirmation form rendered inside `<AIDraftCard />` when expanded. Uses `react-hook-form` + `zod` with dynamic schema generation based on `draft_type`. Pre-fills all `extracted_fields` from the AI draft. Fields listed in `missing_fields` are required but empty with yellow borders.

**Component Hierarchy:**
```
<AIDraftConfirmationForm draftType={draft.draft_type} />
  ├── <ConfidenceFieldWrapper />[] (wraps each field)
  │   └── Field input with confidence-based styling
  ├── Dynamic Zod schema per draft_type
  └── Submit → POST /api/v1/ai/drafts/{id}/confirm
```

**Dynamic Zod Schemas:**

| draft_type | Schema Fields |
|---|---|
| `expense` | `{ amount: z.string().refine(decimalPositive), category: z.string().min(1), date: z.string(), payment_method: z.enum(['cash','transfer','pos','wallet']), scope_type: z.enum(['business','personal','mixed','transfer']), notes: z.string().optional() }` |
| `loan_repayment` | `{ amount: z.string().refine(decimalPositive), loan_id: z.string().uuid(), payment_method: z.enum(['cash','transfer','pos']), date: z.string() }` |
| `income` | `{ amount: z.string().refine(decimalPositive), category: z.string().min(1), date: z.string(), payment_method: z.enum([...]), scope_type: z.enum([...]), notes: z.string().optional() }` |
| `invoice` | `{ customer_id: z.string().uuid(), issue_date: z.string(), items: z.array(itemSchema).min(1), currency_code: z.string().length(3) }` |
| `wallet_deposit` | `{ amount: z.string().refine(decimalPositive), customer_id: z.string().uuid(), description: z.string().optional(), payment_method: z.enum([...]) }` |
| `loan` | `{ direction: z.enum(['borrowed','lent']), principal_amount: z.string().refine(decimalPositive), counterparty_name: z.string(), start_date: z.string(), currency_code: z.string().length(3) }` |
| `transfer` | `{ amount: z.string().refine(decimalPositive), from_scope: z.enum([...]), to_scope: z.enum([...]), date: z.string() }` |

**Missing Fields Handling:**
- Fields in `missing_fields` are required but empty
- Yellow border + helper text: "AI couldn't determine this. Please fill in."
- Form cannot be submitted until missing fields are completed

**State Behaviors:**

| State | Visual |
|---|---|
| idle | Pre-filled form with confidence highlighting |
| loading | "Confirming..." spinner on submit |
| success | Green check animation, card collapses, toast "Record saved" |
| error (422) | Backend field errors displayed inline, form stays open |

**Acceptance Criteria:**
- [ ] Dynamic Zod schema per draft_type
- [ ] Pre-fills extracted_fields from AI draft
- [ ] Missing fields shown with yellow border and fill-in prompt
- [ ] Submit calls POST /api/v1/ai/drafts/{id}/confirm
- [ ] On 422 VALIDATION_ERROR: displays backend field errors inline, keeps form open
- [ ] On success: green check animation, card collapses, success toast

---

### P5-12: Confidence Visualization

**Description:**
Visual confidence indicator system for AI draft fields. Wraps each form field in `<AIDraftConfirmationForm />` with a `<ConfidenceFieldWrapper />` that reads per-field confidence from `field_confidence` and applies visual highlighting. Low-confidence fields (< 0.7) get yellow borders to draw user attention.

**Component: `<ConfidenceFieldWrapper />`**

**Per-Field Visual Rules:**

| Confidence | Border Color | Helper Text |
|---|---|---|
| >= 0.7 | Normal (default) | None |
| 0.01–0.69 | Yellow (#fa8901) | "Low confidence — please verify" |
| 0 / missing | Yellow (#fa8901) | "AI couldn't determine this. Please fill in." |

**Overall Confidence Badge (at top of `<AIDraftCard />`):**

| Overall Confidence | Color | Label |
|---|---|---|
| >= 0.80 | Green (#009e10) | "High confidence" |
| 0.50–0.79 | Yellow (#fa8901) | "Review suggested" |
| < 0.50 | Red | "Needs clarification" |

**Design Tokens:**
- Yellow highlight: `#fa8901` secondary orange (ref: 11 §Brand Tokens — "Secondary orange" for "Warning accents")
- Uses color + text, not color alone (ref: 11 §Accessibility — "Color cannot be the only status signal")

**Accessibility:**
- Confidence badges use icon + text label, not color alone
- Yellow borders visible in both light and dark themes
- Screen readers announce confidence level via aria-label

**Acceptance Criteria:**
- [ ] Fields with confidence < 0.7 get yellow border + "Low confidence — please verify"
- [ ] Fields with confidence = 0 or in missing_fields get yellow border + fill-in prompt
- [ ] Fields with confidence >= 0.7 have normal appearance
- [ ] Overall confidence badge uses color + text at top of draft card
- [ ] Badge colors: green >= 0.8, yellow 0.5–0.79, red < 0.5

---

## Additional Notes

### Dependency Sequencing
1. **P5-01/P5-02** (AI tables) must land before P5-03/P5-04 (sqlc queries)
2. **P5-03/P5-04** (queries) must land before P5-05/P5-06 (API routes)
3. **P5-07** (rate limiting middleware) and **P5-08** (credit tracking) and **P5-09** (input truncation) must be operational before P5-05 can safely call the LLM
4. **P5-05** (parse endpoint) must be operational before P5-06 (confirm endpoint) — confirm validates against draft
5. **P5-06** (confirm endpoint) relies on all Phase 3 and Phase 4 financial write paths being operational
6. Frontend work (P5-10, P5-11, P5-12) depends on P5-05 and P5-06 being operational
7. P5-10 (GlobalAddDrawer upgrade) depends on Phase 3's manual form drawer already existing

### AI Flow Integrity Rules
- **AI never finalizes** (ref: 07 §AI Must Not Finalize): No ledger entries, wallet balance changes, loan repayments, invoice finalizations, tax treatment, or any irreversible financial action is created without user confirmation + backend validation
- **Backend validation is always the source of truth** (ref: 07 §Architecture Rules, 09 §AI Security): AI output is validated with backend schemas; money is decimal strings; AI cannot bypass wallet, loan, split-payment, invoice, tax, or plan validation
- **Cost guardrails** (ref: 07 §Cost And Safety Guardrails): Per-user rate limits, per-plan AI credit limits, input truncation, no anonymous AI calls, no unlimited retries, audit logging
- **Privacy** (ref: 09 §AI Security): Enriched context is tenant-scoped and minimized; no cross-tenant data leakage; minimal prompt metadata stored; no raw provider errors exposed

### Multi-Intent Parsing Examples (Test Cases)
| User Input | Expected Drafts |
|---|---|
| "Bought fuel 5k for delivery" | 1 draft: expense, 5000, business |
| "Sold 2 bags of rice for 20k cash" | 1 draft: sale, 20000, cash payment |
| "Customer A deposited 50k for next order" | 1 draft: wallet_deposit, 50000, customer A |
| "Paid back 10k from my loan" | 1 draft: loan_repayment, 10000 |
| "Bought laptop 70 percent business 30 percent personal" | 1 draft: mixed expense with allocation |
| "Bought fuel 5k and paid 10k to Segun for loan" | 2 drafts: expense 5000 + loan_repayment 10000 |

Ref: 07 §Examples, 07 §Test Plan.

### Nigerian Shorthand Parsing
The LLM prompt must be instructed to parse Nigerian financial shorthand (ref: 07 §Test Plan):
- `5k` = 5,000; `20k` = 20,000; `1m` = 1,000,000
- `TFare` → Transport category
- Payment methods: `POS`, `Transfer`, `cash`, `wallet`
- Currency: `Naira`, `naira`, `NGN` → workspace default currency when appropriate
- Dates: `yesterday`, `last week` → parsed relative dates

### Supported Draft Types and Their Confirmation Paths
| draft_type | Confirmation creates | Validation follows |
|---|---|---|
| `income` | Transaction (type=income) + ledger entries | Same as POST /api/v1/transactions |
| `expense` | Transaction (type=expense) + ledger entries | Same as POST /api/v1/transactions |
| `sale` | Sale record + payment + ledger entries | Same as POST /api/v1/sales |
| `purchase` | Purchase record + ledger entries | Same as POST /api/v1/purchases |
| `invoice` | Invoice (draft status) + invoice items | Same as POST /api/v1/invoices |
| `wallet_deposit` | Wallet ledger entry + payment + ledger entries | Same as POST /api/v1/customers/{id}/wallet/deposits |
| `loan` | Loan record + ledger entries | Same as POST /api/v1/loans |
| `loan_repayment` | Loan balance update + transaction + payment + ledger entries | Same as POST /api/v1/loans/{id}/repayments |
| `transfer` | Transaction (scope_type=transfer/mixed) + allocations + ledger entries | Same as POST /api/v1/transactions with mixed scope |
