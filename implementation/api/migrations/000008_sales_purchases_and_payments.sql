CREATE TABLE counterparties (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    party_type TEXT NOT NULL DEFAULT 'customer' CONSTRAINT counterparties_type_check CHECK (party_type IN ('customer', 'supplier', 'both')),
    email TEXT,
    phone TEXT,
    notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT counterparties_workspace_name_type_uidx UNIQUE (workspace_id, name, party_type)
);
CREATE INDEX counterparties_workspace_type_idx ON counterparties (workspace_id, party_type, is_active);

CREATE TABLE sales (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    customer_id BIGINT REFERENCES counterparties(id) ON DELETE RESTRICT,
    customer_name TEXT NOT NULL,
    sale_date DATE NOT NULL,
    total_amount_minor BIGINT NOT NULL CONSTRAINT sales_total_check CHECK (total_amount_minor > 0),
    paid_amount_minor BIGINT NOT NULL DEFAULT 0 CONSTRAINT sales_paid_check CHECK (paid_amount_minor >= 0 AND paid_amount_minor <= total_amount_minor),
    currency CHAR(3) NOT NULL CONSTRAINT sales_currency_check CHECK (currency ~ '^[A-Z]{3}$'),
    currency_exponent INTEGER NOT NULL DEFAULT 2 CONSTRAINT sales_exponent_check CHECK (currency_exponent >= 0 AND currency_exponent <= 4),
    status TEXT NOT NULL DEFAULT 'unpaid' CONSTRAINT sales_status_check CHECK (status IN ('draft', 'unpaid', 'partially_paid', 'paid', 'voided')),
    notes TEXT,
    reference TEXT,
    idempotency_key TEXT,
    created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX sales_workspace_date_idx ON sales (workspace_id, sale_date DESC, id DESC);
CREATE INDEX sales_workspace_status_idx ON sales (workspace_id, status);
CREATE INDEX sales_customer_idx ON sales (customer_id);
CREATE UNIQUE INDEX sales_idempotency_uidx ON sales (workspace_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL AND status <> 'voided';

CREATE TABLE purchases (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    supplier_id BIGINT REFERENCES counterparties(id) ON DELETE RESTRICT,
    supplier_name TEXT NOT NULL,
    purchase_date DATE NOT NULL,
    total_amount_minor BIGINT NOT NULL CONSTRAINT purchases_total_check CHECK (total_amount_minor > 0),
    paid_amount_minor BIGINT NOT NULL DEFAULT 0 CONSTRAINT purchases_paid_check CHECK (paid_amount_minor >= 0 AND paid_amount_minor <= total_amount_minor),
    currency CHAR(3) NOT NULL CONSTRAINT purchases_currency_check CHECK (currency ~ '^[A-Z]{3}$'),
    currency_exponent INTEGER NOT NULL DEFAULT 2 CONSTRAINT purchases_exponent_check CHECK (currency_exponent >= 0 AND currency_exponent <= 4),
    status TEXT NOT NULL DEFAULT 'unpaid' CONSTRAINT purchases_status_check CHECK (status IN ('draft', 'unpaid', 'partially_paid', 'paid', 'voided')),
    category_id BIGINT REFERENCES categories(id) ON DELETE RESTRICT,
    notes TEXT,
    reference TEXT,
    idempotency_key TEXT,
    created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX purchases_workspace_date_idx ON purchases (workspace_id, purchase_date DESC, id DESC);
CREATE INDEX purchases_workspace_status_idx ON purchases (workspace_id, status);
CREATE INDEX purchases_supplier_idx ON purchases (supplier_id);
CREATE UNIQUE INDEX purchases_idempotency_uidx ON purchases (workspace_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL AND status <> 'voided';

CREATE TABLE payments (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    direction TEXT NOT NULL CONSTRAINT payments_direction_check CHECK (direction IN ('incoming', 'outgoing')),
    payment_date DATE NOT NULL,
    total_amount_minor BIGINT NOT NULL CONSTRAINT payments_total_check CHECK (total_amount_minor > 0),
    currency CHAR(3) NOT NULL CONSTRAINT payments_currency_check CHECK (currency ~ '^[A-Z]{3}$'),
    currency_exponent INTEGER NOT NULL DEFAULT 2 CONSTRAINT payments_exponent_check CHECK (currency_exponent >= 0 AND currency_exponent <= 4),
    counterparty_id BIGINT REFERENCES counterparties(id) ON DELETE RESTRICT,
    counterparty_name TEXT NOT NULL,
    linked_record_type TEXT CONSTRAINT payments_record_type_check CHECK (linked_record_type IS NULL OR linked_record_type IN ('sale', 'purchase', 'invoice')),
    linked_record_id BIGINT,
    status TEXT NOT NULL DEFAULT 'posted' CONSTRAINT payments_status_check CHECK (status IN ('posted', 'voided')),
    notes TEXT,
    reference TEXT,
    idempotency_key TEXT,
    created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX payments_workspace_date_idx ON payments (workspace_id, payment_date DESC, id DESC);
CREATE INDEX payments_linked_idx ON payments (workspace_id, linked_record_type, linked_record_id);
CREATE UNIQUE INDEX payments_idempotency_uidx ON payments (workspace_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL AND status <> 'voided';

CREATE TABLE payment_legs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    payment_id BIGINT NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    money_account_id BIGINT NOT NULL REFERENCES money_accounts(id) ON DELETE RESTRICT,
    amount_minor BIGINT NOT NULL CONSTRAINT payment_legs_amount_check CHECK (amount_minor > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX payment_legs_payment_idx ON payment_legs (payment_id);
CREATE INDEX payment_legs_account_idx ON payment_legs (workspace_id, money_account_id);
