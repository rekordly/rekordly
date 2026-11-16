-- Migration 000062: product_price_history compare-at, source, and price commands idempotency
ALTER TABLE product_price_history ADD COLUMN IF NOT EXISTS old_compare_at_price_minor BIGINT;
ALTER TABLE product_price_history ADD COLUMN IF NOT EXISTS new_compare_at_price_minor BIGINT;
ALTER TABLE product_price_history ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'edit';

CREATE TABLE IF NOT EXISTS product_price_commands (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    idempotency_key TEXT NOT NULL,
    product_id BIGINT REFERENCES products(id) ON DELETE CASCADE,
    response_payload JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(workspace_id, idempotency_key)
);
