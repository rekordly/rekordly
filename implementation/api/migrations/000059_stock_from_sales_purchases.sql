-- Stock follows what actually happens: sales, invoices and purchases now carry product
-- lines, and selling or buying a stock product moves its stock.

CREATE TABLE IF NOT EXISTS sale_items (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    sale_id BIGINT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    product_id BIGINT REFERENCES products(id) ON DELETE RESTRICT,
    variant_id BIGINT REFERENCES product_variants(id) ON DELETE RESTRICT,
    description TEXT NOT NULL CHECK (length(btrim(description)) > 0),
    quantity NUMERIC(18,4) NOT NULL CHECK (quantity > 0),
    unit_price_minor BIGINT NOT NULL CHECK (unit_price_minor >= 0),
    amount_minor BIGINT NOT NULL CHECK (amount_minor >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sale_items_sale_idx ON sale_items (workspace_id, sale_id);
CREATE INDEX IF NOT EXISTS sale_items_product_idx ON sale_items (workspace_id, product_id) WHERE product_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS purchase_items (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    purchase_id BIGINT NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
    product_id BIGINT REFERENCES products(id) ON DELETE RESTRICT,
    variant_id BIGINT REFERENCES product_variants(id) ON DELETE RESTRICT,
    description TEXT NOT NULL CHECK (length(btrim(description)) > 0),
    quantity NUMERIC(18,4) NOT NULL CHECK (quantity > 0),
    unit_cost_minor BIGINT NOT NULL CHECK (unit_cost_minor >= 0),
    amount_minor BIGINT NOT NULL CHECK (amount_minor >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS purchase_items_purchase_idx ON purchase_items (workspace_id, purchase_id);
CREATE INDEX IF NOT EXISTS purchase_items_product_idx ON purchase_items (workspace_id, product_id) WHERE product_id IS NOT NULL;

ALTER TABLE sales ADD COLUMN IF NOT EXISTS location_id BIGINT REFERENCES inventory_locations(id) ON DELETE RESTRICT;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS location_id BIGINT REFERENCES inventory_locations(id) ON DELETE RESTRICT;

ALTER TABLE invoice_items
    ADD COLUMN IF NOT EXISTS product_id BIGINT REFERENCES products(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS variant_id BIGINT REFERENCES product_variants(id) ON DELETE RESTRICT;

-- New movement kinds and sources.
ALTER TABLE inventory_movements DROP CONSTRAINT IF EXISTS inventory_movements_movement_type_check;
ALTER TABLE inventory_movements ADD CONSTRAINT inventory_movements_movement_type_check
    CHECK (movement_type IN ('opening','receipt','adjustment','transfer_in','transfer_out','sale','return','purchase'));
ALTER TABLE inventory_movements DROP CONSTRAINT IF EXISTS inventory_movements_source_check;
ALTER TABLE inventory_movements ADD CONSTRAINT inventory_movements_source_check
    CHECK (source_type IN ('goods_receipt','inventory_opening','inventory_adjustment','inventory_transfer','sale','supplier_return','stock_count','invoice','purchase'));
-- Stock with no recorded cost still moves; its value change is zero.
ALTER TABLE inventory_movements DROP CONSTRAINT IF EXISTS inventory_movements_value_delta_minor_check;

CREATE INDEX IF NOT EXISTS inventory_movements_source_idx ON inventory_movements (workspace_id, source_type, source_id);

-- Plain reasons for adding and removing stock by hand.
ALTER TABLE stock_adjustments DROP CONSTRAINT IF EXISTS stock_adjustments_reason_check;
ALTER TABLE stock_adjustments ADD CONSTRAINT stock_adjustments_reason_check
    CHECK (reason_code IN ('damage','spoilage','shrinkage','internal_use','correction','other','restock','found','lost','expired'));
ALTER TABLE inventory_adjustments DROP CONSTRAINT IF EXISTS inventory_adjustments_reason_code_check;
ALTER TABLE inventory_adjustments ADD CONSTRAINT inventory_adjustments_reason_code_check
    CHECK (reason_code IN ('damage','spoilage','shrinkage','internal_use','correction','other','restock','found','lost','expired'));
