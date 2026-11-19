-- 000070_storefront_payments_and_payouts.sql
-- Storefront payments, merchant payout accounts, payment attempts, and webhook idempotency.

CREATE TABLE IF NOT EXISTS merchant_payout_accounts (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    provider TEXT NOT NULL CHECK (provider IN ('paystack', 'squad')),
    bank_code TEXT NOT NULL,
    account_number_last4 TEXT NOT NULL CHECK (length(account_number_last4) = 4),
    account_name TEXT NOT NULL,
    subaccount_ref TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('pending', 'active', 'failed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, provider)
);
CREATE INDEX IF NOT EXISTS merchant_payout_accounts_ws_idx ON merchant_payout_accounts (workspace_id);

CREATE TABLE IF NOT EXISTS storefront_payment_attempts (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    order_id BIGINT NOT NULL REFERENCES storefront_orders(id) ON DELETE CASCADE,
    provider TEXT NOT NULL CHECK (provider IN ('paystack', 'squad')),
    method TEXT NOT NULL CHECK (method IN ('virtual_account', 'card')),
    reference TEXT NOT NULL UNIQUE,
    amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
    fee_minor BIGINT NOT NULL DEFAULT 0 CHECK (fee_minor >= 0),
    commission_minor BIGINT NOT NULL DEFAULT 0 CHECK (commission_minor >= 0),
    virtual_account_number TEXT,
    bank_name TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'expired', 'failed', 'rejected')),
    raw_event JSONB,
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS storefront_payment_attempts_order_idx ON storefront_payment_attempts (workspace_id, order_id, id DESC);

CREATE TABLE IF NOT EXISTS payment_webhook_events (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    provider TEXT NOT NULL CHECK (provider IN ('paystack', 'squad', 'shipbubble')),
    event_id TEXT NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at TIMESTAMPTZ,
    outcome TEXT NOT NULL DEFAULT 'processed',
    UNIQUE (provider, event_id)
);

ALTER TABLE storefront_settings
    ADD COLUMN IF NOT EXISTS payment_bank_transfer_enabled BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS payment_card_enabled BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS payment_manual_transfer_enabled BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS payment_cod_enabled BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS fee_bearer TEXT NOT NULL DEFAULT 'merchant' CHECK (fee_bearer IN ('merchant', 'customer')),
    ADD COLUMN IF NOT EXISTS hold_payment_minutes INTEGER NOT NULL DEFAULT 15 CHECK (hold_payment_minutes > 0),
    ADD COLUMN IF NOT EXISTS hold_manual_transfer_hours INTEGER NOT NULL DEFAULT 2 CHECK (hold_manual_transfer_hours > 0),
    ADD COLUMN IF NOT EXISTS hold_confirmation_hours INTEGER NOT NULL DEFAULT 2 CHECK (hold_confirmation_hours > 0),
    ADD COLUMN IF NOT EXISTS hold_pickup_hours INTEGER NOT NULL DEFAULT 48 CHECK (hold_pickup_hours > 0);

ALTER TABLE storefront_orders
    ADD COLUMN IF NOT EXISTS hold_type TEXT CHECK (hold_type IS NULL OR hold_type IN ('payment', 'transfer_manual', 'awaiting_confirmation', 'pickup')),
    ADD COLUMN IF NOT EXISTS processing_fee_minor BIGINT NOT NULL DEFAULT 0 CHECK (processing_fee_minor >= 0);

ALTER TABLE storefront_orders DROP CONSTRAINT IF EXISTS storefront_orders_payment_status_check;
ALTER TABLE storefront_orders ADD CONSTRAINT storefront_orders_payment_status_check
    CHECK (payment_status IN ('not_requested', 'unpaid', 'partially_paid', 'paid', 'paid_needs_attention', 'refunded', 'partially_refunded'));

ALTER TABLE sales
    ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'pos', 'online_store', 'invoice'));
