# Storefront: themes, simple customisation and a Store area

Planning only. Nothing here is built yet. It's written after reviewing Bumpa's store screens (16 Nov 2026) and our current storefront code.

---

## 1. What Bumpa does (from the screenshots)

**Themes**
- **Gallery:** "My themes" shows the active theme (their free "Bumpa" theme). "More themes" lists 6 paid themes (Universal, Porto, Vogue, Allure, Essence, Avant) with filter chips by trade (Fashion, Electronics).
- **Theme page:** a full preview on the left. On the right: the price (₦150,000 + 7.5% VAT, so ₦161,250), a coupon box, **Buy theme now**, **Live preview**, and a feature list (video banner, banner slides, reviews, featured collections, font change, About/FAQ/terms pages, price filter, sorting, related products, new arrivals, best sellers, wishlist).

**Storefront customisation**
- One long page of sections, each a heading plus a toggle row. Some rows have an **Edit** button that opens a side drawer:
  - favicon and theme colour
  - custom banner, about us, contact info
  - location page, newsletter pop-up, product listing style
  - return policy (rich text in a drawer), loyalty policy, social handles
  - top banner message, variation picker style, WhatsApp chat button

**Site settings:** SEO title (60 characters) and description (160 characters), share image, a preview of how the link looks, a long tips box, plus pixel and Google Analytics tabs.

**Domain:** edit the subdomain, connect your own domain, or buy one.

**General settings:** tabs for Inventory, Products, Orders, Shipping, Campaigns and Notifications.
- **Inventory:** reserve stock in cart, low-stock number, show out-of-stock items, show stock count.
- **Products:** product notes, size chart.
- **Orders:** abandoned order recovery.
- **Notifications:** customer, account and staff emails, each a long list of toggles.

**Shipping:** a list of delivery options (name, fee, description, which locations). It comes pre-filled with sample rows (Pick up ₦0, Lagos Mainland ₦5,000), and there's a "Create free shipping" shortcut.

**Connected apps:** Meta Pixel, TikTok Pixel, Google Analytics, Shipbubble and Chowdeck.

### What's good, and worth copying
- **A toggle plus an Edit drawer per feature.** You switch a section on, and only then fill in its few fields.
- **Sensible defaults and sample data.** A new store isn't empty.
- **Live preview** before buying a theme, with a clear feature list.
- **One store link** that you can rename, or swap for your own domain.

### What's bad, and to avoid
- **Settings are scattered across six places:** Storefront customisation, Site settings, General settings, Shipping, Location and Connected apps. A merchant can't tell where anything lives.
- **Very long lists** with section headers repeated above single toggles ("CONTACT INFO", "LOCATION PAGE"…).
- **No live preview while customising.** You toggle things blind.
- **Theme colour is a bare colour bar,** with no guidance or palettes.
- **Paid themes are expensive** at ₦161,250, for a one-off visual change.

## 2. What we have today

- **Navigation:** Store sits under **Operations → Storefront**, as one page with 6 tabs: Overview, Appearance & policies, Catalogue, Orders, Domains and Analytics.
- **Appearance & policies is one form with 20 raw fields:**
  - name, slug and theme
  - tagline and description
  - **four hex colour boxes** (primary, accent, background, text) and a font picker
  - phone, email, WhatsApp, delivery fee, address and delivery guidance
  - return and terms policies as **single-line inputs**
  - SEO title and description

  This is the "too enormous" part.
- **Themes:** there are four names (Classic, Modern, Editorial, Minimal), but the public store (`public-storefront-client.tsx`) really renders **one layout** and only uses the primary colour. Choosing a theme changes almost nothing.
- **Catalogue:** each variant is **published one by one** in a drawer with its own *public title, description, price, images, availability rule…*. That's a second copy of the product that the merchant has to keep in sync.
- **Collections exist twice:** product collections (Products page) and storefront collections (Store page).
- **Orders:** the online order flow is solid (confirm, fulfil, return, convert to invoice, messages, stock reservations). It lives in its own list, apart from Sales.
- **Analytics:** a single row of counts (page views, searches, add to carts, checkouts, orders confirmed) with no charts.

## 3. Goals

1. **Live in 3 steps:** pick a theme → add logo, name and colour → your products are already there → Publish.
2. **Nothing enormous.** Every extra is a section you switch on, and each section asks for **4 fields at most** in a drawer.
3. **No hex codes, no font names.** Offer colour swatches (with an optional custom picker) and 3 font styles.
4. **Always see the result.** A live preview sits beside the settings on desktop. On phones it's one tap away.
5. **One catalogue.** The store uses the product's own name, photos, price, variants and stock. No duplicates.
6. **One place for store settings,** grouped as cards with a summary line and an Edit drawer.

## 4. A Store area of its own

Move Store out of *Operations* into its own sidebar group:

| Page | What it's for |
|---|---|
| **Overview** | Charts and figures: sales, orders, visitors, conversion, top products. See §9. |
| **Orders** | Online orders to confirm, pack and deliver. The existing order flow, tidied onto the document layout. |
| **Products** | Everything you sell, each with an **On store** switch, a featured star and a collection. Bulk on/off. |
| **Design** | Themes, plus the **Customise** screen with a live preview. |
| **Settings** | Store details, delivery, payments and checkout, policies, link and sharing. |

The whole sidebar will be reorganised later, as you said. This plan only needs "Store" to be its own group.

**Sales and online orders.** An online order is a sale that hasn't been confirmed yet.
- **Proposal:** when an online order is confirmed and paid, it becomes a **Sale** automatically, using the same stock and ledger path as the sales work, with `source = online store`.
- **Sales page:** gets a "Source: Online store / In person" filter.
- **Store → Orders:** stays the place to fulfil orders.

This way the money reports never miss online sales. The backend needs checking: `ConfirmStorefrontOrder` and `FulfilStorefrontOrder` may already post. If they do, we only need the link and the filter.

## 5. Themes

**A theme is:** a layout, the sections it supports, a default colour palette and a font pairing. Themes are code in the web app. Each one has a small **manifest** that says which sections and options it supports, so the Customise screen only shows what that theme can do ("each store has settings based on what is available").

```ts
// web/src/lib/store-themes/simple/manifest.ts (sketch)
export const simple = {
  key: "simple",
  name: "Simple",
  price: "free",
  bestFor: ["Any shop"],
  palettes: ["green", "ink", "ocean", "sunset", "rose", "earth"],
  fontStyles: ["modern", "classic", "friendly"],
  sections: {
    announcement: { fields: ["text", "link"] },
    hero:         { fields: ["image", "heading", "subheading", "button"], max_slides: 1 },
    collections:  { fields: ["collection_ids"] },
    product_grid: { fields: ["title", "source"] },   // source: new | best_sellers | collection
    about:        { fields: ["heading", "body", "image"] },
    faq:          { fields: ["items"] },
    contact:      { fields: [] },                     // uses store details
  },
  defaultSections: ["hero", "product_grid", "about", "contact"],
};
```

**Launch with 2 free themes:**
1. **Simple.** A clean product grid that works for any shop: food, phones, cosmetics. This is the default.
2. **Boutique.** Image-led, with a large banner, collection tiles and bigger product photos. For fashion, beauty and lifestyle.

**Later:** paid themes, such as **Bold** (dark, electronics), **Market** (many categories, grocery) and **Studio** (services and bookings). They're sold one-off at a much lower price than Bumpa, or included in a Pro plan. See the decisions in §11.

**Rules:**
- **Switching theme keeps content.** Your banner, about text and FAQ carry over. Sections the new theme doesn't support are hidden, not deleted.
- **Paid themes can be previewed and customised fully before buying.** Publish is what asks for payment.

## 6. Design → Customise (the main screen)

```
┌───────────────────────────────┬───────────────────────────────────────┐
│ ← Design        [Desktop|Phone]│                                       │
│                               │                                       │
│ Brand                         │          LIVE PREVIEW                 │
│  Logo      [upload]           │      (the real store, as you edit)    │
│  Store name [Ade Stores    ]  │                                       │
│  Colour  ● ● ● ● ● ● +        │                                       │
│  Style   [Modern|Classic|Friendly]                                    │
│                               │                                       │
│ Sections              (drag)  │                                       │
│  ⠿ Announcement bar   ○       │                                       │
│  ⠿ Banner             ● ›     │                                       │
│  ⠿ Products           ● ›     │                                       │
│  ⠿ Collections        ○       │                                       │
│  ⠿ About us           ● ›     │                                       │
│  ⠿ Questions (FAQ)    ○       │                                       │
│  ⠿ Contact & WhatsApp ●       │                                       │
│                               │                                       │
│ [ Save draft ]  [ Publish ]   │                                       │
└───────────────────────────────┴───────────────────────────────────────┘
```

**Brand block:** logo, store name, colour and style. That's all most merchants ever touch.
- **Colour:** 6 swatches that each set a full, contrast-checked palette (main colour, accent, background, text). A **+** opens a picker for an exact brand colour, and we work out the rest from it.
- **Style:** three choices, each a tested font pairing. **Modern** is Inter/Inter, **Classic** is Merriweather/Inter, **Friendly** is Plus Jakarta. No font names are shown.

**Sections:**
- Each row is a switch plus **›** to edit. Editing opens a drawer: a side drawer on desktop, a bottom sheet on phones, using our `SideSheet`. It asks for **4 fields at most**.
- Rows can be dragged to reorder.
- The list only shows the sections the current theme supports.

**Saving:** changes are kept as a **draft**, and the preview shows the draft. **Publish** makes it live. The storefront already has a `version`, so we use it for safe publishing.

**Phones:** the settings sit on top, with a **Preview** button that opens the store full-screen and a floating **Back to editing** button.

**Defaults:** a new store starts with sample banner text and section text already written, based on the business name, so it never looks empty.

## 7. Products on the store

- **On by default.** Store settings has "Show new products on my store automatically", which is **on**. New active products appear without any extra step.
- **Product form, Store details step:** add an **On my store** switch, on by default, next to the outlets that already live there.
- **Store → Products:**
  - every product with an **On store** switch, a ★ featured toggle and a collection
  - bulk "Turn on" and "Turn off"
  - a filter for "On store" / "Hidden"
  - archived products are hidden automatically
- **No second copy.** The store shows the product's own name, description, photos, price and variants. Shoppers pick Size or Colour as buttons, using the variants work. Remove the per-variant publish drawer (public title, price, etc.).
  - **Optional, later:** an "Online price" override on the product, if you want online to differ from the shop price. See the decisions in §11.
- **Stock shown on the store** is one setting each, not per product:
  - Show sold-out items (on)
  - Show how many are left (off)
  - "Only X left" from a low-stock number (3)
  - Reserve items in carts for N hours (already exists as `reservation_ttl_hours`)
- **One set of collections.** Merge storefront collections into product collections. A collection has a "Show on store" switch and an optional image.

## 8. Store → Settings (one page, grouped cards)

Each card shows a one-line summary and an **Edit** drawer, so nothing sprawls:

| Card | Summary example | Drawer fields |
|---|---|---|
| **Store details** | "Ade Stores · ade.rekordly.shop" | Name, store link (subdomain), phone, WhatsApp, email, address and opening hours |
| **Delivery** | "Pick up free · 3 delivery areas" | Pick-up on/off and address; delivery areas as a list (name, fee, days); "Free delivery over ₦X" |
| **Payments & checkout** | "Pay online, bank transfer" | Pay online (Paystack), pay on delivery, bank transfer details; order note on/off; reserve stock for N hours |
| **Shown to shoppers** | "Sold-out shown · stock count hidden" | The stock display options from §7, plus "show new products automatically" |
| **Policies** | "Returns, Terms" | Returns, Terms, Privacy and Delivery policy in our rich text editor (Tiptap), each **pre-filled with a sensible template** you can edit |
| **Link & sharing** | "ade.rekordly.shop" | Edit subdomain; connect your own domain (later: buy one); share title, description and image, **with a preview of how the link looks on WhatsApp** |
| **Marketing apps** *(later)* | "Not connected" | Meta Pixel, TikTok Pixel, Google Analytics IDs |

Store emails, such as order confirmations and delivery updates, go under the app's main **Notifications** settings as one "Online store" group, not as a separate long list here.

## 9. Store → Overview (charts)

- **KPI cards** with a period switch (7 days, 30 days, 90 days):
  - Store sales (₦)
  - Orders
  - Visitors
  - Conversion rate (orders ÷ visitors)
  - Average order value
- **Charts:**
  - **Sales over time:** line chart, with orders as bars underneath.
  - **Shopping funnel:** visits → product views → add to cart → checkout → paid. We already count most of these steps.
  - **Top products:** bar list by sales and by views.
  - **Orders needing action:** to confirm, to pack, to deliver, as counts with links.
  - *Later:* where visitors came from (WhatsApp, Instagram, Google, direct), abandoned carts, and new versus returning shoppers.
- **Backend:** today's analytics is only 30-day totals. We need **daily counts per event**, a referrer for traffic sources, and top products. One `GET /storefront/overview?period=30d` should return everything on this page in a single request, following the "one request per page" rule from `35-…`.

## 10. Phases

**Phase 1: simple and clean (the main ask)**
1. A Store sidebar group with Overview, Orders, Products, Design and Settings. Overview starts with today's numbers as KPI cards.
2. The theme manifest, plus the **Simple** and **Boutique** themes rendered properly on the public store.
3. The Customise screen: brand block, sections with drawers, live preview, draft/Publish.
4. Products on by default: the switch on the product form, the Store → Products list with bulk on/off, and the duplicate publish drawer removed.
5. The Settings page as cards, with policy templates in the rich text editor.
6. Collections merged.

**Phase 2: insight and delivery**
7. The Overview charts: daily events, funnel, top products, referrers.
8. Delivery areas with fees, and free delivery over an amount.
9. Confirmed and paid online orders become Sales, with a source filter on Sales.

**Phase 3: grow**
10. The paid themes shop: theme pages with preview and feature list, buying through Billing, and an "owned themes" list.
11. Marketing apps (pixels, Google Analytics), custom domain purchase, newsletter, product reviews and abandoned cart reminders.

## 11. Decisions

> **Answered (16 Nov 2026):**
> - Free themes: Simple and Boutique.
> - Online orders: a confirmed, paid online order becomes a Sale automatically.
> - Price: **one price** for now, with no separate online price.
> - New products: shown on the store automatically.
> - Store links: `name.rekordly.shop`.
>
> - Paid themes: **one-off purchase** per theme (Phase 3).

The original questions:

1. **The two free themes:** is *Simple* (any shop) plus *Boutique* (fashion and beauty) right, or would *Bold* (electronics and gadgets) suit your users better than Boutique?
2. **Online orders and Sales:** should a confirmed, paid online order become a Sale automatically? Recommended: yes.
3. **Paid themes:** a one-off price per theme (and roughly how much), or all themes included in a Pro plan?
4. **Online price:** do you need a different online price per product, or is one price enough for now? Recommended: one price for Phase 1.
5. **New products on the store automatically:** should it be on by default? Recommended: on, with a clear "Hidden from store" switch.
6. **Store link domain:** what base domain do the free store links use (e.g. `name.rekordly.shop`)?

## 12. Backend notes (for the Codex prompt later)

- **Storefront:**
  - `theme_key` becomes free text, validated against the themes the store can use (free or owned).
  - Add `theme_settings jsonb` (brand and per-section content) and `sections jsonb` (order and on/off), validated against the theme's manifest keys.
  - Add a draft copy and a published copy, with `version` for safe publish.
- **Products:**
  - Add `show_on_store boolean default true` on the product (or keep `storefront_products` as a thin on/off and featured link with no copied fields).
  - Add a store setting `auto_show_new_products`.
- **Collections:** add `show_on_store` and `image_url` to product collections, and migrate storefront collections into them.
- **Store settings:** delivery areas table; payments options; policy texts (rich text, cleaned by `rich_text.go`).
- **Analytics:** daily event counts and referrer, plus `GET /storefront/overview`.
- **Paid themes (Phase 3):** a `theme_purchases` table linked to Billing.
- **One request per page:** the Customise screen loads with one `GET /storefront/design` (theme, manifest keys allowed, settings, sections, owned themes), and Store → Products with one list call that includes `on_store`, featured and collection.
