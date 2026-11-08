CREATE TABLE finance_accounts (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('cash', 'bank', 'wallet', 'card', 'other')),
    currency CHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, name)
);

CREATE TABLE finance_categories (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    direction TEXT NOT NULL CHECK (direction IN ('income', 'expense', 'both')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, name)
);

CREATE TABLE money_records (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    actor_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    direction TEXT NOT NULL CHECK (direction IN ('money_in', 'money_out', 'transfer')),
    amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
    currency CHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    occurred_on DATE NOT NULL,
    account_id BIGINT REFERENCES finance_accounts(id) ON DELETE RESTRICT,
    category_id BIGINT REFERENCES finance_categories(id) ON DELETE RESTRICT,
    purpose TEXT NOT NULL DEFAULT 'not_yet_known',
    counterparty_name TEXT,
    note TEXT,
    entry_source TEXT NOT NULL DEFAULT 'manual' CHECK (entry_source IN ('manual', 'ai_assisted', 'import', 'offline')),
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed', 'voided')),
    idempotency_key TEXT,
    idempotency_fingerprint BYTEA,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    confirmed_at TIMESTAMPTZ,
    voided_at TIMESTAMPTZ,
    UNIQUE (workspace_id, idempotency_key)
);
CREATE INDEX money_records_workspace_date_idx ON money_records (workspace_id, occurred_on DESC, id DESC);

CREATE TABLE ledger_entries (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    money_record_id BIGINT NOT NULL REFERENCES money_records(id) ON DELETE RESTRICT,
    account_code TEXT NOT NULL,
    debit_minor BIGINT NOT NULL DEFAULT 0 CHECK (debit_minor >= 0),
    credit_minor BIGINT NOT NULL DEFAULT 0 CHECK (credit_minor >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK ((debit_minor > 0 AND credit_minor = 0) OR (credit_minor > 0 AND debit_minor = 0))
);
CREATE INDEX ledger_entries_workspace_idx ON ledger_entries (workspace_id, created_at DESC);
