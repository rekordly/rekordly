-- Supplier cash paid before an approved bill is an asset, not an expense and
-- not an Accounts Payable settlement. Applications to a bill are separate,
-- idempotent, non-cash events.
ALTER TABLE ledger_entries DROP CONSTRAINT ledger_entries_source_type_check;
ALTER TABLE ledger_entries ADD CONSTRAINT ledger_entries_source_type_check CHECK (source_type IN ('money_transaction','sale','purchase','invoice_payment','deposit','wallet_payment','reversal','adjustment','goods_receipt','supplier_bill','supplier_advance','supplier_advance_application'));

CREATE TABLE supplier_advances (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    supplier_id BIGINT NOT NULL REFERENCES counterparties(id) ON DELETE RESTRICT,
    payment_id BIGINT NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
    currency CHAR(3) NOT NULL CONSTRAINT supplier_advances_currency_check CHECK (currency ~ '^[A-Z]{3}$'),
    currency_exponent INTEGER NOT NULL CONSTRAINT supplier_advances_exponent_check CHECK (currency_exponent BETWEEN 0 AND 4),
    original_minor BIGINT NOT NULL CONSTRAINT supplier_advances_original_check CHECK (original_minor > 0),
    available_minor BIGINT NOT NULL CONSTRAINT supplier_advances_available_check CHECK (available_minor >= 0 AND available_minor <= original_minor),
    status TEXT NOT NULL DEFAULT 'open' CONSTRAINT supplier_advances_status_check CHECK (status IN ('open','partially_applied','applied','refunded','voided')),
    version INTEGER NOT NULL DEFAULT 1 CONSTRAINT supplier_advances_version_check CHECK (version > 0),
    created_by_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT supplier_advances_workspace_payment_uidx UNIQUE (workspace_id, payment_id)
);
CREATE INDEX supplier_advances_workspace_supplier_status_idx ON supplier_advances (workspace_id, supplier_id, status, id DESC);

CREATE TABLE supplier_advance_applications (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    supplier_advance_id BIGINT NOT NULL REFERENCES supplier_advances(id) ON DELETE RESTRICT,
    supplier_bill_id BIGINT NOT NULL REFERENCES supplier_bills(id) ON DELETE RESTRICT,
    amount_minor BIGINT NOT NULL CONSTRAINT supplier_advance_applications_amount_check CHECK (amount_minor > 0),
    idempotency_key TEXT NOT NULL CONSTRAINT supplier_advance_applications_key_check CHECK (length(btrim(idempotency_key)) > 0),
    created_by_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT supplier_advance_applications_workspace_key_uidx UNIQUE (workspace_id, idempotency_key)
);
CREATE INDEX supplier_advance_applications_workspace_advance_idx ON supplier_advance_applications (workspace_id, supplier_advance_id, id DESC);
CREATE INDEX supplier_advance_applications_workspace_bill_idx ON supplier_advance_applications (workspace_id, supplier_bill_id, id DESC);
