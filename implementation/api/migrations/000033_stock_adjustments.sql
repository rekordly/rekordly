-- Blueprint 07 Slice 7: Stock Adjustments & Damage Write-Offs

CREATE TABLE IF NOT EXISTS stock_adjustments (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    adjustment_number TEXT NOT NULL CONSTRAINT stock_adjustments_number_check CHECK (length(btrim(adjustment_number)) > 0),
    location_id BIGINT NOT NULL REFERENCES inventory_locations(id) ON DELETE RESTRICT,
    reason_code TEXT NOT NULL CONSTRAINT stock_adjustments_reason_check CHECK (reason_code IN ('damage', 'spoilage', 'shrinkage', 'internal_use', 'correction', 'other')),
    notes TEXT,
    idempotency_key TEXT,
    created_by_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT stock_adjustments_workspace_number_uidx UNIQUE (workspace_id, adjustment_number),
    CONSTRAINT stock_adjustments_workspace_key_uidx UNIQUE (workspace_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS stock_adjustments_workspace_reason_idx 
    ON stock_adjustments (workspace_id, reason_code, created_at DESC);

CREATE TABLE IF NOT EXISTS stock_adjustment_lines (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    adjustment_id BIGINT NOT NULL REFERENCES stock_adjustments(id) ON DELETE CASCADE,
    product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    variant_id BIGINT REFERENCES product_variants(id) ON DELETE RESTRICT,
    quantity_delta NUMERIC(18,4) NOT NULL CONSTRAINT stock_adjustment_lines_qty_check CHECK (quantity_delta <> 0),
    unit_cost_minor BIGINT NOT NULL DEFAULT 0 CONSTRAINT stock_adjustment_lines_cost_check CHECK (unit_cost_minor >= 0),
    total_cost_minor BIGINT NOT NULL DEFAULT 0 CONSTRAINT stock_adjustment_lines_total_cost_check CHECK (total_cost_minor >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stock_adjustment_lines_adjustment_idx 
    ON stock_adjustment_lines (adjustment_id);
