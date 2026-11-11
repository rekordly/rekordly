-- Inventory is derived from immutable movements, with a transactional
-- weighted-average balance per product/location. The policy is explicit so
-- future FIFO support cannot silently change historical valuation.
ALTER TABLE ledger_entries DROP CONSTRAINT ledger_entries_source_type_check;
ALTER TABLE ledger_entries ADD CONSTRAINT ledger_entries_source_type_check CHECK (source_type IN ('money_transaction','sale','purchase','invoice_payment','deposit','wallet_payment','reversal','adjustment','goods_receipt','supplier_bill','supplier_advance','supplier_advance_application','inventory_opening'));

CREATE TABLE inventory_locations (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL CONSTRAINT inventory_locations_name_check CHECK (length(btrim(name)) > 0),
    location_type TEXT NOT NULL DEFAULT 'outlet' CONSTRAINT inventory_locations_type_check CHECK (location_type IN ('outlet','warehouse','store','other')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT inventory_locations_workspace_name_uidx UNIQUE (workspace_id, name)
);
CREATE INDEX inventory_locations_workspace_active_idx ON inventory_locations (workspace_id, is_active, id);

CREATE TABLE inventory_costing_settings (
    workspace_id BIGINT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
    costing_method TEXT NOT NULL DEFAULT 'weighted_average' CONSTRAINT inventory_costing_method_check CHECK (costing_method = 'weighted_average'),
    currency CHAR(3) NOT NULL CONSTRAINT inventory_costing_currency_check CHECK (currency ~ '^[A-Z]{3}$'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE goods_receipts ADD COLUMN location_id BIGINT REFERENCES inventory_locations(id) ON DELETE RESTRICT;

ALTER TABLE inventory_movements ADD COLUMN location_id BIGINT REFERENCES inventory_locations(id) ON DELETE RESTRICT;
ALTER TABLE inventory_movements ADD COLUMN source_type TEXT NOT NULL DEFAULT 'goods_receipt';
ALTER TABLE inventory_movements ADD COLUMN source_id BIGINT;
ALTER TABLE inventory_movements ALTER COLUMN goods_receipt_line_id DROP NOT NULL;
ALTER TABLE inventory_movements DROP CONSTRAINT inventory_movements_movement_type_check;
ALTER TABLE inventory_movements ADD CONSTRAINT inventory_movements_movement_type_check CHECK (movement_type IN ('opening','receipt','adjustment','transfer_in','transfer_out','sale','return'));
ALTER TABLE inventory_movements ADD CONSTRAINT inventory_movements_source_check CHECK (source_type IN ('goods_receipt','inventory_opening','inventory_adjustment','inventory_transfer','sale','supplier_return'));
CREATE INDEX inventory_movements_workspace_location_product_idx ON inventory_movements(workspace_id, location_id, product_id, occurred_on DESC, id DESC);

CREATE TABLE inventory_balances (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    location_id BIGINT NOT NULL REFERENCES inventory_locations(id) ON DELETE RESTRICT,
    product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    quantity_on_hand NUMERIC(18,4) NOT NULL CONSTRAINT inventory_balances_quantity_check CHECK (quantity_on_hand >= 0),
    value_on_hand_minor BIGINT NOT NULL CONSTRAINT inventory_balances_value_check CHECK (value_on_hand_minor >= 0),
    costing_method TEXT NOT NULL DEFAULT 'weighted_average' CONSTRAINT inventory_balances_method_check CHECK (costing_method = 'weighted_average'),
    version INTEGER NOT NULL DEFAULT 1 CONSTRAINT inventory_balances_version_check CHECK (version > 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT inventory_balances_workspace_location_product_uidx UNIQUE (workspace_id, location_id, product_id)
);
CREATE INDEX inventory_balances_workspace_product_idx ON inventory_balances (workspace_id, product_id, location_id);

CREATE TABLE inventory_opening_entries (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    location_id BIGINT NOT NULL REFERENCES inventory_locations(id) ON DELETE RESTRICT,
    product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    quantity NUMERIC(18,4) NOT NULL CONSTRAINT inventory_opening_quantity_check CHECK (quantity > 0),
    unit_cost_minor BIGINT NOT NULL CONSTRAINT inventory_opening_unit_cost_check CHECK (unit_cost_minor >= 0),
    value_minor BIGINT NOT NULL CONSTRAINT inventory_opening_value_check CHECK (value_minor >= 0),
    effective_on DATE NOT NULL,
    reason TEXT NOT NULL CONSTRAINT inventory_opening_reason_check CHECK (length(btrim(reason)) > 0),
    idempotency_key TEXT NOT NULL CONSTRAINT inventory_opening_key_check CHECK (length(btrim(idempotency_key)) > 0),
    created_by_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT inventory_opening_workspace_key_uidx UNIQUE (workspace_id, idempotency_key)
);
CREATE INDEX inventory_opening_workspace_product_idx ON inventory_opening_entries (workspace_id, product_id, location_id, id DESC);
