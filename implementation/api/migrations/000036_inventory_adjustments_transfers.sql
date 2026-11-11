ALTER TABLE ledger_entries DROP CONSTRAINT IF EXISTS ledger_entries_source_type_check;
ALTER TABLE ledger_entries ADD CONSTRAINT ledger_entries_source_type_check CHECK (source_type IN ('money_transaction','sale','purchase','invoice_payment','deposit','wallet_payment','reversal','adjustment','goods_receipt','supplier_bill','supplier_advance','supplier_advance_application','inventory_opening','cogs_sale','inventory_adjustment','inventory_transfer_variance','stock_count_variance','supplier_return','supplier_credit','supplier_refund','inventory_transfer'));
ALTER TABLE inventory_movements DROP CONSTRAINT IF EXISTS inventory_movements_source_check;
ALTER TABLE inventory_movements ADD CONSTRAINT inventory_movements_source_check CHECK (source_type IN ('goods_receipt','inventory_opening','inventory_adjustment','inventory_transfer','sale','supplier_return','stock_count'));

CREATE TABLE IF NOT EXISTS inventory_adjustments (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 adjustment_number TEXT NOT NULL,
 location_id BIGINT NOT NULL REFERENCES inventory_locations(id) ON DELETE RESTRICT,
 reason_code TEXT NOT NULL CHECK (reason_code IN ('damage','spoilage','shrinkage','internal_use','correction','other')),
 notes TEXT,
 idempotency_key TEXT NOT NULL,
 created_by_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,idempotency_key), UNIQUE(workspace_id,adjustment_number)
);
CREATE TABLE IF NOT EXISTS inventory_adjustment_lines (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 adjustment_id BIGINT NOT NULL REFERENCES inventory_adjustments(id) ON DELETE CASCADE,
 product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
 quantity_delta NUMERIC(18,4) NOT NULL CHECK (quantity_delta <> 0),
 unit_cost_minor BIGINT NOT NULL CHECK (unit_cost_minor >= 0),
 total_cost_minor BIGINT NOT NULL CHECK (total_cost_minor >= 0)
);
CREATE TABLE IF NOT EXISTS inventory_transfers (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 transfer_number TEXT NOT NULL,
 source_location_id BIGINT NOT NULL REFERENCES inventory_locations(id) ON DELETE RESTRICT,
 destination_location_id BIGINT NOT NULL REFERENCES inventory_locations(id) ON DELETE RESTRICT,
 status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('draft','dispatched','received','cancelled')),
 notes TEXT,
 idempotency_key TEXT NOT NULL,
 created_by_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK(source_location_id <> destination_location_id), UNIQUE(workspace_id,idempotency_key), UNIQUE(workspace_id,transfer_number)
);
CREATE TABLE IF NOT EXISTS inventory_transfer_lines (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 transfer_id BIGINT NOT NULL REFERENCES inventory_transfers(id) ON DELETE CASCADE,
 product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
 quantity NUMERIC(18,4) NOT NULL CHECK(quantity > 0),
 unit_cost_minor BIGINT NOT NULL CHECK(unit_cost_minor >= 0)
);
