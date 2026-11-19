-- 000071_storefront_delivery_and_pickup.sql
-- Delivery areas extension, pickup points, Shipbubble configuration and package weights.

ALTER TABLE storefront_delivery_areas
    ADD COLUMN IF NOT EXISTS state TEXT,
    ADD COLUMN IF NOT EXISTS estimate_text TEXT NOT NULL DEFAULT '' CHECK (length(estimate_text) <= 100),
    ADD COLUMN IF NOT EXISTS outlet_id BIGINT REFERENCES inventory_locations(id) ON DELETE SET NULL;

ALTER TABLE inventory_locations
    ADD COLUMN IF NOT EXISTS is_pickup_point BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS pickup_note TEXT NOT NULL DEFAULT '' CHECK (length(pickup_note) <= 500);

ALTER TABLE storefront_orders
    ADD COLUMN IF NOT EXISTS pickup_code TEXT CHECK (pickup_code IS NULL OR length(pickup_code) = 6),
    ADD COLUMN IF NOT EXISTS pickup_point_id BIGINT REFERENCES inventory_locations(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS courier_name TEXT,
    ADD COLUMN IF NOT EXISTS courier_tracking_number TEXT,
    ADD COLUMN IF NOT EXISTS courier_status TEXT,
    ADD COLUMN IF NOT EXISTS courier_booking_error TEXT,
    ADD COLUMN IF NOT EXISTS rate_token TEXT;

ALTER TABLE products
    ADD COLUMN IF NOT EXISTS weight_grams INTEGER CHECK (weight_grams IS NULL OR weight_grams >= 0);

ALTER TABLE product_variants
    ADD COLUMN IF NOT EXISTS weight_grams INTEGER CHECK (weight_grams IS NULL OR weight_grams >= 0);

ALTER TABLE storefront_settings
    ADD COLUMN IF NOT EXISTS default_weight_grams INTEGER NOT NULL DEFAULT 500 CHECK (default_weight_grams >= 0),
    ADD COLUMN IF NOT EXISTS shipbubble_api_key TEXT,
    ADD COLUMN IF NOT EXISTS shipbubble_strategy TEXT NOT NULL DEFAULT 'cheapest' CHECK (shipbubble_strategy IN ('cheapest', 'selected')),
    ADD COLUMN IF NOT EXISTS shipbubble_couriers JSONB NOT NULL DEFAULT '[]'::jsonb;
