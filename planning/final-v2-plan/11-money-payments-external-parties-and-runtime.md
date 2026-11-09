# Rekordly v2 Money, Payments, External Parties and Runtime Decisions

**Prepared:** 7 November 2026  
**Status:** Authoritative product/architecture decision  
**Founder inputs incorporated:** Go backend, explicit structure, Render preference, existing Cloudinary account, Neon/Supabase options, total service budget under ₦50,000

## 1. Locked backend decision

- Core backend: **Go modular monolith**.
- HTTP API and background worker are separate processes built from the same Go modules.
- Query approach: explicit SQL through `sqlc`, PostgreSQL driver/pool through `pgx`/`pgxpool`.
- No NestJS, Fastify, Rust or Python service in the December architecture.
- Next.js remains the frontend; it communicates with the Go API over HTTPS.
- A new service is introduced only when a measured limitation cannot be solved cleanly inside the modular monolith.

The founder has deployed NestJS before but prefers explicit structure, can deploy Go, and will not trade December scope for learning Rust. That makes Go the risk-adjusted selection.

## 2. Money storage decision

### Posted monetary amounts

Store finalized monetary totals as signed integer minor units:

- Database type: `BIGINT`
- Field suffix: `_minor`, for example `amount_minor`, `debit_minor`, `credit_minor`
- Currency field: ISO 4217 currency code
- Currency metadata: minor-unit exponent

Examples:

| Display value | Currency exponent | Stored value |
|---|---:|---:|
| ₦0.05 | 2 | `5` |
| ₦10.05 | 2 | `1005` |
| $1,250.99 | 2 | `125099` |
| ¥500 | 0 | `500` |
| KWD 1.250 | 3 | `1250` |

This prevents binary floating-point errors and ambiguity around leading or trailing zeros. The application never stores `10.05` as a float.

### High-precision calculation values

Not every financial number is a payable amount. Store or calculate these with explicit fixed-precision decimal types:

- product unit prices before line rounding where sub-minor precision is allowed;
- weighted-average and FIFO unit costs;
- quantities and unit conversions;
- tax rates and discount rates;
- foreign-exchange rates;
- allocation ratios.

Use `shopspring/decimal` in Go and appropriate PostgreSQL `NUMERIC(p,s)` columns for those calculation values. Convert to minor units only at a documented rounding boundary.

### API boundary

- User-facing major-unit input is a string such as `"10.05"`, never a JSON number.
- API may return both `amount_minor: "1005"` and a currency code. Encode `BIGINT` values as strings in JSON to avoid JavaScript safe-integer limits.
- Frontend formatting derives the display value from `amount_minor`, currency and exponent.
- The server parser accepts plain decimal notation only; reject exponent notation, commas in machine values, `NaN`, infinity and excess fractional digits unless the workflow explicitly supports rounding.
- Negative sign is controlled by transaction type; users normally enter an unsigned magnitude.

### Rounding

- Default commercial rounding: half away from zero, unless a legal/currency rule requires otherwise.
- Round each line at the documented boundary, then make document total equal the sum of stored rounded lines.
- Allocate document-level discount/tax residual deterministically to eligible lines.
- Ledger debit and credit minor-unit totals must be exactly equal integers before commit.
- Never repeatedly round intermediate unit-cost calculations.

### Overflow

Every conversion checks that the result fits signed 64-bit range. Product limits should be much lower than the technical maximum. Arithmetic uses checked helpers; silent integer overflow is forbidden.

## 3. Manual money workflow: purpose and allocation

The earlier workflow stopped at category selection. Business money must also answer **what the money settles**.

### Revised stages

1. Choose money direction: money in, money out, transfer or adjustment.
2. Choose Personal or Business space.
3. Enter amount, currency, date and money account.
4. For Business, choose **purpose/link**.
5. Select or create the counterparty when relevant.
6. Select one or more open source documents or choose an unallocated treatment.
7. Enter category/account only for the portion not already determined by a source document.
8. Preview allocation, remaining amount and accounting effect.
9. Confirm and post atomically.

### Money-in purposes

- Payment for one or more invoices
- Immediate sale/receipt
- Customer advance or deposit
- Loan repayment received
- Loan proceeds received
- Owner capital introduced
- Refund/rebate received
- Other income
- Transfer between own accounts
- Unknown/unclassified receipt

### Money-out purposes

- Payment for one or more supplier bills
- Immediate purchase/expense
- Supplier advance
- Customer refund
- Loan repayment
- Loan issued to another person
- Owner drawing
- Asset/investment purchase
- Tax payment
- Other expense
- Transfer between own accounts
- Unknown/unclassified payment

### Allocation rules

- A payment can allocate to one document, several documents or no document yet.
- The allocation screen lists open documents for the chosen customer/supplier, oldest due first by default.
- User can enter an amount per document; the UI continuously shows payment total, allocated amount and remainder.
- Allocations cannot exceed each document's outstanding amount.
- A customer overpayment/remainder can become a customer deposit/on-account credit only after explicit confirmation.
- A supplier overpayment/remainder can become a supplier advance only after explicit confirmation.
- An unidentified receipt is posted to an Unidentified Receipts liability/suspense account and appears in a resolve queue.
- An unidentified outgoing payment is posted to a clearing/suspense account and appears in the same resolve queue.
- Later allocation transfers the balance from deposit/advance/suspense to the correct receivable, payable, expense or income without duplicating bank movement.
- Reversing a payment reverses its active allocations and restores document balances atomically.

### Document semantics

- Invoice creates receivable; its payment settles receivable.
- Supplier bill creates payable; its payment settles payable.
- A purchase order alone is not a payable and cannot be treated as an ordinary bill payment.
- Money paid before a supplier bill is a supplier advance linked optionally to the PO.
- A goods receipt changes stock/GRNI according to policy; it is not itself proof that cash was paid.
- An immediate sale/purchase can create source document and payment together in one transaction while retaining separate linked records.

## 4. External customers and suppliers are not required to be Rekordly users

`party` and `user` are different concepts:

- A customer or supplier exists as a business contact inside the sender's workspace.
- It may have no Rekordly user account.
- Email, phone and address are contact channels, not proof of platform membership.
- Sending an invoice, estimate, receipt, statement, PO or remittance advice must never require recipient registration.

## 5. Public document portal

Recipients open a mobile-friendly public link without signing in.

### Supported documents

- Estimate/proforma
- Invoice and receipt
- Customer statement when explicitly shared
- Purchase order
- Remittance/payment advice
- Storefront order status when enabled

### Guest capabilities

Depending on document type and sender settings, a guest can:

- view the document and sender identity;
- download/print its PDF;
- accept or decline an estimate;
- acknowledge a purchase order;
- submit a dispute/message or payment-reference evidence;
- see current public payment status and outstanding balance;
- follow an enabled payment link later;
- choose to create a Rekordly account.

Account creation is an optional conversion prompt, not a gate. Suggested wording: “Want all invoices from businesses using Rekordly in one place? Create a free account.”

### Link security

- Use a cryptographically random opaque token with at least 128 bits of entropy.
- Store only its hash; never use sequential document IDs as public authorization.
- Links are revocable and can expire by document/policy.
- Rate-limit access and do not reveal whether guessed document IDs exist.
- A link grants access only to the shared document and explicitly enabled actions, not the party's full history.
- Sensitive statements require shorter expiry or an additional OTP.
- PDF/media access uses short-lived signed URLs.
- Public pages must not leak internal notes, ledger accounts, margins, supplier costs or unrelated customer data.

## 6. Converting a guest into a Rekordly user

1. Recipient opens the shared document.
2. Recipient may create an account with verified email/phone.
3. Matching contact information proposes a claim; matching alone does not expose history automatically.
4. Claim is approved through sender policy, a signed invitation or an additional verification challenge.
5. The external identity links to the party record without merging the sender's private contact notes.
6. Future shared documents can appear in the recipient inbox.
7. The recipient can revoke its platform link without deleting the sender's lawful accounting record.

Never merge customer records across businesses. Each business owns its own party/contact record; the external user identity is only a permission link.

## 7. Realtime decision

### MVP: no WebSocket dependency

Rekordly does not need WebSockets for its core December workflows. Use:

- normal HTTPS mutations;
- TanStack Query cache invalidation after successful writes;
- polling only while waiting for a known asynchronous job, with backoff and a stop condition;
- page refresh/revalidation for dashboards and public-document status;
- email/in-app notification records for events that do not need instant delivery.

This keeps the frontend compatible with serverless Next.js hosting while the Go API runs as a normal container.

### Later realtime options

- Add Server-Sent Events first for one-way job progress or notifications.
- Add WebSockets only for a proven two-way need such as live multi-user POS, collaborative editing or support chat.
- Realtime events are hints to refetch authoritative data; they never carry the only copy of financial state.
- If API instances scale horizontally, use a shared event mechanism/outbox before relying on in-memory connections.

## 8. Frontend runtime decision

- Keep Next.js server-capable; do not force a static-only export.
- Public storefront/document pages benefit from server rendering, metadata and controlled token handling.
- Authenticated dashboard data comes from the Go API; the Next.js server is not a second financial backend.
- Serverless hosting is acceptable for Next.js rendering/routes that do not own long-running jobs.
- All durable financial commands, webhooks, PDF jobs, imports, AI jobs and domain checks belong to Go API/worker.

## 9. Deployment selection

### API

Use a Render Go web service initially.

- Render Free is acceptable for development, demos and an early invite-only test.
- It is **not** the final public-beta production tier: it sleeps after 15 minutes without inbound HTTP/WebSocket traffic, wake-up can take about a minute, may restart, lacks private inbound networking and blocks common SMTP ports.
- Upgrade the API to the smallest paid always-on tier before public beta or any reliability promise.

### Worker

Render's free plan does not provide a free background-worker service. Options in order:

1. During development/invite-only testing, run bounded worker commands as explicitly triggered work or temporarily co-locate a very small poller in the API with a documented migration flag.
2. Before public beta, deploy the separate paid worker required by the architecture.
3. Do not keep a free web service awake artificially; design for the actual provider limits.

The production end-state remains separate API and worker processes.

### PostgreSQL: Neon selected for the first deployment

Use Neon PostgreSQL first because it provides plain PostgreSQL, connection pooling, scale-to-zero for low traffic, branching and a low-cost upgrade path.

- Use separate projects/branches and credentials for local/dev, staging and production.
- Go uses the pooled connection string for normal API traffic; migrations use the connection mode recommended by Neon for migrations.
- Configure a small explicit `pgxpool` limit for both API and worker.
- Free-tier restore retention is not enough to satisfy the launch restore gate alone; schedule independent logical backups to a separate protected destination.
- Move to a paid Neon plan or another managed PostgreSQL tier before public beta if the measured cold-start, restore window or availability is insufficient.

Supabase remains the fallback if Rekordly later wants its bundled Auth, Storage or Realtime. Do not adopt those products merely because the database is hosted there. Supabase Free currently has no automatic backups, so it also requires manual/off-site backups or a paid plan.

### Cloudinary

Use the existing Cloudinary account for:

- product and storefront images;
- business logos and public catalogue media;
- optimized image transformations.

For invoices, receipts, identity evidence and financial attachments:

- never use default public `upload` delivery;
- use `authenticated` delivery (or carefully configured private delivery), signed uploads and short-lived signed download URLs;
- store only Cloudinary asset identifiers/metadata in PostgreSQL;
- verify deletion, retention, backup/export and data-location requirements before treating it as the permanent financial-document store.

If those controls or costs are unsuitable, move sensitive documents to private S3-compatible object storage while keeping Cloudinary for public media.

### Email

- Prefer an HTTPS email API such as Resend from Render, because Render Free blocks outbound ports 25, 465 and 587.
- Existing SMTP can be used only from a host/tier that permits the required outbound port and after SPF, DKIM and DMARC are configured.
- Store email delivery attempts as jobs; email failure must not roll back an issued invoice.

## 10. Deployment topology

```text
Browser / public recipient
        |
        v
Next.js frontend (server-capable or serverless rendering)
        |
        v HTTPS
Go API on Render  ------------------> Cloudinary (public media / signed private assets)
        |
        +---------------------------> Email HTTPS API
        |
        v
Neon PostgreSQL <------------------- Go worker on Render (paid before public beta)
        |
        v
Outbox/jobs, ledger, documents, allocations and audit
```

No WebSocket, Redis, Kafka or microservice is required for the first release.

## 11. Decisions still requiring measurement

- Exact Render paid API/worker sizes and total monthly cost.
- Neon free versus paid production tier after load/cold-start/restore testing.
- Next.js host.
- Whether Cloudinary meets permanent sensitive-document requirements.
- Resend versus another HTTPS mail provider and final monthly allowance.
- Independent backup destination and automated restore rehearsal.

