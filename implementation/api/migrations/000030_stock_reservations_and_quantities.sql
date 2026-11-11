-- Blueprint 07 Slice 3 & 4: 4-State Quantity Model, Stock Reservations, and Sales COGS Ledger Integration

ALTER TABLE inventory_balances
    ADD COLUMN IF NOT EXISTS reserved_quantity NUMERIC(18,4) NOT NULL DEFAULT 0 CONSTRAINT inventory_balances_reserved_check CHECK (reserved_quantity >= 0),
    ADD COLUMN IF NOT EXISTS in_transit_quantity NUMERIC(18,4) NOT NULL DEFAULT 0 CONSTRAINT inventory_balances_in_transit_check CHECK (in_transit_quantity >= 0),
    ADD COLUMN IF NOT EXISTS variant_id BIGINT REFERENCES product_variants(id) ON DELETE RESTRICT;

ALTER TABLE inventory_movements
    ADD COLUMN IF NOT EXISTS variant_id BIGINT REFERENCES product_variants(id) ON DELETE RESTRICT;

ALTER TABLE inventory_movements DROP CONSTRAINT IF EXISTS inventory_movements_source_check;
ALTER TABLE inventory_movements ADD CONSTRAINT inventory_movements_source_check CHECK (source_type IN ('goods_receipt','inventory_opening','inventory_adjustment','inventory_transfer','sale','supplier_return','stock_count'));

ALTER TABLE ledger_entries DROP CONSTRAINT IF EXISTS ledger_entries_source_type_check;
ALTER TABLE ledger_entries ADD CONSTRAINT ledger_entries_source_type_check CHECK (source_type IN (
    'money_transaction','sale','purchase','invoice_payment','deposit','wallet_payment',
    'reversal','adjustment','goods_receipt','supplier_bill','supplier_advance',
    'supplier_advance_application','inventory_opening','cogs_sale','inventory_adjustment',
    'inventory_transfer_variance','stock_count_variance'
));

CREATE TABLE IF NOT EXISTS stock_reservations (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    location_id BIGINT NOT NULL REFERENCES inventory_locations(id) ON DELETE RESTRICT,
    product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    variant_id BIGINT REFERENCES product_variants(id) ON DELETE RESTRICT,
    order_id BIGINT,
    quantity NUMERIC(18,4) NOT NULL CONSTRAINT stock_reservations_quantity_check CHECK (quantity > 0),
    status TEXT NOT NULL DEFAULT 'active' CONSTRAINT stock_reservations_status_check CHECK (status IN ('active', 'fulfilled', 'released', 'expired')),
    expires_at TIMESTAMPTZ,
    notes TEXT,
    idempotency_key TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT stock_reservations_workspace_key_uidx UNIQUE (workspace_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS stock_reservations_workspace_loc_prod_status_idx 
    ON stock_reservations (workspace_id, location_id, product_id, status);
