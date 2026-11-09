# Rekordly v2 Pricing Validation and Metrics

**Prepared:** 7 November 2026  
**Beta commercial mode:** Free controlled beta  
**Post-beta hypotheses:** Personal Plus ₦1,500/month; Business ₦5,000/month

## 1. Objective

Validate that users receive recurring value, understand the Personal/Business structure and will pay enough to support infrastructure, AI and founder support without compromising data ownership.

Pricing is a hypothesis until behavior and interviews support it.

## 2. Plan hypotheses

### Free — ₦0

Job: start a money-recording habit.

Proposed value:

- 100 confirmed records/month
- 12 months visible history
- Three money accounts
- Ten custom categories
- Two active budgets
- Limited attachments and AI drafts
- Basic monthly summary
- Limited-frequency full export
- Cached read-only offline access

### Personal Plus — ₦1,500/month or ₦15,000/year

Job: maintain a complete personal financial picture.

Proposed value:

- Higher record/account/attachment limits
- Unlimited history under fair use
- Full budgets and comparisons
- Loans, investments and assets
- CSV import
- Offline drafts/sync
- Higher AI allowance
- Lifestyle insight and alerts
- Full exports

### Business — ₦5,000/month or ₦50,000/year

Job: run daily small-business money and operations with trustworthy books.

Proposed value:

- Optional owner Personal space and combined summary
- One Business workspace
- Owner plus two staff
- Two outlets
- Customers, suppliers, invoices and bills
- Catalogue, inventory and procurement
- Financial statements and tax-readiness exports
- One storefront and Rekordly subdomain
- Higher AI and storage limits
- Accountant seat

## 3. Add-on hypotheses

| Add-on | Hypothesis |
|---|---:|
| Additional staff | ₦1,000/month |
| Additional outlet | ₦1,500/month |
| Additional Business | ₦3,000/month |
| Custom-domain connection | ₦1,000/month or ₦10,000/year |
| 100 additional AI drafts | ₦1,000 |
| Additional 10 GB storage | ₦1,000/month |
| Assisted setup | From ₦15,000 once |
| Data migration | From ₦25,000 once |
| Catalogue setup | From ₦30,000 once |
| Monthly bookkeeping support | From ₦25,000/month |

WhatsApp accounting and online-payment pricing remain undefined until provider costs and usage are known.

## 4. Validation sequence

### Stage 1 — Problem/value interviews

Interview at least:

- Five personal users
- Five freelancers
- Five small businesses, including inventory businesses
- One accountant/bookkeeper minimum; target two

Test current behavior, pain frequency, alternatives and consequences before showing price.

### Stage 2 — Concept/package test

Show the three plans without checkout. Ask each participant to:

- Explain each plan in their own words
- Choose a plan
- Identify the most valuable and confusing features
- State which limit would trigger an upgrade
- Choose monthly versus annual

### Stage 3 — Price sensitivity

For Personal Plus and Business, ask:

- At what price is it too cheap to trust?
- At what price is it a bargain?
- At what price does it begin to feel expensive?
- At what price is it too expensive?

Also test direct alternatives around the proposed points without leading participants.

### Stage 4 — Behavioral willingness

Use one or more:

- Join paid-plan waitlist
- Select intended plan during beta
- Reserve founding price without charge
- Pay refundable deposit only after legal/operational readiness
- Attempt checkout in a clearly labelled pricing experiment without taking money when unavailable

Stated willingness alone is weak evidence.

### Stage 5 — Live paid test

After beta value and payment readiness:

- Randomize or cohort-test approved price/annual options carefully
- Preserve existing promised beta access
- Measure conversion, early cancellation, support and usage
- Do not obscure terms or use dark patterns

## 5. Primary product metrics

### Acquisition

- Qualified signup source
- Onboarding started/completed
- Personal/Freelancer/Business choice
- Cost per qualified activated user when paid acquisition begins

### Activation

Primary activation:

- Three confirmed entries and one useful summary viewed within seven days

Business secondary activation:

- One invoice-to-payment, PO-to-receipt or storefront-request-to-confirmed-order loop

Measure:

- Activation rate
- Median time to first entry
- Median time to third entry
- Assistance-required rate
- Import versus manual/AI adoption

### Engagement and retention

- Users recording in at least three distinct weeks in first month
- Weekly active recorders
- Confirmed records per active user
- Active budgets/reports viewed
- Business operational loops completed
- Week 1, Week 4 and Month 3 retention

Registration count alone is not success.

### Trust and quality

- AI draft edit rate
- AI draft abandonment rate
- Correction/reversal rate
- Duplicate prevention rate
- Reconciliation failures — target zero
- Export success/reconciliation rate
- Support requests per activated user
- Data-loss/cross-tenant/security incidents — target zero

### Commercial

- Plan intent distribution
- Free-to-paid conversion
- Monthly versus annual selection
- Add-on attach rate
- Trial-to-paid conversion when introduced
- Voluntary cancellation and reason
- Revenue per paying workspace
- Gross margin after AI/storage/payment/support costs

## 6. Safe analytics contract

Allowed properties:

- Source/channel
- Device class
- Workspace kind
- Plan/entitlement
- Feature/action type
- Count/latency/error buckets
- Record-type/category identifiers only when system-defined and non-sensitive
- Boolean assistance/confirmation/edited state

Forbidden analytics:

- Raw amounts
- Narration
- Customer/supplier names
- Contact details
- Receipt/document contents
- Account numbers
- AI prompt/response content containing user financial data
- OTP/session/secret values

## 7. Proposed events

- `signup_started`, `auth_completed`
- `onboarding_role_selected`, `workspace_created`
- `first_account_created`
- `entry_started`, `draft_created`, `draft_edited`, `record_confirmed`
- `ai_draft_returned`, `ai_draft_failed`
- `import_started`, `import_reviewed`, `import_completed`
- `invoice_issued`, `payment_recorded`
- `purchase_order_approved`, `goods_receipt_posted`, `supplier_bill_matched`
- `storefront_published`, `order_requested`, `order_confirmed`, `order_fulfilled`
- `report_viewed`, `export_completed`
- `limit_warning_shown`, `limit_reached`, `pricing_viewed`, `plan_intent_selected`
- `support_requested`

## 8. Decision thresholds

Initial thresholds are directional and must be interpreted with cohort size.

### Continue Personal Plus

- At least 40% of activated personal beta users retain through Week 4
- At least 25% select Personal Plus as intended plan
- At least five show behavioral willingness, not only verbal approval

### Continue Business pricing

- At least 50% of activated Business users complete a secondary activation loop
- At least 30% select Business at the proposed price
- Inventory/storefront users demonstrate recurring weekly operational value
- Support cost does not make ₦5,000 structurally unprofitable

### Reprice or restructure

- Business plan support/AI/storage cost consumes an unacceptable portion of price
- Users value only one narrow module and reject bundled complexity
- Combined Personal + Business entitlement confuses ownership or upgrade choice
- Custom domain demand is high enough to bundle rather than add on

## 9. Pricing questions to resolve during beta

1. Is ₦1,500 sufficiently valuable for personal users without bank feeds?
2. Is ₦5,000 too low for full inventory, storefront, staff and accounting support?
3. Should Freelancer receive a lower Business entry package later?
4. Do two included outlets/staff match the launch audience?
5. Which free limit encourages upgrade without stopping the recording habit?
6. Does annual billing reduce payment friction or create distrust?
7. Should custom domain be bundled in annual Business?
8. What AI allowance produces real value within the cost ceiling?

## 10. Experiment calendar

### Before beta onboarding

- Prepare interview script and plan cards
- Configure privacy-safe analytics
- Recruit and segment cohort

### First two beta weeks

- Observe onboarding/activation
- Run weekly interviews
- Collect plan intent after value is experienced
- Avoid aggressive upgrade prompts

### Weeks three and four

- Test limits/usage understanding
- Run price sensitivity and annual-plan test
- Estimate support and infrastructure cost per active user

### Paid decision

Introduce payment only after:

- Core retention exists
- Entitlements and downgrade behavior pass
- Paystack flow and terms pass
- Support/refund process exists
- Founder approves pricing evidence

## 11. Pricing integrity rules

- No ads in financial workflows.
- No sale of financial data.
- No paywall on basic export/read access to owned records.
- Show limits before users reach them.
- State whether fees exclude/include applicable taxes.
- Disclose processor fees separately.
- Never market unlimited usage when hard cost/safety limits exist.
- Grandfathering/founding offers require written duration and terms.
