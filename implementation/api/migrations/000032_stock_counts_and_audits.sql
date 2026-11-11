-- Blueprint 07 Slice 6: Stock Counts & Physical Audits

CREATE TABLE IF NOT EXISTS stock_counts (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    count_number TEXT NOT NULL CONSTRAINT stock_counts_number_check CHECK (length(btrim(count_number)) > 0),
    location_id BIGINT NOT NULL REFERENCES inventory_locations(id) ON DELETE RESTRICT,
    scope TEXT NOT NULL DEFAULT 'full' CONSTRAINT stock_counts_scope_check CHECK (scope IN ('full', 'category', 'custom')),
    status TEXT NOT NULL DEFAULT 'draft' CONSTRAINT stock_counts_status_check CHECK (status IN ('draft', 'in_progress', 'completed', 'cancelled')),
    counted_at TIMESTAMPTZ,
    notes TEXT,
    idempotency_key TEXT,
    created_by_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT stock_counts_workspace_number_uidx UNIQUE (workspace_id, count_number),
    CONSTRAINT stock_counts_workspace_key_uidx UNIQUE (workspace_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS stock_counts_workspace_status_idx 
    ON stock_counts (workspace_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS stock_count_lines (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    count_id BIGINT NOT NULL REFERENCES stock_counts(id) ON DELETE CASCADE,
    product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    variant_id BIGINT REFERENCES product_variants(id) ON DELETE RESTRICT,
    expected_quantity NUMERIC(18,4) NOT NULL DEFAULT 0 CONSTRAINT stock_count_lines_exp_check CHECK (expected_quantity >= 0),
    counted_quantity NUMERIC(18,4),
    variance_quantity NUMERIC(18,4) NOT NULL DEFAULT 0,
    unit_cost_minor BIGINT NOT NULL DEFAULT 0 CONSTRAINT stock_count_lines_cost_check CHECK (unit_cost_minor >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stock_count_lines_count_idx 
    ON stock_count_lines (count_id);
