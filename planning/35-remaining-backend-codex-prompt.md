# Codex prompt: remaining backend work, with one request per page and one request per action

Paste everything below the line into Codex.

> **Audit (16 Nov 2026).** I checked the current frontend before writing this. What changed from the earlier prompts (`33-…`, `34-…`):
> - **Dropped:** the `?purchase_order_id=` / `?goods_receipt_id=` list filters. The order page now gets its receipts and bills inside `GET /purchase-orders/:id`, so nothing needs them.
> - **Added:** most pages make 2–5 requests where 1 would do, mainly a full supplier list just to show one name. Several buttons also fire 3–8 writes in a row from the browser. If the tab closes halfway, the data is left half done. Sections B and C fix both.

---

You are working on Rekordly V2, a bookkeeping, stock and procurement app for Nigerian small businesses.

- **API:** Go, Gin, pgx and sqlc, in `implementation/api`.
- **Web:** Next.js 16, HeroUI v3 and Tailwind v4, in `implementation/web`.
- **Rules:** read `AGENT_RULES.md` first. It overrides everything here.

Your job is the backend work below, plus the small web change listed after each item, so the frontend actually uses it. Do not redesign any screen.

**The goal:** a page loads with **one** request (two at most, when a picker list is really needed), and a button that does one thing for the user sends **one** request that succeeds or fails as a whole.

## Ground rules (follow the existing code)

1. **sqlc for every query.** Put queries in `implementation/api/sqlc/queries/*.sql` and regenerate:
   `docker run --rm --network none -v "<api dir>:/src" -w /src sqlc/sqlc:1.31.1 generate`
   Don't add new raw `pool.Query` code. Never hand-edit generated files in `internal/db`.
2. **Migrations:** each change is a new numbered file in `implementation/api/migrations/`. The latest is `000060_variant_stock.sql`, so start at `000061_…`. Never edit an old migration.
3. **Money:** BIGINT minor units in the database. JSON carries minor units as strings. Prices people type arrive as major-unit decimal strings and are parsed with `ParseMajorToMinor(value, exponent)`. Never use floats.
4. **Workspace scoping:** every query filters by `workspace_id`. Every `/:id` route returns 404 for another workspace's record, and a test proves it.
5. **Idempotency:** every write takes an `idempotency_key`, the same way as existing v2 writes such as `CreatePurchaseOrderFromRequest`. A replay returns the first result. A combined command (section C) uses **one** key for the whole thing.
6. **Permissions:** copy the check that the handlers next to yours use.
   - Product handlers use `businessWorkspace(c)`.
   - Procurement uses the existing names: `purchases.view`, `purchases.create`, `purchases.create_po`, `purchases.approve_po`, `purchases.receive`, `purchases.create_bill`, `purchases.approve_bill`, `purchases.pay_supplier`.
   - A combined command needs every permission its steps need. Don't invent new permission names.
7. **Response shape:** success is `{"data": …}` and errors are `{"error": {"code", "message"}}`. Messages are plain English a shop owner understands.
8. **Ledger:** any write that posts to the ledger (bills, payments, stock) must balance, with debits equal to credits, inside the same transaction as everything else in that command. Tests assert that the ledger balances.
9. **Reuse, don't copy.** Section C commands must call the **existing** service functions (`CreateGoodsReceipt`, `CreateSupplierBill`, `ApproveSupplierBill`, `CreatePayment`, `AdvancePurchaseOrder`, stock transfer services, …) inside one transaction. Where needed, refactor them to accept a `db.Queries` built on a transaction. Don't write a second copy of the business logic.
10. **Checks:** run `gofmt` on the files you touch.
    Build and test offline:
    `docker run --rm --network none -v "<api dir>:/src" -v rekordly-gomod:/go/pkg/mod -e GOPROXY=off -e GOFLAGS=-mod=mod -w /src golang:1.22-alpine sh -c "go build ./... && go vet ./internal/finance/ && go test ./internal/finance/..."`
    Integration tests need `DATABASE_URL` and the `rekordly-postgres` Docker network. Follow `internal/finance/stock_from_records_integration_test.go`.
11. **Web:** run `npx tsc --noEmit` and `npx eslint <changed files>` in `implementation/web`. Use the existing shared components. Don't add packages.
12. **Commits:** don't commit `implementation/api/cmd/seed-emperor/`. Make one commit per section in the existing style (`feat(scope): …`).

---

## A. Price changes (still needed)

**Today.** `web/src/components/features/products/product-price-drawer.tsx` saves one product with 2 requests: `PUT /options` with the whole grid, then `PATCH` with the whole product. The bulk drawer makes **3 requests per product** in a loop (get, options, patch). That leads to stale overwrites and bulk changes that stop halfway.

**A1. `POST /api/v1/catalogue/products/:id/prices`**

```json
{ "idempotency_key": "…", "product": { "selling_price": "16500", "compare_at_price": "" }, "variants": [{ "id": 41, "selling_price": "18000", "compare_at_price": "20000" }] }
```

- **What's sent:** both parts are optional, but at least one must be present. Leave anything not listed untouched.
- **Prices:** any value with at most `exponent` decimals is valid (odd prices are fine), and the server never rounds.
- **Compare-at:** empty clears it. Otherwise it must be above that row's new price. The error names the variant.
- **Variant ids:** each must belong to the product, must not be archived, and must not be the default variant. The product's own price goes through `product`.
- **Transaction:** do everything in one transaction. Write one `product_price_history` row per changed row and one `price_changed` event with a plain summary.
- **Response:** return the updated `ProductDetail`.

**A2. `POST /api/v1/catalogue/products/prices/bulk`**

```json
{ "idempotency_key": "…", "product_ids": [3, 8], "rule": { "direction": "increase", "by": "percent", "value": "10", "round": "" }, "include_variants": true }
```

- **Maths:** match `applyRule` in `web/src/lib/price-change.ts` exactly, in integer minor units.
  - percent (0–100, at most 2 decimals): `(old × (10000 ± hundredths) + 5000) / 10000`
  - amount: major units in each product's own currency
  - `round` is `""`, `"10"`, `"50"`, `"100"` or `"500"`: the nearest step
  - clamp at 0
- **Compare-at:** keep it only while it stays above the new price.
- **Transaction:** run the whole batch in one transaction. On any failure save nothing and return 422 with `{"failed": [{product_id, name, message}]}`. On success return `{updated_products, updated_variants}`.
- **Limit:** at most 500 ids.

**A3. Price history**
- **New columns:** a migration adds nullable `old_compare_at_price_minor`, `new_compare_at_price_minor` and `source` (`edit`, `quick_change`, `bulk_change`, `options`) to `product_price_history`.
- **Filling them:** fill them on every path.
- **Small fix:** when `PUT /options` changed only prices, log `price_changed` instead of "Options changed".

**A — web:**
- add `productsApi.changePrices` and `productsApi.bulkChangePrices`
- `ChangePriceDrawer`: 1 request
- `BulkPriceDrawer`: 1 request, with `failed` shown in the existing "Not changed" list
- delete `productPricePayload` and `variantPricesPayload` from `price-change.ts`

---

## B. One request per page (reads)

| Page | Requests today | Target |
|---|---|---|
| Purchase request detail | request + **all suppliers** | 1 |
| Purchase order detail | order + **all suppliers** + messages (checked every 60 s even when closed) | 1, plus messages only while the sheet is open |
| Goods receipt detail | receipt + **all suppliers** | 1 |
| Bill detail | bill + **all suppliers** | 1 |
| Requests, orders, receipts and bills lists | list + **all suppliers** (each) | 1 |
| Product detail | product + **all collections** + **all outlets**; History tab: price history + events | 1; History tab 1 |
| Products list | list + collections, plus **a second list** whenever a collection filter is picked | 2 (collections are needed for the filter labels) |
| Inventory | products + inventory balances + outlets | 1 |

**B1. Embed the supplier.**
- **Details:** add `supplier: { id, name, phone, email } | null` to the purchase request, purchase order, goods receipt and supplier bill detail responses.
- **Lists:** add `supplier_name` to each row of the four list endpoints.
- **Web:** in `procurement-detail-pages.tsx` and `procurement-section-pages.tsx`, remove every `useContacts(workspaceId, "suppliers")` that only looks up a name. The share link's WhatsApp and email buttons read `order.supplier.phone` and `order.supplier.email`.

**B2. Lists return everything, with paging.**
- **Problem:** `ListGoodsReceipts` and `ListSupplierBills` are hard-capped at 50 (`Limit: 50`), and the purchase request and order lists likewise. Older records silently disappear from the list pages.
- **Fix:** add `limit` (default 50, max 200) and `before_id` cursor paging to all four, returning `{ items…, next_before_id }`. Follow the paging style already used by the money record lists (`ServerListControls` in `web/src/components/ui/data-view.tsx`).
- **Web:** pass the `server` controls to `DataView` on those four list pages.

**B3. Product detail.**
- **Names:** add `collections: [{id, name}]` and `outlets: [{id, name}]` (the ones linked to the product) to `GET /catalogue/products/:id`.
- **History:** add `GET /catalogue/products/:id/history`, which returns price changes and product events merged into one list, newest first, with each item shaped `{ kind: "price" | "event", … }`. It replaces `/price-history` and `/events`. Keep the old routes for now.
- **Web (`product-detail-page.tsx`):** drop `useProductCollections` and `useOutlets` from the detail page, and make the History tab one query.

**B4. Products list.**
- **API:** add `collection_ids: number[]` to each row of `GET /catalogue/products`.
- **Web (`products-page.tsx`):** filter by collection on the client and delete the `filteredByCollection` query.

**B5. Inventory overview.**
- **API:** add `GET /api/v1/inventory/overview`. It returns everything `web/src/components/features/products/inventory-overview.tsx` builds today from 3 requests: products with stock (per outlet and in total), value at cost, and outlets with `products_in_stock` and `stock_value_minor`.
- **Web:** use the one query.

**B6. Purchase order: unread count with the order.**
- **API:** add `unread_messages` to `GET /purchase-orders/:id` (see D2 for how reads are tracked).
- **Web (`document-chat.tsx`):** take the count from the order. Only fetch the message list while the sheet is open, and stop the 60-second check when it's closed.

---

## C. One request per action (writes that must succeed or fail as a whole)

| Button / flow | Requests today, one after another from the browser |
|---|---|
| Order page "Send to supplier" (on a draft) | submit → approve → issue → create share link (**4**) |
| New order form "Send now" | create → submit → approve → issue (**4**) |
| Receive goods form (PO not sent yet, bill and pay now) | submit → approve → issue → create receipt → create bill → approve bill → pay (**up to 7**) |
| New bill form "Pay now" | create bill → approve → pay (**3**) |
| Pay on a goods receipt (payment drawer) | create bill → approve → pay (**3**) |
| Product Stock tab "Move between outlets" | create transfer → dispatch → receive (**3**) |
| New product with variants and opening stock | create → save options → **one stock add per variant** (**2 + N**) |
| Edit product with variants | update → save options (**2**) |

**C1. `POST /api/v1/purchase-orders/:id/commands/issue`**
- **What it does:** moves the order from wherever it is (draft, submitted or approved) to `issued`, in one transaction, recording each step's event.
- **Permissions:** it needs `purchases.approve_po` to pass approval. Without it, the order stops at `submitted` and the response says so: `{ order, stopped_at: "submitted", message: "Sent for approval. Someone who can approve orders must send it." }`.
- **Share link:** with `"share": true`, it also returns `share: { token, url, expires_at }`. **Reuse** an active, unexpired share link for this order instead of making a new one each time (`TODO.md` §1, "Link reuse"). Accept `"force_new_link": true` to replace it.
- **Create and send in one go:** `POST /purchase-orders/direct` also accepts `"issue": true` and `"share": true`.
- **Web:** `ensureIssued` in `procurement-detail-pages.tsx` and the three-step chains in `procurement-flow-form.tsx` (order and receipt modes) each become 1 request.

**C2. `POST /api/v1/goods-receipts` takes the whole "receive" step.**
- **What it does:** besides the receipt, it accepts optional `"issue_order": true` (sends a linked order that hasn't been sent yet, with the same permission rule as C1), `"bill": { supplier_invoice_number, bill_date, due_date, approve: true }` and `"payment": { account_id, amount, payment_date, reference }`.
- **Transaction:** everything happens in **one transaction**: send the order, create the receipt with its stock movement, create the bill, approve it, then record the payment. Each part posts to the ledger exactly as it does on its own today.
- **Response:** `{ receipt, bill?, payment? }`.
- **Web:** the receipt branch of `procurement-flow-form.tsx` (including `savedReceiptRef`, which only exists to resume a half-finished chain) becomes 1 request.

**C3. Pay a bill or receipt in one step.**
- **New bills:** `POST /api/v1/supplier-bills` accepts `"approve": true` and an optional `"payment"`. Use it for the bill branch of the flow form.
- **Receipts:** add `POST /api/v1/goods-receipts/:id/payments` with `{ account_id or legs[], amount, payment_date, reference, idempotency_key }`. If the receipt has no bill, it creates one from the receipt, approves it (accepting any difference, as the drawer does today), then records the payment, all in one transaction.
- **Web:** use it in the `goods_receipt` branch of `payment-drawer.tsx`.

**C4. `POST /api/v1/catalogue/products/:id/stock/move`**
- **Body:** `{ variant_id?, from_outlet_id, to_outlet_id, quantity, note?, idempotency_key }`.
- **What it does:** one transaction that creates, dispatches and receives the transfer, using the existing stock transfer services, so the movement history stays the same.
- **Web:** replaces the 3-step chain in `product-stock.tsx`.

**C5. Product save with options and opening stock.**
- **Create:** `POST /catalogue/products` accepts optional `options` and `variants` (the same shape as `PUT /options`), and each variant can carry `opening_stock`, `opening_unit_cost` and `outlet_id`.
- **Edit:** `PATCH /catalogue/products/:id` accepts optional `options` and `variants`. Sending `options: []` removes variants.
- **Transaction:** run everything, including opening stock and its ledger posting, in one transaction.
- **Web:** the save in `product-form-page.tsx` becomes 1 request, and the per-variant `changeStock` loop goes away.

---

## D. Still needed from the earlier prompt

**D1. Supplier bill detail (`GET /supplier-bills/:id`).**
- **Per line:** add `expected_unit_cost_minor` (from the receipt line, or failing that the order line) and `variance_minor`.
- **Payments:** add `payments: [{ id, payment_date, amount_minor, reference, account_name }]`.
- **Events:** add `events` (created, approved, disputed, rejected, paid, part paid, reversed), each with `actor_name`, `note` and `created_at`. Add a bill events table if none exists, and write to it from the existing bill commands.
- **Actor names:** add `actor_name` to purchase order events and purchase request decisions.
- **Web (bill page):**
  - show each line's difference under the line when it isn't 0
  - add a Payments tab
  - add an Activity card using the existing `ActivityCard`
  - show "by {actor_name}" in activity on the order and request pages

**D2. Messages (`/documents/:docType/:id/messages`).**
- **Sender name:** when `sender_name` is empty, use the workspace's business name instead of "Team".
- **Read tracking:** a migration adds `document_message_reads` (`workspace_id`, `user_id`, `document_type`, `document_id`, `last_read_message_id`, `updated_at`), unique per user and document.
- **Unread count:** the list returns `{ messages, unread_count }`, counting `guest` messages after the user's last read.
- **Mark read:** add `POST …/messages/read` with `{ last_read_message_id }`. It only moves forward.
- **Allowed types:** accept only `purchase_order`, `invoice`, `supplier_bill`, `goods_receipt` and `purchase`. Anything else gets a 400.
- **Web (`document-chat.tsx`):** replace the `localStorage` read position with this. Mark read when the sheet opens and when a message arrives while it's open.

**D3. Files on documents.**
- **What it does:** attach private evidence (a supplier invoice photo, a waybill) to an order, receipt, bill or purchase. Reuse `evidence_assets`, the upload in `web/src/lib/evidence.ts` and `GET /evidence/:id/access`.
- **Storage:** a migration adds `document_files` (`workspace_id`, `document_type`, `document_id`, `evidence_asset_id`, `created_by_user_id`, `created_at`).
- **One request per page:** include `files: [{ id, evidence_id, file_name, mime_type, size_bytes, created_at, uploaded_by_name }]` **in each document's detail response**, rather than a separate GET.
- **Routes:**
  - `POST /documents/:docType/:id/files` with `{ evidence_id, idempotency_key }`. The evidence must belong to the workspace.
  - `DELETE /documents/:docType/:id/files/:fileId` unlinks it and keeps the evidence.
- **Web:** add a Files tab on those four pages, with a list, open through the signed link, "Add file", and a ⋮ menu with Remove.

---

## Tests (for every section)

- **Workspace isolation:** another workspace's id returns 404 on every new or changed route.
- **Combined commands (C1–C5):**
  - Success path, with the ledger balanced.
  - **Failure rollback.** Make a later step fail, such as a payment with a missing account. Assert that **nothing** was saved: no receipt, bill, stock movement or ledger entry.
  - Replay with the same idempotency key returns the first result and doesn't double-post.
  - C1 without approve permission stops at `submitted`.
  - C1 share-link reuse returns the same token.
- **Price maths (A):**
  - 15,000 +10% gives 16,500
  - 16,537.50 exact stays as typed
  - 16,537 rounded to 50 gives 16,550
  - a percentage over 100 is rejected
  - a decrease clamps at 0
  - a currency with exponent 0
- **Reads (B):** embedded supplier and names are correct. Paging returns everything across pages with no repeats.
- **Messages and files (D2, D3):** unread count rises for guest messages only and resets after a read. An unknown document type gets a 400. Attaching another workspace's evidence is rejected.

## Order of work

Do the sections in this order, with each in its own commit: **C1, C2, C3** (the half-finished-data risk), then **B1, B2, B6**, **A**, **C4, C5**, **B3, B4, B5**, **D1, D2, D3**.

## Out of scope

- Short links (`TODO.md` §1, the `/s/:code` service). Link reuse is in C1.
- The notification items in `NOTIFICATIONS_TODO.md`.
- Screen redesigns.

## When you finish

Reply with:
1. what you built, section by section
2. the migrations you added
3. the new and changed endpoints, with example responses
4. the test output, pasted
5. for each page and button in the B and C tables, the request count before and after
6. anything you couldn't do and why

Then mark the finished parts as done at the top of `planning/33-price-change-backend-prompt.md` and `planning/34-procurement-document-pages-backend-prompt.md`.
