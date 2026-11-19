ALTER TABLE storefront_settings
    ADD COLUMN theme_drafts JSONB NOT NULL DEFAULT '{}'::jsonb;
