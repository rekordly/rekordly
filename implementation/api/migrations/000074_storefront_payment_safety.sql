-- 000074_storefront_payment_safety.sql
-- Payment attempt mismatch/duplicate statuses, received amount tracking, and order attention metadata.

ALTER TABLE storefront_payment_attempts DROP CONSTRAINT IF EXISTS storefront_payment_attempts_status_check;
ALTER TABLE storefront_payment_attempts ADD CONSTRAINT storefront_payment_attempts_status_check
    CHECK (status IN ('pending', 'paid', 'paid_wrong_amount', 'duplicate_payment', 'expired', 'failed', 'rejected'));

ALTER TABLE storefront_payment_attempts
    ADD COLUMN IF NOT EXISTS received_amount_minor BIGINT CHECK (received_amount_minor IS NULL OR received_amount_minor >= 0);

ALTER TABLE storefront_orders
    ADD COLUMN IF NOT EXISTS payment_attention_reason TEXT
        CHECK (payment_attention_reason IS NULL OR payment_attention_reason IN ('wrong_amount', 'duplicate_payment', 'late_payment_out_of_stock')),
    ADD COLUMN IF NOT EXISTS payment_attention_message TEXT;
