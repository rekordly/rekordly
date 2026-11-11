-- Blueprint 07 foundation. Catalogue setup is intentionally separate from
-- inventory movements: creating an item never creates stock or accounting entries.
CREATE TABLE products (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL CONSTRAINT products_name_check CHECK (length(btrim(name)) > 0),
    description TEXT,
    kind TEXT NOT NULL CONSTRAINT products_kind_check CHECK (kind IN ('service', 'non_stock', 'stock_tracked')),
    status TEXT NOT NULL DEFAULT 'active' CONSTRAINT products_status_check CHECK (status IN ('draft', 'active', 'archived')),
    unit_name TEXT NOT NULL DEFAULT 'each' CONSTRAINT products_unit_name_check CHECK (length(btrim(unit_name)) > 0),
    idempotency_key TEXT NOT NULL CONSTRAINT products_idempotency_key_check CHECK (length(btrim(idempotency_key)) > 0),
    created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT products_workspace_idempotency_uidx UNIQUE (workspace_id, idempotency_key)
);
CREATE INDEX products_workspace_id_desc_idx ON products (workspace_id, id DESC);

CREATE TABLE product_variants (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT 'Default' CONSTRAINT product_variants_name_check CHECK (length(btrim(name)) > 0),
    sku TEXT,
    barcode TEXT,
    selling_price_minor BIGINT NOT NULL CONSTRAINT product_variants_selling_price_check CHECK (selling_price_minor >= 0),
    currency CHAR(3) NOT NULL CONSTRAINT product_variants_currency_check CHECK (currency ~ '^[A-Z]{3}$'),
    currency_exponent INTEGER NOT NULL CONSTRAINT product_variants_exponent_check CHECK (currency_exponent >= 0 AND currency_exponent <= 4),
    is_default BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX product_variants_workspace_product_idx ON product_variants (workspace_id, product_id);
CREATE UNIQUE INDEX product_variants_one_default_idx ON product_variants (product_id) WHERE is_default;
CREATE UNIQUE INDEX product_variants_workspace_sku_uidx ON product_variants (workspace_id, lower(sku)) WHERE sku IS NOT NULL AND btrim(sku) <> '';
CREATE UNIQUE INDEX product_variants_workspace_barcode_uidx ON product_variants (workspace_id, barcode) WHERE barcode IS NOT NULL AND btrim(barcode) <> '';
