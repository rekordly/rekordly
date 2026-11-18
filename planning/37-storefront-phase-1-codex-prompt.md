# Codex prompt: Storefront Phase 1 (simple themes, customise screen, one catalogue, Store area)

Paste everything below the line into Codex. The background is in `planning/36-storefront-themes-and-settings-plan.md`, which has the plan and the decisions already made.

---

You are working on Rekordly V2, a bookkeeping, stock and sales app for Nigerian small businesses.

- **API:** Go, Gin, pgx and sqlc, in `implementation/api`.
- **Web:** Next.js 16, HeroUI v3 and Tailwind v4, in `implementation/web`.
- **Rules:** read `AGENT_RULES.md` first. It overrides everything here.
- **The plan:** read `planning/36-storefront-themes-and-settings-plan.md` (sections 3–8 and 10 Phase 1). This prompt is Phase 1 of that plan, as a full vertical slice: database → API → UI.

## The goal in one sentence

A merchant opens **Store**, picks one of 2 free themes, sets **logo, name, colour and style**, switches on the sections they want (each with 4 fields at most, in a drawer), sees the real store update live beside the settings, and presses **Publish**. Their products are **already on the store** because the store uses the product catalogue directly.

## What exists today (read these files before changing anything)

- **Admin page:** `web/src/components/features/store/storefront-admin-page.tsx`.
  - It has 6 tabs: overview, appearance, catalogue, orders, domains and analytics.
  - `AppearanceAndPolicyForm` is the 20-field form to replace. It has 4 hex inputs, a font select, and policies as single-line inputs.
- **Drawers:** `web/src/components/features/store/storefront-admin-drawers.tsx`.
  - `PublishVariantDrawer` copies product fields to remove.
  - `MerchantOrderDetailDrawer` stays.
- **Public store:**
  - `web/src/app/s/[slug]/page.tsx`
  - `web/src/components/features/store/public-storefront-client.tsx`: one layout that only uses `primary_color`
  - `public-order-status-client.tsx`
- **API:** `api/internal/finance/storefront_*.go`, queries in `api/sqlc/queries/finance_storefront.sql`, tables in `api/migrations/000048_blueprint_09_storefront.sql`:
  - `storefronts`, with `theme_key` restricted to classic, modern, editorial and minimal, and a `version`
  - `storefront_settings`: a flat table of colours, font, policies, `section_order` and so on
  - `storefront_collections` (a duplicate of `product_collections` from migration 000058)
  - `storefront_products`, one row per variant, with **copied** fields: `public_title`, `public_description`, `image_urls`, `public_price_minor`, `availability_policy`, …
- **Rows that must keep working:** `storefront_cart_lines.storefront_product_id` and `storefront_order_lines.storefront_product_id` reference `storefront_products(id)`. **Keep that table and its ids**, because existing carts and orders depend on them.
- **Navigation:** `web/src/components/layout/navigation.ts`. Store sits under **Operations → Storefront** (`/store`).
- **Permissions:** `storefront.view`, `storefront.manage_appearance`, `storefront.manage_catalogue`, `storefront.manage_checkout`, `storefront.manage_domain`, `storefront.publish`. Use these and don't invent new ones.
- **Shared UI to reuse:**
  - `components/ui/side-sheet.tsx`: a right drawer on desktop and a bottom sheet on phones
  - `components/ui/app-switch.tsx`
  - `components/ui/app-input.tsx`, `money-input.tsx` and `app-textarea.tsx`
  - `components/ui/rich-text-editor.tsx` (Tiptap)
  - `components/ui/data-view.tsx`
  - `components/ui/page.tsx` (`Segmented`, `StatusPill`, `PageHeader`)
  - `components/ui/cards` (`KpiCard`) and `KpiRow` (from `features/finance/dashboard-parts.tsx`)
  - `AppRowActions` (the ⋮ menu)
  - `features/finance/document-page.tsx` (`DocumentShell`, `ItemsTable`, `StatusTimeline`, `ActivityCard`), for the order detail page
- **Images:** product images upload through `uploadProductImage` in `web/src/lib/products.ts`. Reuse it for the logo and banner.

## Ground rules

1. **sqlc for every query.** Regenerate with:
   `docker run --rm --network none -v "<api dir>:/src" -w /src sqlc/sqlc:1.31.1 generate`
   Never hand-edit `internal/db`.
2. **Migrations:** start at the next free number after the latest file in `api/migrations` (currently `000063_…`, so the next is `000064_…`). Only add: never edit old migrations, and never drop a column that existing rows or orders still read.
3. **Money:** minor units, sent as strings. Use `ParseMajorToMinor` for typed amounts. Never use floats.
4. **Every query filters by `workspace_id`.** Public endpoints resolve the store by slug or host and only return published data.
5. **Idempotency** on every write, the same way as the other v2 writes.
6. **One request per page.** The Customise screen loads with **one** GET, and so do Store → Products and Store → Settings. A button sends **one** request that saves fully or not at all.
7. **Plain words:** in UI text and error messages, write things a shop owner understands. No "slug", "hex", "SEO" or "font family" in the UI.
8. **Shared components only.** No new npm packages. Every drawer is a `SideSheet`, every switch an `AppSwitch`, and every money field a `MoneyInput`.
9. **Phones first.** Nothing scrolls sideways at 375px wide. Tables become cards on phones (`DataView` `renderCard`).
10. **Checks:**
    - Go: `docker run --rm --network none -v "<api dir>:/src" -v rekordly-gomod:/go/pkg/mod -e GOPROXY=off -e GOFLAGS=-mod=mod -w /src golang:1.22-alpine sh -c "gofmt -l ./internal/finance/; go build ./... && go vet ./internal/finance/ && go test ./internal/finance/..."`
    - Integration tests: use `DATABASE_URL` on the `rekordly-postgres` network. Follow `internal/finance/blueprint_09_storefront_integration_test.go`.
    - Web: `npx tsc --noEmit` and `npx eslint <changed files>` in `implementation/web`.
11. **Commits:** one per section below, in the existing style (`feat(store): …`). Never commit `implementation/api/cmd/seed-emperor/`.

---

## Section 1: themes as code, with a manifest

Create `web/src/lib/store-themes/`:

- **`types.ts`:**
  - `ThemeManifest`: `key`, `name`, `description`, `bestFor`, `price: "free" | { minor: string }`, `palettes`, `fontStyles`, `sections` (per section key: allowed `fields` and any limits), `defaultSections` (an ordered list).
  - `ThemeSettings`: the saved content (below).
- **`palettes.ts`:** 6 named palettes: `green`, `ink`, `ocean`, `sunset`, `rose`, `earth`. Each has `primary`, `accent`, `background`, `surface`, `text` and `muted`, all checked for WCAG AA contrast (text on background, and white on primary).
  - Add `paletteFromColor(hex)`, which builds a full palette from one custom brand colour.
- **`font-styles.ts`:** 3 styles, each a tested pairing that loads through `next/font/google`, which is already in the project:
  - `modern`: Inter / Inter
  - `classic`: Merriweather headings / Inter body
  - `friendly`: Plus Jakarta Sans / Plus Jakarta Sans
- **Two free themes**, each a folder with a `manifest.ts` and the React sections it renders:
  - **`simple`:** the default. A clean grid for any shop, with a compact header, a single banner and a product grid of 2 columns on phones and 4 on desktop.
  - **`boutique`:** image-led. A full-width banner with up to 3 slides, collection tiles, larger product cards, and a centred header with the logo.
- **Supported sections:**

  | Section | Fields (4 at most) | Notes |
  |---|---|---|
  | `announcement` | `text`, `link` | A thin bar at the top. Off by default. |
  | `hero` | `image`, `heading`, `subheading`, `button_label` | The button goes to all products. `boutique` allows up to 3 slides. |
  | `product_grid` | `title`, `source` (`new` / `best_sellers` / `featured` / `collection`), `collection_id`, `limit` | It can appear more than once. |
  | `collections` | `collection_ids` | Collection tiles with images. |
  | `about` | `heading`, `body` (rich text), `image` | |
  | `faq` | `items` (question and answer pairs, at most 10) | |
  | `contact` | none | Uses the store details: phone, WhatsApp, address and hours. Adds a floating WhatsApp button when a WhatsApp number is set. |

- **Theme switching:** it keeps all section content. Sections the new theme doesn't support are hidden, not deleted.
- **One renderer for both screens:** both themes render from the **same** data shape. The public page and the live preview use the **same components**.

## Section 2: database and API for design

**Migration:**
- **`storefronts.theme_key`:** drop the four-value check. It becomes free text, validated in Go against the theme keys the store may use. In Phase 1 those are `simple` and `boutique`. Map old values: `classic`, `minimal` and `modern` → `simple`; `editorial` → `boutique`.
- **`storefront_settings` gets new columns:**
  - `brand jsonb` (`logo_url`, `palette`, `custom_color`, `font_style`)
  - `sections jsonb` (an ordered array of `{ id, type, enabled, content }`)
  - `draft_theme_key text`, `draft_brand jsonb`, `draft_sections jsonb`
  - `published_at timestamptz`
- **Backfill** `brand` and `sections` from the old columns: logo, banner, tagline, description and `section_order`. The old colour and font columns stay but are no longer written.

**Endpoints:**
- **`GET /api/v1/storefront/design`** returns everything the Customise screen needs in one response:
  - published and draft theme key, brand and sections
  - the store name and link
  - store details used by the `contact` section
  - `available_themes` (key, name, free or owned)
  - `has_unpublished_changes`
- **`PUT /api/v1/storefront/design/draft`:** `{ theme_key, name, brand, sections, expected_version, idempotency_key }`.
  - **Validate:**
    - the theme is allowed
    - every section type and field is allowed by the theme's manifest (keep a small Go copy of the allowed keys per theme, in sync with the web manifests)
    - text length limits
    - rich text cleaned by the existing `rich_text.go` sanitiser
    - image URLs only from the upload host the product images use
  - **Saves the draft only.** Nothing changes on the live store.
- **`POST /api/v1/storefront/design/publish`:** `{ expected_version, idempotency_key }`. It copies the draft to the published copy, bumps `version`, sets `published_at`, and writes a storefront event. It needs `storefront.publish`.
- **`POST /api/v1/storefront/design/discard`:** resets the draft to the published copy.
- **Public store data:** `GET /public/storefronts/:slug` and `by-host` return the **published** theme key, brand (with the resolved palette colours and font style) and enabled sections in order. They never return the draft.
- **Preview:** the preview must show the draft without making it public. Add `GET /api/v1/storefront/design/preview-data`, which needs merchant auth and returns the same shape as the public store payload, built from the draft. The live preview in Section 4 renders from it.

## Section 3: one catalogue (the store uses products directly)

**Migration:**
- **`products.show_on_store boolean not null default true`.** Backfill it as true where the product already has a published `storefront_products` row, and as true for all other active products. New products default to true.
- **Store setting `auto_show_new_products boolean default true`** on `storefront_settings`. When it's false, new products are created with `show_on_store = false`.
- **`product_collections`** gets `show_on_store boolean default true` and `image_url text`. **Migrate** every `storefront_collections` row into `product_collections`, matching by name within the workspace and creating the collection if it's missing. Move the product links (`storefront_products.collection_id` → the product's collection link). Keep the old table for now, but stop reading and writing it.
- **`storefront_products` becomes a thin link:**
  - Keep the row per variant, so carts and orders keep their ids.
  - It's kept in sync **automatically**: a row exists for every non-archived variant of every product with `show_on_store = true`.
  - `is_published` mirrors `show_on_store` and the variant's active flag.
  - Keep `is_featured` and `position`.
  - Make the copied columns nullable and **stop writing them**: `public_title`, `public_description`, `public_sku`, `image_urls`, `public_price_minor`, `availability_policy`, `low_stock_threshold`, `max_qty_per_order`, `contact_only`, `seo_*`.
  - Sync in the same transaction as product create and update, the options save, archive and restore, and the `show_on_store` change.

**Public reads** (store page, product page, cart validate, checkout) take name, description, images, price, variants and options **from the product and variant tables**, not the copied columns.
- **Price:** always the variant's selling price. **One price only:** no online price override.
- **Stock and availability** come from the store-level settings in Section 5 and the real stock. Cart validation and checkout keep using the existing stock reservation logic.
- **Shoppers pick variants by option:** for example Size: S M L, Colour: Red Blue, as buttons. A combination that's off or out of stock is shown greyed out.

**Merchant endpoints:**
- **`GET /api/v1/storefront/products`:** one request. Every non-archived product with `id`, `name`, first image, `price_minor`, `variant_count`, `in_stock`, `show_on_store`, `is_featured`, `collection_ids`, and paging (`limit`, `before_id`).
- **`PATCH /api/v1/storefront/products/:productId`:** `{ show_on_store?, is_featured?, collection_ids?, idempotency_key }`.
- **`POST /api/v1/storefront/products/bulk`:** `{ product_ids, show_on_store?, is_featured?, idempotency_key }`, in one transaction.
- **Retire:** `PUT /storefront/catalogue/:variantId`, and `POST /storefront/collections` (collections are managed on the Products page). Keep the routes, returning 410 Gone with a plain message, until the web no longer calls them.

## Section 4: Store area UI

**Navigation** (`navigation.ts`): make **Store** its own group, with its own icon, out of Operations, with these children:
- Overview `/store`
- Orders `/store/orders`
- Products `/store/products`
- Design `/store/design`
- Settings `/store/settings`

Keep `storefront.view` on the group. Remove "Storefront" from Operations.

**Store → Overview (`/store`).**
- **Header:** the store's link with Copy and Open buttons, a status pill (Live, Draft or Unpublished), and Publish or Unpublish.
- **`KpiRow`:** 4 cards from today's analytics endpoint: page views, add to carts, orders confirmed, and conversion (orders ÷ views). Charts are Phase 2.
- **"Needs action":** counts of orders to confirm, pack and deliver, each linking to Orders with a filter.
- **First visit:** if no store exists yet, show a friendly 3-step setup instead: choose a theme → brand → publish. It creates the store with `simple` and the `green` palette, using the business name.

**Store → Orders (`/store/orders`).**
- **List:** move the existing orders list here, using `DataView` with filters (status, date).
- **Order detail:** the existing order detail drawer becomes a page at `/store/orders/[id]`, using `DocumentShell`:
  - a `StatusTimeline` (placed → confirmed → packed → delivered)
  - an `ItemsTable`
  - customer details in a `DetailsPanel`
  - messages through `DocumentChat` (make it accept load and send functions if it doesn't yet)
  - actions: Confirm, Request change, Mark packed, Mark delivered, Return, Cancel, with one primary button and the rest behind ⋮

  Keep the same API calls as `MerchantOrderDetailDrawer` today.

**Store → Products (`/store/products`).**
- **One `DataView`:** image and name, price, stock, an **On store** `AppSwitch`, a ★ featured toggle, and collections.
- **Filters:** On store / Hidden / Out of stock, plus collection.
- **Bulk:** select rows → "Show on store", "Hide from store", "Feature".
- **Empty state:** links to Products → Add product.
- **Remove:** the old per-variant publish drawer (`PublishVariantDrawer`).

**Product form** (`web/src/components/features/products/product-form-page.tsx`, the "Store details" step): add an **"Show on my online store"** `AppSwitch` next to the outlets. On a new product it defaults to the store's `auto_show_new_products` setting. Save it in the existing single product save request.

**Products page collections** (`product-collections.tsx`): add "Show on store" and an optional image to the collection drawer.

**Store → Design (`/store/design`): the main screen.**
- **Theme cards:** a thumbnail of each available theme with its name and "Best for…", a **Current** badge on the active one, and **Use this theme**. Changing theme only changes the draft.
- **Customise** opens the editor:

  ```
  Desktop:  [ settings panel 380px | live preview (Desktop / Phone toggle) ]
  Phone:    settings full width, a "Preview" button opens the preview full screen
  ```

- **Settings panel, top to bottom:**
  1. **Brand:**
     - Logo upload (`uploadProductImage`)
     - Store name
     - **Colour:** 6 palette swatches plus a "+" custom colour picker (a native `<input type="color">` styled as a swatch is fine)
     - **Style:** a `Segmented` control with Modern, Classic and Friendly, which shows a small "Aa" sample
  2. **Sections:**
     - Each row has a drag handle, the section name, an `AppSwitch`, and a **›** that opens its drawer.
     - Drag to reorder: keyboard accessible, using up and down buttons on phones. No new drag-and-drop package.
     - "Add section" adds another `product_grid` or `collections`.
     - Each drawer is a `SideSheet` with that section's fields (4 at most) and Cancel / Done.
- **Footer:** "All changes saved" while the draft autosaves (debounced at 800 ms, sent as one `PUT …/draft`), plus **Discard changes** and a primary **Publish** button. The button shows "Publish changes" when there are unpublished changes, and is disabled when there are none.
- **Live preview:** renders the real theme components from `preview-data` plus the unsaved local edits, so it updates as the merchant types. The Desktop / Phone switch changes the preview width (the phone view is 390px wide). Clicking a section in the preview opens its drawer.
- **First time:** sections are pre-filled with friendly sample text that uses the business name. For example, hero: "Welcome to {name}", "Quality products, delivered to you". The store never looks empty.

**Store → Settings (`/store/settings`).** One page of cards. Each card shows a one-line summary and an **Edit** button that opens a `SideSheet`:

| Card | Summary example | Drawer fields |
|---|---|---|
| Store details | "Ade Stores · ade.rekordly.shop" | Name; store link (`name` + `.rekordly.shop`, checked for availability); phone; WhatsApp; email; address; opening hours |
| Delivery | "Pick up free · Delivery ₦2,000" | Pick-up on/off with address; one delivery fee (`MoneyInput`) and a delivery note. Delivery areas are Phase 2. |
| Payments & checkout | "Pay online, bank transfer" | The payment methods the API already supports; require phone or email (existing `checkout_require_*`); hold items in carts for N hours (existing `reservation_ttl_hours`) |
| What shoppers see | "Sold-out shown · stock count hidden" | Show sold-out items (on); show how many are left (off); "Only X left" from a number (3); show new products automatically (on) |
| Policies | "Returns, Terms" | Returns, Terms, Privacy and Delivery policy, each in `rich-text-editor` and **pre-filled with a plain template** the merchant can edit. Saved cleaned. |
| Link & sharing | "ade.rekordly.shop" | Share title (60 characters at most), share description (160 at most), share image, and a **preview card showing how the link looks on WhatsApp**. Connecting your own domain moves here from the old Domains tab, keeping its existing API and verification flow. |

- **One request per screen:** load all of it with **one** `GET /api/v1/storefront/settings`, and save each card with **one** `PATCH /api/v1/storefront/settings` sending only that card's fields.
- **Validation and cleanup:** validate the store link (lowercase letters, numbers and hyphens, 3 to 40 characters, not taken, not reserved). Policies go through `rich_text.go`.
- **Remove** the old `AppearanceAndPolicyForm` and the 6-tab admin page once these pages replace them.

**Public store** (`/s/[slug]`, and custom domains through `by-host`):
- **Rendering:** render the published theme and sections with the shared theme components, the resolved palette as CSS variables, and the font style through `next/font`.
- **Pages:** home (the sections), all products with a collection filter, the product page (images, variant option buttons, quantity, add to cart, description), the cart and checkout. Checkout keeps the existing checkout and order API.
- **Footer:** policy links, contact, social links, and "Made with Rekordly".
- **Speed and sharing:** server-render the home and product pages, with `metadata` from the share title, description and image so links preview well on WhatsApp. Images go through `next/image` with sizes. Aim for a Lighthouse mobile score of 90 or more on the home page.

## Section 5: store-level stock display settings

- **New columns on `storefront_settings`:** `show_sold_out boolean default true`, `show_stock_count boolean default false`, `low_stock_threshold int default 3`.
- **Public responses use them:**
  - if `show_sold_out` is false, hide products and variants with no stock
  - if `show_stock_count` is true, show "X left"
  - otherwise show "Only X left" only when stock is at or below the threshold
- **Untouched:** cart and checkout stock checks stay exactly as they are.

## Section 6: online orders become sales

- When an online order is **confirmed and paid** (see `ConfirmStorefrontOrder` / `FulfilStorefrontOrder` in `storefront_order_service.go`), it must exist as a **Sale** with `source = "online_store"` and a link back to the order. Stock and ledger posting must happen **once only**.
  - **First, read the existing code and find out what already posts.** If confirmation already posts a sale-like entry, add the link and the source rather than posting again.
- **Sales list:** add a "Source" filter: All / In person / Online store.
- **Online store orders:** show "View sale" when linked.
- **Tests:** an order confirmed and paid creates exactly one sale and moves stock once, with the ledger balanced. Cancelling before confirmation creates nothing. Returning reverses through the existing return path.

---

## Tests (required)

- **Design:**
  - The draft never shows on the public endpoint until Publish.
  - Publish bumps the version, and a stale `expected_version` gets a 409.
  - A section or field not in the theme's manifest gets a 400.
  - Rich text is cleaned.
  - Discard restores the published copy.
- **Catalogue:**
  - A new product with `show_on_store` creates link rows for all its variants. Hiding it removes them from the public store.
  - The public price always equals the variant's selling price.
  - Existing carts and orders still load after the migration.
  - Collections migrated without losing product links.
- **Settings:**
  - A taken store link is rejected.
  - Each card's PATCH changes only its own fields.
- **Stock display:** sold-out hidden or shown, "X left", and the low-stock threshold all behave as described.
- **Orders → Sales:** created exactly once, with balanced ledger and stock moved once.
- **Workspace isolation** on every new merchant route. Public routes never leak draft or unpublished data.
- **Web:** type check and lint clean. Manually check at 375px and 1280px: no sideways scroll, every drawer is a `SideSheet`, and the preview matches the public page.

## Out of scope (later phases)

- Charts on the Overview, daily analytics and traffic sources (Phase 2).
- Delivery areas with different fees, and free delivery over an amount (Phase 2).
- Paid themes and buying them (Phase 3, **one-off purchase per theme**). In Phase 1, keep `price` in the manifest and `available_themes` ready for it, but only ship the 2 free themes.
- Ad pixels, newsletter, reviews, abandoned cart reminders, and buying domains.
- A separate online price (decided: one price for now).

## When you finish

Reply with:
1. what you built, section by section
2. the migrations you added, and how existing stores, products, collections, carts and orders were moved over
3. the new, changed and retired endpoints, with example responses
4. the test output, pasted
5. screenshots or a short description of Store → Design at phone and desktop width
6. anything you couldn't do and why

Then mark Phase 1 as done in `planning/36-storefront-themes-and-settings-plan.md`.
