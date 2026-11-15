# Prompt for Codex: product options, variants and per-variant stock

Paste everything below the line into Codex.

---

You are working in the Rekordly V2 repository on the branch `feat/ui-redesign-and-products`. The last good commit is `f65f2f7` (stock follows sales, invoices and purchases; product Stock tab). Start a new branch from it, for example `feat/product-variants-stock`, and do not push or merge.

## Read these first, and follow them over anything below if they conflict

1. `AGENT_RULES.md` (repo root): the project rules. Key ones:
   - money is never a float: minor units (int64 / BigInt) or decimal strings
   - every query is scoped by `workspace_id`
   - writes take an idempotency key
   - approved packages only (ask before adding any npm package or Go module)
   - planning documents go only in `/planning`
2. `implementation/web/AGENTS.md`: this is Next.js 16. Read the guide in `node_modules/next/dist/docs/` before writing routing or server code. Route `params` are a Promise.
3. `planning/design-system-selection-components.md`: the design system for pickers and selects.
4. Look at these files to copy the existing patterns, look and wording:
   - `implementation/web/src/components/features/products/product-form-page.tsx`: the 3-step product form (Basics, Store details, Stock & availability) with a live preview
   - `implementation/web/src/components/features/products/product-detail-page.tsx`: the product page with tabs (Overview, Variants, Stock, Price history, History)
   - `implementation/web/src/components/features/products/product-stock.tsx`: the Stock tab (Add, Remove, Move, Count, stock history)
   - `implementation/web/src/components/features/products/inventory-overview.tsx`: Inventory (stock levels, Count stock, Outlets)
   - `implementation/web/src/components/pickers/line-items-field.tsx`: the item picker used by sales, purchases and invoices (`context` = invoice | sale | purchase)
   - `implementation/web/src/components/ui/form-kit.tsx`: FormPage, FormSection, FormGrid, ChoiceCards, ChipMultiSelect, StepNav, PickerDrawer
   - `implementation/web/src/components/ui/data-view.tsx`: table on large screens, cards on small screens (`columns` and `renderCard`)
   - `implementation/web/src/components/ui/form-drawer.tsx`, `app-select.tsx`, `filter-dropdown.tsx`, `money-input.tsx`
   - `implementation/api/internal/finance/stock_moves.go`, `stock_records.go`, `product_stock_handler.go`, `products_v2_service.go`, `products_v2_handler.go`
   - `implementation/api/migrations/000029_product_variants_and_options.sql`, `000059_stock_from_sales_purchases.sql`

## Design rules to keep

- **Stack:** HeroUI v3 components, Tailwind v4 tokens (`bg-surface`, `border-border`, `text-muted`, `bg-primary-soft`, and so on), phosphor outline icons, Urbanist font. Never hard-code colours. Light and dark mode must both work.
- **Layout:** lists show a table on large screens and cards on small screens, through `DataView`. Small forms open in `FormDrawer` (a modal on desktop, a bottom sheet on phones). Large records are full pages built with `FormPage`.
- **Reuse:** use the shared pickers in `components/pickers` and the pieces in `form-kit`. Don't create a second version of something that already exists.
- **Selects:** show only the chosen label in the closed field. Descriptions appear only in the open list.
- **Wording:** plain, short, friendly English for small Nigerian businesses. "Product" everywhere (not "item" or "catalogue"). Error messages say what to do, for example "Only 4 Red / M left in Main outlet. Add stock first, or lower the quantity."
- **Motion:** use the existing animation classes (`animate-fade-up`, `animate-pop`) and respect reduced motion.
- **Accessibility:** every input has a label, and every icon button has an `aria-label`.

## Backend rules to keep

- **Database:** sqlc for all queries. Regenerate with `docker run --rm -v "<api dir>":/src -w /src sqlc/sqlc:1.31.1 generate`. No ORM.
- **Migrations:** add a new file `implementation/api/migrations/000060_variant_stock.sql`. Never edit an old migration. Plain SQL; there is no down file.
- **Money:** int64 minor units in Go. Major-unit strings in JSON input, parsed with `ParseMajorToMinor`. Quantities use `shopspring/decimal`.
- **Stock moves:** keep the weighted-average cost and the balanced ledger posting from `stock_moves.go`. Every stock change writes an `inventory_movements` row.
- **Tests:** run them in Docker with the module cache:
  `docker run --rm -v "<api dir>":/src -v rekordly-gomod:/go/pkg/mod -w /src golang:1.22-alpine go test ./internal/finance/ -skip TestBP19_G0`
  The integration tests need `DATABASE_URL` and run on the `rekordly-postgres` container's network. `stock_from_records_integration_test.go` is the model to follow.
- **Rebuild:** `docker compose up -d --build rekordly-api` from `implementation/`. This also runs the migrations.

## What exists today (the problem)

- Tables `product_options`, `product_option_values` and `variant_option_values` exist, but the "New variant" form only asks for a free-text name. Variants aren't built from option values.
- Stock is counted per product, not per variant: `inventory_balances` is unique on `(workspace_id, location_id, product_id)`. Rekordly can say "Ankara shirt: 20" but not "Red / M: 6".
- The sale, invoice and purchase item picker picks a product, never a variant, so the price comes from the product.
- Every product has one default variant (`products.default_variant_id`, named "Default").

## Goal

A product can have options, such as Colour (Red, Blue) and Size (S, M, L). Rekordly builds every combination as a variant. Each variant has its own price, cost, SKU, barcode and **stock**. The product's stock is the sum of its variants. Selling, buying and adjusting stock happen on a specific variant.

## Experience to build

### Product form (add and edit), in the Basics step

1. Add a switch: "This product comes in different sizes, colours or types". When it's off, the product works exactly as today (one default variant).
2. When it's on, show an **Options** section:
   - each option has a name (with suggestions: Size, Colour, Material, Style) and values entered as chips (type, then Enter)
   - up to 3 options and 30 values per option
   - options and values can be renamed and reordered
3. **The variants table is generated automatically**: one row per combination, named from the values ("Red / M").
   - Columns: Variant, Price, Cost, Compare-at, Stock (opening stock, new products only), SKU, Barcode, On/Off.
   - A **"Set for all"** control fills the price, cost or compare-at into every row.
   - SKUs are automatic: the product SKU plus a short code for each value (for example `ANKSHI-RED-M`), unique per workspace. They can still be edited.
   - A combination you don't sell is turned off. It's saved as an inactive variant, not deleted.
   - Table on large screens, cards on small screens.
4. **Editing:**
   - adding a value adds the missing combinations as new rows to fill in
   - removing a value archives the affected variants if they have stock or past sales, and deletes them only if they've never been used
   - the form explains this before saving
5. The live preview shows the price range ("From ₦15,000") when variant prices differ.

### Product page

- **Overview and tiles:** stock shows the total, with "across 9 variants". The price shows a range when variant prices differ.
- **Variants tab:** a read and edit table of variants, showing their option values, price, cost, SKU, stock and status. Remove the old free-text "New variant" drawer. Variants now only come from options; "Edit options" opens the product form at the options section.
- **Stock tab:**
  - per-variant stock by outlet, with the product total on top
  - Add, Remove, Move and Count ask "Which variant?" first. Skip this question when there's only the default variant.
  - the stock history line shows the variant ("Sold · Red / M · Walk-in customer")

### Selling, buying and invoicing (`line-items-field.tsx`)

- Picking a product that has variants opens a second step in the same drawer, "Which one?". It lists the active variants with their price (cost for purchases) and stock. Choosing one adds the line with `variant_id`, using the variant's price. The line reads "Ankara shirt · Red / M".
- Products without variants behave as today.
- The stock warning in the item form uses the variant's stock.

### Inventory

- **Stock levels:** one row per product, expandable or with a "variants" hint, showing the total. The variant breakdown is on the product page.
- **Count stock:** lists variants (product name plus variant name) for products that have them.
- **Product import and export:** one row per variant, with columns `option1_name, option1_value, option2_name, option2_value, option3_name, option3_value`. Rows with the same product name are grouped into one product.

## Backend to build

1. **Migration `000060_variant_stock.sql`:**
   - `inventory_balances.variant_id` (NOT NULL after backfill), unique on `(workspace_id, location_id, variant_id)`. Backfill every existing balance to its product's default variant. Keep `product_id` for totals.
   - make sure `inventory_movements.variant_id` is filled for new movements, and backfill old ones to the default variant
   - `product_variants`: add `is_default`, `position` and `archived_at` if they're missing, and a unique `upper(sku)` per workspace (some of this may already exist; check first)
   - keep `variant_option_values` as the link between variants and values
2. **Service:**
   - `SaveProductOptions(product, options, variants)`: within one transaction, upsert the options and values, create or update or archive the variants, bind the option values, generate SKUs, and record a product event ("Options changed: added Colour Yellow"). Price changes per variant go to price history with the variant name.
   - stock functions in `stock_moves.go` (`issueStockTx`, `receiveStockTx`, `returnIssuedStockTx`) take a `variantID`. Balances are found by variant. A product with options must have a variant on every sale, purchase, invoice and stock change; reply with a plain error if it's missing. A product without options uses its default variant automatically.
   - product totals (`ListProductsV2`, product detail) sum across variants. Product detail returns the variants with their option values and their stock by outlet.
   - `ChangeProductStock` and the stock history take or return the variant.
3. **API:**
   - `PUT /catalogue/products/:id/options` saves options and variants together (idempotent)
   - include `variants[]` with `option_values` in `GET /catalogue/products/:id`
   - the sale, purchase and invoice item inputs already accept `variant_id`; make it required when the product has options
4. **Tests:** add an integration test that:
   - creates a product with Colour × Size and sets per-variant stock
   - sells one variant and checks only that variant drops and the product total updates
   - buys into another variant
   - checks that selling a product with options but no `variant_id` is refused
   - adds a value and checks the new combinations appear
   - removes a value with stock and checks the variant is archived, not deleted
   - checks every ledger entry balances

   Existing tests must keep passing.

## Done means

- `go vet` passes, and the finance tests pass, including the integration tests against the local database.
- From `implementation/web`: `npx tsc --noEmit` passes, `npx eslint src` has no errors, `npm test` passes, and `npx next build` succeeds.
- It works in the browser, in light and dark mode and at phone width. Check:
  - creating a product with options and stock
  - editing options
  - selling a variant from a sale and from an invoice
  - buying a variant
  - Add, Remove and Count on a variant
  - the Inventory totals
- Existing products without options behave exactly as before.
- Small commits with clear messages. Don't commit `implementation/api/cmd/seed-emperor/`.

## Don't

- Don't add packages without asking.
- Don't change the shell, cards, colours or fonts.
- Don't remove the procurement flow (purchase orders and goods receipts). Update it to carry `variant_id` if it needs to compile.
- Don't store money as floats, and don't drop workspace scoping.
- Don't delete variants that have stock or history.
