-- Blueprint 07 Slice 5: Stock Transfers Between Outlets

CREATE TABLE IF NOT EXISTS stock_transfers (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    transfer_number TEXT NOT NULL CONSTRAINT stock_transfers_number_check CHECK (length(btrim(transfer_number)) > 0),
    source_location_id BIGINT NOT NULL REFERENCES inventory_locations(id) ON DELETE RESTRICT,
    destination_location_id BIGINT NOT NULL REFERENCES inventory_locations(id) ON DELETE RESTRICT,
    status TEXT NOT NULL DEFAULT 'draft' CONSTRAINT stock_transfers_status_check CHECK (status IN ('draft', 'dispatched', 'received', 'cancelled')),
    dispatched_at TIMESTAMPTZ,
    received_at TIMESTAMPTZ,
    notes TEXT,
    idempotency_key TEXT,
    created_by_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT stock_transfers_locations_diff_check CHECK (source_location_id <> destination_location_id),
    CONSTRAINT stock_transfers_workspace_number_uidx UNIQUE (workspace_id, transfer_number),
    CONSTRAINT stock_transfers_workspace_key_uidx UNIQUE (workspace_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS stock_transfers_workspace_status_idx 
    ON stock_transfers (workspace_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS stock_transfer_lines (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    transfer_id BIGINT NOT NULL REFERENCES stock_transfers(id) ON DELETE CASCADE,
    product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    variant_id BIGINT REFERENCES product_variants(id) ON DELETE RESTRICT,
    quantity_requested NUMERIC(18,4) NOT NULL CONSTRAINT stock_transfer_lines_req_check CHECK (quantity_requested > 0),
    quantity_dispatched NUMERIC(18,4) NOT NULL DEFAULT 0 CONSTRAINT stock_transfer_lines_disp_check CHECK (quantity_dispatched >= 0),
    quantity_received NUMERIC(18,4) NOT NULL DEFAULT 0 CONSTRAINT stock_transfer_lines_recv_check CHECK (quantity_received >= 0),
    unit_cost_minor BIGINT NOT NULL DEFAULT 0 CONSTRAINT stock_transfer_lines_cost_check CHECK (unit_cost_minor >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stock_transfer_lines_transfer_idx 
    ON stock_transfer_lines (transfer_id);
