-- Storefront Phase 1: editable theme drafts and one product catalogue.
ALTER TABLE storefronts DROP CONSTRAINT IF EXISTS storefronts_theme_key_check;
UPDATE storefronts
SET theme_key = CASE theme_key
    WHEN 'editorial' THEN 'boutique'
    WHEN 'classic' THEN 'simple'
    WHEN 'minimal' THEN 'simple'
    WHEN 'modern' THEN 'simple'
    ELSE theme_key
END;

ALTER TABLE storefront_settings
    ADD COLUMN IF NOT EXISTS brand JSONB NOT NULL DEFAULT '{"palette":"green","font_style":"modern"}'::jsonb,
    ADD COLUMN IF NOT EXISTS sections JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS draft_name TEXT,
    ADD COLUMN IF NOT EXISTS draft_theme_key TEXT NOT NULL DEFAULT 'simple',
    ADD COLUMN IF NOT EXISTS draft_brand JSONB NOT NULL DEFAULT '{"palette":"green","font_style":"modern"}'::jsonb,
    ADD COLUMN IF NOT EXISTS draft_sections JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS auto_show_new_products BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS show_sold_out BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS show_stock_count BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS low_stock_threshold INTEGER NOT NULL DEFAULT 3 CHECK (low_stock_threshold >= 0);

-- Carry legacy appearance settings into the new brand shape. Preserve the old columns for readers.
UPDATE storefront_settings st
SET brand = jsonb_build_object(
        'logo_url', NULLIF(st.logo_url, ''),
        'palette', CASE WHEN st.primary_color = '#166534' THEN 'green' ELSE 'custom' END,
        'custom_color', st.primary_color,
        'font_style', CASE WHEN st.font_family = 'merriweather' THEN 'classic' WHEN st.font_family = 'plus_jakarta' THEN 'friendly' ELSE 'modern' END
    ),
    draft_brand = jsonb_build_object(
        'logo_url', NULLIF(st.logo_url, ''),
        'palette', CASE WHEN st.primary_color = '#166534' THEN 'green' ELSE 'custom' END,
        'custom_color', st.primary_color,
        'font_style', CASE WHEN st.font_family = 'merriweather' THEN 'classic' WHEN st.font_family = 'plus_jakarta' THEN 'friendly' ELSE 'modern' END
    ),
    sections = COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
            'id', section_key || '-' || ord::text,
            'type', section_key,
            'enabled', true,
            'content', CASE section_key
                WHEN 'hero' THEN jsonb_build_object('image', st.banner_url, 'heading', COALESCE(st.tagline, 'Welcome'), 'subheading', COALESCE(st.description, 'Quality products, delivered to you'), 'button_label', 'Shop now')
                WHEN 'product_grid' THEN jsonb_build_object('title', 'Shop our products', 'source', 'new', 'limit', 12)
                WHEN 'about' THEN jsonb_build_object('heading', 'About us', 'body', COALESCE(st.description, ''))
                ELSE '{}'::jsonb
            END
        ) ORDER BY ord)
        FROM (
            SELECT CASE value
                WHEN 'featured' THEN 'product_grid'
                WHEN 'all_products' THEN 'product_grid'
                WHEN 'policies' THEN 'about'
                WHEN 'collections' THEN 'collections'
                WHEN 'contact' THEN 'contact'
                WHEN 'hero' THEN 'hero'
                ELSE NULL
            END AS section_key, ord
            FROM jsonb_array_elements_text(st.section_order) WITH ORDINALITY AS item(value, ord)
        ) old_sections
        WHERE section_key IS NOT NULL
    ), '[]'::jsonb),
    draft_sections = COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
            'id', section_key || '-' || ord::text,
            'type', section_key,
            'enabled', true,
            'content', CASE section_key
                WHEN 'hero' THEN jsonb_build_object('image', st.banner_url, 'heading', COALESCE(st.tagline, 'Welcome'), 'subheading', COALESCE(st.description, 'Quality products, delivered to you'), 'button_label', 'Shop now')
                WHEN 'product_grid' THEN jsonb_build_object('title', 'Shop our products', 'source', 'new', 'limit', 12)
                WHEN 'about' THEN jsonb_build_object('heading', 'About us', 'body', COALESCE(st.description, ''))
                ELSE '{}'::jsonb
            END
        ) ORDER BY ord)
        FROM (
            SELECT CASE value
                WHEN 'featured' THEN 'product_grid'
                WHEN 'all_products' THEN 'product_grid'
                WHEN 'policies' THEN 'about'
                WHEN 'collections' THEN 'collections'
                WHEN 'contact' THEN 'contact'
                WHEN 'hero' THEN 'hero'
                ELSE NULL
            END AS section_key, ord
            FROM jsonb_array_elements_text(st.section_order) WITH ORDINALITY AS item(value, ord)
        ) old_sections
        WHERE section_key IS NOT NULL
    ), '[]'::jsonb),
    draft_theme_key = sf.theme_key,
    draft_name = sf.name,
    published_at = sf.published_at
FROM storefronts sf
WHERE sf.id = st.storefront_id AND sf.workspace_id = st.workspace_id;

UPDATE storefront_settings st
SET draft_theme_key = sf.theme_key
FROM storefronts sf
WHERE sf.id = st.storefront_id AND st.draft_theme_key = 'simple';

UPDATE storefront_settings st
SET draft_name = sf.name
FROM storefronts sf
WHERE sf.id = st.storefront_id AND st.workspace_id = sf.workspace_id AND st.draft_name IS NULL;

-- Products are the online catalogue. Existing projection ids remain in place for carts and orders.
ALTER TABLE products ADD COLUMN IF NOT EXISTS show_on_store BOOLEAN NOT NULL DEFAULT true;
UPDATE products p
SET show_on_store = (p.archived_at IS NULL)
WHERE NOT EXISTS (SELECT 1 FROM storefront_products sp WHERE sp.workspace_id = p.workspace_id AND sp.product_id = p.id AND sp.is_published = true);

ALTER TABLE product_collections
    ADD COLUMN IF NOT EXISTS show_on_store BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Merge storefront collections into the product collection set by workspace and normalized name.
INSERT INTO product_collections (workspace_id, name, description, position, image_url)
SELECT sc.workspace_id, sc.name, sc.description, sc.position, sc.image_url
FROM storefront_collections sc
ON CONFLICT (workspace_id, lower(name)) DO NOTHING;

INSERT INTO product_collection_items (workspace_id, collection_id, product_id)
SELECT sp.workspace_id, pc.id, sp.product_id
FROM storefront_products sp
JOIN storefront_collections sc ON sc.id = sp.collection_id AND sc.workspace_id = sp.workspace_id
JOIN product_collections pc ON pc.workspace_id = sc.workspace_id AND lower(pc.name) = lower(sc.name)
ON CONFLICT (collection_id, product_id) DO NOTHING;

-- These columns remain temporarily for compatibility, but cease to be authoritative.
ALTER TABLE storefront_products
    ALTER COLUMN public_title DROP NOT NULL,
    ALTER COLUMN public_price_minor DROP NOT NULL,
    ALTER COLUMN public_description DROP NOT NULL,
    ALTER COLUMN public_sku DROP NOT NULL,
    ALTER COLUMN image_urls DROP NOT NULL,
    ALTER COLUMN availability_policy DROP NOT NULL,
    ALTER COLUMN low_stock_threshold DROP NOT NULL,
    ALTER COLUMN max_qty_per_order DROP NOT NULL,
    ALTER COLUMN contact_only DROP NOT NULL,
    ALTER COLUMN seo_slug DROP NOT NULL,
    ALTER COLUMN seo_title DROP NOT NULL,
    ALTER COLUMN seo_description DROP NOT NULL;

ALTER TABLE storefront_products DROP CONSTRAINT IF EXISTS storefront_products_public_price_minor_check;

CREATE TABLE IF NOT EXISTS storefront_design_events (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    storefront_id BIGINT NOT NULL REFERENCES storefronts(id) ON DELETE CASCADE,
    actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL CHECK (event_type IN ('draft_saved', 'published', 'discarded')),
    idempotency_key TEXT NOT NULL CHECK (length(btrim(idempotency_key)) > 0),
    request_hash TEXT NOT NULL CHECK (length(request_hash) = 64),
    version INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS storefront_design_events_store_idx ON storefront_design_events (workspace_id, storefront_id, id DESC);

CREATE TABLE IF NOT EXISTS storefront_catalogue_mutations (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    idempotency_key TEXT NOT NULL CHECK (length(btrim(idempotency_key)) > 0),
    request_hash TEXT NOT NULL CHECK (length(request_hash) = 64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, idempotency_key)
);

ALTER TABLE sales
    ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'in_person' CHECK (source IN ('in_person', 'online_store')),
    ADD COLUMN IF NOT EXISTS storefront_order_id BIGINT REFERENCES storefront_orders(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS sales_storefront_order_uidx ON sales (workspace_id, storefront_order_id) WHERE storefront_order_id IS NOT NULL;

-- Create the stable link row for active catalogue variants that are enabled for the store.
INSERT INTO storefront_products (
    workspace_id, storefront_id, product_id, variant_id, is_published, is_featured
)
SELECT p.workspace_id, sf.id, p.id, pv.id, p.show_on_store AND pv.is_active, false
FROM storefronts sf
JOIN products p ON p.workspace_id = sf.workspace_id AND p.status = 'active' AND p.archived_at IS NULL AND p.show_on_store = true
JOIN product_variants pv ON pv.workspace_id = p.workspace_id AND pv.product_id = p.id AND pv.is_active = true
ON CONFLICT (storefront_id, product_id, variant_id) DO UPDATE
SET is_published = EXCLUDED.is_published, updated_at = now();

CREATE OR REPLACE FUNCTION sync_storefront_product_links(p_workspace_id BIGINT, p_product_id BIGINT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO storefront_products (
        workspace_id, storefront_id, product_id, variant_id, is_published, is_featured
    )
    SELECT p.workspace_id, sf.id, p.id, pv.id, true, false
    FROM storefronts sf
    JOIN products p ON p.workspace_id = sf.workspace_id AND p.id = p_product_id
        AND p.workspace_id = p_workspace_id AND p.status = 'active' AND p.archived_at IS NULL AND p.show_on_store
    JOIN product_variants pv ON pv.workspace_id = p.workspace_id AND pv.product_id = p.id AND pv.is_active AND pv.archived_at IS NULL
    WHERE sf.workspace_id = p_workspace_id
    ON CONFLICT (storefront_id, product_id, variant_id) DO UPDATE
    SET is_published = true, updated_at = now();

    UPDATE storefront_products sp
    SET is_published = p.show_on_store AND p.status = 'active' AND p.archived_at IS NULL AND pv.is_active AND pv.archived_at IS NULL,
        updated_at = now()
    FROM products p
    JOIN product_variants pv ON pv.workspace_id = p.workspace_id AND pv.product_id = p.id
    WHERE sp.workspace_id = p_workspace_id AND sp.product_id = p_product_id
      AND p.workspace_id = sp.workspace_id AND p.id = sp.product_id
      AND pv.workspace_id = sp.workspace_id AND pv.id = sp.variant_id;
END;
$$;

CREATE OR REPLACE FUNCTION trigger_sync_storefront_product_links()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_TABLE_NAME = 'storefronts' THEN
        PERFORM sync_storefront_product_links(NEW.workspace_id, p.id)
        FROM products p WHERE p.workspace_id = NEW.workspace_id;
    ELSIF TG_TABLE_NAME = 'products' THEN
        PERFORM sync_storefront_product_links(NEW.workspace_id, NEW.id);
    ELSE
        PERFORM sync_storefront_product_links(NEW.workspace_id, NEW.product_id);
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS storefront_sync_product_on_store ON products;
CREATE TRIGGER storefront_sync_product_on_store AFTER INSERT OR UPDATE OF status, archived_at, show_on_store ON products
FOR EACH ROW EXECUTE FUNCTION trigger_sync_storefront_product_links();

DROP TRIGGER IF EXISTS storefront_sync_variant_on_store ON product_variants;
CREATE TRIGGER storefront_sync_variant_on_store AFTER INSERT OR UPDATE OF product_id, is_active, archived_at ON product_variants
FOR EACH ROW EXECUTE FUNCTION trigger_sync_storefront_product_links();

DROP TRIGGER IF EXISTS storefront_seed_products_on_create ON storefronts;
CREATE TRIGGER storefront_seed_products_on_create AFTER INSERT ON storefronts
FOR EACH ROW EXECUTE FUNCTION trigger_sync_storefront_product_links();
