# 31 — Bumpa UX walkthrough and Rekordly V2 gap plan

Observed 13 November 2026 in a signed-in Bumpa trial account (read-only: no record was saved, no setting changed). Compared with the V2 web app running locally. Screens named here are the ones that were opened; anything not opened is not claimed.

## 1. How Bumpa is organised

### Navigation

| Group | Items (route) |
|---|---|
| Quick Access | Dashboard, Products (`/dashboard/products`, child: Product Filter), Orders (`/dashboard/orders`, child: Abandoned orders), Customers, Analytics, Bumpa Wallet, Sales & Marketing (Discounts & Coupons, Campaigns), Loyalty Program, Wholesale, Extensions |
| More › Operations | Shipping, Staff Account, Location, General Settings, Connected Apps |
| More › Finance | (not opened) |
| More › Store Setup | Store Information (`/dashboard/store/store-information`), Subscription, Api Key |
| More › SEO & Website Management | Site Settings, Site Customisation (`/dashboard/store/customisation`), Domains |
| More › Grow With Bumpa | Referrals, Academy, Support, Blog |

Top bar: View Store, Point of Sale, location switcher, profile menu (Profile, Maintenance Mode, KYC Tiers, Log Out). A parent item is itself a page; its children appear beneath it.

What to copy: daily work sits in a short Quick Access list and everything occasional hides behind one "More" group with five labelled sections.

### List page anatomy (identical on Products, Orders, Customers)

1. Title, help icon, **Actions** dropdown (import, export, history, settings) and **one** primary button ("Add New Product", "Create Order", "Add New Customer").
2. Three or four coloured summary tiles for that module only (retail value, inventory value, products sold, out of stock; total, completed, unpaid orders; total customers, groups, subscribers).
3. Pill tabs for sibling views: Products / Collections / Bundles / Featured Brands / Add-Ons / Gift. Customers / Customer Groups / Newsletter.
4. Orders also has status pills: Paid, Partially Paid, Pending, Unpaid, All.
5. Toolbar: refresh, group by, delivery, date range, filter, column picker, search.
6. Table with row checkboxes, bulk export, and "Show 25 Entries".

### Create flows

| Record | Pattern |
|---|---|
| Product | Full page. First choose type by card: Regular, With Variations, Bundle. Then grouped sections in one card: Product Details, Pricing (price, cost price, compare-at, unit), Inventory (stock, status, barcode, order quantity limits). Sticky bottom bar: Cancel, Preview, Add Product. "Watch Video Tutorial" top right. |
| Order (sale) | Full page. Order Details: customer (optional: "leave blank if you don't have the contact"), currency, sales channel, order date. Products: **Select Products** and **Add New** side by side. Payment: status as three options (Paid, Unpaid, Partially Paid), method, notes with a rich text editor. Sticky bar: Clear, Cancel, Create. |
| Customer picker | Right drawer: search, **+ Add Customer** inline, selectable rows with Edit, Cancel and Continue. |
| Product picker | Right drawer: **+ New Product** inline, search by name, "N Selected" counter, rows show thumbnail, name, stock ("8 in Stock") and price, Clear and Save. |

What to copy: large records get a page, small choices get a drawer, and every picker can create what is missing without leaving the form.

### Storefront activation and templates

- **Activation** is a checklist on the dashboard: "Complete your onboarding", a progress bar, and a single "Next Step" button ("Complete Store Information"). A To-do list lists the missing pieces (description, store image, tagline).
- **Store Information** is a read-style profile page with "Edit Store Information" and "Add Business Hours".
- **Templates** (Site Customisation): "My Theme(s)" shows the active theme with an Active badge and a Customize button. "More Themes" is a gallery filtered by All / Fashion / Electronics, each card with Buy Theme and a New badge.
- **Customise** is one long page of toggled sections with a sticky Save bar: Branding (favicon, theme colour), Banner, About Us, Contact info, Location page, Newsletter, Product Listing, Return Policy, Loyalty Points Policy, Social Media, Top banner message, Product Variation, WhatsApp chat.
- Domains and Site Settings are separate pages.

### Dashboard

Onboarding card, wallet and account details, business overview with a period filter (orders, products sold, new customers, visits, total sales, settled, owed), recent orders, top sales channels, and **Quick Actions** (Create New Order, Add A New Product, Run Sales, Ask Bumpa).

## 2. Where Rekordly V2 differs today

| Area | Bumpa | Rekordly V2 | Impact |
|---|---|---|---|
| Sidebar | 10 daily items, rest under More | Business "Money" group holds about nine items | Hard to scan; no obvious daily path |
| List header | Tiles, Actions menu, one primary button | Search and view switch only | Looks bare; secondary actions have no home |
| Status filtering | Pills per status | None | Cannot find unpaid records quickly |
| Sale form | Full page, customer, products with stock, payment status | Two-step drawer: customer and date, then amount and payment | **No products at all** |
| Pickers | Drawer with inline "add new" | Plain dropdown plus "or type a name" | Slow, no way to add a missing customer in place |
| Detail view | Row opens a record page | No detail pages | Cannot review a record |
| Dashboard | Checklist, to-do, quick actions | Figures and charts only | No guidance for a new user |
| Storefront and templates | Full set | Not built | Needs backend first |

## 3. What the backend allows today

Implemented (per the project status): auth, money records, sales and purchasing, invoices and wallets, budgets and tax. **Not built:** inventory, storefront, advanced reconciliation, billing. So a Bumpa-style product picker, stock counts, themes and activation cannot be real until the catalogue and storefront backends exist. Invoices already accept line items as free text.

## 4. Proposed phases

**Phase A, frontend only, now**
1. Restructure the sidebar into Quick Access plus More.
2. One list-page template: tiles, Actions menu, one primary button, pill tabs, status pills, row click.
3. Full-page create forms for sale, purchase and invoice with a sticky action bar; customer picker as a drawer with inline add; payment status as three options.
4. Record detail pages.
5. Dashboard onboarding checklist and Quick Actions.

**Phase B, needs backend:** products, variations, bundles, stock, collections. Then the product picker in sale, invoice and purchase.

**Phase C, needs backend:** store information, themes gallery, customisation, domains, and a real activation checklist.

## 5. Bumpa Finance, expenses and analytics (second pass)

Opened: Finance menu, Expenses (list and create form), Transactions, Analytics. Not opened: Payment Methods, Bumpa Terminal, Bumpa Capital, Bank Details, Taxes (a guessed Taxes address redirected to the dashboard), Discounts, Loyalty, Wholesale, Extensions.

| Page | What it does |
|---|---|
| Finance menu | Transactions, Expenses, Payment Methods, Bumpa Terminal, Bumpa Capital, Bank Details, Taxes |
| Expenses | Subtitle "Create, manage and move expenses between locations". Header: Audit Log, Export CSV, **Create New Expense**. Tabs: Expenses, Expense Category. Filters: category, location, date range, search by amount or word. |
| Create Expense | Full page. Optional receipt image first ("this can be your receipt or invoice"), then Expense Details: name, category, store location, amount, date, description. Bar: Cancel, Create Expense. |
| Transactions | Two totals (online, offline) and a note that pending settlements are paid within 24 hours. Tabs: Transaction History, Settlement History. Date filter, Export CSV. |
| Analytics | Tabs: Sales, Transactions, Products, Customers, Campaigns. Date range plus **Compare**, a "Business report is ready" download, and a line chart with a "% from last year" delta. |

Patterns worth taking: the receipt is optional and comes first, expense categories are a tab on the same page, an audit log sits next to export, and every analytics view can compare two periods.

## 6. Design references supplied by the founder

Source: the "AI Finance Management SaaS" and "AI CFO Platform" Behance case studies in Downloads, plus three dashboards sent in chat. These are other designers' work: use the patterns, not their logos, copy or artwork. They are marketing mockups, so any score or forecast shown there needs a real definition before Rekordly displays one.

### AI Finance Management ("Fynix", light with green)

- Light grey page, mint-green accent, deep green for primary buttons and active chart bars. Very large corner radius.
- Sidebar: workspace switcher at the top ("Personal Account"), MAIN MENU (Dashboard, AI, Transactions, Wallet, Invoices, Reports), PREFERENCE (Settings, Help), and an "Upgrade plan" card at the bottom.
- Every page has a title plus a one-line subtitle.
- Dashboard: a green **Total Balance** hero card with Deposit and Send; three small cards for income, expense and savings; a health-score card; a stacked **Cashflow** bar chart with a period filter; an **AI Assistant** panel; a **Recent Transactions** table with search, category and account filters, a date range and Download; a **Statistic** donut with Income/Expense tabs and a category list with percentage chips.
- A full AI page: centred greeting, one large prompt box with attach, voice and image, then four example cards.

### AI CFO ("Orven", dark with green)

- Dense dark data screens. A row of KPI cards, each with a change chip against the last 30 days; trend line, donut and breakdown charts; a cohort heat table; "AI signals" rows with impact and confidence.
- Sidebar with collapsible groups, a company switcher, a "synced 3 min ago" status next to the page title, and Export top right.
- A readiness view: percentage ring, a criteria list with target and progress, and "what to fix" rows each with a Create task button.
- A shareable investor-report preview page.

### The three dashboards sent in chat

Top pill navigation instead of a sidebar; a step roadmap (checkmarks along a line) for progress; ring gauges on cards; one saturated card beside white cards; a savings-goals list with progress bars; a "Recent Activities" table with search and filter.

## 7. Comparison

| Need | Bumpa | Fynix | Orven | Rekordly today | Take for V2 |
|---|---|---|---|---|---|
| Overall feel | Practical, green on white | Calm, light, spacious | Dark, dense | Green with neutral cards | Fynix spacing and card style on Rekordly's own green; Orven density for dark mode |
| Sidebar | Quick Access plus More | Grouped MAIN MENU / PREFERENCE, switcher, upgrade card | Collapsible groups, switcher | One long list | Grouped menu, workspace switcher on top, plan card at the bottom |
| Page header | Title plus Actions plus one primary button | Title plus quoted subtitle | Title plus sync status plus Export | Title plus description | Keep subtitle, add status and Export |
| Dashboard | Checklist, to-do, quick actions | Balance hero, charts, AI panel | KPI row, signals | Four tiles, two charts | Roadmap stepper, balance hero with actions, KPI row, cashflow, recent activity |
| Activation progress | Progress bar and Next Step | none | Readiness ring and criteria | none | Stepper of real steps, with a ring on the card |
| Charts | Single line | Stacked bars, donut with chips | Trend, donut, waterfall | Area and donut | Add stacked cashflow bars and donut with category chips |
| Transactions list | Online and offline totals, history and settlement tabs | Search, category, account, date, Download | Table with impact | Search plus table | Add category and account filters, date range and Download |
| Create forms | Full page, optional receipt first | Drawer-style | n/a | Drawer | Full page for sale, purchase, invoice, expense; drawers for pickers |
| AI | n/a | Prompt page with example cards | AI signals and "Ask" button | none | "Type what happened" prompt as the AI capture entry, later |

Do not build yet, because the backend has nothing behind them: finance score, forecasts, AI signals, investor reports, cohort tables, currency exchange.

## 8. Open questions for the founder

- Should a sale without products stay allowed (amount only) once the catalogue exists, as Bumpa allows a sale with no customer?
- Is a theme store (paid themes) in scope, or a fixed set of included templates?
- Is "Run Sales" (discounts and campaigns) a V2 feature?
- Which look leads: the light Fynix style, or the dark-first Orven style?
- Should the AI "type what happened" prompt be the dashboard's main widget once the AI backend exists?
- Should expenses stay under Money, or get their own page with Categories and an Audit Log as Bumpa does?
