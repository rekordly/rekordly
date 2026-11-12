# Accountant & Bookkeeper Synthetic Review

- **Fixtures Reviewed**: Synthetic NGN Personal (`GF-M1`, `GF-M2`) and Business FIFO/Weighted-Average (`GF-INV-FIFO`, `GF-INV-WA`) golden datasets.
- **Checks**:
  - Double-entry debit/credit balance invariant holds across all posted journals.
  - Personal vs Business books remain strictly separate; owner contributions/drawings map to equity, not revenue/expense.
  - VAT (`7.5%`) and discount ordering produce exact minor-unit kobo totals without floating-point rounding.
- **Status**: Approved for synthetic controlled-beta cohort (`controlled_beta`).
