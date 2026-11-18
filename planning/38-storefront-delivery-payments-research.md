# Storefront for launch: delivery, payments, stock holding and order tracking

Research and recommendation, 18 Nov 2026. Covers the six questions:
1. delivery APIs
2. merchant-set delivery prices
3. pickup
4. payment in each case
5. stock reservation in each case
6. how customers who aren't registered track orders

---

## 0. Where the code is today

Read from `storefront_public_service.go` and `storefront_order_service.go`:

- **Checkout is a request, not a purchase.** `SubmitGuestCheckout` creates an order but **reserves no stock and records no payment**. The merchant reviews it, then `ConfirmStorefrontOrder` reserves the stock. Fulfilment (packed, then delivered) moves the stock out. Paid orders become Sales.
- **Delivery:** pickup, store delivery and "customer arranges", plus delivery areas with a fee each and a free-delivery threshold. That's already merchant-set pricing.
- **Payment:** none happens online. Paystack is only wired for Rekordly's own subscriptions (`internal/billing/paystack.go`), not for store orders.
- **Tracking:** after checkout the customer gets a **private status link**. Its token is stored only as a hash, and the link lets them view, message, cancel before confirmation, acknowledge changes and ask for a return. Codex is adding customer matching now (`storefront_customer_match.go`).

That's a good, safe base. What's missing for launch is **taking money online**, **holding stock while the customer pays**, **courier delivery**, and a **"My orders" lookup** that doesn't depend on keeping one link.

---

## 1. Delivery APIs we can use

| Provider | What it is | Useful for us |
|---|---|---|
| **Shipbubble** | Nigerian **aggregator**: one API, many couriers (Kwik, GIG, DHL and others) | Live rates (`/v1/shipping/fetch_rates`), booking, **cash on delivery**, insurance, returns, tracking and webhooks. Rate tokens last 7 days. **Bumpa offers Shipbubble and Chowdeck under Connected Apps.** |
| **Terminal Africa (TShip)** | Aggregator with a similar scope | Carriers include GIG, DHL Nigeria, Kwik, Dellyman, Red Star, Fez, Gokada, plus a "store-pickup" carrier |
| **Sendbox** | Aggregator with a dashboard | Compares carriers, books, makes waybills, tracks |
| **Kwik, Chowdeck Relay** | Same-day riders (Lagos, also Abuja and Port Harcourt for Kwik) | Direct APIs for fast city delivery |
| **GIG Logistics, Fez** | Nationwide couriers | Direct APIs. GIG offers pay on delivery. |

**Recommendation:** integrate **one aggregator, Shipbubble**, not individual couriers. One integration gives same-day city riders and interstate couriers, it's what Bumpa merchants already know, and it covers rates, booking, tracking webhooks and later COD. Keep Terminal Africa as the fallback if Shipbubble's terms don't suit.

**How it fits:**
- **The merchant connects their own Shipbubble account** (API key in Store → Settings → Delivery → "Connect a courier"). The courier wallet and billing stay between the merchant and Shipbubble, so Rekordly never holds delivery money. Bumpa works the same way ("Connect").
- **Products need a weight** for live rates. Bumpa requires weights for automated shipping too. Add **weight** to the product form, with a store-wide default weight so it never blocks.
- **Pickup address:** courier rates are worked out from the outlet's address, which the outlet form already has.
- **When it's booked:** courier delivery is **booked only after payment**. Bumpa: "Automated Shipping works with only online payment methods". Shipbubble's status webhooks then add "Picked up", "In transit" and "Delivered" to the order's timeline automatically.

**Before building, check:** current Shipbubble pricing and markup, the address-validation fee (a third-party guide says 50 free, then ₦5 each), the webhook status list, and COD terms. Their public docs don't list these.

---

## 2. Merchant-set delivery prices (own riders)

This already exists as delivery areas. For launch, make it clearer:

- **Area:** name (e.g. "Lagos Mainland"), optionally tied to a **state** (and later LGA) so checkout can suggest the right one from the address.
- **Fee per area**, an **estimated time** ("1–2 days"), and which **outlet** ships it.
- **Free delivery over ₦X**, which exists.
- **Checkout** shows only the active areas, with fee and estimate, and the total updates immediately.

The merchant's own riders deliver these orders, so **any payment method** works (section 4).

---

## 3. Manual pickup

- **Pickup points are outlets** marked "Customers can pick up here", each with an address, opening hours and an optional note ("Call before coming").
- **Checkout:** the customer picks a pickup point, and delivery is free.
- **Stock comes from that outlet.** Per-outlet stock already exists, so a customer can't pick up something only another branch has.
- **Ready for pickup:** the merchant marks it ready, and the customer gets a message (status link and email). Handing it over marks the order done.
- **Pickup code:** a short code on the order page that staff check at handover. It's cheap and stops the wrong person collecting the order.

---

## 4. Payment in each scenario

### Payment options to offer

1. **Pay online (recommended default):** card, bank transfer, USSD through **Paystack**.
   - **"Pay with Transfer"** gives a temporary account number for each payment and confirms automatically with a `charge.success` webhook. This matters in Nigeria, where most people pay by transfer. It's enabled through Paystack support.
2. **Bank transfer to the merchant's own account (manual):** what we have today. The customer sees the bank details, sends money, and the merchant clicks "Mark paid".
3. **Pay on delivery / at pickup:** cash or POS at the door or counter. The merchant collects.

Each store switches these on or off in Store → Settings → Payments.

### How online money reaches the merchant

There are two models:

| | **A. Paystack subaccounts (Rekordly is the platform)** | **B. Merchant connects their own Paystack keys** |
|---|---|---|
| Setup for the merchant | Enter bank account details once. We create a Paystack subaccount. | Must have their own Paystack business account and paste keys |
| Where money settles | Paystack pays the merchant's bank directly, next working day. Rekordly never holds it. | The merchant's own Paystack |
| Rekordly's fee | Can take a cut automatically (`transaction_charge` or a percentage split) | Must bill separately |
| Auto-reconcile into Sales and books | Yes, from our webhook | Yes, but every merchant webhook needs setting up |
| Fees | Paystack local: about **1.5% + ₦100, capped at ₦2,000** (₦100 waived under ₦2,500; check the live pricing page). Who pays them is configurable (`bearer`). | Same fees, on the merchant's own account |

**Recommendation: A, Paystack subaccounts.** It's one tap for merchants, money goes straight to their bank, Rekordly can earn a small commission, and every paid order is posted to the books automatically. Rekordly must complete Paystack's go-live as a registered business, and subaccounts must be Nigerian bank accounts for a Nigerian business. Offer B later for larger merchants who already use Paystack.

### What the books record

These are the money entries we already post elsewhere:
- **Paid online:** Sale + payment to a "Paystack clearing" account. The Paystack fee is an expense. Settlement then moves the money from clearing to the bank.
- **Bank transfer (manual):** Sale + payment to the merchant's chosen bank account when they click "Mark paid".
- **Pay on delivery / at pickup:** the order is confirmed and owed (a receivable) until collected. On delivery: Sale + payment (cash or POS account). If delivery fails, it's cancelled and the stock comes back.

---

## 5. Stock reservation in each scenario

Rules, based on standard practice:
- **Hold stock at checkout, not when items go into the cart.**
- **A short "payment hold" (10–15 minutes) releases itself.**
- **Turn the hold into a firm reservation once there's a real commitment** (payment, or merchant confirmation).
- **Release on cancel, expiry or failed delivery.**
- Make holds atomic and idempotent, which our existing reservation code already does in Postgres.

| Delivery | Payment | At "Place order" | Becomes firm when | Stock leaves when | Sale recorded when |
|---|---|---|---|---|---|
| Pickup | Online | **15-minute payment hold** | Paystack `charge.success` | Handed over | On payment |
| Pickup | Pay at pickup | **Pickup hold** for the merchant's pickup window (default 48 h), auto-cancel if not collected | Immediately (it's the pickup hold) | Handed over | On collection |
| Own delivery area | Online | 15-minute payment hold | On payment | Dispatched | On payment |
| Own delivery area | Bank transfer (manual) | **Transfer hold** (default 2 h, merchant setting) | Merchant clicks "Mark paid" | Dispatched | On "Mark paid" |
| Own delivery area | Pay on delivery | **Short hold** (default 2 h) waiting for the merchant to confirm (they usually call the customer) | Merchant confirms | Dispatched | On delivery (cash collected) |
| Courier (Shipbubble) | **Online only** | 15-minute payment hold | On payment, then the courier is booked automatically | Courier picks up | On payment |
| Courier + COD *(later)* | Courier collects | Like pay on delivery | Merchant confirms | Courier picks up | When the courier pays out (reconciled from their report) |

**What changes from today:**
1. **Checkout places a timed hold.** Today `SubmitGuestCheckout` reserves nothing, so two people can order the last item.
2. **Holds expire on their own.** `ExpireStaleStorefrontReservations` already exists, so we extend it to cover the new hold types.
3. **The merchant sets the hold times:** payment 15 min, transfer 2 h, pickup 48 h.
4. **The customer sees a countdown:** "We're holding your items for 14:59", and "Pickup within 48 hours".

---

## 6. How customers who aren't registered track orders

### What competitors do

- **Bumpa:** the customer gets a tracking number by email and enters it on the store's "Track Shipment" page. When a customer pays in-store, a website account is created for them by email.
- **WooCommerce and most stores:** order number + email to view an order.
- **Modern practice:** passwordless sign-in with an **email code (OTP)**, a magic link, or both in the same email.

Order number + email alone is weak: order numbers leak and emails are guessable. It should be **paired with a code sent to that email or phone**.

### Recommendation: never force sign-up; use one passwordless "shopper identity" across all Rekordly stores

1. **Checkout stays guest.** Ask for name, phone and email. Don't make them create an account first: forced sign-up loses sales.
2. **Order link (exists today):** after ordering, the confirmation page and email or WhatsApp message carry the private status link. Keep it:
   - long and random, stored only as a hash
   - one order only, read-only, plus the safe actions (message, cancel before confirmation, return request)
   - rate-limited
3. **"Track my order" on every store:** the customer enters their email (or phone later), gets a **6-digit code** (valid 10 minutes, 5 tries), and sees **all their orders from that store**. No password.
   - The page always replies "If you have orders, we've sent a code", so nobody can test which emails are customers.
   - The code email also contains a sign-in link, so phone users can copy the code and desktop users can click.
4. **One identity across Rekordly stores ("Rekordly ID"):** the same email-code sign-in works at `rekordly.com/orders`, showing orders from **every** Rekordly store that customer bought from. This is Bumpa's "an account for every customer by email", but better: one identity for every store, so returning shoppers check out faster (saved name, phone, addresses) on any Rekordly store.
5. **Optional upsell after the order, never before:** "Track your spending for free: your purchases appear automatically in Personal Rekordly." A personal Rekordly user's store purchases can be added to their personal expenses automatically. **No competitor can do this**, because they have no personal finance side. This is our advantage over Bumpa.
6. **Privacy:**
   - A merchant only ever sees their **own** customers and orders.
   - A shopper sees their orders across stores, but no store sees another store's data about them.
   - Phone numbers are masked on the order page, and nothing personal goes in URLs except the random token.

**Where it connects:** Codex's customer matching (an order is linked to a merchant's Customer record by email or phone) is the merchant side. The shopper identity above is the customer side. Keep them separate: one is the merchant's customer list, the other is the shopper's own login.

**SMS or WhatsApp codes** (instead of email) cost money per message through an SMS or WhatsApp provider. Launch with **email codes**, and add phone codes later.

---

## 7. Launch plan

**Phase A: launch**
1. Paystack subaccounts: merchant bank setup, pay online (card, transfer, USSD) with webhook confirmation, Paystack fee and clearing entries in the books.
2. Per-store payment switches: Online, Bank transfer (manual), Pay on delivery or at pickup.
3. Holds at checkout, using the table in section 5, with merchant-set times, auto-expiry and a customer countdown.
4. Pickup points (outlets), a pickup code, and "Ready for pickup".
5. Delivery areas with state, fee, estimated time and outlet.
6. "Track my order" with an email code on each store. Keep the status link.

**Phase B: soon after**
7. Shipbubble connect: live courier rates at checkout, auto-booking after payment, tracking webhooks into the order timeline. Product weight and store default weight.
8. Rekordly ID: one sign-in across stores, saved details, and `rekordly.com/orders`.

**Phase C: later**
9. Courier cash on delivery (Shipbubble COD) with payout reconciliation.
10. Personal Rekordly upsell (purchases appear as personal expenses automatically).
11. POS (in `TODO.md`) on the same holds and Sales.

---

## 8. Decisions for you

1. **Payments model:** Paystack **subaccounts** (Rekordly as the platform) or merchant-owned keys? Recommended: subaccounts.
2. **Rekordly commission** on online store payments: none at launch, or a small percentage?
3. **Who pays the Paystack fee:** the merchant (default) or the customer as a checkout fee?
4. **Courier aggregator:** Shipbubble (recommended) or Terminal Africa?
5. **Default hold times:** payment 15 min, transfer 2 h, pickup 48 h. Are these OK?
6. **Shopper identity:** start with email codes only (recommended), and add phone or WhatsApp codes later?

---

## Sources

- Shipbubble: [API docs](https://docs.shipbubble.com/), [Request shipping rates](https://docs.shipbubble.com/api-reference/rates/request-shipping-rates), [Rates from selected couriers](https://docs.shipbubble.com/api-reference/rates/request-shipping-rates-from-selected-couriers), [Webhook simulator](https://docs.shipbubble.com/api-reference/webhooks/webhook-simulator-sandbox), [Developer's guide to logistics APIs](https://www.blog.shipbubble.com/a-developers-guide-to-logistics-apis-for-nigerian-ecommerce/), [Shopware plugin (validation fee note)](https://github.com/KommandHub-Org/KmhShipbubbleSW)
- Terminal Africa: [TShip intro](https://docs.terminal.africa/tship), [Get rates](https://docs.terminal.africa/tship/rate/get-rates), [Carriers](https://docs.terminal.africa/tship/carrier/get-carriers)
- Couriers and comparisons: [Kwik API announcement](https://kwik.delivery/kwik-delivery-releases-its-api-to-merchants-and-businesses/), [GIG e-commerce](https://giglogistics.com/e-commerce/), [30 logistics APIs in Nigeria](https://www.buildstudio.com.ng/logistics-apis-for-nigerians), [Sendbox review](https://brands.ng/sendbox-nigeria-review-best-delivery-platform-for-small-businesses/), [Best logistics for e-commerce 2026](https://brands.ng/blog/best-logistics-company-in-nigeria-for-ecommerce-in-2026-a-sellers-honest-guide/), [SME logistics comparison](https://vendda.co/blog/top-5-logistics-providers-nigeria-sme), [Integrating local delivery APIs](https://ebrandpromotion.com/how-to-integrate-local-delivery-apis-with-your-ecommerce-website/)
- Paystack: [Split payments](https://paystack.com/docs/payments/split-payments/), [Payment channels (Pay with Transfer)](https://paystack.com/docs/payments/payment-channels/), [Dedicated virtual accounts](https://paystack.com/docs/payments/dedicated-virtual-accounts/), [Fees and settlement 2026](https://www.lilachbullock.com/paystack-in-nigeria/), [Split payments guide](https://www.mctaba.com/learn/paystack/paystack-split-payments-and-marketplaces-complete-guide)
- Bumpa: [Tracking shipments](https://support.getbumpa.com/support/solutions/articles/150000210798-tracking-shipment-for-orders-with-automated-shipping-option), [Order processing](https://www.getbumpa.com/blog/everything-you-need-to-know-about-order-processing-and-fulfilment-for-small), [Bumpa vs Flutterwave Store](https://www.getbumpa.com/blog/bumpa-vs-flutterwave-store-what-nigerian-sellers-actually-need-to-know)
- Stock holds: [Inventory reservation backend](https://encore.dev/articles/ecommerce-inventory-reservation-backend), [Locking inventory during checkout](https://help.shopline.com/hc/en-001/articles/20024302623129-Locking-Inventory-During-Checkout-to-Prevent-Overselling), [Order management design](https://techinterview.org/lld-ecommerce-order-management/)
- Guest tracking: [Guest checkout vs passwordless](https://mojoauth.com/blog/guest-checkout-vs-account-login-passwordless-patterns), [WooCommerce guest order tracking](https://www.godaddy.com/resources/skills/woocommerce-guest-checkout-track-orders.md), [Guest order lookup (Microsoft)](https://learn.microsoft.com/en-us/dynamics365/commerce/order-lookup-guest), [Magic link deliverability](https://guptadeepak.com/ciam-compass/best-practices/magic-link-deliverability/), [Magic links](https://supertokens.com/blog/magiclinks)
