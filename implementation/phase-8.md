# Phase 8: Security, QA, Beta

**Goal:** Harden the MVP before public launch. Known security, data, and financial correctness risks are tested. Produce a production launch candidate.

**Planning References:** `05-data-model.md`, `06-api-architecture.md`, `09-security.md`, `10-monetization.md`, `12-roadmap.md`, `13-tech-stack-and-libraries.md`

**Build Order:** This phase is fundamentally different — it is not new feature work but a systematic test and hardening pass. The order proceeds from data-layer security tests up through API security, financial integrity, offline/sync correctness, dependency scanning, backup verification, and finally private beta setup. Each work item is a test suite or verification activity with precise pass/fail criteria.

---

## Section 1: Summary Table

| ID | Work Item | Owner Area | Acceptance Criteria |
|----|-----------|------------|---------------------|
| P8-01 | Tenant isolation test suite | QA / Backend | Cross-workspace read and write attempts on all tenant-owned tables return FORBIDDEN or NOT_FOUND. |
| P8-02 | Object-level authorization tests | QA / Backend | Every `/{id}` route rejects access to resources belonging to another workspace. |
| P8-03 | Property-level authorization (mass assignment) tests | QA / Backend | Clients cannot set protected fields (workspace_id, plan_id, wallet_balance, etc.) via API payloads. |
| P8-04 | Financial integrity: Ledger balance tests | QA / Backend | Every finalized financial write creates balanced ledger entries; unbalanced writes roll back entirely. |
| P8-05 | Financial integrity: Wallet overdraft tests | QA / Backend | Wallet balances never go negative; overdraft attempts return INSUFFICIENT_WALLET_BALANCE. |
| P8-06 | Financial integrity: Split payment overpayment tests | QA / Backend | Sum of payment rows cannot exceed amount due; overpayments return OVERPAYMENT_NOT_ALLOWED. |
| P8-07 | Financial integrity: Loan overpayment tests | QA / Backend | Loan repayments cannot reduce balance below zero; overpayments return OVERPAYMENT_NOT_ALLOWED. |
| P8-08 | Immutability tests | QA / Backend | Finalized records cannot be PATCHed or DELETEd; corrections use void/reversal endpoints only. |
| P8-09 | AI abuse and cost tests | QA / Backend | Rate limits enforced, input truncated, no anonymous access, AI drafts require confirmation, AI output validated. |
| P8-10 | Offline sync tests | QA / Backend | Idempotency keys prevent duplicates, server-wins for finalized records, batch limits enforced, Free users blocked. |
| P8-11 | Webhook signature and idempotency tests | QA / Backend | Invalid signatures rejected, duplicate events idempotent, payloads sanitized. |
| P8-12 | Auth security tests | QA / Backend | OTP expiry, resend throttle, failed attempt lockout, refresh/logout, revoked session all work correctly. |
| P8-13 | CORS/CSRF tests | QA / Backend | Unknown origins rejected, CSRF tokens required for unsafe methods, no wildcard CORS on protected routes. |
| P8-14 | SQL injection prevention verification | QA / Backend | All database access uses sqlc parameterized queries; no string concatenation with user input. |
| P8-15 | Dependency vulnerability scanning | DevOps / QA | CI blocks merge on critical/high npm and Go vulnerabilities; weekly scheduled scan on main. |
| P8-16 | Backup and restore verification | DevOps / QA | Full backup-restore cycle succeeds with data integrity verified and RTO < 30 minutes. |
| P8-17 | Rate limit tests | QA / Backend | Rate limit headers present on all responses; 429 returned on excess; per-user limits independent. |
| P8-18 | Pagination tests | QA / Backend | Cursor pagination works, offset pagination rejected, 30-day default scoping enforced, no unbounded queries. |
| P8-19 | PII masking verification in logs | QA / Backend | Logs mask emails, phones, bank details; no raw secrets, tokens, or full OTP values. |
| P8-20 | Audit logging verification | QA / Backend | Audit entries created for all security events; entries do not contain raw secrets or unmasked PII. |
| P8-21 | Private beta setup | DevOps / QA | Staging seeded with fake data, full user journey smoke-tested, beta accounts created and invited. |

---

## Section 2: Detailed Descriptions

---

### P8-01: Tenant Isolation Test Suite

**Description:**
Comprehensive test suite verifying that no cross-workspace data access is possible. Even though MVP has one workspace per user, tenant isolation is mandatory per Doc 09: every tenant-owned query must include `workspace_id`; cross-workspace access must fail with `FORBIDDEN` or `NOT_FOUND`. This test suite creates two users with separate workspaces and systematically attempts every read and write path across the boundary. This is the most critical security test — if tenant isolation fails, one user could see or modify another user's financial data.

**Technical Details:**

**Test Suite:** `TestTenantIsolation`

**Methodology:**
1. Create user A with `workspace_A`
2. Create user B with `workspace_B`
3. Populate `workspace_A` with sample data in all tables
4. Authenticate as user A
5. Attempt to read and mutate records belonging to `workspace_B`

**Tables Tested:**

| Table | Read Test | Write Test |
|---|---|---|
| transactions | `GET /api/v1/transactions?workspace_id=B_ID` | `POST /api/v1/transactions` with B's customer |
| invoices | `GET /api/v1/invoices/{B_invoice_id}` | `PATCH /api/v1/invoices/{B_invoice_id}` |
| invoice_items | (via invoice routes) | (via invoice routes) |
| payments | `GET /api/v1/payments?workspace_id=B_ID` | `POST /api/v1/payments` for B's invoice |
| sales | `GET /api/v1/sales?workspace_id=B_ID` | `POST /api/v1/sales` with B's customer |
| purchases | `GET /api/v1/purchases?workspace_id=B_ID` | `POST /api/v1/purchases` with B's vendor |
| customers | `GET /api/v1/customers?workspace_id=B_ID` | `POST /api/v1/customers` with B's workspace |
| customer_wallets | `GET /api/v1/customers/{B_cust_id}/wallet` | `POST /api/v1/customers/{B_cust_id}/wallet/deposits` |
| customer_wallet_ledger | `GET /api/v1/customers/{B_cust_id}/wallet/ledger` | (via wallet deposit) |
| loans | `GET /api/v1/loans/{B_loan_id}` | `POST /api/v1/loans/{B_loan_id}/repayments` |
| budgets | `GET /api/v1/budgets?workspace_id=B_ID` | `POST /api/v1/budgets` with B's workspace |
| budget_categories | (via budget routes) | (via budget routes) |
| exports | `GET /api/v1/exports/{B_export_id}` | `POST /api/v1/exports` with B's workspace |
| generated_documents | (via export routes) | (via export routes) |
| notification_preferences | (via notification routes) | `PATCH /api/v1/notifications/preferences` |
| notifications | `GET /api/v1/notifications?workspace_id=B_ID` | `PATCH /api/v1/notifications/{B_notif_id}/read` |
| notification_deliveries | (via notification routes) | (via notification routes) |
| ai_entry_drafts | (via AI routes) | `POST /api/v1/ai/parse-entry` referencing B's data |
| usage_counters | (via plan/usage routes) | (via write operations) |
| client_mutations | (via sync routes) | `POST /api/v1/sync/mutations` with B's workspace |

**Expected Results:**
- All read attempts: `403 FORBIDDEN` or `404 NOT_FOUND` — never `200` with B's data
- All write attempts: `403 FORBIDDEN` or `404 NOT_FOUND` — no records created in B's workspace
- Responses use `FORBIDDEN` or `NOT_FOUND` consistently per Doc 09

**Acceptance Criteria:**
- [ ] All 18+ tenant-owned tables tested for cross-workspace read protection
- [ ] All tenant-owned tables tested for cross-workspace write protection
- [ ] No cross-workspace access succeeds — every attempt returns 403 or 404
- [ ] No data from workspace_B is ever returned in workspace_A's API responses
- [ ] Void/reversal attempts on B's records fail
- [ ] Test suite runs in CI/CD and blocks merge on failure

---

### P8-02: Object-Level Authorization Tests

**Description:**
Test suite verifying that every `/{id}` route in the API checks that the requested resource belongs to the authenticated user's workspace. Per Doc 09: every `/{id}` route must check object ownership; transaction ID must belong to the authenticated user's workspace; same for invoices, wallets, jobs, exports. This test goes deeper than tenant isolation (P8-01) by testing every individual route with specific resource IDs rather than broad workspace-level queries.

**Technical Details:**

**Test Suite:** `TestObjectLevelAuth`

**Method:**
1. Create a resource in workspace A
2. Authenticate as user B (different workspace)
3. Attempt each route with A's resource ID

**Routes Tested:**

| Route | Method | Expected Result |
|---|---|---|
| `/api/v1/transactions/{A_id}` | GET | 404 or 403 |
| `/api/v1/transactions/{A_id}/void` | POST | 404 or 403 |
| `/api/v1/invoices/{A_id}` | GET | 404 or 403 |
| `/api/v1/invoices/{A_id}` | PATCH | 404 or 403 |
| `/api/v1/invoices/{A_id}/finalize` | POST | 404 or 403 |
| `/api/v1/invoices/{A_id}/void` | POST | 404 or 403 |
| `/api/v1/invoices/{A_id}/pdf` | POST | 404 or 403 |
| `/api/v1/loans/{A_id}` | GET | 404 or 403 |
| `/api/v1/loans/{A_id}/repayments` | POST | 404 or 403 |
| `/api/v1/customers/{A_id}/wallet` | GET | 404 or 403 |
| `/api/v1/customers/{A_id}/wallet/deposits` | POST | 404 or 403 |
| `/api/v1/customers/{A_id}/wallet/ledger` | GET | 404 or 403 |
| `/api/v1/budgets/{A_id}/status` | GET | 404 or 403 |
| `/api/v1/jobs/{A_id}` | GET | 404 or 403 |
| `/api/v1/exports/{A_id}` | GET | 404 or 403 |
| `/api/v1/notifications/{A_id}/read` | PATCH | 404 or 403 |

**Additional Checks:**
- Verify that A's resource data is never leaked in error messages (no "Transaction X belongs to workspace Y" messages)
- Verify that response time is consistent regardless of whether the resource exists in another workspace (no timing oracle)

**Acceptance Criteria:**
- [ ] Every `/{id}` route returns 403 or 404 for resources in another workspace
- [ ] No route returns 200 with data from another workspace
- [ ] No data leakage through error messages
- [ ] All 16+ routes tested
- [ ] Test suite runs in CI/CD

---

### P8-03: Property-Level Authorization Tests (Mass Assignment)

**Description:**
Test suite verifying that clients cannot set protected fields via API payloads. Per Doc 09: clients must not be able to mass-assign protected fields; the API should map request DTOs to allowed fields explicitly instead of binding directly into database models. This test attempts to inject protected fields into request payloads and verifies that the server ignores or rejects them. Protected fields include workspace_id, user_id, plan_id, subscription_id, ledger_entries, wallet_balance, loan_balance, paid_amount, voided_at, voided_by_id, created_by_id, updated_by_id, and internal status fields.

**Technical Details:**

**Test Suite:** `TestMassAssignmentProtection`

**Protected Fields (Ref: Doc 09):**

| Field | Why Protected |
|---|---|
| workspace_id | Could move data to another workspace |
| user_id | Could attribute actions to another user |
| plan_id | Could upgrade plan without payment |
| subscription_id | Could link to another user's subscription |
| ledger_entries | Could create unbalanced or fraudulent entries |
| wallet_balance | Could inflate wallet balance |
| loan_balance | Could reduce loan balance without payment |
| paid_amount | Could mark invoices as paid without actual payment |
| voided_at | Could void records without proper flow |
| voided_by_id | Could attribute void to another user |
| created_by_id | Could attribute creation to another user |
| updated_by_id | Could attribute updates to another user |
| status (internal) | Could finalize invoices/transactions without proper flow |

**Test Cases:**

| # | Request | Expected Behavior |
|---|---|---|
| 1 | `POST /api/v1/transactions` with `{ "workspace_id": "victim_ws_id" }` | Created record uses authenticated user's workspace_id, not supplied one |
| 2 | `POST /api/v1/transactions` with `{ "created_by_id": "other_user_id" }` | `created_by_id` is the authenticated user's ID |
| 3 | `PATCH /api/v1/invoices/{id}` with `{ "status": "finalized", "paid_amount": "9999999" }` | Must fail; status transitions use dedicated endpoints |
| 4 | `POST /api/v1/transactions` with `{ "voided_at": "2026-01-01", "voided_by_id": "uuid" }` | Must ignore or reject; voiding uses `POST /transactions/{id}/void` only |
| 5 | `POST /api/v1/transactions` with `{ "plan_id": "pro_plan_id" }` | Must ignore; plan resolved server-side |
| 6 | `POST /api/v1/transactions` with `{ "wallet_balance": "9999999" }` | Must ignore; wallet balance is server-managed |
| 7 | `POST /api/v1/transactions` with `{ "loan_balance": "0" }` | Must ignore; loan balance is server-managed |

**Implementation Verification:**
- Inspect API request DTO structs — they must NOT contain protected fields
- Verify that Go handler code maps DTOs to database models explicitly, not via reflection or automatic binding
- Confirm that `sqlc` generated code only sets columns that appear in the query file

**Acceptance Criteria:**
- [ ] All 7+ test cases pass — protected fields are never set from client input
- [ ] Created records always use server-resolved workspace_id and user_id
- [ ] Status transitions only work through dedicated endpoints (finalize, void)
- [ ] Wallet balance, loan balance, and paid_amount never directly settable
- [ ] API DTOs do not include protected fields
- [ ] No automatic model binding from request body to database model

---

### P8-04: Financial Integrity: Ledger Balance Tests

**Description:**
Test suite verifying that every finalized financial write creates balanced ledger entries where total debits equal total credits. Per Doc 05/06/09: total debits must equal total credits before commit; ledger writes happen in database transactions; finalized entries are immutable. This is the fundamental accounting correctness test — if ledger entries don't balance, the entire financial model is compromised.

**Technical Details:**

**Test Suite:** `TestLedgerBalance`

**Test Cases:**

| # | Operation | Expected Ledger Entries |
|---|---|---|
| 1 | `POST /api/v1/transactions` (income) | Debit cash, Credit income → balanced |
| 2 | `POST /api/v1/transactions` (expense) | Debit expense, Credit cash → balanced |
| 3 | Sale with split payments (cash + transfer + POS + wallet) | Debit cash/transfer/POS/customer_liabilities, Credit revenue → balanced |
| 4 | Invoice finalization | Debit receivable, Credit revenue → balanced |
| 5 | Void operation | Creates reversing entries → balanced |
| 6 | Wallet deposit | Debit cash, Credit customer_liabilities → balanced |
| 7 | Wallet payment | Debit customer_liabilities, Credit receivable/cash → balanced |
| 8 | Loan creation | Debit receivable, Credit cash → balanced |
| 9 | Loan repayment | Debit cash, Credit receivable → balanced |
| 10 | Mixed transaction with allocation | Debit/credit split by allocation → balanced |

**Failure Cases:**

| # | Scenario | Expected Result |
|---|---|---|
| 11 | Attempt to write transaction that would create unbalanced ledger entries | Must fail and roll back entire DB transaction; no partial writes |
| 12 | Concurrent ledger writes to same account | Must serialize correctly; both sets of entries must balance independently |

**Verification Query:**
After each test write, verify:
```sql
SELECT 
  transaction_id,
  SUM(debit_amount) as total_debits,
  SUM(credit_amount) as total_credits
FROM ledger_entries
WHERE transaction_id = $1
GROUP BY transaction_id;
```
- `total_debits` must equal `total_credits` for every `transaction_id`
- Use `shopspring/decimal` for comparison (never float64)

**Acceptance Criteria:**
- [ ] All 10+ financial write operations create balanced ledger entries
- [ ] Void operations create balanced reversing entries
- [ ] Unbalanced ledger write attempts fail and roll back entirely
- [ ] No partial writes — either all entries commit or none do
- [ ] Concurrent writes serialize correctly with balanced results
- [ ] Verification uses decimal comparison, not float64

---

### P8-05: Financial Integrity: Wallet Overdraft Tests

**Description:**
Test suite verifying that customer wallet balances cannot go negative under any circumstances. Per Doc 05/06/09: no negative wallet balances; wallet payments must validate available balance transactionally; deposits credit customer liabilities, not revenue. This test covers direct wallet payments, split payments with wallet portions, and concurrent wallet access scenarios.

**Technical Details:**

**Test Suite:** `TestWalletOverdraft`

**Test Cases:**

| # | Scenario | Wallet Balance | Attempted Payment | Expected Result |
|---|---|---|---|---|
| 1 | Direct wallet overdraft | `"5000.0000"` | `"6000.0000"` via wallet payment | `409 CONFLICT` with `INSUFFICIENT_WALLET_BALANCE` |
| 2 | Split payment with wallet exceeding balance | `"5000.0000"` | Wallet `"5500.0000"` + Cash `"5000.0000"` | `409 CONFLICT` — entire split rejected transactionally |
| 3 | Invoice payment via wallet exceeding balance | `"3000.0000"` | `"5000.0000"` | `409 CONFLICT` |
| 4 | Exact wallet balance payment | `"5000.0000"` | `"5000.0000"` | `200 OK`, new balance `"0.0000"` |
| 5 | Partial wallet payment within balance | `"5000.0000"` | `"3000.0000"` | `200 OK`, new balance `"2000.0000"` |

**Concurrent Wallet Access Test:**

| # | Scenario | Expected Result |
|---|---|---|
| 6 | Two simultaneous wallet payments, each attempting full balance | Exactly one succeeds, one fails with `INSUFFICIENT_WALLET_BALANCE` |
| 7 | Two simultaneous partial payments that together exceed balance | At most one succeeds, or both partial amounts succeed without overdraft |

**Implementation:**
- Use goroutines with `sync.WaitGroup` for concurrent tests
- Verify `SELECT ... FOR UPDATE` row-level locking prevents race conditions
- Post-test verification: `SELECT balance FROM customer_wallets WHERE id = $1` must be `>= 0`

**Error Response Format:**
```json
{
  "error": {
    "code": "INSUFFICIENT_WALLET_BALANCE",
    "message": "Insufficient wallet balance. Available: NGN 5,000.0000, Requested: NGN 6,000.0000",
    "details": {
      "available_balance": "5000.0000",
      "requested_amount": "6000.0000",
      "currency_code": "NGN"
    }
  }
}
```

**Acceptance Criteria:**
- [ ] Wallet overdraft attempts return `409 INSUFFICIENT_WALLET_BALANCE`
- [ ] Split payments with wallet overdraft rejected entirely (no partial acceptance)
- [ ] Exact-balance and partial-balance payments succeed
- [ ] Concurrent wallet access serialized correctly — no negative balances
- [ ] Post-test verification confirms all wallet balances >= 0
- [ ] Error message includes available balance and requested amount

---

### P8-06: Financial Integrity: Split Payment Overpayment Tests

**Description:**
Test suite verifying that the sum of payment rows cannot exceed the amount due on a sale or invoice. Per Doc 05/06/09: sum of payment rows must not exceed amount due; payment validation must happen transactionally. This test covers single and multiple payment rows, sequential partial payments, and wallet portions in split payments.

**Technical Details:**

**Test Suite:** `TestSplitPaymentOverpayment`

**Test Cases:**

| # | Scenario | Amount Due | Payment Rows | Expected Result |
|---|---|---|---|---|
| 1 | Two rows exceeding total | `"10000.0000"` | `"6000.0000"` + `"5000.0000"` | `409 OVERPAYMENT_NOT_ALLOWED` |
| 2 | Three rows exceeding total | `"20000.0000"` | `"8000.0000"` + `"8000.0000"` + `"5000.0000"` | `409 OVERPAYMENT_NOT_ALLOWED` |
| 3 | Exact total | `"10000.0000"` | `"6000.0000"` + `"4000.0000"` | `200 OK` |
| 4 | Partial total (underpaid) | `"10000.0000"` | `"7000.0000"` | `200 OK`, balance `"3000.0000"` |
| 5 | Sequential overpayment | `"10000.0000"` | First `"7000.0000"` OK, then `"4000.0000"` | Second rejected: `409 OVERPAYMENT_NOT_ALLOWED` |
| 6 | Wallet portion exceeds wallet + total | `"10000.0000"` | Wallet `"8000.0000"` (balance `"5000.0000"`) | Rejected: `INSUFFICIENT_WALLET_BALANCE` |
| 7 | Wallet + cash exceeding total | `"10000.0000"` | Wallet `"7000.0000"` + Cash `"4000.0000"` | `409 OVERPAYMENT_NOT_ALLOWED` |

**Verification:**
- All validation within a single database transaction
- After successful payment: `paid_amount = SUM(payment_rows.amount)`, `balance_amount = total_amount - paid_amount`
- After rejected payment: no payment rows created, `paid_amount` unchanged

**Error Response Format:**
```json
{
  "error": {
    "code": "OVERPAYMENT_NOT_ALLOWED",
    "message": "Total payment amount (NGN 11,000.0000) exceeds amount due (NGN 10,000.0000)",
    "details": {
      "amount_due": "10000.0000",
      "total_payment": "11000.0000",
      "currency_code": "NGN"
    }
  }
}
```

**Acceptance Criteria:**
- [ ] Overpayment attempts return `409 OVERPAYMENT_NOT_ALLOWED`
- [ ] Exact-total payments succeed
- [ ] Partial payments succeed and correctly update balance
- [ ] Sequential payments correctly track running total and reject overpayments
- [ ] Wallet portion in split payments also validated for both wallet balance and total cap
- [ ] All validation is transactional — no partial payment rows created on rejection

---

### P8-07: Financial Integrity: Loan Overpayment Tests

**Description:**
Test suite verifying that loan repayments cannot reduce the loan balance below zero. Per Doc 05/06/09: loan repayments cannot reduce balance below zero; no amortization, no compound interest in MVP. This test covers overpayments, exact repayments, and concurrent repayment scenarios.

**Technical Details:**

**Test Suite:** `TestLoanOverpayment`

**Test Cases:**

| # | Scenario | Loan Balance | Repayment Amount | Expected Result |
|---|---|---|---|---|
| 1 | Overpayment | `"10000.0000"` | `"15000.0000"` | `409 OVERPAYMENT_NOT_ALLOWED` |
| 2 | Exact repayment | `"10000.0000"` | `"10000.0000"` | `200 OK`, balance → `"0.0000"`, status → `'paid'` |
| 3 | Slight overpayment | `"5000.0000"` | `"5001.0000"` | `409 OVERPAYMENT_NOT_ALLOWED` |
| 4 | Partial repayment | `"10000.0000"` | `"5000.0000"` | `200 OK`, balance → `"5000.0000"`, status remains `'active'` |
| 5 | Zero repayment | `"10000.0000"` | `"0.0000"` | `400 VALIDATION_ERROR` — amount must be > 0 |

**Concurrent Repayment Test:**

| # | Scenario | Loan Balance | Two Concurrent Repayments | Expected Result |
|---|---|---|---|---|
| 6 | Both for `"5000.0000"` against `"8000.0000"` | `"8000.0000"` | `"5000.0000"` + `"5000.0000"` | At most one succeeds, or partial amounts succeed without overpaying |

**Verification:**
- Post-test: `SELECT current_balance FROM loans WHERE id = $1` must be `>= 0`
- After exact repayment: `status` must be `'paid'`, `current_balance` must be `"0.0000"`
- Use `shopspring/decimal` for comparison

**Error Response Format:**
```json
{
  "error": {
    "code": "OVERPAYMENT_NOT_ALLOWED",
    "message": "Repayment amount (NGN 15,000.0000) exceeds current loan balance (NGN 10,000.0000)",
    "details": {
      "current_balance": "10000.0000",
      "repayment_amount": "15000.0000",
      "currency_code": "NGN"
    }
  }
}
```

**Acceptance Criteria:**
- [ ] Overpayment attempts return `409 OVERPAYMENT_NOT_ALLOWED`
- [ ] Exact repayment sets balance to 0 and status to 'paid'
- [ ] Partial repayment reduces balance correctly
- [ ] Zero-amount repayment rejected as validation error
- [ ] Concurrent repayments serialized — no negative balances
- [ ] Post-test verification confirms all loan balances >= 0

---

### P8-08: Immutability Tests

**Description:**
Test suite verifying that finalized financial records cannot be directly edited or hard-deleted. Per Doc 05/06/09: finalized transactions, invoices, payments, and wallet ledger entries are never hard-deleted or directly updated; corrections use voids and reversing entries. This test ensures the immutability guarantee holds for all financial record types, while confirming that draft records (like draft invoices) remain mutable.

**Technical Details:**

**Test Suite:** `TestImmutability`

**Test Cases:**

| # | Operation | Record State | Method/Route | Expected Result |
|---|---|---|---|---|
| 1 | Edit finalized transaction | Finalized | `PATCH /api/v1/transactions/{id}` | `405` or `409` — "Finalized records cannot be edited. Use void to correct." |
| 2 | Delete finalized transaction | Finalized | `DELETE /api/v1/transactions/{id}` | `405 METHOD_NOT_ALLOWED` |
| 3 | Edit finalized invoice | Finalized | `PATCH /api/v1/invoices/{id}` | `405` or `409` |
| 4 | Delete finalized invoice | Finalized | `DELETE /api/v1/invoices/{id}` | `405` |
| 5 | Mutate finalized payment | Finalized | Direct mutation endpoint | Must fail |
| 6 | Edit wallet ledger entry | Finalized | `PATCH /api/v1/...` | Must fail |
| 7 | Delete wallet ledger entry | Finalized | `DELETE /api/v1/...` | Must fail |
| 8 | Edit draft invoice | Draft | `PATCH /api/v1/invoices/{id}` | `200 OK` — drafts are mutable |
| 9 | Void finalized transaction | Finalized | `POST /api/v1/transactions/{id}/void` | `200 OK`, creates reversing entry, sets `voided_at` and `voided_by_id` |

**Database Verification:**
- No hard `DELETE` statements on finalized records in any code path
- After void: `SELECT voided_at FROM transactions WHERE id = $1` must be non-null
- After void: reversing ledger entries exist with `SUM(debit) = SUM(credit)`
- Record still exists in database — only `voided_at` is set, no hard delete

**Acceptance Criteria:**
- [ ] Finalized transactions cannot be PATCHed or DELETEd
- [ ] Finalized invoices cannot be PATCHed or DELETEd
- [ ] Finalized payments cannot be directly mutated
- [ ] Wallet ledger entries cannot be edited or deleted
- [ ] Draft invoices CAN be edited (PATCH works for drafts)
- [ ] Void operation succeeds on finalized records, creates reversing entries
- [ ] Void sets `voided_at` and `voided_by_id` but does NOT hard-delete
- [ ] No hard DELETE operations on finalized records in any code path

---

### P8-09: AI Abuse and Cost Tests

**Description:**
Test suite verifying AI endpoint rate limiting, input truncation, output validation, access control, and confirmation requirements. Per Doc 07/09: per-user and per-plan AI rate limits; input truncation; no anonymous AI calls; AI output validated with backend schemas; AI drafts never bypass validation. This test ensures the AI layer cannot be abused for cost inflation, data exfiltration, or financial rule bypass.

**Technical Details:**

**Test Suite:** `TestAIAbuseAndCost`

**Rate Limit Tests:**

| # | Scenario | Expected Result |
|---|---|---|
| 1 | Free user exceeds per-minute rate on `POST /api/v1/ai/parse-entry` | `429` with `X-RateLimit-Remaining: 0` and `X-RateLimit-Reset` headers |
| 2 | Business plan user hits per-plan AI credit limit | `403 PLAN_LIMIT_REACHED` with credits used and plan limit |

**Input Truncation Tests:**

| # | Scenario | Expected Result |
|---|---|---|
| 3 | Submit 5000-character input | Backend truncates to max input length (e.g., 2000 chars) before sending to LLM; `ai_audit_logs.input_length` reflects original length, only truncated text goes to provider |

**Output Validation Tests:**

| # | Scenario | Expected Result |
|---|---|---|
| 4 | AI returns `amount` as float `"5000.5"` | Backend must convert to decimal string or reject |
| 5 | AI returns invalid `scope_type: "enterprise"` | Backend must reject invalid enum value |
| 6 | AI draft confirmation attempts wallet overdraft | Backend must enforce `INSUFFICIENT_WALLET_BALANCE` regardless of AI origin |
| 7 | AI draft confirmation attempts loan overpayment | Backend must enforce `OVERPAYMENT_NOT_ALLOWED` regardless of AI origin |
| 8 | AI draft confirmation attempts split payment overpayment | Backend must enforce `OVERPAYMENT_NOT_ALLOWED` regardless of AI origin |

**No Anonymous Access Test:**

| # | Scenario | Expected Result |
|---|---|---|
| 9 | `POST /api/v1/ai/parse-entry` without auth | `401 UNAUTHORIZED` |

**Confirmation Required Test:**

| # | Scenario | Expected Result |
|---|---|---|
| 10 | AI draft never confirmed | Must NOT create a transaction, ledger entry, or any financial record |

**Rate Limit Header Verification:**
All AI endpoint responses must include:
- `X-RateLimit-Limit`: maximum requests allowed
- `X-RateLimit-Remaining`: remaining requests in current window
- `X-RateLimit-Reset`: Unix timestamp when the window resets

**Acceptance Criteria:**
- [ ] Per-user rate limits enforced — excess requests return 429 with correct headers
- [ ] Per-plan AI credit limits enforced — `PLAN_LIMIT_REACHED` when exhausted
- [ ] Input truncated before LLM call; audit log records original and truncated lengths
- [ ] Invalid AI output (bad amounts, invalid enums) rejected or corrected by backend
- [ ] AI-originated drafts subject to all financial validation rules (wallet, loan, split payment)
- [ ] No anonymous AI access — unauthenticated requests return 401
- [ ] Unconfirmed AI drafts create zero financial records

---

### P8-10: Offline Sync Tests

**Description:**
Test suite verifying the correctness of the `POST /api/v1/sync/mutations` endpoint — idempotency, server-wins conflict resolution, batch limits, and Free user restrictions. Per Doc 05/06/09: duplicate idempotency keys must not create duplicate records; server wins for finalized records, balances, wallets, loans, invoices; offline writes require idempotency keys; Free users cannot create offline records.

**Technical Details:**

**Test Suite:** `TestOfflineSync`

**Idempotency Tests:**

| # | Scenario | Expected Result |
|---|---|---|
| 1 | Send same `idempotency_key` twice in separate requests | Second request returns same result; no duplicate records; `client_mutations` has exactly 1 row for that key |
| 2 | Send batch with 2 mutations sharing same `idempotency_key` | Only first applied; second returns duplicate status |

**Server-Wins Tests:**

| # | Scenario | Expected Result |
|---|---|---|
| 3 | Client submits offline mutation to void a transaction already voided on server | `status: 'conflict'`, `conflict_reason: 'server_finalized_record_exists'` |
| 4 | Client submits offline wallet deposit, but server wallet balance changed | Server's balance wins; mutation applied with server state |
| 5 | Client submits offline invoice edit on a finalized invoice | Rejected as conflict |

**Batch Limit Test:**

| # | Scenario | Expected Result |
|---|---|---|
| 6 | Sync more than 25 mutations in a single batch | `400 VALIDATION_ERROR` with message "Batch size exceeds maximum of 25" |

**Free User Restriction:**

| # | Scenario | Expected Result |
|---|---|---|
| 7 | Free user calls `POST /api/v1/sync/mutations` | `403 PLAN_LIMIT_REACHED` |

**Duplicate client_request_id:**

| # | Scenario | Expected Result |
|---|---|---|
| 8 | Same `(workspace_id, client_request_id)` submitted twice | Second returns existing result from `client_mutations` |

**Body Size Limit:**

| # | Scenario | Expected Result |
|---|---|---|
| 9 | Request body exceeds 256 KB | `400 VALIDATION_ERROR` |

**Acceptance Criteria:**
- [ ] Duplicate idempotency keys do not create duplicate records
- [ ] Duplicate client_request_ids return existing results
- [ ] Server wins for finalized records — conflicting mutations marked as `conflict`
- [ ] Server wins for wallet and loan balances
- [ ] Batch size limit of 25 enforced
- [ ] Body size limit of 256 KB enforced
- [ ] Free users blocked from sync endpoint
- [ ] All applied mutations create balanced ledger entries

---

### P8-11: Webhook Signature and Idempotency Tests

**Description:**
Test suite verifying Paystack webhook signature validation and idempotent event processing. Per Doc 06/09: must verify webhook signatures; invalid signatures must be rejected; processing must be idempotent; duplicate events must not duplicate subscription updates. Per Doc 09: webhook payloads should be logged only in sanitized form.

**Technical Details:**

**Test Suite:** `TestWebhookSecurity`

**Signature Tests:**

| # | Scenario | Expected Result |
|---|---|---|
| 1 | Invalid HMAC-SHA512 signature | `401`; event NOT stored in `webhook_events` |
| 2 | Valid HMAC-SHA512 signature | `200`; event stored with `signature_valid = true`, `processed = true` |
| 3 | Missing `x-paystack-signature` header | `401` |

**Idempotency Tests:**

| # | Scenario | Expected Result |
|---|---|---|
| 4 | Same Paystack event (same `provider_event_id`) sent twice with valid signature | Second returns `200 { "status": "duplicate" }`; `subscriptions` has exactly 1 update; `webhook_events` has exactly 1 row |
| 5 | `subscription.create` then `subscription.enable` for same subscription | Both processed; plan state reflects latest event |
| 6 | Concurrent identical webhook events | Exactly one processed; others return duplicate status |

**Payload Safety Test:**

| # | Scenario | Expected Result |
|---|---|---|
| 7 | Verify stored `webhook_events.payload` | No full card numbers, no raw bank details, no unmasked PII |

**Signature Computation for Tests:**
```go
mac := hmac.New(sha512.New, []byte(webhookSecret))
mac.Write(requestBody)
expectedSig := hex.EncodeToString(mac.Sum(nil))
// Set x-paystack-signature header to expectedSig for valid test
```

**Acceptance Criteria:**
- [ ] Invalid signatures return 401 and event is NOT stored
- [ ] Valid signatures process and store events correctly
- [ ] Missing signature header returns 401
- [ ] Duplicate events return duplicate status without re-processing
- [ ] Sequential events for same subscription both processed correctly
- [ ] Concurrent events deduplicated safely
- [ ] Stored payloads contain no full card numbers or raw bank details

---

### P8-12: Auth Security Tests

**Description:**
Test suite verifying all authentication security requirements from Doc 09. Covers OTP expiry, resend throttle, failed attempt lockout, session refresh, logout, session revocation, OTP value non-exposure, and email enumeration prevention. These are the foundational security tests for the auth system built in Phase 2.

**Technical Details:**

**Test Suite:** `TestAuthSecurity`

**OTP Expiry Tests:**

| # | Scenario | Expected Result |
|---|---|---|
| 1 | Request OTP, wait beyond TTL (5 min), attempt verify | `401` with code `OTP_EXPIRED` |
| 2 | Verify OTP before expiry | `200 OK` — verification succeeds |

**Resend Throttle Tests:**

| # | Scenario | Expected Result |
|---|---|---|
| 3 | Request OTP twice within 60 seconds | Second request returns `429 RATE_LIMITED` |

**Failed Attempt Lockout Tests:**

| # | Scenario | Expected Result |
|---|---|---|
| 4 | Submit wrong OTP 5 times for same email | 6th attempt returns `403 OTP_LOCKOUT` with lockout duration |
| 5 | After lockout expires, correct OTP | `200 OK` — verification succeeds |

**Session Tests:**

| # | Scenario | Expected Result |
|---|---|---|
| 6 | `POST /api/v1/auth/refresh` with valid refresh token | Returns new access token |
| 7 | `POST /api/v1/auth/refresh` with expired refresh token | `401 UNAUTHORIZED` |
| 8 | `POST /api/v1/auth/logout` | Subsequent `GET /api/v1/session` returns `401` |
| 9 | Use old access token after logout | `401 UNAUTHORIZED` |
| 10 | Reuse refresh token after logout | Must fail |

**OTP Security Tests:**

| # | Scenario | Expected Result |
|---|---|---|
| 11 | OTP value in API response or log | Must NOT appear — check all response bodies and log output |
| 12 | `POST /api/v1/auth/request-otp` for non-existent email | Same success message as existing email — no user enumeration |

**Acceptance Criteria:**
- [ ] OTP expiry enforced — expired OTPs rejected
- [ ] Resend throttle prevents OTP spam
- [ ] Failed attempt lockout activates after threshold; expires after timeout
- [ ] Session refresh works with valid tokens; fails with expired/revoked tokens
- [ ] Logout revokes session; old tokens fail on subsequent requests
- [ ] OTP values never exposed in responses or logs
- [ ] Email enumeration prevented — same response for existing and non-existing emails

---

### P8-13: CORS/CSRF Tests

**Description:**
Test suite verifying Cross-Origin Resource Sharing and Cross-Site Request Forgery protections. Per Doc 09: production must allow only approved origins; no wildcard CORS on protected endpoints; unknown origins must be rejected; CORS config must be environment-specific; unsafe methods must require CSRF validation. These tests ensure the split-architecture (`rekordly.com` ↔ `api.rekordly.com`) is properly secured.

**Technical Details:**

**Test Suite:** `TestCORSAndCSRF`

**CORS Tests:**

| # | Scenario | Expected Result |
|---|---|---|
| 1 | Request from `Origin: https://rekordly.com` | `Access-Control-Allow-Origin: https://rekordly.com` in response |
| 2 | Request from `Origin: https://evil.com` | No `Access-Control-Allow-Origin` header; credentialed request rejected |
| 3 | Staging origin to production API | Rejected — `staging.rekordly.com` not in production allowlist |
| 4 | `OPTIONS` preflight from allowed origin | Returns `Access-Control-Allow-Methods`, `Access-Control-Allow-Headers`, `Access-Control-Max-Age` |
| 5 | `OPTIONS` preflight from disallowed origin | Returns `403` |

**CSRF Tests (if cookie-based auth):**

| # | Scenario | Expected Result |
|---|---|---|
| 6 | `POST /api/v1/transactions` with valid session cookie but missing CSRF token | `403 FORBIDDEN` with code `CSRF_TOKEN_MISSING` |
| 7 | `POST /api/v1/transactions` with valid CSRF token | `200 OK` |
| 8 | `GET` requests without CSRF token | Must succeed — CSRF only for unsafe methods |

**Wildcard Rejection:**

| # | Scenario | Expected Result |
|---|---|---|
| 9 | Check all production responses | `Access-Control-Allow-Origin: *` must NEVER appear for credentialed routes |

**Acceptance Criteria:**
- [ ] Approved origins receive correct CORS headers
- [ ] Unknown origins rejected — no CORS headers for credentialed requests
- [ ] Cross-environment origin leakage prevented
- [ ] Preflight requests handled correctly for allowed and disallowed origins
- [ ] CSRF token required for POST/PATCH/DELETE (if cookie auth)
- [ ] GET requests not subject to CSRF
- [ ] No wildcard `Access-Control-Allow-Origin: *` on any protected route

---

### P8-14: SQL Injection Prevention Verification

**Description:**
Verification that all database access uses `sqlc` parameterized queries and no raw SQL string concatenation with user input exists in the codebase. Per Doc 09: use parameterized SQL queries only; `sqlc` for type-safe queries; raw SQL string concatenation with user input is absolutely banned; user-controlled sort/filter fields must be allowlisted. This is a combination of static analysis and dynamic testing.

**Technical Details:**

**Test Suite:** `TestSQLInjectionPrevention`

**Static Analysis Checks:**

| # | Check | Expected Result |
|---|---|---|
| 1 | Search for `fmt.Sprintf` with SQL keywords in Go files | Zero results — no `fmt.Sprintf("SELECT...")`, `fmt.Sprintf("INSERT...")`, etc. |
| 2 | Search for string concatenation with query/sql variables | Zero results |
| 3 | Verify all query files use `sqlc` `sql.yaml` configuration | All queries in `internal/db/` are sqlc-generated |
| 4 | Verify no hand-written SQL in Go code outside `sqlc` query files | Only `sqlc`-generated code touches the database |

**Dynamic Tests:**

| # | Scenario | Input | Expected Result |
|---|---|---|---|
| 5 | SQL injection in category filter | `?category=' OR 1=1--` | Returns empty or validation error, NOT all transactions |
| 6 | SQL injection in transaction body | `"category": "'; DROP TABLE transactions; --"` | Stored as literal string, not executed as SQL |
| 7 | SQL injection in sort field | `?sort=amount; DROP TABLE users` | Only allowlisted sort columns accepted: `occurred_at`, `amount`, `created_at` |

**Allowlisted Sort/Filter Fields:**

| Endpoint | Allowed Sort Columns | Allowed Filter Fields |
|---|---|---|
| GET /transactions | `occurred_at`, `amount`, `created_at` | `scope_type`, `category`, `from`, `to`, `status` |
| GET /invoices | `issue_date`, `due_date`, `created_at` | `status`, `customer_id`, `from`, `to` |
| GET /payments | `paid_at`, `created_at` | `method`, `from`, `to` |

**Acceptance Criteria:**
- [ ] Static analysis finds zero instances of SQL string concatenation with user input
- [ ] All database queries go through `sqlc`-generated code
- [ ] SQL injection payloads in query parameters are treated as literal strings
- [ ] SQL injection payloads in request bodies are stored as literal strings
- [ ] User-controlled sort/filter fields allowlisted — invalid values rejected
- [ ] Code review rejects any PR introducing raw SQL construction

---

### P8-15: Dependency Vulnerability Scanning

**Description:**
Set up automated dependency vulnerability scanning in the CI/CD pipeline for both Go and Node.js dependencies. Per Doc 09/13: CI/CD must run automated dependency vulnerability scanning; deployment must be blocked for critical/high vulnerabilities; lockfiles must be committed; avoid abandoned packages for security-sensitive code.

**Technical Details:**

**CI/CD Integration (GitHub Actions):**

**Go Scanning:**
```yaml
- name: Go Vulnerability Check
  run: |
    go install golang.org/x/vuln/cmd/govulncheck@latest
    govulncheck ./...
```
- On `critical` or `high` severity: fail the build and block merge

**Node.js Scanning:**
```yaml
- name: NPM Audit
  run: npm audit --audit-level=high
```
- On `high` or `critical` vulnerabilities: fail the build and block merge

**Docker Image Scanning:**
```yaml
- name: Docker Image Scan
  run: |
    docker scout cves rekordly-api:latest --exit-code --severity critical,high
    docker scout cves rekordly-worker:latest --exit-code --severity critical,high
```

**Weekly Scheduled Scan:**
```yaml
on:
  schedule:
    - cron: '0 6 * * 1'  # Every Monday 6 AM UTC
```
- Runs full `govulncheck` + `npm audit` on `main` branch
- On failure: creates a GitHub issue with vulnerability details
- Issue template: package name, severity, CVE, recommended fix version

**Lockfile Verification:**
- `go.sum` must be committed and up-to-date
- `package-lock.json` must be committed and up-to-date
- CI checks that lockfiles match current dependency tree

**Pass Criteria:**
- Zero critical or high vulnerabilities in production dependencies at merge time
- Low/moderate vulnerabilities tracked but do not block merge

**Acceptance Criteria:**
- [ ] `govulncheck` step in CI fails on critical/high Go vulnerabilities
- [ ] `npm audit --audit-level=high` step in CI fails on high/critical npm vulnerabilities
- [ ] Docker image scanning configured for API and worker images
- [ ] Weekly scheduled scan runs and creates GitHub issues on failure
- [ ] `go.sum` and `package-lock.json` verified as committed and up-to-date
- [ ] Build blocked on critical/high vulnerabilities; merge not possible

---

### P8-16: Backup and Restore Verification

**Description:**
Verify that production PostgreSQL backups are configured, encrypted, and restorable with acceptable RTO. Per Doc 08/09: production PostgreSQL requires automated backups; backup restore should be tested before launch; backups must be encrypted; disaster recovery prioritizes restoring PostgreSQL first.

**Technical Details:**

**Test Procedure:**

| Step | Action | Verification |
|---|---|---|
| 1 | Trigger production PostgreSQL backup via Northflank | Backup file exists in storage with timestamp |
| 2 | Verify backup contents | Restore to temporary database; `SELECT COUNT(*)` on critical tables matches production |
| 3 | Verify encryption | Confirm backup files are encrypted at rest (Northflank config or S3 bucket settings) |
| 4 | Restore test | Fresh PostgreSQL from backup; app connects and serves `GET /api/v1/health` → `200`, `GET /api/v1/ready` → `200`; sample user can log in and see data |
| 5 | Timing | Full restore completes within RTO target: < 30 minutes |
| 6 | Documentation | Restore procedure documented in runbook with exact commands |

**Critical Tables to Verify:**

| Table | Verification |
|---|---|
| transactions | COUNT matches |
| ledger_entries | COUNT matches |
| invoices | COUNT matches |
| payments | COUNT matches |
| customer_wallets | COUNT matches |
| customer_wallet_ledger | COUNT matches |
| loans | COUNT matches |
| users | COUNT matches |
| workspaces | COUNT matches |
| subscriptions | COUNT matches |

**Restore Procedure (Runbook):**
1. Select backup in Northflank dashboard
2. Restore to new PostgreSQL instance
3. Reconfigure API connection string to point to restored instance
4. Verify health/readiness endpoints
5. Verify sample user data
6. Switch DNS/routing to restored instance

**Acceptance Criteria:**
- [ ] Automated daily backup configured with 7-day retention
- [ ] Backup files encrypted at rest
- [ ] Full restore to temporary instance succeeds
- [ ] Row counts on all critical tables match between production and restored backup
- [ ] Application connects to restored database and serves health checks
- [ ] Sample user can authenticate and see their data on restored instance
- [ ] Restore completes within RTO target (< 30 minutes)
- [ ] Restore procedure documented in runbook

---

### P8-17: Rate Limit Tests

**Description:**
Test suite verifying that rate limiting is enforced on all required endpoints and that rate limit headers are present on all responses. Per Doc 06/09: all responses must include rate limit headers; rate limiting required on auth, AI, exports, webhooks, offline sync, and all write endpoints.

**Technical Details:**

**Test Suite:** `TestRateLimits`

**Header Verification:**

| # | Scenario | Expected Headers |
|---|---|---|
| 1 | Any `GET /api/v1/transactions` | `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` present |
| 2 | Sequential requests | `X-RateLimit-Remaining` decrements on each |
| 3 | `X-RateLimit-Reset` value | Valid future Unix timestamp |

**Rate Limit Enforcement:**

| # | Endpoint | Expected Behavior on Excess |
|---|---|---|
| 4 | `POST /api/v1/auth/request-otp` | `429` with `X-RateLimit-Remaining: 0` |
| 5 | `POST /api/v1/ai/parse-entry` | `429` with rate limit headers |
| 6 | `POST /api/v1/exports` | `429` |
| 7 | `POST /api/v1/sync/mutations` | `429` |
| 8 | General write endpoints | `429` on excess |

**Per-User vs Per-IP:**

| # | Scenario | Expected Result |
|---|---|---|
| 9 | Two different authenticated users from same IP | Each gets independent rate limit counters |

**Recovery:**

| # | Scenario | Expected Result |
|---|---|---|
| 10 | After `X-RateLimit-Reset` time passes | Requests succeed again |

**Acceptance Criteria:**
- [ ] All API responses include `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`
- [ ] Remaining count decrements correctly
- [ ] Rate limit exceeded returns 429 with headers
- [ ] Per-user rate limits independent of IP address
- [ ] Rate limit window resets correctly after timeout
- [ ] Auth, AI, export, sync, and write endpoints all rate-limited

---

### P8-18: Pagination Tests

**Description:**
Test suite verifying cursor pagination, date scoping, and rejection of offset pagination for all financial list endpoints. Per Doc 06/09: all financial list endpoints use cursor pagination and default to 30-day/current-month window; offset pagination is not allowed; unbounded list requests are not allowed.

**Technical Details:**

**Test Suite:** `TestPaginationAndDateScoping`

**Cursor Pagination Tests:**

| # | Scenario | Expected Result |
|---|---|---|
| 1 | `GET /api/v1/transactions` | Returns `{ "data": [...], "meta": { "next_cursor": "occurred_at:id", "has_more": true } }` |
| 2 | `GET /api/v1/transactions?cursor=<next_cursor>` | Returns next page of results |
| 3 | Item ordering | Items ordered by `occurred_at DESC, id DESC` |
| 4 | No duplicates | No duplicate items across pages |

**Offset Pagination Rejection:**

| # | Scenario | Expected Result |
|---|---|---|
| 5 | `GET /api/v1/transactions?offset=0&limit=50` | `400 VALIDATION_ERROR`: "Offset pagination is not supported. Use cursor pagination." |

**Default Date Scoping:**

| # | Scenario | Expected Result |
|---|---|---|
| 6 | `GET /api/v1/transactions` without `from`/`to` | Defaults to current month or last 30 days; `meta.default_scope` indicates applied range |
| 7 | `GET /api/v1/transactions?from=2026-01-01&to=2026-06-30` | Returns transactions within that range |
| 8 | `GET /api/v1/transactions?from=2020-01-01` (no `to`) | Must require `to` or default-scope the upper bound; reject truly unbounded queries |

**Applies to All Financial List Endpoints:**

| Endpoint | Cursor Field | Default Scope |
|---|---|---|
| GET /transactions | `occurred_at:id` | Current month |
| GET /invoices | `issue_date:id` | Current month |
| GET /payments | `paid_at:id` | Current month |
| GET /sales | `created_at:id` | Current month |
| GET /purchases | `created_at:id` | Current month |
| GET /customers/{id}/wallet/ledger | `created_at:id` | Current month |
| GET /loans | `created_at:id` | Current month |
| GET /exports | `created_at:id` | Current month |

**Acceptance Criteria:**
- [ ] Cursor pagination works correctly — next_cursor returns next page
- [ ] Items ordered by correct fields (date DESC, id DESC)
- [ ] No duplicate items across pages
- [ ] Offset pagination rejected with clear error message
- [ ] Default date scoping applied (current month or 30 days)
- [ ] Explicit date filters override defaults
- [ ] Unbounded queries rejected or default-scoped
- [ ] All 8+ financial list endpoints tested

---

### P8-19: PII Masking Verification in Logs

**Description:**
Verify that PII is properly masked in all log output, API error responses, and stored audit records. Per Doc 09: PII should be masked in logs; `john@gmail.com` → `j***@gmail.com`; `08012345678` → `080****5678`; bank account numbers show only last few digits; logs must not contain full secrets, raw tokens, full OTP values, full PII, or unnecessary raw provider payloads.

**Technical Details:**

**Test Suite:** `TestPIIMasking`

**Log Inspection Tests:**

| # | Scenario | What to Check | Expected Masking |
|---|---|---|---|
| 1 | OTP request | Structured logs | Email: `j***@gmail.com` pattern |
| 2 | Login attempt | Logs | No session tokens or raw auth cookies |
| 3 | Customer with phone | Logs | Phone: `080****5678` pattern |
| 4 | Customer with bank details | Logs | Only last 3-4 digits visible |
| 5 | Webhook payload | Stored `webhook_events.payload` | No full card numbers, bank details, or raw PII |
| 6 | AI audit logs | Stored `ai_audit_logs` | No full raw user prompts; only metadata (input length, confidence, provider response status) |

**Implementation:**
- Central `log/slog` middleware with PII masking function applied to all log entries
- Masking function uses regex patterns for common PII types:
  - Email: `(.{1}).*(@.*)` → `$1***$2`
  - Phone: `(\d{3})\d*(\d{4})` → `$1****$2`
  - Bank account: `(\d{3})\d*(\d{3,4})` → `$1****$2`

**Verification:**
- Grep production-like log output for common PII patterns (email regex, phone regex, bank account patterns) → must return zero matches
- Check API error responses for PII leakage

**Acceptance Criteria:**
- [ ] Email addresses masked in logs (first char + `***` + domain)
- [ ] Phone numbers masked (area code + `****` + last 4 digits)
- [ ] Bank account numbers show only last 3-4 digits
- [ ] Session tokens and auth cookies never appear in logs
- [ ] OTP values never appear in logs or API responses
- [ ] Webhook payloads sanitized before storage
- [ ] AI audit logs store only metadata, not full prompts
- [ ] Grep for PII patterns in log output returns zero matches

---

### P8-20: Audit Logging Verification

**Description:**
Verify that audit log entries are created for all security-relevant events listed in Doc 09. Audit logs support security investigation, financial review, and compliance. Each audit entry must include `event_type`, `user_id`, `workspace_id`, `timestamp`, `ip_address`, `user_agent`, and sanitized details — but must NOT contain raw secrets, raw tokens, full OTP values, or unmasked PII.

**Technical Details:**

**Test Suite:** `TestAuditLogging`

**Events to Verify (each must create an audit log entry):**

| # | Event | Audit Entry Must Include |
|---|---|---|
| 1 | Login attempt (success/failure) | email (masked), success boolean, ip_address |
| 2 | OTP request | email (masked), ip_address |
| 3 | Failed OTP attempt | email (masked), attempt count |
| 4 | Session refresh | user_id, ip_address |
| 5 | Logout | user_id, session_id (hashed) |
| 6 | Revoked session | user_id, session_id (hashed) |
| 7 | Financial write (transaction create) | workspace_id, transaction_type, amount, created_by |
| 8 | Transaction void | workspace_id, transaction_id, voided_by |
| 9 | Invoice finalization | workspace_id, invoice_id, finalized_by |
| 10 | Invoice void | workspace_id, invoice_id, voided_by |
| 11 | Wallet deposit | workspace_id, customer_id, amount |
| 12 | Wallet payment | workspace_id, customer_id, amount |
| 13 | Loan creation | workspace_id, loan_id, principal, direction |
| 14 | Loan repayment | workspace_id, loan_id, amount |
| 15 | Export generation | workspace_id, export_type, format |
| 16 | PDF generation | workspace_id, document_type |
| 17 | AI parse request | user_id, input_length, provider |
| 18 | AI draft confirmation | user_id, draft_id, record_type |
| 19 | Webhook event received | provider, event_type, signature_valid |
| 20 | Plan-limit block event | workspace_id, feature, current_usage, limit |
| 21 | Rate-limit event | ip_address, endpoint, user_id |

**Verify Audit Entries Do NOT Contain:**
- Raw secrets
- Raw tokens
- Full OTP values
- Unmasked PII
- Unnecessary raw AI prompts

**Verification Query:**
```sql
SELECT * FROM audit_logs
WHERE event_type = 'transaction.create'
  AND workspace_id = $1
ORDER BY created_at DESC
LIMIT 10;
```
- Must return entries for all test transactions

**Acceptance Criteria:**
- [ ] All 21+ event types generate audit log entries
- [ ] Each entry includes event_type, user_id, workspace_id, timestamp, ip_address, user_agent
- [ ] No audit entry contains raw secrets, tokens, or full OTP values
- [ ] No audit entry contains unmasked PII
- [ ] Financial write entries include transaction details (type, amount)
- [ ] Webhook entries include signature validation status
- [ ] Plan-limit and rate-limit events generate audit entries
- [ ] Audit query returns correct entries for test data

---

### P8-21: Private Beta Setup with Staging Fake Data

**Description:**
Prepare the staging environment for private beta testing by seeding it with realistic fake data, configuring all staging services, running a full smoke test of the user journey, and inviting beta testers. Per Doc 08: staging uses fake data only; Paystack/Stripe test mode; AI sandbox keys; staging-only secrets. Per Doc 12: private beta with staging/fake data first; limited live beta users after staging validation.

**Technical Details:**

**Staging Seed Script: `scripts/seed-staging.go`**

**Test Users:**

| User | Email | Plan | Purpose |
|---|---|---|---|
| beta-tester-1 | `beta-tester-1@rekordly.com` | Free | Test Free plan experience with ads and limits |
| beta-tester-2 | `beta-tester-2@rekordly.com` | Starter | Test basic paid plan |
| beta-tester-3 | `beta-tester-3@rekordly.com` | Business | Test multi-currency, AI Assistant, on-demand tax reports |
| beta-tester-4 | `beta-tester-4@rekordly.com` | Pro | Test highest tier |
| beta-tester-5 | `beta-tester-5@rekordly.com` | Free | Test rewarded ad flow |

**Seed Data Per Workspace:**

| Data Type | Count | Details |
|---|---|---|
| Transactions | 50+ | Mix of income, expense, sale, purchase with business/personal/mixed/transfer scopes over 3 months |
| Invoices | 10+ | Various states: draft, finalized, paid, partially_paid, overdue, voided |
| Customer wallets | 5+ | With deposits and payments |
| Loans | 3+ | With repayments |
| Budgets | 2+ | With various statuses (on_track, warning, exceeded) |
| AI entry drafts | 5+ | Including confirmed and unconfirmed |
| Usage counters | Various | Some near limits, some with bonus from rewarded ads |

**Staging Configuration Verification:**
- `staging-api.rekordly.com` accessible
- Paystack test mode keys configured
- AI sandbox keys with low limits configured
- Staging-only CORS origins (no production origins)
- Staging-only secrets (no production secrets)
- Email provider configured (can use test mode like Mailtrap)

**Full User Journey Smoke Test:**

| Step | Action | Verify |
|---|---|---|
| 1 | Sign up | Account created, workspace assigned |
| 2 | OTP verify | Email received, OTP verified |
| 3 | Onboarding | Workspace configured |
| 4 | Dashboard | Stats load, empty states actionable |
| 5 | Add transaction (AI) | "Type what happened" → AI draft → confirm → record created |
| 6 | Add transaction (manual) | Manual form → submit → record created |
| 7 | Create invoice | Invoice created with line items |
| 8 | Finalize invoice | Invoice finalized, PDF generated |
| 9 | Record payment | Split payment with multiple methods |
| 10 | Wallet deposit | Customer wallet deposit recorded |
| 11 | Wallet payment | Wallet payment against invoice |
| 12 | Loan creation | Loan created with principal |
| 13 | Loan repayment | Partial repayment recorded |
| 14 | Budget creation | Budget with expense limits |
| 15 | Export | CSV/PDF export generated |
| 16 | Tax report | Tax readiness summary generated (if plan allows) |
| 17 | Upgrade plan | Checkout flow via Paystack test mode |
| 18 | Go offline | Create draft, verify offline queue |
| 19 | Come online | Auto-sync, draft applied |

**Beta User Access:**
- Create 5-10 beta user accounts
- Send invitation emails with staging URL and test credentials
- Collect feedback via form (e.g., Google Forms or Typeform)

**Acceptance Criteria:**
- [ ] Seed script creates all test users with different plan tiers
- [ ] 50+ transactions, 10+ invoices, 5+ wallets, 3+ loans per workspace
- [ ] Staging API accessible and functional
- [ ] Full smoke test passes all 19 steps without errors
- [ ] Paystack test mode processes checkout flow
- [ ] AI sandbox keys work for parse-entry
- [ ] Offline/sync flow works end-to-end
- [ ] Beta invitation emails sent
- [ ] Feedback collection mechanism ready

---

## Dependencies and Sequencing

1. **P8-01–P8-03 (Authorization tests)** are foundational — run first to verify the security model before testing business logic.
2. **P8-04–P8-08 (Financial integrity tests)** depend on a working financial core from Phases 3-4.
3. **P8-09 (AI abuse tests)** depends on Phase 5 AI endpoints being functional.
4. **P8-10–P8-11 (Offline sync and webhook tests)** depend on Phase 7 backend work being complete.
5. **P8-12 (Auth tests)** can run independently but should validate the auth system from Phase 2.
6. **P8-13–P8-14 (CORS/CSRF and SQL injection)** are infrastructure-level and can run in parallel.
7. **P8-15 (Dependency scanning)** is CI/CD integration and can be set up in parallel with tests.
8. **P8-16 (Backup verification)** requires production-like database with meaningful data (use staging seed).
9. **P8-17–P8-18 (Rate limits and pagination)** can run once the relevant endpoints exist.
10. **P8-19–P8-20 (PII masking and audit logging)** verify observability; should be among the last checks.
11. **P8-21 (Private beta)** is the final gate — only set up after all test suites pass.

## Key Rules (Cross-Referenced from Planning Docs)

- **Backend is the security boundary** (Doc 09).
- **Fail closed by default** (Doc 09).
- **Do not trust client-supplied identifiers, amounts, statuses, plan data, or ledger data** (Doc 09).
- **Every protected request resolves `user_id` and `workspace_id`** (Doc 06/09).
- **Financial writes create balanced ledger entries in database transactions** (Doc 05/06/09).
- **Finalized records are immutable; corrections use voids and reversals** (Doc 05/06/09).
- **Wallets cannot go negative; split payments cannot overpay; loans cannot overpay** (Doc 05/06/09/12).
- **AI output is suggestion only; requires user confirmation and backend validation** (Doc 07/09).
- **Offline sync: server wins for finalized records; idempotency keys required** (Doc 04/05/06/09).
- **Webhook signatures verified; processing idempotent** (Doc 06/09).
- **Rate limit headers on all responses; 429 on excess** (Doc 06/09).
- **Cursor pagination only; 30-day default scoping** (Doc 06/09).
- **PII masked in logs; audit logs for all security events** (Doc 09).
- **Critical/high dependency vulnerabilities block deployment** (Doc 09).
- **Production backups encrypted and restore-tested** (Doc 08/09).
