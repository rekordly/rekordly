CREATE TABLE money_accounts (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    account_type TEXT NOT NULL CONSTRAINT money_accounts_type_check CHECK (account_type IN ('cash', 'bank', 'mobile_wallet', 'clearing', 'other')),
    currency CHAR(3) NOT NULL CONSTRAINT money_accounts_currency_check CHECK (currency ~ '^[A-Z]{3}$'),
    currency_exponent INTEGER NOT NULL DEFAULT 2 CONSTRAINT money_accounts_exponent_check CHECK (currency_exponent >= 0 AND currency_exponent <= 4),
    opening_balance_minor BIGINT NOT NULL DEFAULT 0,
    current_balance_minor BIGINT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT money_accounts_workspace_name_uidx UNIQUE (workspace_id, name)
);
CREATE INDEX money_accounts_workspace_active_idx ON money_accounts (workspace_id, is_active);

CREATE TABLE categories (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    direction TEXT NOT NULL CONSTRAINT categories_direction_check CHECK (direction IN ('money_in', 'money_out', 'both')),
    scope TEXT NOT NULL DEFAULT 'both' CONSTRAINT categories_scope_check CHECK (scope IN ('personal', 'business', 'both')),
    account_class TEXT NOT NULL CONSTRAINT categories_account_class_check CHECK (account_class IN ('income', 'expense', 'asset', 'liability', 'equity')),
    is_system BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT categories_workspace_name_direction_uidx UNIQUE (workspace_id, name, direction)
);
CREATE INDEX categories_workspace_active_idx ON categories (workspace_id, is_active);

CREATE TABLE money_transactions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    direction TEXT NOT NULL CONSTRAINT money_transactions_direction_check CHECK (direction IN ('money_in', 'money_out', 'transfer')),
    status TEXT NOT NULL DEFAULT 'draft' CONSTRAINT money_transactions_status_check CHECK (status IN ('draft', 'posted', 'voided', 'reversed')),
    amount_minor BIGINT NOT NULL CONSTRAINT money_transactions_amount_check CHECK (amount_minor > 0),
    currency CHAR(3) NOT NULL CONSTRAINT money_transactions_currency_check CHECK (currency ~ '^[A-Z]{3}$'),
    currency_exponent INTEGER NOT NULL DEFAULT 2 CONSTRAINT money_transactions_exponent_check CHECK (currency_exponent >= 0 AND currency_exponent <= 4),
    effective_date DATE NOT NULL,
    money_account_id BIGINT REFERENCES money_accounts(id) ON DELETE RESTRICT,
    destination_account_id BIGINT REFERENCES money_accounts(id) ON DELETE RESTRICT,
    category_id BIGINT REFERENCES categories(id) ON DELETE RESTRICT,
    counterparty_name TEXT,
    purpose TEXT NOT NULL DEFAULT 'other',
    notes TEXT,
    reference TEXT,
    idempotency_key TEXT,
    is_void BOOLEAN NOT NULL DEFAULT false,
    voided_at TIMESTAMPTZ,
    void_reason TEXT,
    reversal_of_id BIGINT REFERENCES money_transactions(id) ON DELETE RESTRICT,
    created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    posted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT money_transactions_transfer_destination_check CHECK (
        (direction = 'transfer' AND (status = 'draft' OR (destination_account_id IS NOT NULL AND destination_account_id <> money_account_id)))
        OR (direction <> 'transfer')
    ),
    CONSTRAINT money_transactions_void_state_check CHECK (
        (status = 'voided' AND is_void AND voided_at IS NOT NULL AND void_reason IS NOT NULL)
        OR (status <> 'voided' AND NOT is_void)
    )
);
CREATE INDEX money_transactions_workspace_date_idx ON money_transactions (workspace_id, effective_date DESC, id DESC);
CREATE INDEX money_transactions_workspace_status_idx ON money_transactions (workspace_id, status);
CREATE INDEX money_transactions_account_idx ON money_transactions (money_account_id);
CREATE INDEX money_transactions_destination_account_idx ON money_transactions (destination_account_id);
CREATE INDEX money_transactions_reversal_idx ON money_transactions (reversal_of_id);
CREATE UNIQUE INDEX money_transactions_idempotency_uidx ON money_transactions (workspace_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL AND status <> 'voided';

CREATE TABLE ledger_entries (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    source_type TEXT NOT NULL CONSTRAINT ledger_entries_source_type_check CHECK (source_type IN ('money_transaction', 'sale', 'purchase', 'invoice_payment', 'deposit', 'wallet_payment', 'reversal', 'adjustment')),
    source_id BIGINT NOT NULL,
    entry_date DATE NOT NULL,
    currency CHAR(3) NOT NULL CONSTRAINT ledger_entries_currency_check CHECK (currency ~ '^[A-Z]{3}$'),
    currency_exponent INTEGER NOT NULL DEFAULT 2,
    description TEXT,
    is_reversed BOOLEAN NOT NULL DEFAULT false,
    reversed_by_entry_id BIGINT REFERENCES ledger_entries(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ledger_entries_workspace_source_idx ON ledger_entries (workspace_id, source_type, source_id);
CREATE INDEX ledger_entries_workspace_date_idx ON ledger_entries (workspace_id, entry_date);

CREATE TABLE ledger_lines (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ledger_entry_id BIGINT NOT NULL REFERENCES ledger_entries(id) ON DELETE CASCADE,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    account_id BIGINT REFERENCES money_accounts(id) ON DELETE RESTRICT,
    account_class TEXT NOT NULL CONSTRAINT ledger_lines_class_check CHECK (account_class IN ('asset', 'liability', 'equity', 'revenue', 'expense')),
    debit_minor BIGINT NOT NULL DEFAULT 0 CONSTRAINT ledger_lines_debit_check CHECK (debit_minor >= 0),
    credit_minor BIGINT NOT NULL DEFAULT 0 CONSTRAINT ledger_lines_credit_check CHECK (credit_minor >= 0),
    description TEXT,
    CONSTRAINT ledger_lines_balanced_line_check CHECK (
        (debit_minor > 0 AND credit_minor = 0) OR (credit_minor > 0 AND debit_minor = 0)
    )
);
CREATE INDEX ledger_lines_entry_id_idx ON ledger_lines (ledger_entry_id);
CREATE INDEX ledger_lines_workspace_account_idx ON ledger_lines (workspace_id, account_id);

CREATE TABLE attachments_metadata (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    transaction_id BIGINT REFERENCES money_transactions(id) ON DELETE CASCADE,
    storage_key TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_size_bytes BIGINT NOT NULL CONSTRAINT attachments_size_check CHECK (file_size_bytes > 0),
    mime_type TEXT NOT NULL,
    sha256_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX attachments_metadata_workspace_txn_idx ON attachments_metadata (workspace_id, transaction_id);
