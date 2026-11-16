# Notifications Todo List (Products, Inventory, Purchases, Procurement, Bills & POs)

This checklist tracks all in-app, email, and WhatsApp-handoff notifications across the **Catalogue, Inventory, and Procurement/Purchasing** modules.

---

## 1. Purchase Orders (`/purchase-orders` & `/purchase-orders/share/[token]`)
- [x] **Supplier Acknowledged PO**: Notify buyer workspace in-app when supplier acknowledges a shared PO (`/purchase-orders/[id]`).
- [x] **Supplier Updated Prices / Requested Changes on PO**: Notify buyer workspace in-app when supplier updates unit prices or quantities or requests a change on `/purchase-orders/share/[token]`.
- [x] **Supplier Declined PO**: Notify buyer workspace in-app when supplier declines a shared PO.
- [x] **Supplier Sent Message on PO Portal**: Notify buyer workspace in-app when supplier posts a message on `/purchase-orders/share/[token]`.
- [x] **Supplier Claimed Merchant Link**: Notify buyer workspace in-app when supplier links their Rekordly account via `/purchase-orders/share/[token]`.
- [ ] **PO Submitted for Internal Approval**: Notify workspace owner/approvers when a staff member submits a draft PO (`status = submitted`).
- [ ] **PO Approved Internally**: Notify the PO creator when an admin approves the PO so it can be issued to the supplier.
- [ ] **PO Expected Delivery Due / Overdue**: Daily reminder when an issued/acknowledged PO passes its `expected_date` without a Goods Receipt.
- [ ] **Supplier Linked Account Auto-Delivery**: When a supplier has claimed a merchant link (`external_party_links`), automatically push newly issued POs into the supplier's Rekordly inbox.

---

## 2. Purchase Requests (`/purchase-requests`)
- [ ] **Request Submitted for Approval**: Notify workspace owner/admin when a staff member submits a Purchase Request (`urgent` / `high` priority highlighted).
- [ ] **Request Approved / Rejected**: Notify the requesting staff member when their Purchase Request is approved or rejected.
- [ ] **Approved Request Needed-By Reminder**: Notify procurement team when an approved request is approaching its `needed_by` date without a PO or Goods Receipt.

---

## 3. Procurement / Goods Receipts (`/procurement`)
- [ ] **Goods Received into Stock**: Notify workspace owner / accountant when a new Goods Receipt is recorded (especially when received against a PO).
- [ ] **PO vs. Receipt Quantity or Price Variance**: Notify workspace owner when accepted quantity, rejected quantity, or actual unit cost on a Goods Receipt differs from the Purchase Order.
- [ ] **Unbilled Goods Receipt (GRNI Aging) Reminder**: Notify finance/owner when a Goods Receipt has been in stock for $>7$ days without a Supplier Bill or payment recorded.
- [ ] **Stock Returned to Supplier**: Notify finance/owner when a Supplier Return (`createSupplierReturn`) is recorded against a Goods Receipt so a supplier credit/refund can be tracked.

---

## 4. Supplier Bills (`/bills`)
- [ ] **Supplier Sends Bill to Merchant (Connected Supplier $\rightarrow$ Buyer)**: Allow a connected supplier (who claimed the merchant link) to submit their invoice/bill directly from the PO portal so the merchant receives an in-app notification (*"New bill received from {Supplier}"*) and can approve or convert it to a Goods Receipt.
- [ ] **Bill Recorded with Price Variance**: Notify workspace owner/approver when a Supplier Bill has a `variance_minor != 0` requiring variance approval.
- [ ] **Bill Due Soon / Overdue Alert**: Notify workspace owner 3 days before a Supplier Bill's `due_date` and on the day it becomes `overdue`.
- [ ] **Bill Payment Recorded**: Notify procurement/finance team (and connected supplier) when full or partial payment is recorded against a Supplier Bill.

---

## 5. Direct Purchases (`/purchases`)
- [ ] **Credit / Partially Paid Purchase Due**: Notify workspace owner when an unpaid or partially paid direct purchase remains unsettled after 7 days.
- [ ] **Large Purchase Recorded**: Notify workspace owner when a staff member records a direct purchase above the workspace approval threshold.

---

## 6. Products & Inventory (`/products`, `/inventory`)
- [ ] **Low Stock Alert (Reorder Threshold)**: Notify workspace owner / inventory manager when a stock-tracked product or variant's `available_quantity` drops at or below its `low_stock_threshold` (with a one-click action to **Create Purchase Request** or **Create PO**).
- [ ] **Out of Stock Alert (`0` Available)**: High-priority alert when a sellable product/variant reaches `0` available stock at an outlet.
- [ ] **Batch Expiry Warning**: Notify inventory manager 30 days and 7 days before a received batch (`expiry_date` on `goods_receipt_lines`) expires.
- [ ] **Stock Count Variance Detected**: Notify workspace owner when a Stock Count (`stock_counts`) is completed with a negative or positive `variance_quantity`.
- [ ] **Stock Transfer Dispatched / Received**: Notify destination outlet manager when a Stock Transfer (`stock_transfers`) is dispatched to their location, and notify sender when received.
- [ ] **Selling Price Below Effective Landed Cost Warning**: Notify workspace owner when a new Procurement Receipt with extra/transport costs (`effective_unit_cost_minor`) pushes a product's unit cost above its current selling price.
