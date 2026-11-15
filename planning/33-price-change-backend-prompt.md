# Prompt: dedicated price-change endpoints (backend)

Paste this to the backend agent. Follow `AGENT_RULES`, the existing products v2 code in
`implementation/api/internal/finance/products_v2_service.go` and
`product_options_v2_service.go`, and sqlc for every query.

## Why

The web app now has a **Change price** drawer (one product, with variants) and a
**Change prices** drawer (several ticked products, one rule). See
`implementation/web/src/components/features/products/product-price-drawer.tsx` and
`implementation/web/src/lib/price-change.ts`.

For now they save through endpoints that already exist:

- `PATCH /catalogue/products/:id` with the whole product payload rebuilt from the detail
- `PUT /catalogue/products/:id/options` with the whole option grid rebuilt from the detail
- the bulk drawer loops over products in the browser, one product at a time

That works, and price history is already recorded. It has three problems:

1. A price change resends every field. A stale tab could overwrite another person's edit.
2. Bulk changes are not atomic. If the tab closes halfway, some products change and others don't.
3. The options endpoint logs the event "Options changed" when only prices changed. History also doesn't record compare-at prices or which rule was used.

## Build

### 1. `POST /api/v1/catalogue/products/:id/prices`

Changes only the selling and compare-at prices of one product and its variants.

```json
{
  "idempotency_key": "…",
  "product": { "selling_price": "16500", "compare_at_price": "" },
  "variants": [
    { "id": 41, "selling_price": "18000", "compare_at_price": "20000" },
    { "id": 42, "selling_price": "16537.50" }
  ]
}
```

- `product` and `variants` are both optional, but at least one must be present. Leave anything not listed untouched.
- Prices are major-unit decimal strings. Parse them with `ParseMajorToMinor` and the product's exponent. **Accept any value with at most `exponent` decimals.** Odd prices such as 16,537.50 are valid. Never round on the server.
- A selling price must be zero or more.
- A compare-at price must be empty (which clears it) or above that row's new selling price. The error must name the variant, e.g. "Red / XL: the compare-at price must be above the selling price".
- Every variant id must belong to this product, must not be archived, and must not be the default variant. The product's own price lives on the default variant through `product`.
- Do everything in one transaction, scoped to the workspace, with idempotency like the other v2 writes.
- For each row whose selling price or compare-at changed, insert one `product_price_history` row. Write one product event `price_changed` with a plain summary, e.g. "Price changed on 3 variants" or "Price changed from ₦15,000 to ₦16,500".
- Return the updated `ProductDetail`.

### 2. `POST /api/v1/catalogue/products/prices/bulk`

```json
{
  "idempotency_key": "…",
  "product_ids": [3, 8, 12],
  "rule": { "direction": "increase", "by": "percent", "value": "10", "round": "" },
  "include_variants": true
}
```

- **`rule.by`:**
  - `"percent"`: the value has at most 2 decimals. A decrease must be under 100.
  - `"amount"`: major units in **each product's own currency**.
- **`round`:** `""` (exact, the default), `"10"`, `"50"`, `"100"` or `"500"` major units, rounding to the nearest step.
- **Maths:** match the web exactly, using integer minor units only.
  - percent: `new = (old × (10000 ± hundredths) + 5000) / 10000` (half up)
  - then round to the step if one is set
  - clamp at 0
- **What changes:** the product price (default variant), plus every non-archived option variant when `include_variants` is true.
- **Compare-at:** keep it only while it stays above the new price. Otherwise clear it.
- **Transaction:** use one transaction for the whole batch. If any product fails validation, save nothing and return the failures as `{ "failed": [{ "product_id": 8, "name": "…", "message": "…" }] }`. On success return `{ "updated_products": n, "updated_variants": m }`.
- **History:** write price history rows and a `price_changed` event per product. The summary names the rule, e.g. "Bulk change: +10%".
- **Limit:** at most 500 products per call.

### 3. Price history

- Add `old_compare_at_price_minor` and `new_compare_at_price_minor` (nullable) to `product_price_history`, in a new migration.
- Add a nullable `source` text column: `edit`, `quick_change`, `bulk_change`, `options`. Expose it in `ListProductPriceHistory`.
- Fill it from each write path.
- Return the changer's display name, if it is cheap to join.

### 4. Small fix

When `PUT /options` changed nothing but prices, it should log `price_changed` instead of "Options changed".

## Tests

- **Unit tests for the rule maths:**
  - 15,000 +10% gives 16,500
  - 16,537.50 exact stays as typed
  - 16,537 rounded to 50 gives 16,550
  - a 100% decrease is rejected
  - a decrease below zero clamps to 0
  - a JPY product (exponent 0)
- **Integration tests against Postgres:**
  - a single change writes history and an event, and leaves name, SKU, outlets and stock untouched
  - bulk rolls back fully when one product is invalid
  - compare-at is cleared when it falls below the new price
  - workspace isolation: another workspace's product id is rejected

## Then the web swap (small)

In `implementation/web/src/lib/products.ts`, add `changePrices(workspaceId, id, body, key)` and `bulkChangePrices(workspaceId, body, key)`. In `product-price-drawer.tsx`:

- `ChangePriceDrawer.save` makes one `changePrices` call instead of `saveOptions` plus `update`.
- `BulkPriceDrawer.run` makes one `bulkChangePrices` call instead of the per-product loop. Show `failed` in the existing "Not changed" list.

`productPricePayload` and `variantPricesPayload` in `price-change.ts` can then be deleted. Keep `applyRule`, because the preview still uses it.
