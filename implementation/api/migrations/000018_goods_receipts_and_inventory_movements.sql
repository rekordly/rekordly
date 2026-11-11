-- Blueprint 07/08: a posted receipt is immutable operational and accounting
-- evidence. Inventory is derived from movements; there is no mutable quantity
-- counter to drift away from its source documents.
ALTER TABLE ledger_entries DROP CONSTRAINT ledger_entries_source_type_check;
ALTER TABLE ledger_entries ADD CONSTRAINT ledger_entries_source_type_check CHECK (source_type IN ('money_transaction', 'sale', 'purchase', 'invoice_payment', 'deposit', 'wallet_payment', 'reversal', 'adjustment', 'goods_receipt'));
ALTER TABLE purchase_orders DROP CONSTRAINT purchase_orders_status_check;
ALTER TABLE purchase_orders ADD CONSTRAINT purchase_orders_status_check CHECK (status IN ('draft','submitted','approved','issued','partially_received','fully_received'));

CREATE TABLE goods_receipts (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 purchase_order_id BIGINT NOT NULL REFERENCES purchase_orders(id) ON DELETE RESTRICT,
 receipt_reference TEXT,
 received_on DATE NOT NULL,
 idempotency_key TEXT NOT NULL CHECK (length(btrim(idempotency_key)) > 0),
 created_by_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,idempotency_key)
);
CREATE INDEX goods_receipts_workspace_order_id_idx ON goods_receipts(workspace_id,purchase_order_id,id DESC);

CREATE TABLE goods_receipt_lines (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 goods_receipt_id BIGINT NOT NULL REFERENCES goods_receipts(id) ON DELETE RESTRICT,
 purchase_order_line_id BIGINT NOT NULL REFERENCES purchase_order_lines(id) ON DELETE RESTRICT,
 product_id BIGINT REFERENCES products(id) ON DELETE RESTRICT,
 accepted_quantity NUMERIC(18,4) NOT NULL CHECK(accepted_quantity > 0),
 unit_cost_minor BIGINT NOT NULL CHECK(unit_cost_minor >= 0),
 line_total_minor BIGINT NOT NULL CHECK(line_total_minor >= 0),
 UNIQUE(goods_receipt_id,purchase_order_line_id)
);
CREATE INDEX goods_receipt_lines_workspace_order_line_idx ON goods_receipt_lines(workspace_id,purchase_order_line_id);

CREATE TABLE inventory_movements (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
 goods_receipt_line_id BIGINT NOT NULL UNIQUE REFERENCES goods_receipt_lines(id) ON DELETE RESTRICT,
 movement_type TEXT NOT NULL CHECK(movement_type IN ('receipt')),
 quantity_delta NUMERIC(18,4) NOT NULL CHECK(quantity_delta > 0),
 value_delta_minor BIGINT NOT NULL CHECK(value_delta_minor >= 0),
 occurred_on DATE NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX inventory_movements_workspace_product_date_idx ON inventory_movements(workspace_id,product_id,occurred_on DESC,id DESC);
