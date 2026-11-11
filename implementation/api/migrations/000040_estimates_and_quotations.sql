-- Blueprint 06: Estimates and Quotations
CREATE TABLE IF NOT EXISTS estimates (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    estimate_number TEXT NOT NULL,
    customer_id BIGINT REFERENCES counterparties(id) ON DELETE RESTRICT,
    customer_name TEXT NOT NULL,
    issue_date DATE NOT NULL,
    expiry_date DATE NOT NULL,
    currency CHAR(3) NOT NULL CONSTRAINT estimates_currency_check CHECK (currency ~ '^[A-Z]{3}$'),
    currency_exponent INTEGER NOT NULL DEFAULT 2 CONSTRAINT estimates_exponent_check CHECK (currency_exponent >= 0 AND currency_exponent <= 4),
    subtotal_minor BIGINT NOT NULL CONSTRAINT estimates_subtotal_check CHECK (subtotal_minor >= 0),
    tax_amount_minor BIGINT NOT NULL DEFAULT 0 CONSTRAINT estimates_tax_check CHECK (tax_amount_minor >= 0),
    total_amount_minor BIGINT NOT NULL CONSTRAINT estimates_total_check CHECK (total_amount_minor >= 0),
    status TEXT NOT NULL DEFAULT 'draft' CONSTRAINT estimates_status_check CHECK (status IN ('draft', 'sent', 'accepted', 'declined', 'converted', 'expired')),
    notes TEXT,
    terms TEXT,
    converted_invoice_id BIGINT REFERENCES invoices(id) ON DELETE SET NULL,
    created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    idempotency_key TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT estimates_workspace_number_uidx UNIQUE (workspace_id, estimate_number)
);

CREATE INDEX IF NOT EXISTS estimates_workspace_date_idx ON estimates (workspace_id, issue_date DESC, id DESC);
CREATE INDEX IF NOT EXISTS estimates_workspace_status_idx ON estimates (workspace_id, status);
CREATE INDEX IF NOT EXISTS estimates_customer_idx ON estimates (workspace_id, customer_id);
CREATE UNIQUE INDEX IF NOT EXISTS estimates_idempotency_uidx ON estimates (workspace_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS estimate_items (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    estimate_id BIGINT NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    quantity NUMERIC(14, 4) NOT NULL DEFAULT 1 CONSTRAINT estimate_items_qty_check CHECK (quantity > 0),
    unit_price_minor BIGINT NOT NULL CONSTRAINT estimate_items_price_check CHECK (unit_price_minor >= 0),
    amount_minor BIGINT NOT NULL CONSTRAINT estimate_items_amount_check CHECK (amount_minor >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS estimate_items_estimate_idx ON estimate_items (estimate_id);
