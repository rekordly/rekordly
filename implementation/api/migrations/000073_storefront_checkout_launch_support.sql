-- 000073_storefront_checkout_launch_support.sql
-- Courier delivery method constraint, encrypted status token for shopper portal,
-- manual bank transfer display fields, shipping rate cache, and shopper email link tokens.

ALTER TABLE storefront_orders DROP CONSTRAINT IF EXISTS storefront_orders_delivery_method_check;
ALTER TABLE storefront_orders ADD CONSTRAINT storefront_orders_delivery_method_check
    CHECK (delivery_method IN ('pickup', 'merchant_delivery', 'customer_arranged', 'courier'));

ALTER TABLE storefront_orders
    ADD COLUMN IF NOT EXISTS public_token_enc TEXT,
    ADD COLUMN IF NOT EXISTS courier_service_code TEXT,
    ADD COLUMN IF NOT EXISTS courier_id TEXT,
    ADD COLUMN IF NOT EXISTS courier_tracking_url TEXT;

ALTER TABLE storefront_settings
    ADD COLUMN IF NOT EXISTS manual_bank_name TEXT,
    ADD COLUMN IF NOT EXISTS manual_bank_account_number TEXT,
    ADD COLUMN IF NOT EXISTS manual_bank_account_name TEXT;

ALTER TABLE shopper_login_codes
    ADD COLUMN IF NOT EXISTS link_token_hash TEXT;
CREATE INDEX IF NOT EXISTS shopper_login_codes_link_token_idx
    ON shopper_login_codes (link_token_hash) WHERE link_token_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS storefront_shipping_rate_cache (
    cache_key TEXT PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    storefront_id BIGINT NOT NULL REFERENCES storefronts(id) ON DELETE CASCADE,
    request_token TEXT NOT NULL,
    rates_json JSONB NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS storefront_shipping_rate_cache_token_idx
    ON storefront_shipping_rate_cache (storefront_id, request_token, expires_at DESC);
