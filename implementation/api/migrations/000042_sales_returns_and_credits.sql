-- Blueprint 06: Sales Returns and Customer Credit Notes
CREATE TABLE IF NOT EXISTS sales_returns (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    return_number TEXT NOT NULL,
    sale_id BIGINT REFERENCES sales(id) ON DELETE SET NULL,
    invoice_id BIGINT REFERENCES invoices(id) ON DELETE SET NULL,
    customer_id BIGINT REFERENCES counterparties(id) ON DELETE RESTRICT,
    customer_name TEXT NOT NULL,
    return_date DATE NOT NULL,
    currency CHAR(3) NOT NULL CONSTRAINT sales_returns_currency_check CHECK (currency ~ '^[A-Z]{3}$'),
    currency_exponent INTEGER NOT NULL DEFAULT 2,
    subtotal_minor BIGINT NOT NULL CONSTRAINT sales_returns_subtotal_check CHECK (subtotal_minor >= 0),
    tax_amount_minor BIGINT NOT NULL DEFAULT 0,
    total_amount_minor BIGINT NOT NULL CONSTRAINT sales_returns_total_check CHECK (total_amount_minor >= 0),
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'issued' CONSTRAINT sales_returns_status_check CHECK (status IN ('draft', 'issued', 'applied', 'refunded', 'voided')),
    action_taken TEXT NOT NULL DEFAULT 'customer_credit' CONSTRAINT sales_returns_action_check CHECK (action_taken IN ('customer_credit', 'refund', 'invoice_reduction')),
    created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    idempotency_key TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT sales_returns_workspace_number_uidx UNIQUE (workspace_id, return_number)
);

CREATE INDEX IF NOT EXISTS sales_returns_workspace_date_idx ON sales_returns (workspace_id, return_date DESC, id DESC);
CREATE INDEX IF NOT EXISTS sales_returns_customer_idx ON sales_returns (workspace_id, customer_id);

CREATE TABLE IF NOT EXISTS sales_return_items (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sales_return_id BIGINT NOT NULL REFERENCES sales_returns(id) ON DELETE CASCADE,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    catalogue_item_id BIGINT REFERENCES products(id) ON DELETE SET NULL,
    quantity NUMERIC(14, 4) NOT NULL DEFAULT 1 CONSTRAINT sales_return_items_qty_check CHECK (quantity > 0),
    unit_price_minor BIGINT NOT NULL,
    amount_minor BIGINT NOT NULL,
    restock_inventory BOOLEAN NOT NULL DEFAULT FALSE,
    outlet_id BIGINT REFERENCES inventory_locations(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sales_return_items_return_idx ON sales_return_items (sales_return_id);

CREATE TABLE IF NOT EXISTS customer_credits (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    customer_id BIGINT NOT NULL REFERENCES counterparties(id) ON DELETE CASCADE,
    currency CHAR(3) NOT NULL,
    balance_minor BIGINT NOT NULL DEFAULT 0 CONSTRAINT customer_credits_balance_check CHECK (balance_minor >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT customer_credits_workspace_cust_curr_uidx UNIQUE (workspace_id, customer_id, currency)
);

CREATE TABLE IF NOT EXISTS customer_credit_transactions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    credit_id BIGINT NOT NULL REFERENCES customer_credits(id) ON DELETE CASCADE,
    direction TEXT NOT NULL CONSTRAINT cust_credit_dir_check CHECK (direction IN ('credit', 'debit')),
    amount_minor BIGINT NOT NULL CONSTRAINT cust_credit_amount_check CHECK (amount_minor > 0),
    source_type TEXT NOT NULL,
    source_id BIGINT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cust_credit_tx_credit_idx ON customer_credit_transactions (credit_id);
