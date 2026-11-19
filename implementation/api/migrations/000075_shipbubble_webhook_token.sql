ALTER TABLE storefront_settings
    ADD COLUMN IF NOT EXISTS shipbubble_webhook_token TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS storefront_settings_shipbubble_webhook_token_uidx
    ON storefront_settings (shipbubble_webhook_token)
    WHERE shipbubble_webhook_token IS NOT NULL;
