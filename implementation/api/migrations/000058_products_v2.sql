-- Products v2: richer product records, where they are sold, collections,
-- price and change history, and product imports.

-- Public store copy and images live on the product so every channel can reuse them.
ALTER TABLE products
    ADD COLUMN IF NOT EXISTS short_description TEXT CHECK (short_description IS NULL OR length(short_description) <= 300),
    ADD COLUMN IF NOT EXISTS long_description TEXT CHECK (long_description IS NULL OR length(long_description) <= 10000),
    ADD COLUMN IF NOT EXISTS image_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- A reference price shown crossed out next to the selling price.
ALTER TABLE product_variants
    ADD COLUMN IF NOT EXISTS compare_at_price_minor BIGINT CHECK (compare_at_price_minor IS NULL OR compare_at_price_minor >= 0);

-- SKUs must stay unique inside a workspace when they are set.
CREATE UNIQUE INDEX IF NOT EXISTS product_variants_workspace_sku_uidx
    ON product_variants (workspace_id, upper(sku)) WHERE sku IS NOT NULL;

-- Which outlets (shops, warehouses) sell or stock a product. No rows means all outlets.
CREATE TABLE IF NOT EXISTS product_outlets (
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    location_id BIGINT NOT NULL REFERENCES inventory_locations(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (product_id, location_id)
);
CREATE INDEX IF NOT EXISTS product_outlets_workspace_idx ON product_outlets (workspace_id, location_id);

-- Product-level collections ("Shoes", "New arrivals"); the online store reuses them.
CREATE TABLE IF NOT EXISTS product_collections (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
    description TEXT CHECK (description IS NULL OR length(description) <= 500),
    position INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS product_collections_workspace_name_uidx ON product_collections (workspace_id, lower(name));

CREATE TABLE IF NOT EXISTS product_collection_items (
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    collection_id BIGINT NOT NULL REFERENCES product_collections(id) ON DELETE CASCADE,
    product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (collection_id, product_id)
);
CREATE INDEX IF NOT EXISTS product_collection_items_product_idx ON product_collection_items (workspace_id, product_id);

-- Every change to a variant's selling or cost price.
CREATE TABLE IF NOT EXISTS product_price_history (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    variant_id BIGINT NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
    old_selling_price_minor BIGINT,
    new_selling_price_minor BIGINT NOT NULL,
    old_cost_price_minor BIGINT,
    new_cost_price_minor BIGINT NOT NULL,
    currency CHAR(3) NOT NULL,
    currency_exponent INTEGER NOT NULL,
    changed_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS product_price_history_product_idx ON product_price_history (workspace_id, product_id, changed_at DESC);

-- A readable trail of what happened to a product.
CREATE TABLE IF NOT EXISTS product_events (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL CHECK (event_type IN ('created', 'updated', 'price_changed', 'archived', 'restored', 'imported', 'stock_opened')),
    summary TEXT NOT NULL CHECK (length(btrim(summary)) BETWEEN 1 AND 300),
    actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS product_events_product_idx ON product_events (workspace_id, product_id, created_at DESC);

-- One row per product import, for the import history list.
CREATE TABLE IF NOT EXISTS product_import_batches (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL CHECK (length(btrim(file_name)) BETWEEN 1 AND 200),
    total_rows INTEGER NOT NULL CHECK (total_rows >= 0),
    created_count INTEGER NOT NULL DEFAULT 0 CHECK (created_count >= 0),
    failed_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
    errors JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS product_import_batches_workspace_idx ON product_import_batches (workspace_id, created_at DESC);
