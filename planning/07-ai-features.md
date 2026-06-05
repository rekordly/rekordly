# 07 - Rekordly V2 AI Features

## Summary

This document defines the MVP AI feature plan for Rekordly v2.

AI-assisted entry is Rekordly's primary creation experience. Users type what happened, Rekordly parses it into one or more structured drafts, and the user confirms or edits before anything becomes financial truth.

The MVP AI scope is web-app only. WhatsApp AI bot, receipt OCR, invoice OCR, advanced report explanations, anomaly detection, and "ask my business" remain Phase 2 unless explicitly promoted later.

## MVP AI Scope

### Primary Feature

Natural-language financial entry is the MVP AI feature.

Flow:

- User types "what happened."
- AI returns one or more structured drafts.
- User reviews and edits each draft in the confirmation form.
- Backend validates and saves only after confirmation.

### Multi-Intent Parsing

The parser must detect multiple intents in a single user input.

Example:

> Bought fuel 5k and paid 10k to Segun for loan

Expected output:

- Draft 1: expense for fuel, `5000`.
- Draft 2: loan repayment to Segun, `10000`.

Rules:

- Response returns an array of drafts, not a single draft object.
- Each draft can have its own type, extracted fields, missing fields, confidence, and warnings.
- User can confirm, edit, or reject each draft independently.

### Supported Draft Types

MVP AI may return drafts for:

- Income
- Expense
- Sale
- Purchase
- Invoice draft
- Customer deposit/wallet event
- Loan/debt record
- Loan repayment/payment
- Transfer/mixed transaction suggestion

### Fields AI May Infer

AI may infer:

- Amount
- Currency
- Date
- Transaction type
- Category
- Counterparty/customer/vendor
- Payment method
- Business/personal/mixed/transfer scope
- Tax-deductible hint
- Notes
- Confidence score
- Missing fields

Confidence rules:

- Confidence score must be passed to the frontend.
- Field-level confidence should be included where possible.
- Low-confidence fields should be visually highlighted in the manual confirmation form, such as in yellow, so users know what to double-check.

### AI Must Not Finalize

AI must not finalize:

- Ledger entries
- Wallet balance changes
- Loan repayments
- Invoice finalization
- Tax treatment
- Any irreversible financial action

AI output is always a suggestion until confirmed by the user and validated by the backend.

## AI Flow

1. User opens Add Transaction.
2. User types free text.
3. API checks plan, AI credit, and rate limit.
4. Backend enriches prompt with safe user context.
5. Backend truncates input.
6. AI parser returns an array of structured drafts with confidence and missing fields.
7. User confirms, edits, or rejects each draft.
8. Backend validates confirmed payloads with normal finance rules.
9. Confirmed records create transactions, payments, ledger entries, wallet/loan changes if applicable.
10. AI audit log stores metadata and result references.

## Architecture Rules

- Use a provider abstraction so OpenAI or other LLM providers can be swapped.
- Use strict JSON schema output from the model.
- Validate AI output with backend schemas.
- Never trust model output directly.
- AI endpoint accepts and returns money as decimal strings only.
- Use synchronous parsing for simple entries.
- Use async job pattern for expensive or long-running parsing.
- Future WhatsApp channel must call the same parser, not a separate AI workflow.
- Do not expose raw provider errors to users.

## Prompt / Response Contract

### Request Shape Includes

The request shape should include:

- User text
- Workspace context
- Default currency
- Allowed draft types
- Local form context when available
- Enriched user context

Enriched user context should include:

- User's last 10 used categories.
- Top 5 frequent vendors/customers.
- Default workspace scope.

Rules:

- Context must be tenant-scoped.
- Context must be minimized to avoid leaking unrelated data.
- Enrichment should improve categorization based on the user's real business history, not generic dictionary definitions.

### Response Shape Includes

The response shape should include:

- `drafts: []`

Each draft should include:

- Draft type
- Extracted fields
- Missing fields
- Field-level confidence
- Overall confidence
- Warnings
- Normalized text

Rules:

- AI should return "needs clarification" when intent is ambiguous.
- AI should suggest, not decide, personal/business/mixed/transfer classification.
- Frontend should use confidence metadata to highlight uncertain fields.

## Cost And Safety Guardrails

- Per-user and per-plan AI rate limits.
- Input truncation before LLM calls.
- Request body size limits.
- No anonymous AI calls.
- No unlimited retries.
- Low-confidence drafts require stronger manual review.
- AI usage increments plan counters before or atomically with provider calls.
- Store only necessary prompt metadata.
- Avoid keeping sensitive raw prompts unless explicitly needed.
- Never let AI override server-side ledger, wallet, loan, payment, or invoice validation.

## Examples

- "Bought fuel 5k for delivery" -> business expense draft.
- "Sold 2 bags of rice for 20k cash" -> sale draft with cash payment.
- "Customer A deposited 50k for next order" -> customer wallet deposit draft.
- "Paid back 10k from my loan" -> loan repayment draft.
- "Bought laptop 70 percent business 30 percent personal" -> mixed expense draft with allocation.
- "Bought fuel 5k and paid 10k to Segun for loan" -> two drafts: expense and loan repayment.

## Test Plan

- Parses Nigerian shorthand: `5k` = `5000`, `20k` = `20000`.
- Parses local terms: `TFare` as transport.
- Parses payment methods: `POS`, `Transfer`, `cash`, `wallet`.
- Defaults `Naira`, `naira`, `NGN`, and missing local currency to workspace default currency when appropriate.
- Correctly parses common informal dates like `yesterday` and `last week`.
- Detects multi-intent inputs and returns multiple drafts.
- Rejects or asks clarification for missing amount or unclear intent.
- Does not save without user confirmation.
- Does not create unbalanced ledger entries.
- Does not allow wallet overdraft through AI-created drafts.
- Does not allow loan overpayment through AI-created drafts.
- Applies plan/rate limits.
- Truncates oversized input.
- Handles provider failure gracefully.
- Records AI audit metadata.
- Supports future channel compatibility: same parse endpoint can support WhatsApp later.

## Assumptions

- MVP AI entry is web-app only.
- WhatsApp AI bot is Phase 2.
- AI entry is the primary create flow; manual form is fallback/confirmation.
- Backend validation remains the source of financial truth.
- AI output never bypasses plan limits, ledger balance rules, immutability, wallet validation, loan validation, or split-payment validation.
