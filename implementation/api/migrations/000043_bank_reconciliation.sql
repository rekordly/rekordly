-- 000043_bank_reconciliation.sql
-- Blueprint 04: Bank and Cash Reconciliation Engine

CREATE TABLE IF NOT EXISTS bank_reconciliations (
    id BIGSERIAL PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    money_account_id BIGINT NOT NULL REFERENCES money_accounts(id) ON DELETE RESTRICT,
    statement_date DATE NOT NULL,
    statement_balance_minor BIGINT NOT NULL,
    ledger_balance_minor BIGINT NOT NULL,
    difference_minor BIGINT NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'in_progress' CONSTRAINT bank_recon_status_check CHECK (status IN ('in_progress', 'reconciled', 'discarded')),
    reconciled_at TIMESTAMPTZ,
    reconciled_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bank_recon_workspace_acc_idx ON bank_reconciliations (workspace_id, money_account_id, statement_date DESC);

CREATE TABLE IF NOT EXISTS bank_reconciliation_matches (
    id BIGSERIAL PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    reconciliation_id BIGINT NOT NULL REFERENCES bank_reconciliations(id) ON DELETE CASCADE,
    transaction_id BIGINT NOT NULL REFERENCES money_transactions(id) ON DELETE RESTRICT,
    match_status TEXT NOT NULL DEFAULT 'cleared' CONSTRAINT bank_recon_match_status CHECK (match_status IN ('cleared', 'unmatched', 'disputed')),
    cleared_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT bank_recon_match_unique UNIQUE (reconciliation_id, transaction_id)
);

CREATE INDEX IF NOT EXISTS bank_recon_matches_tx_idx ON bank_reconciliation_matches (workspace_id, transaction_id);
