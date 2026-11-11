-- Blueprint 09 SQLC Queries: Storefronts, Collections, Projections, Domains, Carts, Orders & Analytics

-- name: CreateStorefront :one
INSERT INTO storefronts (
    workspace_id, name, slug, theme_key, default_outlet_id, currency, currency_exponent, created_by_user_id
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING *;

-- name: CreateDefaultStorefrontSettings :one
INSERT INTO storefront_settings (storefront_id, workspace_id)
VALUES ($1, $2)
RETURNING *;

-- name: GetStorefrontByWorkspace :one
SELECT * FROM storefronts
WHERE workspace_id = $1;

-- name: GetStorefrontBySlug :one
SELECT * FROM storefronts
WHERE lower(btrim(slug)) = lower(btrim($1));

-- name: GetStorefrontByID :one
SELECT * FROM storefronts
WHERE workspace_id = $1 AND id = $2;

-- name: GetStorefrontSettings :one
SELECT * FROM storefront_settings
WHERE storefront_id = $1 AND workspace_id = $2;

-- name: UpdateStorefrontHeader :one
UPDATE storefronts
SET name = COALESCE(sqlc.narg('name'), name),
    slug = COALESCE(sqlc.narg('slug'), slug),
    theme_key = COALESCE(sqlc.narg('theme_key'), theme_key),
    default_outlet_id = COALESCE(sqlc.narg('default_outlet_id'), default_outlet_id),
    reservation_ttl_hours = COALESCE(sqlc.narg('reservation_ttl_hours'), reservation_ttl_hours),
    version = version + 1,
    updated_at = now()
WHERE workspace_id = $1 AND id = $2 AND version = $3
RETURNING *;

-- name: UpdateStorefrontLifecycle :one
UPDATE storefronts
SET status = $3,
    entitlement_status = $4,
    grace_until = $5,
    published_at = CASE WHEN $3 = 'published' AND published_at IS NULL THEN now() ELSE published_at END,
    version = version + 1,
    updated_at = now()
WHERE workspace_id = $1 AND id = $2
RETURNING *;

-- name: UpdateStorefrontSettings :one
UPDATE storefront_settings
SET tagline = $3,
    description = $4,
    logo_url = $5,
    banner_url = $6,
    primary_color = $7,
    accent_color = $8,
    background_color = $9,
    text_color = $10,
    font_family = $11,
    section_order = $12,
    contact_phone = $13,
    contact_email = $14,
    whatsapp_number = $15,
    address = $16,
    business_hours = $17,
    social_links = $18,
    delivery_methods = $19,
    delivery_guidance = $20,
    default_delivery_fee_minor = $21,
    checkout_require_email = $22,
    checkout_require_phone = $23,
    return_policy = $24,
    privacy_policy = $25,
    terms_policy = $26,
    custom_policy = $27,
    seo_title = $28,
    seo_description = $29,
    seo_image_url = $30,
    seo_indexable = $31,
    version = version + 1,
    updated_at = now()
WHERE storefront_id = $1 AND workspace_id = $2
RETURNING *;

-- Collections
-- name: CreateStorefrontCollection :one
INSERT INTO storefront_collections (workspace_id, storefront_id, name, slug, description, image_url, position, is_visible)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING *;

-- name: ListStorefrontCollections :many
SELECT * FROM storefront_collections
WHERE storefront_id = $1 AND workspace_id = $2
ORDER BY position ASC, id ASC;

-- name: ListPublicStorefrontCollections :many
SELECT id, name, slug, description, image_url, position
FROM storefront_collections
WHERE storefront_id = $1 AND is_visible = true
ORDER BY position ASC, id ASC;

-- name: UpdateStorefrontCollection :one
UPDATE storefront_collections
SET name = $3,
    slug = $4,
    description = $5,
    image_url = $6,
    position = $7,
    is_visible = $8,
    updated_at = now()
WHERE id = $1 AND workspace_id = $2
RETURNING *;

-- name: DeleteStorefrontCollection :exec
DELETE FROM storefront_collections
WHERE id = $1 AND workspace_id = $2;

-- Public Catalogue Projections
-- name: UpsertStorefrontProduct :one
INSERT INTO storefront_products (
    workspace_id, storefront_id, product_id, variant_id, collection_id,
    is_published, is_featured, public_title, public_description, public_sku,
    image_urls, public_price_minor, availability_policy, low_stock_threshold,
    max_qty_per_order, contact_only, position, seo_slug, seo_title, seo_description
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
ON CONFLICT (storefront_id, product_id, variant_id) DO UPDATE SET
    collection_id = EXCLUDED.collection_id,
    is_published = EXCLUDED.is_published,
    is_featured = EXCLUDED.is_featured,
    public_title = EXCLUDED.public_title,
    public_description = EXCLUDED.public_description,
    public_sku = EXCLUDED.public_sku,
    image_urls = EXCLUDED.image_urls,
    public_price_minor = EXCLUDED.public_price_minor,
    availability_policy = EXCLUDED.availability_policy,
    low_stock_threshold = EXCLUDED.low_stock_threshold,
    max_qty_per_order = EXCLUDED.max_qty_per_order,
    contact_only = EXCLUDED.contact_only,
    position = EXCLUDED.position,
    seo_slug = EXCLUDED.seo_slug,
    seo_title = EXCLUDED.seo_title,
    seo_description = EXCLUDED.seo_description,
    updated_at = now()
RETURNING *;

-- name: ListMerchantStorefrontProducts :many
SELECT sp.*, p.kind AS product_kind, p.status AS product_status, p.unit_name, pv.name AS variant_name, pv.is_active AS variant_active, pv.currency
FROM storefront_products sp
JOIN products p ON p.id = sp.product_id AND p.workspace_id = sp.workspace_id
JOIN product_variants pv ON pv.id = sp.variant_id AND pv.workspace_id = sp.workspace_id
WHERE sp.storefront_id = $1 AND sp.workspace_id = $2
ORDER BY sp.is_featured DESC, sp.position ASC, sp.id ASC;

-- name: CountPublishedStorefrontProducts :one
SELECT count(*)::bigint
FROM storefront_products sp
JOIN products p ON p.id = sp.product_id
JOIN product_variants pv ON pv.id = sp.variant_id
WHERE sp.storefront_id = $1 AND sp.is_published = true AND p.status = 'active' AND pv.is_active = true;

-- name: ListPublicStorefrontProducts :many
SELECT sp.id, sp.storefront_id, sp.product_id, sp.variant_id, sp.collection_id,
       sp.is_featured, sp.public_title, sp.public_description, sp.public_sku,
       sp.image_urls, sp.public_price_minor, sp.availability_policy, sp.low_stock_threshold,
       sp.max_qty_per_order, sp.contact_only, sp.position, sp.seo_slug, sp.seo_title, sp.seo_description,
       p.kind AS product_kind, p.unit_name, pv.name AS variant_name, pv.currency, pv.currency_exponent,
       COALESCE((
           SELECT sum(ib.quantity_on_hand - ib.reserved_quantity)
           FROM inventory_balances ib
           WHERE ib.workspace_id = sp.workspace_id
             AND ib.product_id = sp.product_id
             AND (sqlc.narg('outlet_id')::bigint IS NULL OR ib.location_id = sqlc.narg('outlet_id')::bigint)
       ), 0)::numeric AS available_quantity
FROM storefront_products sp
JOIN products p ON p.id = sp.product_id AND p.workspace_id = sp.workspace_id
JOIN product_variants pv ON pv.id = sp.variant_id AND pv.workspace_id = sp.workspace_id
WHERE sp.storefront_id = $1
  AND sp.is_published = true
  AND p.status = 'active'
  AND pv.is_active = true
ORDER BY sp.is_featured DESC, sp.position ASC, sp.id ASC;

-- Domains
-- name: CreateStorefrontDomain :one
INSERT INTO storefront_domains (
    workspace_id, storefront_id, hostname, domain_type, status, verification_token, tls_status, is_primary
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING *;

-- name: GetStorefrontDomainByHost :one
SELECT sd.*, sf.status AS storefront_status, sf.entitlement_status, sf.slug AS storefront_slug
FROM storefront_domains sd
JOIN storefronts sf ON sf.id = sd.storefront_id
WHERE lower(btrim(sd.hostname)) = lower(btrim($1))
  AND sd.status <> 'disconnected'
LIMIT 1;

-- name: ListStorefrontDomains :many
SELECT * FROM storefront_domains
WHERE storefront_id = $1 AND workspace_id = $2
ORDER BY domain_type ASC, is_primary DESC, id DESC;

-- name: GetStorefrontDomainForUpdate :one
SELECT * FROM storefront_domains
WHERE id = $1 AND workspace_id = $2
FOR UPDATE;

-- name: UpdateStorefrontDomainState :one
UPDATE storefront_domains
SET status = $3,
    tls_status = $4,
    last_checked_at = now(),
    check_attempts = check_attempts + 1,
    last_error = $5,
    verified_at = CASE WHEN $3 IN ('verified', 'active') AND verified_at IS NULL THEN now() ELSE verified_at END,
    is_primary = COALESCE(sqlc.narg('is_primary'), is_primary),
    updated_at = now()
WHERE id = $1 AND workspace_id = $2
RETURNING *;

-- name: UpdateStorefrontDomainsEntitlement :exec
UPDATE storefront_domains
SET status = CASE
        WHEN $2::text = 'expired' THEN 'disabled'
        WHEN $2::text = 'grace' AND status = 'active' THEN 'grace'
        WHEN $2::text = 'active' AND domain_type = 'subdomain' AND status IN ('grace', 'disabled') THEN 'active'
        ELSE status
    END,
    updated_at = now()
WHERE storefront_id = $1 AND status <> 'disconnected';

-- Carts
-- name: CreateStorefrontCart :one
INSERT INTO storefront_carts (workspace_id, storefront_id, cart_token_hash, currency, expires_at)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: GetStorefrontCartByHash :one
SELECT * FROM storefront_carts
WHERE cart_token_hash = $1 AND storefront_id = $2 AND expires_at > now();

-- name: ListStorefrontCartLines :many
SELECT * FROM storefront_cart_lines
WHERE cart_id = $1
ORDER BY id ASC;

-- name: UpsertStorefrontCartLine :one
INSERT INTO storefront_cart_lines (cart_id, storefront_product_id, quantity, unit_price_snapshot_minor)
VALUES ($1, $2, $3, $4)
ON CONFLICT (cart_id, storefront_product_id) DO UPDATE SET
    quantity = EXCLUDED.quantity,
    unit_price_snapshot_minor = EXCLUDED.unit_price_snapshot_minor,
    updated_at = now()
RETURNING *;

-- name: DeleteStorefrontCartLine :exec
DELETE FROM storefront_cart_lines
WHERE cart_id = $1 AND storefront_product_id = $2;

-- name: ClearStorefrontCart :exec
DELETE FROM storefront_cart_lines
WHERE cart_id = $1;

-- Orders & Order Workflow
-- name: NextStorefrontOrderSequence :one
INSERT INTO storefront_order_sequences (storefront_id, next_value)
VALUES ($1, 2)
ON CONFLICT (storefront_id) DO UPDATE SET next_value = storefront_order_sequences.next_value + 1
RETURNING next_value - 1;

-- name: GetStorefrontOrderByIdempotency :one
SELECT * FROM storefront_orders
WHERE workspace_id = $1 AND idempotency_key = $2;

-- name: CreateStorefrontOrder :one
INSERT INTO storefront_orders (
    workspace_id, storefront_id, order_reference, public_token_hash, outlet_id,
    currency, currency_exponent, subtotal_minor, tax_minor, delivery_fee_minor, total_minor,
    delivery_method, customer_name, customer_phone, customer_email, organization_name,
    preferred_contact_method, delivery_address, delivery_landmark, preferred_delivery_time,
    customer_note, policy_acknowledged, policy_version, idempotency_key
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)
RETURNING *;

-- name: CreateStorefrontOrderLine :one
INSERT INTO storefront_order_lines (
    workspace_id, order_id, storefront_product_id, product_id, variant_id,
    product_kind, title_snapshot, variant_snapshot, unit_name,
    requested_quantity, confirmed_quantity, unit_price_minor, line_total_minor
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
RETURNING *;

-- name: GetStorefrontOrderByPublicTokenHash :one
SELECT * FROM storefront_orders
WHERE public_token_hash = $1;

-- name: GetStorefrontOrderForUpdateByPublicHash :one
SELECT * FROM storefront_orders
WHERE public_token_hash = $1
FOR UPDATE;

-- name: GetStorefrontOrderByID :one
SELECT * FROM storefront_orders
WHERE workspace_id = $1 AND id = $2;

-- name: GetStorefrontOrderForUpdate :one
SELECT * FROM storefront_orders
WHERE workspace_id = $1 AND id = $2
FOR UPDATE;

-- name: ListStorefrontOrders :many
SELECT * FROM storefront_orders
WHERE workspace_id = $1
  AND (sqlc.narg('commercial_status')::text IS NULL OR commercial_status = sqlc.narg('commercial_status'))
  AND (sqlc.narg('outlet_id')::bigint IS NULL OR outlet_id = sqlc.narg('outlet_id'))
ORDER BY id DESC
LIMIT $2;

-- name: ListStorefrontOrderLines :many
SELECT * FROM storefront_order_lines
WHERE order_id = $1
ORDER BY id ASC;

-- name: UpdateStorefrontOrderLineReservation :one
UPDATE storefront_order_lines
SET reservation_id = $2,
    confirmed_quantity = $3,
    unit_price_minor = $4,
    line_total_minor = $5
WHERE id = $1
RETURNING *;

-- name: UpdateStorefrontOrderLineFulfilled :one
UPDATE storefront_order_lines
SET fulfilled_quantity = fulfilled_quantity + $2
WHERE id = $1 AND fulfilled_quantity + $2 <= confirmed_quantity
RETURNING *;

-- name: CreateStorefrontOrderVersion :one
INSERT INTO storefront_order_versions (
    workspace_id, order_id, version, snapshot, change_summary, requires_customer_ack, actor_type, actor_user_id
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING *;

-- name: ListStorefrontOrderVersions :many
SELECT * FROM storefront_order_versions
WHERE order_id = $1
ORDER BY version DESC;

-- name: AcknowledgeStorefrontOrderVersion :one
UPDATE storefront_order_versions
SET acknowledged_at = now()
WHERE order_id = $1 AND version = $2 AND acknowledged_at IS NULL
RETURNING *;

-- name: CreateStorefrontOrderEvent :one
INSERT INTO storefront_order_events (
    workspace_id, order_id, event_type, actor_type, actor_user_id, customer_visible, message, metadata
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING *;

-- name: ListStorefrontOrderEvents :many
SELECT * FROM storefront_order_events
WHERE order_id = $1
  AND ($2::boolean = false OR customer_visible = true)
ORDER BY id ASC;

-- name: CreateStorefrontFulfilment :one
INSERT INTO storefront_fulfilments (
    workspace_id, order_id, outlet_id, delivery_method, dispatched_on, recipient_name, tracking_note, cogs_total_minor, created_by_user_id
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
RETURNING *;

-- name: ListStorefrontFulfilments :many
SELECT * FROM storefront_fulfilments
WHERE order_id = $1
ORDER BY id DESC;

-- Analytics
-- name: InsertStorefrontAnalyticsEvent :exec
INSERT INTO storefront_analytics_events (
    workspace_id, storefront_id, event_type, storefront_product_id, collection_id, referrer_class, search_query_hash
) VALUES ($1, $2, $3, $4, $5, $6, $7);

-- name: GetStorefrontAnalyticsSummary :one
SELECT
    count(*) FILTER (WHERE event_type = 'page_view')::bigint AS page_views,
    count(*) FILTER (WHERE event_type = 'product_view')::bigint AS product_views,
    count(*) FILTER (WHERE event_type = 'collection_view')::bigint AS collection_views,
    count(*) FILTER (WHERE event_type = 'search')::bigint AS searches,
    count(*) FILTER (WHERE event_type = 'add_to_cart')::bigint AS add_to_carts,
    count(*) FILTER (WHERE event_type = 'checkout_started')::bigint AS checkouts_started,
    count(*) FILTER (WHERE event_type = 'checkout_submitted')::bigint AS checkouts_submitted,
    count(*) FILTER (WHERE event_type = 'order_confirmed')::bigint AS orders_confirmed,
    count(*) FILTER (WHERE event_type = 'order_declined')::bigint AS orders_declined,
    count(*) FILTER (WHERE event_type = 'order_cancelled')::bigint AS orders_cancelled,
    count(*) FILTER (WHERE event_type = 'order_fulfilled')::bigint AS orders_fulfilled
FROM storefront_analytics_events
WHERE storefront_id = $1 AND workspace_id = $2
  AND occurred_on >= $3;
