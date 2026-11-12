# Accounting & Stock Reconciliation Evidence

- **Golden Money Fixtures (`GF-M1`, `GF-M2`)**: Verified NGN kobo precision (`"9999999999.99"` -> `999999999999` minor units), discount-before-VAT calculation (`2,700,000 + 202,500 = 2,902,500`), and exact debit == credit balance.
- **Golden Inventory Fixtures (`GF-INV-FIFO`, `GF-INV-WA`)**: Verified FIFO (`COGS 640,000`, `Remaining 560,000`) and Weighted-Average (`COGS 720,000`, `Remaining 480,000`) conservation of value.
- **Admin Reconciliation (`POST /v1/admin/ops/reconcile`)**: Verified zero unbalanced posted journals (`unbalanced_journals_count = 0`).
