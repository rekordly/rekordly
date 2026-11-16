ALTER TABLE storefront_settings
    ADD COLUMN IF NOT EXISTS free_delivery_threshold_minor BIGINT
        CHECK (free_delivery_threshold_minor IS NULL OR free_delivery_threshold_minor >= 0);

CREATE TABLE IF NOT EXISTS storefront_delivery_areas (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    storefront_id BIGINT NOT NULL REFERENCES storefronts(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
    fee_minor BIGINT NOT NULL DEFAULT 0 CHECK (fee_minor >= 0),
    description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 400),
    position INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, storefront_id, id)
);
CREATE UNIQUE INDEX IF NOT EXISTS storefront_delivery_area_name_uidx
    ON storefront_delivery_areas (workspace_id, storefront_id, lower(btrim(name)));
CREATE INDEX IF NOT EXISTS storefront_delivery_areas_active_idx
    ON storefront_delivery_areas (workspace_id, storefront_id, position, id)
    WHERE is_active;

ALTER TABLE storefront_orders ADD COLUMN IF NOT EXISTS delivery_area_id BIGINT
    REFERENCES storefront_delivery_areas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS storefront_analytics_referrer_idx
    ON storefront_analytics_events (workspace_id, storefront_id, occurred_on, referrer_class);
CREATE INDEX IF NOT EXISTS storefront_analytics_product_idx
    ON storefront_analytics_events (workspace_id, storefront_id, occurred_on, storefront_product_id)
    WHERE storefront_product_id IS NOT NULL;

ALTER TABLE storefront_analytics_events ADD COLUMN IF NOT EXISTS visitor_key_hash TEXT;
CREATE INDEX IF NOT EXISTS storefront_analytics_visitor_idx
    ON storefront_analytics_events (workspace_id, storefront_id, occurred_on, visitor_key_hash)
    WHERE visitor_key_hash IS NOT NULL;
