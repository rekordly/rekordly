# Prompt: data for the procurement document pages (backend)

> **Status (16 Nov 2026):** sections 1 and 2 are done, and the web uses them:
> - The purchase order detail returns `receipts`, `bills`, `paid_minor`, and per-line `received_quantity`, `rejected_quantity` and `billed_quantity`. The code is in `purchase_order_links.go` and `sqlc/queries/finance_purchase_order_links.sql`.
> - The purchase request detail returns `orders`.
> - The bill view also returns `approved_at`.
>
> Sections 3 to 7 are still open: list filters, per-line bill difference and bill payments, bill events and actor names, message sender name and unread counts, and Files.

Paste this to the backend agent. Follow `AGENT_RULES`. Use sqlc for every query, scope every write to the workspace, and make every write idempotent. Money stays in minor units.

## Context

Every procurement detail page now uses one shared layout:

- a header
- a progress bar (Request → Order → Received → Billed → Paid)
- a summary card with a paid bar
- a linked documents card
- tabs: Items, Activity, Payments

A Messages sheet sits on the purchase order page.

Frontend files:

- `implementation/web/src/components/features/finance/document-page.tsx`
- `implementation/web/src/components/features/finance/document-chat.tsx`
- `implementation/web/src/components/features/finance/procurement-detail-pages.tsx`

To work today, the frontend puts several things together itself. This is slow and approximate:

- **The purchase order page** loads every goods receipt and every bill in the workspace, keeps the ones linked to this order, then loads each one's details to add up received and billed quantities per line.
- **The purchase request page** loads up to 200 purchase orders to find the ones made from this request.
- **Messages** are sent with no sender name, so the supplier sees "Team".

## Build

### 1. Purchase order detail (`GET /api/v1/purchase-orders/:id`)

Add to each line:

```json
{ "received_quantity": "80", "rejected_quantity": "2", "billed_quantity": "80", "returned_quantity": "0" }
```

Add to the order:

```json
{
  "receipts": [{ "id": 4, "receipt_reference": "GRN-4", "received_on": "2026-11-12", "status": "partially_paid", "total_minor": "120000" }],
  "bills":    [{ "id": 9, "supplier_invoice_number": "INV-22", "bill_date": "2026-11-13", "status": "approved", "total_minor": "120000", "outstanding_minor": "20000" }],
  "paid_minor": "100000"
}
```

- Leave out voided, reversed and rejected bills from `bills` and from `billed_quantity`.
- `paid_minor` is the total paid across the linked bills and receipts.

### 2. Purchase request detail (`GET /api/v1/purchase-requests/:id`)

Add `orders: [{ id, order_number, status, total_minor }]` for the orders made from this request.

### 3. List filters

- Add `?purchase_order_id=` to `GET /goods-receipts`.
- Add `?purchase_order_id=` and `?goods_receipt_id=` to `GET /supplier-bills`.

Both are useful elsewhere too.

### 4. Supplier bill detail

- **Per-line difference:** for each line, add `expected_unit_cost_minor` (from the receipt line, or failing that the order line) and `variance_minor`, so the page can show which lines differ. Today it shows one total.
- **Payments:** add `payments: [{ id, payment_date, amount_minor, reference, method }]`.

### 5. Activity

- **Bills:** add `events` (created, approved, disputed, paid, reversed, each with actor and note), in the same shape as `PurchaseOrderEvent`.
- **Actor names:** add `actor_name` to purchase order events and to purchase request decisions, so Activity can show "Approved by Sodiq".

### 6. Messages

- **Sender name:** when `postTeamDocumentMessage` gets no `sender_name`, use the workspace's business name instead of "Team". The supplier then sees who wrote.
- **Unread count:** add `unread_count` per document to `GET /documents/:docType/:id/messages`. It counts guest messages after the user's last read. Add `POST /documents/:docType/:id/messages/read` to mark them read.
  - Store the read position per user in a new `document_message_reads` table (`workspace_id`, `user_id`, `document_type`, `document_id`, `last_read_message_id`).
  - The web keeps this in the browser for now. Once the endpoint exists it will switch, so unread counts follow the user across devices.

### 7. Files on documents

Add a Files tab source. Let users attach evidence (a supplier invoice photo, a waybill) to a purchase order, goods receipt, bill or purchase, using the existing evidence storage (see `web/src/lib/evidence.ts` and its API).

- `GET /documents/:docType/:id/files`
- `POST /documents/:docType/:id/files` (with an evidence id)
- `DELETE /documents/:docType/:id/files/:fileId`

## Tests

- Integration tests for received, billed and returned quantities:
  - partial receipt
  - two receipts on one order
  - a voided bill left out
  - a return reduces the received quantity
- Workspace isolation on every new endpoint and filter.
- Messages: sender name defaults to the business name, and unread count resets after read.

## Then the web swap

In `procurement-detail-pages.tsx`, `PurchaseOrderDetailContent`:

- remove `receiptsQuery`, `billsQuery`, `receiptDetails` and `billDetails`
- read `order.receipts`, `order.bills` and the per-line quantities directly
- pass `paidMinor={order.paid_minor}` to `SummaryCard`

In `PurchaseRequestDetailContent`, use `req.orders` instead of the 200-order list.

In `document-chat.tsx`, replace the `localStorage` read position with `unread_count` and the read endpoint.
