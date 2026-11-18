# Antigravity prompt: storefront checkout for launch (payments, holds, pickup, delivery, Shipbubble, order tracking)

Paste everything below the line into Antigravity. Research and reasons: `planning/38-storefront-delivery-payments-research.md`.

**Decisions taken (18 Nov 2026):**
1. **Payments:** platform subaccounts with **Paystack and Squad** behind one provider layer. **Virtual accounts (bank transfer) are the main way customers pay.**
2. **Rekordly commission:** supported as a percentage, **0% at launch** (free).
3. **Paystack/Squad fee:** the merchant chooses whether they or the customer pays it.
4. **Courier aggregator:** Shipbubble.
5. **Default hold times:** payment 15 min, bank transfer 2 h, pickup 48 h.
6. **Shopper sign-in:** email codes first. Phone and WhatsApp codes later.

---

You are working on Rekordly V2, a bookkeeping, stock and sales app for Nigerian small businesses with an online storefront.

- **API:** Go, Gin, pgx and sqlc, in `implementation/api`.
- **Worker:** `implementation/worker`.
- **Web:** Next.js 16, HeroUI v3 and Tailwind v4, in `implementation/web`.
- **Rules:** read `AGENT_RULES.md` first. It overrides everything here.
- **Background:** read `planning/38-storefront-delivery-payments-research.md` before starting.

Build the **launch checkout**: customers pay online (mainly by bank transfer to a virtual account), stock is held fairly while they pay, pickup and delivery are clear, couriers are booked through Shipbubble, and customers who aren't registered can track their orders safely.

## What exists today (read before changing)

- **Checkout:** `api/internal/finance/storefront_public_service.go` → `SubmitGuestCheckout` creates an order that **reserves no stock and takes no payment**. The order gets a private status link (`StatusToken`, stored hashed as `PublicTokenHash`).
- **Merchant side:** `storefront_order_service.go`:
  - `ConfirmStorefrontOrder` reserves stock
  - `PackStorefrontOrder` and `FulfilStorefrontOrder` move it out
  - `ExpireStaleStorefrontReservations` already releases old holds
  - paid orders link to a **Sale** (`storefront_sales_service.go`)
- **Carts:** `UpsertVisitorCartWithArea`, `ValidateAndRecalculateCartWithArea`.
- **Delivery settings:** delivery areas (name, fee, description), free-delivery threshold and delivery methods (`pickup`, `merchant_delivery`, `customer_arranged`), in store settings (`storefront_service.go`, settings card PATCH).
- **Paystack:** only used for Rekordly's own subscriptions, in `api/internal/billing/paystack.go` (initialise, verify, webhook signature). **Don't break billing.** Reuse its HTTP and signature patterns.
- **Customer matching:** `storefront_customer_match.go` (Codex) links orders to a merchant's Customer.
- **Email:** `api/internal/notify/email.go`.
- **Web:**
  - `web/src/components/features/store/public-storefront-client.tsx` (cart and checkout)
  - `public-order-status-client.tsx` (order page)
  - `storefront-settings-page.tsx` (settings cards)
  - `storefront-order-page.tsx` (merchant order page)
  - `web/src/lib/store-themes/simple/renderer.tsx` (Essential template)
- **Latest migration:** `000069_storefront_theme_ownership_and_growth.sql`. **Start at the next free number** and check again before writing, because other agents add migrations.

## Ground rules

1. **sqlc for every query** (`docker run --rm --network none -v "<api dir>:/src" -w /src sqlc/sqlc:1.31.1 generate`). Never hand-edit `internal/db`.
2. **Migrations only add things.** Never edit an applied migration.
3. **Money:** BIGINT minor units, strings in JSON, `ParseMajorToMinor` for typed amounts. **Every money write balances the ledger (debits = credits) in the same transaction**, and tests assert it.
4. **Workspace scoping:** every merchant query filters by `workspace_id`. Public routes resolve the store by slug or host and never leak draft or unpublished data.
5. **Idempotency:** every write takes an idempotency key. **Every webhook is verified by signature and processed idempotently by provider reference.** The same event delivered twice changes nothing the second time.
6. **Secrets:**
   - Provider secret keys and the Shipbubble key are **encrypted at rest**, using the existing secret or encryption helper if there is one; otherwise add one using an env key.
   - Never return them in responses after saving. Show only the last 4 characters.
   - Never log them.
7. **Rekordly never holds merchant money.** Settlement goes from the provider straight to the merchant's bank through their subaccount.
8. **One request per page, one request per action** (see `planning/35-…`).
9. **Plain words:** in UI text and errors, write for a shop owner or shopper. Shared web components only: `SideSheet`, `AppSwitch`, `AppInput`, `MoneyInput`, `AppComboBox`, `ListAddRow`/`ListItemRow`, `DataView`, `StatusPill`, `DocumentShell` and the rest. No new npm packages. Nothing scrolls sideways at 375px.
10. **Checks:**
    - Go: `docker run --rm --network none -v "<api dir>:/src" -v rekordly-gomod:/go/pkg/mod -e GOPROXY=off -e GOFLAGS=-mod=mod -w /src golang:1.22-alpine sh -c "gofmt -l ./internal/; go build ./... && go vet ./internal/... && go test ./internal/..."`
    - Integration tests: run against a **throwaway database**. Create it with `docker exec rekordly-postgres sh -c 'createdb -U "$POSTGRES_USER" rekordly_test_checkout'`, migrate it with `go run ./cmd/migrate` (env from `api/.env.local`, `DATABASE_URL` pointing at the new database), run the tests, and drop it afterwards. **Never test against the dev database.**
    - Web: `npx tsc --noEmit` and `npx eslint <changed files>`.
    - Three tests already fail before your work: `TestBlueprint12_CSVImport…`, `TestBlueprint16_Settings…` and `TestBP19_G0_…`. Leave them and mention them in your report.
11. **Commits:** one commit per section, `feat(store): …`. Never commit `implementation/api/cmd/seed-emperor/`.
12. **Read the providers' current official docs before coding:**
    - Paystack: subaccounts, split payments, Pay with Transfer, dedicated virtual accounts, webhooks, transfers
    - Squad (GTCO): sub-merchants, dynamic/virtual accounts, webhooks
    - Shipbubble: rates, labels, tracking webhooks

    **Don't rely on memory for field names.** Where a provider can't do something below, say so in your report and fall back gracefully.

---

## Section 1: payment provider layer (Paystack + Squad)

**Interface.** Create `api/internal/payments/` with a provider interface used by the store, separate from Rekordly's own billing:

```go
type Provider interface {
    Key() string // "paystack" | "squad"
    CreateSubaccount(ctx, MerchantPayoutAccount) (SubaccountRef, error)        // KYC'd bank account → provider subaccount/sub-merchant
    ResolveBankAccount(ctx, bankCode, accountNumber string) (accountName string, err error)
    ListBanks(ctx) ([]Bank, error)
    CreateOrderVirtualAccount(ctx, OrderPaymentRequest) (VirtualAccount, error) // account number for THIS order, expiring, amount-locked if supported, settling to the subaccount
    InitializeCardCheckout(ctx, OrderPaymentRequest) (CheckoutURL, error)       // card/USSD fallback
    VerifyWebhook(rawBody []byte, headers http.Header) (Event, error)          // signature + parse
    VerifyTransaction(ctx, reference string) (PaymentResult, error)
}
```

`OrderPaymentRequest` carries:
- amount in minor units, currency, a unique reference
- customer email and name
- the merchant's subaccount reference
- **platform commission** (percentage, default 0) and **fee bearer** (`merchant` | `customer`)
- expiry (the payment hold)

**Paystack:**
- **Subaccount:** subaccounts.
- **Order virtual account:** **Pay with Transfer** (a temporary account number for each payment). Use a dedicated virtual account only if Pay with Transfer can't settle to a subaccount; check this in the docs.
- **Splits:** `subaccount` + `transaction_charge`/percentage + `bearer`.
- **Webhook:** `charge.success` (and `bank.transfer.rejected` → mark the attempt failed).

**Squad:**
- sub-merchant
- dynamic virtual account for each order (amount and expiry)
- signed webhook

Implement **Paystack first**, then Squad behind the same interface. If a capability is missing, return `ErrNotSupported` so the UI hides that option.

**Platform configuration:**
- Env: `PAYSTACK_SECRET_KEY`, `PAYSTACK_WEBHOOK_SECRET` (or Paystack's signature scheme), `SQUAD_SECRET_KEY`, and a webhook secret.
- `PLATFORM_COMMISSION_PERCENT` default `0`.
- Providers that aren't configured are simply unavailable.

**Tables** (migration):
- `merchant_payout_accounts`: `workspace_id`, `provider`, `bank_code`, `account_number_last4`, `account_name`, `subaccount_ref` (encrypted), `status` (`pending` | `active` | `failed`), timestamps. One active per provider per workspace.
- `storefront_payment_attempts`: `workspace_id`, `order_id`, `provider`, `method` (`virtual_account` | `card`), `reference` (unique), `amount_minor`, `fee_minor`, `commission_minor`, `virtual_account_number`, `bank_name`, `expires_at`, `status` (`pending` | `paid` | `expired` | `failed` | `rejected`), `raw_event` (jsonb, trimmed of personal data), `paid_at`.
- `payment_webhook_events`: `provider`, `event_id`/`reference`, `received_at`, `processed_at`, `outcome`. Unique per provider and reference (idempotency).

**Merchant API** (`storefront.manage_checkout`):
- `GET /api/v1/storefront/payments/banks?provider=`
- `POST /api/v1/storefront/payments/resolve-account` → account name
- `POST /api/v1/storefront/payments/payout-account` → creates the subaccount
- `GET /api/v1/storefront/payments`: returns, in one response:
  - the payout account (masked)
  - available providers
  - the enabled methods
  - fee bearer
  - commission (read-only)

**Webhooks (public):**
- `POST /api/v1/webhooks/payments/paystack`
- `POST /api/v1/webhooks/payments/squad`

Each one verifies the signature, records the event (idempotent), checks the amount against the attempt, then calls **one** service function `MarkStorefrontOrderPaid` (Section 3). Return 200 quickly.

**Web (Store → Settings → Payments card):**
- **Payout account:** bank picker (`AppComboBox`, searchable), account number, the resolved name shown back, Save.
- **Methods**, each an `AppSwitch`:
  - **Bank transfer (recommended, on by default)**
  - Card or USSD
  - Bank transfer to my own account (manual): shows the bank details to shoppers
  - Pay on delivery or at pickup
- **Who pays the processing fee:** `Segmented`, Me / The customer.
- **Commission line:** "Rekordly fee: free". It shows the current percentage, read-only.

## Section 2: stock holds at checkout

**Hold types:**

| Hold | Default | Started by | Becomes firm when |
|---|---|---|---|
| `payment` | 15 min | Checkout with online payment | Paid (webhook) |
| `transfer_manual` | 2 h | Checkout with "bank transfer to my account" | Merchant clicks Mark paid |
| `awaiting_confirmation` | 2 h | Checkout with pay on delivery | Merchant confirms |
| `pickup` | 48 h | Order with pay at pickup, or a paid pickup order waiting for collection | Collected (stock leaves) |

**What to change:**
- `SubmitGuestCheckout` must **create the hold atomically** for every line, at the chosen outlet (pickup point or delivery outlet), using the existing reservation code and the per-outlet, per-variant stock. If any line can't be held, return a plain error naming the item, e.g. "Only 1 Red / XL left", and create nothing.
- **Merchant settings** (Payments card): payment hold minutes, manual transfer hold hours, confirmation hold hours, pickup window hours.
- **Expiry:** extend `ExpireStaleStorefrontReservations`, run by the worker, so expired holds release stock, cancel the order with a reason ("Payment not received in time" and so on), mark the payment attempt `expired`, and email the customer.
- **A late payment after expiry** (the webhook arrives after release): try to re-hold the stock. If that works, mark the order paid. If not, mark it `paid_needs_attention` and notify the merchant: "Refund or restock". **Never oversell silently.**
- **The customer sees a countdown** on the payment and order pages: "We're holding your items for 14:32".

## Section 3: one "paid" path into Sales and the books

`MarkStorefrontOrderPaid(ctx, attempt)` runs in **one transaction**:
1. Marks the attempt `paid` and the order paid.
2. Turns the hold firm.
3. Creates or links the **Sale** with `source = online_store`.
4. **Posts the money:**
   - Debit "Payment provider clearing (Paystack/Squad)" for the net amount
   - Debit "Payment processing fees" (expense) for the fee when the merchant pays it
   - Credit sales and tax as the existing sale posting does

   When the customer pays the fee, the customer total includes it and the fee nets to zero for the merchant.
5. Writes an order event, sends the customer a receipt email, and notifies the merchant.

**Manual paths use the same posting with a different debit account:**
- "Mark paid" (manual transfer) → the merchant's chosen money account
- pay on delivery or at pickup when collected → the cash or POS account

**Settlement:** add a simple merchant action, Money → "Record payout from Paystack/Squad", which moves the amount from clearing to the bank. If the provider has a settlements API or webhook, import payouts automatically, but the manual action must exist.

**Ledger tests:** each path balances, and a webhook replay doesn't double-post.

## Section 4: delivery areas, pickup points and checkout

**Delivery areas** (extend the existing ones, keeping their ids):
- add `state` (optional), `estimate_text` ("1–2 days") and `outlet_id`
- keep fee and free-delivery threshold

**Pickup points:**
- outlets get `is_pickup_point`, `pickup_note` and opening hours (reuse existing fields where present)
- a pickup order holds stock **at that outlet**

**Pickup code:**
- 6 characters, shown on the customer's order page
- the merchant enters or checks it when handing over
- the merchant order page gets "Ready for pickup", then "Collected (code)"

**Checkout** (Essential template, `public-storefront-client.tsx`), as one clear page:
1. **Contact:** name, phone, email (email required when the order is paid online, so the receipt and order sign-in work).
2. **Delivery method:**
   - Pickup (choose a point)
   - Delivery (choose an area, or courier rates from Section 5)
   - Arrange my own (if enabled)
3. **Payment method:** only those the store has enabled and that are allowed for the chosen delivery method. **Courier delivery allows online payment only.**
4. **Summary:** items, delivery, fee (if the customer pays it), total, then **Place order**.

**After Place order with online payment:**
- **Virtual account (default):** show bank name, **account number with a copy button**, exact amount, and the countdown. The page checks every 5 seconds (one lightweight GET) and turns to "Payment received" when the webhook lands. Add a "I've sent it" button that triggers a provider verify.
- **Card:** redirect to the provider checkout, then back to the order page.
- **Offline methods:** show the order page with what happens next.

## Section 5: Shipbubble courier delivery

**Merchant connects their own Shipbubble account** (Store → Settings → Delivery → "Courier delivery"):
- API key, stored encrypted and shown masked, then Test connection
- choose which couriers to offer (from Shipbubble's list), or "Cheapest available"

**Product weight:** add `weight_grams` on products and variants, with a **store default weight** setting, so missing weights never block checkout.

**Rates at checkout:**
- `POST /api/v1/public/storefronts/:slug/delivery-rates` with the cart and the customer's address. The server calls Shipbubble from the pickup outlet's address and returns options (courier, price, estimate).
- **Cache rates for each cart and address** for their validity period.
- The chosen rate becomes the delivery fee, and **checkout re-validates it** server-side.

**Booking:**
- After `MarkStorefrontOrderPaid`, **book the shipment automatically** (Shipbubble label or shipment from the stored rate token), and save the tracking number and courier.
- If booking fails, keep the order paid, show "Courier booking failed: Retry" to the merchant, and email the merchant.

**Tracking:**
- `POST /api/v1/webhooks/shipbubble` (verify per their docs, idempotent) adds courier status events to the order timeline: picked up, in transit, delivered, failed.
- "Delivered" fulfils the order (stock leaves, if not already at pickup by the courier); follow the existing fulfil logic.

**Web:** the merchant order page shows courier, tracking number (copy) and status. The customer order page shows the same.

## Section 6: order tracking for guests (email codes, one identity across stores)

**Keep the private status link exactly as it is.**

**Shopper identity (passwordless):**
- **Tables:**
  - `shoppers`: `id`, `email` (unique, lower-case), `created_at`, `last_seen_at`
  - `shopper_login_codes`: `shopper_email`, `code_hash`, `expires_at` (10 min), `attempts` (max 5), `used_at`, `ip_hash`
  - `shopper_sessions`: random token, stored hashed, httpOnly cookie, 30 days
- **Endpoints (public):**
  - `POST /api/v1/public/shopper/code` with `{ email, store_slug? }`: **always** returns the same reply, "If you have orders, we've sent a code". Rate-limited by email and IP. The email contains the 6-digit code **and** a sign-in link.
  - `POST /api/v1/public/shopper/verify` with `{ email, code }`: sets the session cookie.
  - `GET /api/v1/public/shopper/orders?store=<slug>`: that store's orders, or **all** Rekordly stores when no store is given. Each entry: order reference, store name, date, total, status and the order page link.
  - `POST /api/v1/public/shopper/logout`
- **Linking:** orders are linked to shoppers by the email entered at checkout. The link is made when the shopper first signs in, matching orders with that verified email; store the shopper id on the order.
- **Web:**
  - **Store:** a **"Track my order"** link in the Essential header or footer, then email → code → that store's orders.
  - **Rekordly:** `/orders` on the main app domain, a simple "My orders" page across all stores.
  - **Checkout:** prefill name, phone and saved addresses for a signed-in shopper. Add a "Save my details" option.
- **Privacy:**
  - A merchant sees only their own orders and customers.
  - A shopper sees their orders across stores, but no store sees another store's data.
  - No personal data in URLs except random tokens.
  - Phone numbers are masked on public pages.
- **Later (don't build now, mention in your report):**
  - phone or WhatsApp codes
  - the offer, after an order, to see purchases as expenses in Personal Rekordly

---

## Tests (required)

- **Providers:**
  - Paystack and Squad webhook signature checks: valid passes, wrong signature gets a 401
  - an amount mismatch gets rejected
  - a replayed event changes nothing
  - `ErrNotSupported` hides the method
- **Holds:**
  - two checkouts for the last unit: one succeeds, one gets the plain "Only X left" error
  - expiry releases stock and cancels with a reason
  - a late payment re-holds or flags `paid_needs_attention`
- **Paid path:** a Sale is created once, the ledger balances, the fee-bearer variants post correctly, and the manual Mark paid and pay-on-delivery collected paths balance.
- **Pickup:** stock is held at the chosen outlet, the wrong pickup code is rejected, the right code fulfils.
- **Shipbubble** (mock the HTTP client):
  - rates are cached and re-validated
  - booking happens after payment
  - a booking failure leaves a retry
  - tracking webhooks update the timeline idempotently
- **Shoppers:**
  - the code endpoint gives the same reply for unknown emails (no enumeration)
  - 5 wrong attempts lock the code
  - an expired code is rejected
  - the session sees only orders for that verified email
  - a store-scoped list excludes other stores
- **Workspace isolation on every merchant route. Secrets never appear in responses.**

## Order of work and commits

1. **Section 1:** provider layer + Paystack + payout account + webhooks.
2. **Section 2 + Section 3:** holds and the paid path, including the books.
3. **Section 4:** checkout, delivery areas, pickup.
4. **Section 1b:** the Squad provider.
5. **Section 5:** Shipbubble.
6. **Section 6:** shopper identity and order tracking.

## When you finish

Reply with:
1. what you built, section by section
2. the migrations
3. the new endpoints with example responses
4. the test output, pasted
5. **any provider capability you couldn't confirm in the docs, and the fallback you used**
6. the env variables to set
7. anything left undone

Then mark the parts you finished as done in `planning/38-storefront-delivery-payments-research.md`.
