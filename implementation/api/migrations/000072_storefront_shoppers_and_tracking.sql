-- 000072_storefront_shoppers_and_tracking.sql
-- Passwordless shopper identity and order tracking.

CREATE TABLE IF NOT EXISTS shoppers (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT,
    phone TEXT,
    saved_addresses JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS shoppers_email_idx ON shoppers (lower(btrim(email)));

CREATE TABLE IF NOT EXISTS shopper_login_codes (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    shopper_email TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    used_at TIMESTAMPTZ,
    ip_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS shopper_login_codes_email_idx ON shopper_login_codes (lower(btrim(shopper_email)), expires_at DESC);

CREATE TABLE IF NOT EXISTS shopper_sessions (
    token_hash TEXT PRIMARY KEY,
    shopper_id BIGINT NOT NULL REFERENCES shoppers(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS shopper_sessions_shopper_idx ON shopper_sessions (shopper_id);

ALTER TABLE storefront_orders
    ADD COLUMN IF NOT EXISTS shopper_id BIGINT REFERENCES shoppers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS storefront_orders_shopper_idx ON storefront_orders (shopper_id);
