CREATE TABLE IF NOT EXISTS storefront_theme_purchases (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    storefront_id BIGINT NOT NULL REFERENCES storefronts(id) ON DELETE CASCADE,
    theme_key TEXT NOT NULL CHECK (theme_key IN ('bold', 'market', 'studio')),
    plan_version_id BIGINT NOT NULL REFERENCES plan_versions(id) ON DELETE RESTRICT,
    billing_transaction_id BIGINT NOT NULL UNIQUE REFERENCES billing_transactions(id) ON DELETE RESTRICT,
    purchased_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, theme_key)
);
CREATE INDEX IF NOT EXISTS storefront_theme_purchases_store_idx
    ON storefront_theme_purchases (workspace_id, storefront_id, theme_key);

ALTER TABLE storefront_settings
    ADD COLUMN IF NOT EXISTS meta_pixel_id TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS tiktok_pixel_id TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS google_analytics_id TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS storefront_newsletter_subscribers (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    storefront_id BIGINT NOT NULL REFERENCES storefronts(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    normalized_email TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'subscribed' CHECK (status IN ('subscribed', 'unsubscribed')),
    consented_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    unsubscribed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, storefront_id, normalized_email)
);
CREATE INDEX IF NOT EXISTS storefront_newsletter_active_idx
    ON storefront_newsletter_subscribers (workspace_id, storefront_id, id DESC)
    WHERE status = 'subscribed';

CREATE TABLE IF NOT EXISTS storefront_product_reviews (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    storefront_id BIGINT NOT NULL REFERENCES storefronts(id) ON DELETE CASCADE,
    product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    reviewer_name TEXT NOT NULL CHECK (length(btrim(reviewer_name)) BETWEEN 1 AND 120),
    rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    review_text TEXT NOT NULL DEFAULT '' CHECK (length(review_text) <= 3000),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'published', 'rejected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    reviewed_at TIMESTAMPTZ,
    reviewed_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS storefront_reviews_public_idx
    ON storefront_product_reviews (workspace_id, storefront_id, product_id, created_at DESC)
    WHERE status = 'published';
CREATE INDEX IF NOT EXISTS storefront_reviews_moderation_idx
    ON storefront_product_reviews (workspace_id, storefront_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS storefront_cart_reminder_jobs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    storefront_id BIGINT NOT NULL REFERENCES storefronts(id) ON DELETE CASCADE,
    cart_id BIGINT NOT NULL REFERENCES storefront_carts(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    visitor_token_hash TEXT NOT NULL,
    due_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'cancelled', 'failed')),
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, cart_id)
);
CREATE INDEX IF NOT EXISTS storefront_cart_reminders_due_idx
    ON storefront_cart_reminder_jobs (due_at, id)
    WHERE status = 'pending';
