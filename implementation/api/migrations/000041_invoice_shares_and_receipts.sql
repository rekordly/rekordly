-- Blueprint 05 & 06: Invoice Public Shares and Payment Receipts
CREATE TABLE IF NOT EXISTS invoice_shares (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    invoice_id BIGINT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CONSTRAINT invoice_shares_status_check CHECK (status IN ('active', 'revoked')),
    access_count INTEGER NOT NULL DEFAULT 0,
    last_accessed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invoice_shares_workspace_invoice_idx ON invoice_shares (workspace_id, invoice_id);
CREATE INDEX IF NOT EXISTS invoice_shares_token_hash_idx ON invoice_shares (token_hash);

CREATE TABLE IF NOT EXISTS payment_receipts (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    receipt_number TEXT NOT NULL,
    payment_id BIGINT NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
    invoice_id BIGINT REFERENCES invoices(id) ON DELETE SET NULL,
    amount_minor BIGINT NOT NULL,
    currency CHAR(3) NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT payment_receipts_workspace_num_uidx UNIQUE (workspace_id, receipt_number)
);

CREATE INDEX IF NOT EXISTS payment_receipts_payment_idx ON payment_receipts (workspace_id, payment_id);
CREATE INDEX IF NOT EXISTS payment_receipts_token_hash_idx ON payment_receipts (token_hash);
