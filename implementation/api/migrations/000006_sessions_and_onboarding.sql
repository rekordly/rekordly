ALTER TABLE workspaces
    ADD COLUMN business_type TEXT,
    ADD COLUMN country_code CHAR(2),
    ADD CONSTRAINT workspaces_business_type_length_check
        CHECK (business_type IS NULL OR char_length(business_type) BETWEEN 2 AND 80),
    ADD CONSTRAINT workspaces_country_code_format_check
        CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$');

