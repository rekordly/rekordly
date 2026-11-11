-- 000044_reconciliation_statements_and_portals.sql
-- Blueprints 04, 05 & 06: Bank Statement Lines, Cash Counts, Estimate & Statement Portals,
-- Invoice/Estimate Discounts & Delivery Fees, Counterparty Opening Balances & Merges.

-- 1. Extend bank_reconciliations for cash counts and cleared tracking
ALTER TABLE bank_reconciliations
    ADD COLUMN IF NOT EXISTS reconciliation_type TEXT NOT NULL DEFAULT 'bank'
        CONSTRAINT bank_recon_type_check CHECK (reconciliation_type IN ('bank', 'cash')),
    ADD COLUMN IF NOT EXISTS cleared_balance_minor BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS denominations JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 2. Bank statement import batches & parsed statement lines (Blueprint 04)
CREATE TABLE IF NOT EXISTS bank_import_batches (
    id BIGSERIAL PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    money_account_id BIGINT NOT NULL REFERENCES money_accounts(id) ON DELETE RESTRICT,
    file_name TEXT NOT NULL,
    row_count INTEGER NOT NULL DEFAULT 0 CHECK (row_count >= 0),
    imported_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bank_import_batches_ws_idx ON bank_import_batches (workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS bank_lines (
    id BIGSERIAL PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    batch_id BIGINT NOT NULL REFERENCES bank_import_batches(id) ON DELETE CASCADE,
    money_account_id BIGINT NOT NULL REFERENCES money_accounts(id) ON DELETE RESTRICT,
    transaction_date DATE NOT NULL,
    description TEXT NOT NULL,
    reference TEXT,
    direction TEXT NOT NULL CONSTRAINT bank_lines_direction_check CHECK (direction IN ('money_in', 'money_out')),
    amount_minor BIGINT NOT NULL CONSTRAINT bank_lines_amount_check CHECK (amount_minor > 0),
    matched_transaction_id BIGINT REFERENCES money_transactions(id) ON DELETE SET NULL,
    match_status TEXT NOT NULL DEFAULT 'unmatched' CONSTRAINT bank_lines_match_status_check CHECK (match_status IN ('unmatched', 'suggested', 'matched', 'ignored')),
    fingerprint TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bank_lines_ws_acc_idx ON bank_lines (workspace_id, money_account_id, match_status, transaction_date DESC);
CREATE UNIQUE INDEX IF NOT EXISTS bank_lines_fingerprint_uidx ON bank_lines (workspace_id, money_account_id, fingerprint);

-- 3. Public estimate shares (Blueprint 05 & 06)
CREATE TABLE IF NOT EXISTS estimate_shares (
    id BIGSERIAL PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    estimate_id BIGINT NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'active' CONSTRAINT estimate_shares_status_check CHECK (status IN ('active', 'revoked', 'expired')),
    allow_respond BOOLEAN NOT NULL DEFAULT true,
    response_status TEXT CHECK (response_status IS NULL OR response_status IN ('accepted', 'declined')),
    responded_by_name TEXT,
    response_comment TEXT,
    responded_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL,
    access_count INTEGER NOT NULL DEFAULT 0,
    last_accessed_at TIMESTAMPTZ,
    created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS estimate_shares_est_idx ON estimate_shares (workspace_id, estimate_id);

-- 4. Public customer statement shares (Blueprint 05)
CREATE TABLE IF NOT EXISTS customer_statement_shares (
    id BIGSERIAL PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    customer_id BIGINT NOT NULL REFERENCES counterparties(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    from_date DATE,
    to_date DATE,
    status TEXT NOT NULL DEFAULT 'active' CONSTRAINT statement_shares_status_check CHECK (status IN ('active', 'revoked', 'expired')),
    expires_at TIMESTAMPTZ NOT NULL,
    access_count INTEGER NOT NULL DEFAULT 0,
    last_accessed_at TIMESTAMPTZ,
    created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS customer_stmt_shares_cust_idx ON customer_statement_shares (workspace_id, customer_id);

-- 5. Invoice & Estimate discounts and delivery fees (Blueprint 06)
ALTER TABLE invoices
    ADD COLUMN IF NOT EXISTS discount_minor BIGINT NOT NULL DEFAULT 0 CHECK (discount_minor >= 0),
    ADD COLUMN IF NOT EXISTS delivery_fee_minor BIGINT NOT NULL DEFAULT 0 CHECK (delivery_fee_minor >= 0);

ALTER TABLE invoice_items
    ADD COLUMN IF NOT EXISTS discount_minor BIGINT NOT NULL DEFAULT 0 CHECK (discount_minor >= 0);

ALTER TABLE estimates
    ADD COLUMN IF NOT EXISTS discount_minor BIGINT NOT NULL DEFAULT 0 CHECK (discount_minor >= 0),
    ADD COLUMN IF NOT EXISTS delivery_fee_minor BIGINT NOT NULL DEFAULT 0 CHECK (delivery_fee_minor >= 0);

ALTER TABLE estimate_items
    ADD COLUMN IF NOT EXISTS discount_minor BIGINT NOT NULL DEFAULT 0 CHECK (discount_minor >= 0);

-- 6. Counterparty opening balance and merge metadata (Blueprint 05)
ALTER TABLE counterparties
    ADD COLUMN IF NOT EXISTS opening_balance_minor BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS merged_into_id BIGINT REFERENCES counterparties(id) ON DELETE SET NULL;
