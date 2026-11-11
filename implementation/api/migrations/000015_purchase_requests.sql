-- Blueprint 08 starts with a non-posting purchase-request workflow.
-- Requests and approvals are operational commitments only: they never create
-- stock, AP, expense, cash or a supplier-facing purchase order.
CREATE TABLE purchase_requests (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    supplier_id BIGINT REFERENCES counterparties(id) ON DELETE RESTRICT,
    status TEXT NOT NULL DEFAULT 'draft' CONSTRAINT purchase_requests_status_check CHECK (status IN ('draft', 'submitted', 'approved', 'rejected', 'cancelled')),
    version INTEGER NOT NULL DEFAULT 1 CONSTRAINT purchase_requests_version_check CHECK (version > 0),
    needed_by DATE,
    reason TEXT NOT NULL CONSTRAINT purchase_requests_reason_check CHECK (length(btrim(reason)) > 0),
    reference TEXT,
    currency CHAR(3) NOT NULL CONSTRAINT purchase_requests_currency_check CHECK (currency ~ '^[A-Z]{3}$'),
    currency_exponent INTEGER NOT NULL CONSTRAINT purchase_requests_exponent_check CHECK (currency_exponent >= 0 AND currency_exponent <= 4),
    estimated_total_minor BIGINT NOT NULL CONSTRAINT purchase_requests_total_check CHECK (estimated_total_minor > 0),
    idempotency_key TEXT NOT NULL CONSTRAINT purchase_requests_idempotency_check CHECK (length(btrim(idempotency_key)) > 0),
    created_by_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    submitted_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    submitted_at TIMESTAMPTZ,
    approved_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT purchase_requests_workspace_idempotency_uidx UNIQUE (workspace_id, idempotency_key)
);
CREATE INDEX purchase_requests_workspace_status_id_idx ON purchase_requests (workspace_id, status, id DESC);
CREATE INDEX purchase_requests_workspace_supplier_id_idx ON purchase_requests (workspace_id, supplier_id, id DESC);

CREATE TABLE purchase_request_lines (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    purchase_request_id BIGINT NOT NULL REFERENCES purchase_requests(id) ON DELETE CASCADE,
    product_id BIGINT REFERENCES products(id) ON DELETE RESTRICT,
    description TEXT NOT NULL CONSTRAINT purchase_request_lines_description_check CHECK (length(btrim(description)) > 0),
    quantity NUMERIC(18,4) NOT NULL CONSTRAINT purchase_request_lines_quantity_check CHECK (quantity > 0),
    unit_name TEXT NOT NULL CONSTRAINT purchase_request_lines_unit_check CHECK (length(btrim(unit_name)) > 0),
    estimated_unit_price_minor BIGINT NOT NULL CONSTRAINT purchase_request_lines_unit_price_check CHECK (estimated_unit_price_minor > 0),
    estimated_line_total_minor BIGINT NOT NULL CONSTRAINT purchase_request_lines_total_check CHECK (estimated_line_total_minor > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX purchase_request_lines_workspace_request_idx ON purchase_request_lines (workspace_id, purchase_request_id, id);
CREATE INDEX purchase_request_lines_workspace_product_idx ON purchase_request_lines (workspace_id, product_id);

-- Command records make state-changing request commands replay-safe without
-- conflating them with the document's creation idempotency key.
CREATE TABLE purchase_request_command_log (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    purchase_request_id BIGINT NOT NULL REFERENCES purchase_requests(id) ON DELETE CASCADE,
    command TEXT NOT NULL CONSTRAINT purchase_request_command_log_command_check CHECK (command IN ('submit', 'approve')),
    expected_version INTEGER NOT NULL CONSTRAINT purchase_request_command_log_version_check CHECK (expected_version > 0),
    idempotency_key TEXT NOT NULL CONSTRAINT purchase_request_command_log_idempotency_check CHECK (length(btrim(idempotency_key)) > 0),
    actor_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT purchase_request_command_log_workspace_idempotency_uidx UNIQUE (workspace_id, idempotency_key)
);
CREATE INDEX purchase_request_command_log_request_idx ON purchase_request_command_log (workspace_id, purchase_request_id, id DESC);
