-- Blueprint 07: Product variants and options matrix
CREATE TABLE IF NOT EXISTS product_options (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    name TEXT NOT NULL CONSTRAINT product_options_name_check CHECK (length(btrim(name)) > 0),
    position INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS product_options_workspace_product_idx ON product_options (workspace_id, product_id, position);
CREATE UNIQUE INDEX IF NOT EXISTS product_options_product_name_uidx ON product_options (product_id, lower(name));

CREATE TABLE IF NOT EXISTS product_option_values (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    option_id BIGINT NOT NULL REFERENCES product_options(id) ON DELETE CASCADE,
    product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    value TEXT NOT NULL CONSTRAINT product_option_values_val_check CHECK (length(btrim(value)) > 0),
    position INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS product_option_values_product_idx ON product_option_values (workspace_id, product_id);
CREATE UNIQUE INDEX IF NOT EXISTS product_option_values_option_val_uidx ON product_option_values (option_id, lower(value));

CREATE TABLE IF NOT EXISTS variant_option_values (
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    variant_id BIGINT NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
    option_value_id BIGINT NOT NULL REFERENCES product_option_values(id) ON DELETE CASCADE,
    PRIMARY KEY (variant_id, option_value_id)
);
CREATE INDEX IF NOT EXISTS variant_option_values_workspace_idx ON variant_option_values (workspace_id, option_value_id);

ALTER TABLE product_variants
    ADD COLUMN IF NOT EXISTS cost_price_minor BIGINT NOT NULL DEFAULT 0;
