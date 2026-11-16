# Rekordly Project Todo List

## 1. Document Sharing & URL Shortener Service
- [ ] **Link Reuse (No Regenerating Every Time)**:
  - In `CreatePurchaseOrderShare`, check if an active, unexpired share link already exists for the given purchase order (`status = 'active'`, `expires_at > NOW()`).
  - If an active link exists, return the existing token instead of creating a brand new row/token each time the user clicks "Share" or "Issue to supplier".
  - Add optional `force_regenerate` parameter if the user explicitly wants to revoke and regenerate a new link.
- [ ] **Short URL Service (`/s/:code`)**:
  - Implement a lightweight internal short link service in the API (e.g. `short_links` table with `id`, `code` (6–8 char alphanumeric slug, e.g. `po-7x9k2`), `target_url`, `resource_type`, `resource_id`, `created_at`, `expires_at`, `click_count`, `last_clicked_at`).
  - Expose a clean public endpoint `/s/:code` that resolves the slug and performs an HTTP redirect or serves the shared document directly.
  - Generates compact, clean links (e.g. `rekord.ly/s/po-7x9k2` or `app.rekordly.com/s/po-7x9k2`) for WhatsApp, SMS, and email sharing.
  - Tracks basic click analytics (view count, timestamp of last view, referring agent).

---

## 2. Procurement & Purchasing Notifications
*Full detailed breakdown tracked in [NOTIFICATIONS_TODO.md](file:///c:/Users/Emperor/Documents/Code/rekordly/NOTIFICATIONS_TODO.md)*.
- [x] Supplier Acknowledged PO
- [x] Supplier Updated Prices / Requested Changes on PO
- [x] Supplier Declined PO
- [x] Supplier Sent Message on PO Portal
- [x] Supplier Claimed Merchant Link
- [ ] PO Submitted for Internal Approval
- [ ] PO Approved Internally
- [ ] PO Expected Delivery Due / Overdue
- [ ] Supplier Linked Account Auto-Delivery
- [ ] Purchase Requests Submitted & Approvals
- [ ] Goods Received into Stock & PO Variance
- [ ] Supplier Bills & Payments

---

## 3. End-to-End Procurement Flow (Next Review)
- [ ] Complete end-to-end integration across Purchase Requests $\rightarrow$ Purchase Orders $\rightarrow$ Goods Receipts / Procurement $\rightarrow$ Supplier Bills.
