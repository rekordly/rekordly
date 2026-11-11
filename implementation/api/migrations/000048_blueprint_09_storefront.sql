-- 000048_blueprint_09_storefront.sql
-- Blueprint 09: Storefront, Public Catalogue Projection, Cart, Checkout Requests,
-- Merchant Order Review, Reservation & Fulfilment, Domains, Analytics & RBAC.

-- 1. Notification categories extension for storefront & order events
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_category_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_category_check
    CHECK (category IN ('system', 'finance', 'invoice', 'inventory', 'team', 'approval', 'storefront', 'orders'));

-- 2. Storefronts (optional per business workspace, draft by default)
CREATE TABLE IF NOT EXISTS storefronts (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 120),
    slug TEXT NOT NULL CHECK (length(btrim(slug)) BETWEEN 3 AND 63 AND slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'unpublished', 'suspended', 'grace', 'disabled')),
    theme_key TEXT NOT NULL DEFAULT 'classic' CHECK (theme_key IN ('classic', 'modern', 'editorial', 'minimal')),
    version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
    default_outlet_id BIGINT REFERENCES inventory_locations(id) ON DELETE SET NULL,
    currency CHAR(3) NOT NULL DEFAULT 'NGN' CHECK (currency ~ '^[A-Z]{3}$'),
    currency_exponent INTEGER NOT NULL DEFAULT 2 CHECK (currency_exponent BETWEEN 0 AND 4),
    reservation_ttl_hours INTEGER NOT NULL DEFAULT 48 CHECK (reservation_ttl_hours >= 0 AND reservation_ttl_hours <= 720),
    entitlement_status TEXT NOT NULL DEFAULT 'active' CHECK (entitlement_status IN ('active', 'grace', 'expired')),
    grace_until TIMESTAMPTZ,
    published_at TIMESTAMPTZ,
    created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS storefronts_slug_uidx ON storefronts (lower(btrim(slug)));

-- 3. Tokenized Storefront Settings (strictly safe design tokens & policies)
CREATE TABLE IF NOT EXISTS storefront_settings (
    storefront_id BIGINT PRIMARY KEY REFERENCES storefronts(id) ON DELETE CASCADE,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    tagline TEXT,
    description TEXT,
    logo_url TEXT,
    banner_url TEXT,
    primary_color TEXT NOT NULL DEFAULT '#111827' CHECK (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
    accent_color TEXT NOT NULL DEFAULT '#0F766E' CHECK (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
    background_color TEXT NOT NULL DEFAULT '#FFFFFF' CHECK (background_color ~ '^#[0-9A-Fa-f]{6}$'),
    text_color TEXT NOT NULL DEFAULT '#111827' CHECK (text_color ~ '^#[0-9A-Fa-f]{6}$'),
    font_family TEXT NOT NULL DEFAULT 'inter' CHECK (font_family IN ('inter', 'plus_jakarta', 'dm_sans', 'merriweather', 'system')),
    section_order JSONB NOT NULL DEFAULT '["hero","featured","collections","all_products","policies","contact"]'::jsonb,
    contact_phone TEXT,
    contact_email TEXT,
    whatsapp_number TEXT,
    address TEXT,
    business_hours JSONB NOT NULL DEFAULT '{}'::jsonb,
    social_links JSONB NOT NULL DEFAULT '{}'::jsonb,
    delivery_methods JSONB NOT NULL DEFAULT '["pickup","merchant_delivery","customer_arranged"]'::jsonb,
    delivery_guidance TEXT,
    default_delivery_fee_minor BIGINT NOT NULL DEFAULT 0 CHECK (default_delivery_fee_minor >= 0),
    checkout_require_email BOOLEAN NOT NULL DEFAULT false,
    checkout_require_phone BOOLEAN NOT NULL DEFAULT true,
    return_policy TEXT,
    privacy_policy TEXT,
    terms_policy TEXT,
    custom_policy TEXT,
    seo_title TEXT,
    seo_description TEXT,
    seo_image_url TEXT,
    seo_indexable BOOLEAN NOT NULL DEFAULT true,
    canonical_domain_id BIGINT,
    version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Storefront Collections & Allowlisted Public Catalogue Projections
CREATE TABLE IF NOT EXISTS storefront_collections (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    storefront_id BIGINT NOT NULL REFERENCES storefronts(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
    slug TEXT NOT NULL CHECK (length(btrim(slug)) BETWEEN 1 AND 80 AND slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
    description TEXT,
    image_url TEXT,
    position INTEGER NOT NULL DEFAULT 0,
    is_visible BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (storefront_id, slug)
);
CREATE INDEX IF NOT EXISTS storefront_collections_store_pos_idx ON storefront_collections (storefront_id, is_visible, position, id);

CREATE TABLE IF NOT EXISTS storefront_products (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    storefront_id BIGINT NOT NULL REFERENCES storefronts(id) ON DELETE CASCADE,
    product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    variant_id BIGINT NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
    collection_id BIGINT REFERENCES storefront_collections(id) ON DELETE SET NULL,
    is_published BOOLEAN NOT NULL DEFAULT true,
    is_featured BOOLEAN NOT NULL DEFAULT false,
    public_title TEXT NOT NULL CHECK (length(btrim(public_title)) > 0),
    public_description TEXT,
    public_sku TEXT,
    image_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
    public_price_minor BIGINT NOT NULL CHECK (public_price_minor >= 0),
    availability_policy TEXT NOT NULL DEFAULT 'in_out_stock' CHECK (availability_policy IN ('in_out_stock', 'exact_quantity', 'low_stock', 'hide_unavailable', 'allow_request')),
    low_stock_threshold INTEGER NOT NULL DEFAULT 5 CHECK (low_stock_threshold >= 0),
    max_qty_per_order INTEGER NOT NULL DEFAULT 50 CHECK (max_qty_per_order > 0),
    contact_only BOOLEAN NOT NULL DEFAULT false,
    position INTEGER NOT NULL DEFAULT 0,
    seo_slug TEXT,
    seo_title TEXT,
    seo_description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (storefront_id, product_id, variant_id)
);
CREATE INDEX IF NOT EXISTS storefront_products_pub_idx ON storefront_products (storefront_id, is_published, is_featured, position, id);

-- 5. Storefront Domains (Subdomains & Custom Domain Ownership/TLS State Machine)
CREATE TABLE IF NOT EXISTS storefront_domains (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    storefront_id BIGINT NOT NULL REFERENCES storefronts(id) ON DELETE CASCADE,
    hostname TEXT NOT NULL CHECK (length(btrim(hostname)) BETWEEN 4 AND 253),
    domain_type TEXT NOT NULL CHECK (domain_type IN ('subdomain', 'custom')),
    status TEXT NOT NULL DEFAULT 'pending_dns' CHECK (status IN ('pending_dns', 'verifying', 'verified', 'certificate_provisioning', 'active', 'error', 'disconnected', 'grace', 'disabled')),
    verification_token TEXT,
    tls_status TEXT NOT NULL DEFAULT 'pending' CHECK (tls_status IN ('pending', 'provisioning', 'active', 'failed')),
    last_checked_at TIMESTAMPTZ,
    check_attempts INTEGER NOT NULL DEFAULT 0 CHECK (check_attempts >= 0),
    last_error TEXT,
    is_primary BOOLEAN NOT NULL DEFAULT false,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS storefront_domains_active_host_uidx
    ON storefront_domains (lower(btrim(hostname)))
    WHERE status NOT IN ('disconnected');
CREATE INDEX IF NOT EXISTS storefront_domains_storefront_idx ON storefront_domains (storefront_id, id DESC);

-- 6. Visitor Carts (Transient, Expiring, Never Reserves Stock)
CREATE TABLE IF NOT EXISTS storefront_carts (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    storefront_id BIGINT NOT NULL REFERENCES storefronts(id) ON DELETE CASCADE,
    cart_token_hash TEXT NOT NULL UNIQUE,
    currency CHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS storefront_cart_lines (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    cart_id BIGINT NOT NULL REFERENCES storefront_carts(id) ON DELETE CASCADE,
    storefront_product_id BIGINT NOT NULL REFERENCES storefront_products(id) ON DELETE CASCADE,
    quantity NUMERIC(18,4) NOT NULL CHECK (quantity > 0),
    unit_price_snapshot_minor BIGINT NOT NULL CHECK (unit_price_snapshot_minor >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (cart_id, storefront_product_id)
);

-- 7. Order Requests, Lines, Commercial Versions, Audit Events, Fulfilments
CREATE TABLE IF NOT EXISTS storefront_order_sequences (
    storefront_id BIGINT PRIMARY KEY REFERENCES storefronts(id) ON DELETE CASCADE,
    next_value BIGINT NOT NULL DEFAULT 1 CHECK (next_value > 0)
);

CREATE TABLE IF NOT EXISTS storefront_orders (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    storefront_id BIGINT NOT NULL REFERENCES storefronts(id) ON DELETE CASCADE,
    order_reference TEXT NOT NULL,
    public_token_hash TEXT NOT NULL UNIQUE,
    customer_id BIGINT REFERENCES counterparties(id) ON DELETE SET NULL,
    outlet_id BIGINT REFERENCES inventory_locations(id) ON DELETE SET NULL,
    commercial_status TEXT NOT NULL DEFAULT 'request_received' CHECK (commercial_status IN ('request_received', 'needs_review', 'quote_changes_requested', 'confirmed', 'declined', 'cancelled', 'completed')),
    fulfilment_status TEXT NOT NULL DEFAULT 'unreserved' CHECK (fulfilment_status IN ('unreserved', 'reserved', 'partially_fulfilled', 'fulfilled', 'returned')),
    payment_status TEXT NOT NULL DEFAULT 'not_requested' CHECK (payment_status IN ('not_requested', 'unpaid', 'partially_paid', 'paid', 'refunded', 'partially_refunded')),
    version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
    currency CHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    currency_exponent INTEGER NOT NULL DEFAULT 2 CHECK (currency_exponent BETWEEN 0 AND 4),
    subtotal_minor BIGINT NOT NULL CHECK (subtotal_minor >= 0),
    tax_minor BIGINT NOT NULL DEFAULT 0 CHECK (tax_minor >= 0),
    delivery_fee_minor BIGINT NOT NULL DEFAULT 0 CHECK (delivery_fee_minor >= 0),
    total_minor BIGINT NOT NULL CHECK (total_minor >= 0),
    delivery_method TEXT NOT NULL CHECK (delivery_method IN ('pickup', 'merchant_delivery', 'customer_arranged')),
    customer_name TEXT NOT NULL CHECK (length(btrim(customer_name)) BETWEEN 1 AND 160),
    customer_phone TEXT,
    customer_email TEXT,
    organization_name TEXT,
    preferred_contact_method TEXT,
    delivery_address TEXT,
    delivery_landmark TEXT,
    preferred_delivery_time TEXT,
    customer_note TEXT,
    policy_acknowledged BOOLEAN NOT NULL DEFAULT true,
    policy_version INTEGER NOT NULL DEFAULT 1,
    payment_arrangement TEXT,
    linked_invoice_id BIGINT REFERENCES invoices(id) ON DELETE SET NULL,
    linked_sale_id BIGINT REFERENCES sales(id) ON DELETE SET NULL,
    linked_invoice_share_token TEXT,
    decline_or_cancel_reason TEXT,
    reservation_expires_at TIMESTAMPTZ,
    idempotency_key TEXT NOT NULL CHECK (length(btrim(idempotency_key)) > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (storefront_id, order_reference),
    UNIQUE (workspace_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS storefront_orders_ws_status_idx ON storefront_orders (workspace_id, commercial_status, id DESC);

CREATE TABLE IF NOT EXISTS storefront_order_lines (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    order_id BIGINT NOT NULL REFERENCES storefront_orders(id) ON DELETE CASCADE,
    storefront_product_id BIGINT REFERENCES storefront_products(id) ON DELETE SET NULL,
    product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    variant_id BIGINT REFERENCES product_variants(id) ON DELETE RESTRICT,
    product_kind TEXT NOT NULL,
    title_snapshot TEXT NOT NULL,
    variant_snapshot TEXT,
    unit_name TEXT NOT NULL,
    requested_quantity NUMERIC(18,4) NOT NULL CHECK (requested_quantity > 0),
    confirmed_quantity NUMERIC(18,4) NOT NULL CHECK (confirmed_quantity >= 0),
    fulfilled_quantity NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (fulfilled_quantity >= 0),
    unit_price_minor BIGINT NOT NULL CHECK (unit_price_minor >= 0),
    line_total_minor BIGINT NOT NULL CHECK (line_total_minor >= 0),
    reservation_id BIGINT REFERENCES stock_reservations(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS storefront_order_lines_order_idx ON storefront_order_lines (workspace_id, order_id, id);

CREATE TABLE IF NOT EXISTS storefront_order_versions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    order_id BIGINT NOT NULL REFERENCES storefront_orders(id) ON DELETE CASCADE,
    version INTEGER NOT NULL CHECK (version > 0),
    snapshot JSONB NOT NULL,
    change_summary TEXT,
    requires_customer_ack BOOLEAN NOT NULL DEFAULT false,
    acknowledged_at TIMESTAMPTZ,
    actor_type TEXT NOT NULL CHECK (actor_type IN ('customer', 'merchant', 'system')),
    actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (order_id, version)
);

CREATE TABLE IF NOT EXISTS storefront_order_events (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    order_id BIGINT NOT NULL REFERENCES storefront_orders(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    actor_type TEXT NOT NULL CHECK (actor_type IN ('customer', 'merchant', 'system')),
    actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    customer_visible BOOLEAN NOT NULL DEFAULT true,
    message TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS storefront_order_events_order_idx ON storefront_order_events (order_id, id ASC);

CREATE TABLE IF NOT EXISTS storefront_fulfilments (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    order_id BIGINT NOT NULL REFERENCES storefront_orders(id) ON DELETE CASCADE,
    outlet_id BIGINT NOT NULL REFERENCES inventory_locations(id) ON DELETE RESTRICT,
    delivery_method TEXT NOT NULL,
    dispatched_on DATE NOT NULL,
    recipient_name TEXT,
    tracking_note TEXT,
    cogs_total_minor BIGINT NOT NULL DEFAULT 0 CHECK (cogs_total_minor >= 0),
    created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. Privacy-Minimized Storefront Analytics
CREATE TABLE IF NOT EXISTS storefront_analytics_events (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    storefront_id BIGINT NOT NULL REFERENCES storefronts(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL CHECK (event_type IN ('page_view', 'product_view', 'collection_view', 'search', 'add_to_cart', 'checkout_started', 'checkout_submitted', 'order_confirmed', 'order_declined', 'order_cancelled', 'order_fulfilled')),
    storefront_product_id BIGINT,
    collection_id BIGINT,
    referrer_class TEXT,
    search_query_hash TEXT,
    occurred_on DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS storefront_analytics_store_date_idx ON storefront_analytics_events (storefront_id, occurred_on DESC, event_type);

-- 9. Seed Blueprint 09 RBAC Permissions into role_permissions
WITH role_perm_map(role_code, perm_code) AS (
    VALUES
        ('admin', 'storefront.view'), ('admin', 'storefront.manage_appearance'),
        ('admin', 'storefront.manage_catalogue'), ('admin', 'storefront.manage_checkout'),
        ('admin', 'storefront.publish'), ('admin', 'storefront.manage_domain'),
        ('admin', 'orders.view'), ('admin', 'orders.review'),
        ('admin', 'orders.confirm'), ('admin', 'orders.fulfil'),
        ('admin', 'orders.cancel'), ('admin', 'orders.export'),
        ('sales', 'storefront.view'), ('sales', 'orders.view'),
        ('sales', 'orders.review'), ('sales', 'orders.confirm'),
        ('sales', 'orders.fulfil'), ('sales', 'orders.cancel'),
        ('inventory_manager', 'orders.view'), ('inventory_manager', 'orders.fulfil'),
        ('inventory_manager', 'orders.cancel'),
        ('accountant', 'storefront.view'), ('accountant', 'orders.view'),
        ('accountant', 'orders.export'),
        ('viewer', 'storefront.view'), ('viewer', 'orders.view')
)
INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, m.perm_code
FROM roles r
JOIN role_perm_map m ON m.role_code = r.code
ON CONFLICT (role_id, permission_code) DO NOTHING;
