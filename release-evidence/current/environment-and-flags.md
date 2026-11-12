# Environment & Module Enablement Matrix

| Module | Status | Server Enforcement |
|---|---|---|
| Core Identity, Workspaces, Exports, Deletion | **Enabled** | Auth + RBAC + Recent Auth (`bp16`) |
| Personal Finance (Accounts, Budgets, Loans, Assets, Investments) | **Enabled** | Personal workspace isolation + entitlements |
| AI Capture & CSV Imports | **Enabled** | Draft-only; `ai.capture.enabled` kill switch |
| Sales, Invoices, Payments & Allocations | **Enabled** | Balanced double-entry + period locks |
| Inventory & Procurement | **Enabled** | `business.inventory.enabled` / `business.procurement.enabled` |
| Storefront & Custom Domains | **Enabled** | Public host isolation + `storefront.public_orders.enabled` |
| Offline Cached Read & Drafts | **Enabled** | `REKORDLY_OFFLINE_MAX_MODE=draft_only` |
| Offline Queued Financial Confirmations | **Disabled** | `offline.queued_writes.enabled=false` (Blueprint 15 §71 gate) |
| Paid Paystack Live Billing | **Disabled** | `COMMERCIAL_MODE=controlled_beta` & `billing.paid_checkout.enabled=false` |
