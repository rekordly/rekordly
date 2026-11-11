-- Physical returns and their financial resolutions are separate immutable events.
ALTER TABLE ledger_entries DROP CONSTRAINT ledger_entries_source_type_check;
ALTER TABLE ledger_entries ADD CONSTRAINT ledger_entries_source_type_check CHECK (source_type IN ('money_transaction','sale','purchase','invoice_payment','deposit','wallet_payment','reversal','adjustment','goods_receipt','supplier_bill','supplier_advance','supplier_advance_application','inventory_opening','supplier_return','supplier_credit','supplier_refund'));
ALTER TABLE inventory_movements DROP CONSTRAINT inventory_movements_goods_receipt_line_id_key;
ALTER TABLE inventory_movements DROP CONSTRAINT inventory_movements_quantity_delta_check;
ALTER TABLE inventory_movements ADD CONSTRAINT inventory_movements_quantity_delta_check CHECK (quantity_delta <> 0);
ALTER TABLE inventory_movements DROP CONSTRAINT inventory_movements_value_delta_minor_check;
ALTER TABLE inventory_movements ADD CONSTRAINT inventory_movements_value_delta_minor_check CHECK (value_delta_minor <> 0);

CREATE TABLE supplier_returns (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 supplier_id BIGINT NOT NULL REFERENCES counterparties(id) ON DELETE RESTRICT,
 goods_receipt_id BIGINT NOT NULL REFERENCES goods_receipts(id) ON DELETE RESTRICT,
 effective_on DATE NOT NULL,
 reason TEXT NOT NULL CHECK (length(btrim(reason)) > 0),
 total_minor BIGINT NOT NULL CHECK (total_minor > 0),
 status TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('posted','cancelled')),
 idempotency_key TEXT NOT NULL CHECK (length(btrim(idempotency_key)) > 0),
 created_by_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,idempotency_key)
);
CREATE TABLE supplier_return_lines (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 supplier_return_id BIGINT NOT NULL REFERENCES supplier_returns(id) ON DELETE RESTRICT,
 goods_receipt_line_id BIGINT NOT NULL REFERENCES goods_receipt_lines(id) ON DELETE RESTRICT,
 product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
 location_id BIGINT NOT NULL REFERENCES inventory_locations(id) ON DELETE RESTRICT,
 quantity NUMERIC(18,4) NOT NULL CHECK (quantity > 0),
 value_minor BIGINT NOT NULL CHECK (value_minor > 0)
);
CREATE INDEX supplier_returns_workspace_date_idx ON supplier_returns(workspace_id,effective_on DESC,id DESC);

CREATE TABLE supplier_credits (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 supplier_id BIGINT NOT NULL REFERENCES counterparties(id) ON DELETE RESTRICT,
 supplier_return_id BIGINT REFERENCES supplier_returns(id) ON DELETE RESTRICT,
 supplier_bill_id BIGINT REFERENCES supplier_bills(id) ON DELETE RESTRICT,
 currency CHAR(3) NOT NULL,
 currency_exponent INTEGER NOT NULL CHECK (currency_exponent BETWEEN 0 AND 4),
 amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
 outstanding_minor BIGINT NOT NULL CHECK (outstanding_minor >= 0 AND outstanding_minor <= amount_minor),
 status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('approved','partially_refunded','refunded','cancelled')),
 reason TEXT NOT NULL CHECK (length(btrim(reason)) > 0),
 idempotency_key TEXT NOT NULL CHECK (length(btrim(idempotency_key)) > 0),
 created_by_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,idempotency_key)
);
CREATE TABLE supplier_refunds (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 supplier_id BIGINT NOT NULL REFERENCES counterparties(id) ON DELETE RESTRICT,
 supplier_credit_id BIGINT REFERENCES supplier_credits(id) ON DELETE RESTRICT,
 supplier_advance_id BIGINT REFERENCES supplier_advances(id) ON DELETE RESTRICT,
 amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
 currency CHAR(3) NOT NULL,
 currency_exponent INTEGER NOT NULL CHECK (currency_exponent BETWEEN 0 AND 4),
 refund_date DATE NOT NULL,
 idempotency_key TEXT NOT NULL CHECK (length(btrim(idempotency_key)) > 0),
 reason TEXT NOT NULL CHECK (length(btrim(reason)) > 0),
 created_by_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,idempotency_key)
);
