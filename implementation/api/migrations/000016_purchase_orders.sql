-- PO snapshots are operational commitments, never stock/AP/cash postings.
CREATE TABLE purchase_orders (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 source_purchase_request_id BIGINT NOT NULL REFERENCES purchase_requests(id) ON DELETE RESTRICT,
 supplier_id BIGINT REFERENCES counterparties(id) ON DELETE RESTRICT, status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved','issued')),
 version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0), order_number TEXT, currency CHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'), currency_exponent INTEGER NOT NULL CHECK (currency_exponent BETWEEN 0 AND 4), total_minor BIGINT NOT NULL CHECK(total_minor > 0),
 idempotency_key TEXT NOT NULL, created_by_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, approved_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL, issued_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL, issued_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(workspace_id, source_purchase_request_id), UNIQUE(workspace_id,idempotency_key), UNIQUE(workspace_id,order_number)
);
CREATE INDEX purchase_orders_workspace_status_id_idx ON purchase_orders(workspace_id,status,id DESC);
CREATE TABLE purchase_order_lines (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, purchase_order_id BIGINT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE, source_purchase_request_line_id BIGINT NOT NULL REFERENCES purchase_request_lines(id) ON DELETE RESTRICT, product_id BIGINT REFERENCES products(id) ON DELETE RESTRICT, description TEXT NOT NULL, quantity NUMERIC(18,4) NOT NULL CHECK(quantity > 0), unit_name TEXT NOT NULL, expected_unit_cost_minor BIGINT NOT NULL CHECK(expected_unit_cost_minor > 0), line_total_minor BIGINT NOT NULL CHECK(line_total_minor > 0), UNIQUE(purchase_order_id,source_purchase_request_line_id)
);
CREATE INDEX purchase_order_lines_workspace_order_idx ON purchase_order_lines(workspace_id,purchase_order_id,id);
CREATE TABLE purchase_order_sequences (workspace_id BIGINT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE, next_value BIGINT NOT NULL DEFAULT 1 CHECK(next_value > 0));
