CREATE TABLE invoices (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    customer_id BIGINT NOT NULL REFERENCES counterparties(id) ON DELETE RESTRICT,
    customer_name TEXT NOT NULL,
    invoice_number TEXT NOT NULL,
    issue_date DATE NOT NULL,
    due_date DATE NOT NULL,
    subtotal_minor BIGINT NOT NULL CONSTRAINT invoices_subtotal_check CHECK (subtotal_minor > 0),
    tax_amount_minor BIGINT NOT NULL DEFAULT 0 CONSTRAINT invoices_tax_check CHECK (tax_amount_minor >= 0),
    total_amount_minor BIGINT NOT NULL CONSTRAINT invoices_total_check CHECK (total_amount_minor > 0),
    paid_amount_minor BIGINT NOT NULL DEFAULT 0 CONSTRAINT invoices_paid_check CHECK (paid_amount_minor >= 0 AND paid_amount_minor <= total_amount_minor),
    currency CHAR(3) NOT NULL CONSTRAINT invoices_currency_check CHECK (currency ~ '^[A-Z]{3}$'),
    currency_exponent INTEGER NOT NULL DEFAULT 2 CONSTRAINT invoices_exponent_check CHECK (currency_exponent >= 0 AND currency_exponent <= 4),
    status TEXT NOT NULL DEFAULT 'draft' CONSTRAINT invoices_status_check CHECK (status IN ('draft', 'finalized', 'partially_paid', 'paid', 'voided')),
    notes TEXT,
    terms TEXT,
    idempotency_key TEXT,
    created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    finalized_at TIMESTAMPTZ,
    voided_at TIMESTAMPTZ,
    void_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT invoices_workspace_number_uidx UNIQUE (workspace_id, invoice_number)
);
CREATE INDEX invoices_workspace_date_idx ON invoices (workspace_id, issue_date DESC, id DESC);
CREATE INDEX invoices_workspace_status_idx ON invoices (workspace_id, status);
CREATE INDEX invoices_customer_idx ON invoices (workspace_id, customer_id);
CREATE UNIQUE INDEX invoices_idempotency_uidx ON invoices (workspace_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL AND status <> 'voided';

CREATE TABLE invoice_items (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    invoice_id BIGINT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1 CONSTRAINT invoice_items_qty_check CHECK (quantity > 0),
    unit_price_minor BIGINT NOT NULL CONSTRAINT invoice_items_price_check CHECK (unit_price_minor >= 0),
    amount_minor BIGINT NOT NULL CONSTRAINT invoice_items_amount_check CHECK (amount_minor >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX invoice_items_invoice_idx ON invoice_items (invoice_id);

CREATE TABLE customer_wallets (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    customer_id BIGINT NOT NULL REFERENCES counterparties(id) ON DELETE CASCADE,
    currency CHAR(3) NOT NULL CONSTRAINT customer_wallets_currency_check CHECK (currency ~ '^[A-Z]{3}$'),
    currency_exponent INTEGER NOT NULL DEFAULT 2,
    balance_minor BIGINT NOT NULL DEFAULT 0 CONSTRAINT customer_wallets_balance_check CHECK (balance_minor >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT customer_wallets_unique_currency UNIQUE (workspace_id, customer_id, currency)
);
CREATE INDEX customer_wallets_lookup_idx ON customer_wallets (workspace_id, customer_id);

CREATE TABLE wallet_transactions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    customer_id BIGINT NOT NULL REFERENCES counterparties(id) ON DELETE RESTRICT,
    transaction_type TEXT NOT NULL CONSTRAINT wallet_tx_type_check CHECK (transaction_type IN ('deposit', 'invoice_payment', 'refund')),
    amount_minor BIGINT NOT NULL CONSTRAINT wallet_tx_amount_check CHECK (amount_minor > 0),
    balance_after_minor BIGINT NOT NULL CONSTRAINT wallet_tx_balance_after_check CHECK (balance_after_minor >= 0),
    money_account_id BIGINT REFERENCES money_accounts(id) ON DELETE RESTRICT,
    invoice_id BIGINT REFERENCES invoices(id) ON DELETE RESTRICT,
    notes TEXT,
    reference TEXT,
    idempotency_key TEXT,
    created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX wallet_tx_customer_idx ON wallet_transactions (workspace_id, customer_id, created_at DESC);
CREATE INDEX wallet_tx_invoice_idx ON wallet_transactions (workspace_id, invoice_id);
CREATE UNIQUE INDEX wallet_tx_idempotency_uidx ON wallet_transactions (workspace_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;
