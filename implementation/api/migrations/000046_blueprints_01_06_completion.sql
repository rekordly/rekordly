-- 000046_blueprints_01_06_completion.sql
-- Blueprints 01-06 completion: RBAC role templates, outlet scopes, proforma invoices,
-- multi-tax lines, debit notes, document versions, and external portal evidence/messages/links.

-- 1. Optional outlet_id on core operational tables for Blueprint 02 outlet-scope enforcement
ALTER TABLE money_transactions
    ADD COLUMN IF NOT EXISTS outlet_id BIGINT REFERENCES inventory_locations(id) ON DELETE SET NULL;

ALTER TABLE sales
    ADD COLUMN IF NOT EXISTS outlet_id BIGINT REFERENCES inventory_locations(id) ON DELETE SET NULL;

ALTER TABLE purchases
    ADD COLUMN IF NOT EXISTS outlet_id BIGINT REFERENCES inventory_locations(id) ON DELETE SET NULL;

ALTER TABLE invoices
    ADD COLUMN IF NOT EXISTS outlet_id BIGINT REFERENCES inventory_locations(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS document_kind TEXT NOT NULL DEFAULT 'invoice'
        CONSTRAINT invoices_document_kind_check CHECK (document_kind IN ('invoice', 'proforma')),
    ADD COLUMN IF NOT EXISTS converted_from_proforma_id BIGINT REFERENCES invoices(id) ON DELETE SET NULL;

-- 2. Multi-tax / compound tax lines for Invoices and Estimates (Blueprint 06)
CREATE TABLE IF NOT EXISTS invoice_tax_lines (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    invoice_id BIGINT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    rate_bps INTEGER NOT NULL DEFAULT 0 CHECK (rate_bps >= 0 AND rate_bps <= 100000),
    amount_minor BIGINT NOT NULL DEFAULT 0 CHECK (amount_minor >= 0),
    is_compound BOOLEAN NOT NULL DEFAULT false,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS invoice_tax_lines_inv_idx ON invoice_tax_lines (workspace_id, invoice_id, sort_order);

CREATE TABLE IF NOT EXISTS estimate_tax_lines (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    estimate_id BIGINT NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    rate_bps INTEGER NOT NULL DEFAULT 0 CHECK (rate_bps >= 0 AND rate_bps <= 100000),
    amount_minor BIGINT NOT NULL DEFAULT 0 CHECK (amount_minor >= 0),
    is_compound BOOLEAN NOT NULL DEFAULT false,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS estimate_tax_lines_est_idx ON estimate_tax_lines (workspace_id, estimate_id, sort_order);

-- 3. Debit notes / adjustment invoices (Blueprint 06)
CREATE TABLE IF NOT EXISTS debit_notes (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    debit_note_number TEXT NOT NULL,
    invoice_id BIGINT REFERENCES invoices(id) ON DELETE SET NULL,
    customer_id BIGINT NOT NULL REFERENCES counterparties(id) ON DELETE RESTRICT,
    customer_name TEXT NOT NULL,
    issue_date DATE NOT NULL,
    currency CHAR(3) NOT NULL DEFAULT 'NGN',
    currency_exponent SMALLINT NOT NULL DEFAULT 2,
    subtotal_minor BIGINT NOT NULL DEFAULT 0 CHECK (subtotal_minor >= 0),
    tax_amount_minor BIGINT NOT NULL DEFAULT 0 CHECK (tax_amount_minor >= 0),
    total_amount_minor BIGINT NOT NULL DEFAULT 0 CHECK (total_amount_minor >= 0),
    paid_amount_minor BIGINT NOT NULL DEFAULT 0 CHECK (paid_amount_minor >= 0),
    status TEXT NOT NULL DEFAULT 'draft' CONSTRAINT debit_notes_status_check CHECK (status IN ('draft', 'issued', 'paid', 'voided')),
    reason TEXT,
    notes TEXT,
    created_by_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    void_reason TEXT,
    voided_at TIMESTAMPTZ,
    idempotency_key TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT debit_notes_ws_num_unique UNIQUE (workspace_id, debit_note_number)
);

CREATE UNIQUE INDEX IF NOT EXISTS debit_notes_idempotency_uidx ON debit_notes (workspace_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS debit_notes_ws_cust_idx ON debit_notes (workspace_id, customer_id, status);

CREATE TABLE IF NOT EXISTS debit_note_items (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    debit_note_id BIGINT NOT NULL REFERENCES debit_notes(id) ON DELETE CASCADE,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price_minor BIGINT NOT NULL CHECK (unit_price_minor >= 0),
    amount_minor BIGINT NOT NULL CHECK (amount_minor >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Document version / revision history (Blueprint 06)
CREATE TABLE IF NOT EXISTS document_versions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    document_type TEXT NOT NULL CONSTRAINT doc_versions_type_check CHECK (document_type IN ('invoice', 'proforma', 'estimate', 'debit_note')),
    document_id BIGINT NOT NULL,
    version_number INTEGER NOT NULL CHECK (version_number > 0),
    change_summary TEXT NOT NULL,
    snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS document_versions_lookup_idx ON document_versions (workspace_id, document_type, document_id, version_number DESC);

-- 5. External portal payment evidence, messages & party claiming (Blueprint 05)
CREATE TABLE IF NOT EXISTS external_payment_evidences (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    document_type TEXT NOT NULL CONSTRAINT ext_evidence_doc_type_check CHECK (document_type IN ('invoice', 'debit_note')),
    document_id BIGINT NOT NULL,
    share_id BIGINT REFERENCES invoice_shares(id) ON DELETE SET NULL,
    payer_name TEXT NOT NULL,
    payer_email TEXT,
    amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
    payment_date DATE NOT NULL,
    payment_method TEXT NOT NULL,
    reference TEXT,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CONSTRAINT ext_evidence_status_check CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewed_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    review_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ext_payment_evidences_ws_doc_idx ON external_payment_evidences (workspace_id, document_type, document_id, status);

CREATE TABLE IF NOT EXISTS external_messages (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    document_type TEXT NOT NULL CONSTRAINT ext_messages_doc_type_check CHECK (document_type IN ('invoice', 'estimate', 'purchase_order', 'statement')),
    document_id BIGINT NOT NULL,
    share_id BIGINT,
    sender_type TEXT NOT NULL CONSTRAINT ext_messages_sender_check CHECK (sender_type IN ('guest', 'team')),
    sender_name TEXT NOT NULL,
    sender_email TEXT,
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ext_messages_ws_doc_idx ON external_messages (workspace_id, document_type, document_id, created_at ASC);

CREATE TABLE IF NOT EXISTS external_party_links (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    counterparty_id BIGINT NOT NULL REFERENCES counterparties(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source_document_type TEXT NOT NULL,
    source_document_id BIGINT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CONSTRAINT ext_party_links_status_check CHECK (status IN ('active', 'revoked')),
    claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ext_party_links_unique UNIQUE (workspace_id, counterparty_id, user_id)
);

-- 6. Seed Blueprint 02 role templates & granular permissions across all existing workspaces
WITH templates(code, name) AS (
    VALUES
        ('owner', 'Owner'),
        ('admin', 'Admin'),
        ('accountant', 'Accountant / Bookkeeper'),
        ('sales', 'Sales'),
        ('cashier', 'Cashier'),
        ('inventory_manager', 'Inventory Manager'),
        ('procurement', 'Procurement'),
        ('viewer', 'Viewer / Auditor')
)
INSERT INTO roles (workspace_id, code, name, is_system)
SELECT w.id, t.code, t.name, false
FROM workspaces w
CROSS JOIN templates t
ON CONFLICT (workspace_id, code) WHERE NOT is_system DO NOTHING;

WITH role_perm_map(role_code, perm_code) AS (
    VALUES
        ('owner', '*'),
        ('admin', 'money.view'), ('admin', 'money.create'), ('admin', 'money.void'),
        ('admin', 'sales.view'), ('admin', 'sales.create'),
        ('admin', 'purchases.view'), ('admin', 'purchases.create'),
        ('admin', 'invoices.view'), ('admin', 'invoices.create'),
        ('admin', 'reconcile.manage'),
        ('admin', 'contacts.view'), ('admin', 'contacts.manage'),
        ('admin', 'inventory.view_quantity'),
        ('admin', 'reports.view_basic'), ('admin', 'reports.tax'),
        ('admin', 'settings.manage'),
        ('accountant', 'money.view'), ('accountant', 'money.create'), ('accountant', 'money.void'),
        ('accountant', 'sales.view'), ('accountant', 'purchases.view'),
        ('accountant', 'invoices.view'), ('accountant', 'invoices.create'),
        ('accountant', 'reconcile.manage'),
        ('accountant', 'contacts.view'), ('accountant', 'contacts.manage'),
        ('accountant', 'reports.view_basic'), ('accountant', 'reports.tax'),
        ('sales', 'sales.view'), ('sales', 'sales.create'),
        ('sales', 'invoices.view'), ('sales', 'invoices.create'),
        ('sales', 'contacts.view'), ('sales', 'contacts.manage'),
        ('sales', 'inventory.view_quantity'),
        ('cashier', 'money.view'), ('cashier', 'money.create'),
        ('cashier', 'sales.view'), ('cashier', 'sales.create'),
        ('cashier', 'invoices.view'), ('cashier', 'contacts.view'),
        ('inventory_manager', 'inventory.view_quantity'),
        ('inventory_manager', 'purchases.view'), ('inventory_manager', 'sales.view'),
        ('inventory_manager', 'contacts.view'),
        ('procurement', 'purchases.view'), ('procurement', 'purchases.create'),
        ('procurement', 'contacts.view'), ('procurement', 'contacts.manage'),
        ('procurement', 'inventory.view_quantity'),
        ('viewer', 'money.view'), ('viewer', 'sales.view'), ('viewer', 'purchases.view'),
        ('viewer', 'invoices.view'), ('viewer', 'contacts.view'),
        ('viewer', 'inventory.view_quantity'), ('viewer', 'reports.view_basic'),
        ('staff', 'contacts.view'), ('staff', 'invoices.view'), ('staff', 'invoices.create'),
        ('member', 'contacts.view'), ('member', 'invoices.view'), ('member', 'invoices.create')
)
INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, m.perm_code
FROM roles r
JOIN role_perm_map m ON m.role_code = r.code
ON CONFLICT (role_id, permission_code) DO NOTHING;
