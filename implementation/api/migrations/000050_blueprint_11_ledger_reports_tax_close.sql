-- 000050_blueprint_11_ledger_reports_tax_close.sql
-- Blueprint 11: Chart of Accounts, Journal Engine, Subledger Reconciliation, Reports, Tax Schedules & Period Close

-- 1. Chart of Accounts
CREATE TABLE IF NOT EXISTS chart_accounts (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    account_class TEXT NOT NULL CONSTRAINT chart_accounts_class_check CHECK (account_class IN ('asset', 'liability', 'equity', 'revenue', 'expense')),
    subtype TEXT NOT NULL,
    parent_id BIGINT REFERENCES chart_accounts(id) ON DELETE RESTRICT,
    currency_restriction CHAR(3) CONSTRAINT chart_accounts_currency_check CHECK (currency_restriction IS NULL OR currency_restriction ~ '^[A-Z]{3}$'),
    is_system BOOLEAN NOT NULL DEFAULT false,
    is_control BOOLEAN NOT NULL DEFAULT false,
    control_subledger TEXT CONSTRAINT chart_accounts_subledger_check CHECK (
        control_subledger IS NULL OR control_subledger IN (
            'ar', 'ap', 'customer_deposits', 'supplier_advances', 'inventory',
            'loans_receivable', 'loans_payable', 'tax_payable', 'tax_recoverable',
            'grni', 'cash_bank', 'suspense'
        )
    ),
    is_active BOOLEAN NOT NULL DEFAULT true,
    archived_at TIMESTAMPTZ,
    template_version TEXT NOT NULL DEFAULT 'v1',
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chart_accounts_ws_code_uidx UNIQUE (workspace_id, code)
);

CREATE INDEX IF NOT EXISTS chart_accounts_ws_class_idx ON chart_accounts (workspace_id, account_class, is_active, code);
CREATE INDEX IF NOT EXISTS chart_accounts_ws_parent_idx ON chart_accounts (workspace_id, parent_id);

CREATE TABLE IF NOT EXISTS account_mappings (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    mapping_key TEXT NOT NULL,
    chart_account_id BIGINT NOT NULL REFERENCES chart_accounts(id) ON DELETE RESTRICT,
    updated_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT account_mappings_ws_key_uidx UNIQUE (workspace_id, mapping_key)
);

-- 2. Posting Template Versions
CREATE TABLE IF NOT EXISTS posting_template_versions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    template_key TEXT NOT NULL,
    version TEXT NOT NULL DEFAULT 'v1',
    description TEXT NOT NULL,
    spec JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT posting_template_versions_uidx UNIQUE (template_key, version)
);

INSERT INTO posting_template_versions (template_key, version, description, spec) VALUES
    ('personal_expense', 'v1', 'Personal lifestyle expense', '{"debit":"operating_expense","credit":"cash_default"}'),
    ('business_cash_sale', 'v1', 'Immediate business cash sale', '{"debit":"cash_default","credit":["sales_revenue","vat_payable"]}'),
    ('service_invoice', 'v1', 'Service invoice recognition', '{"debit":"ar_control","credit":["service_revenue","vat_payable"]}'),
    ('invoice_collection', 'v1', 'Customer invoice payment collection', '{"debit":"cash_default","credit":"ar_control"}'),
    ('customer_deposit', 'v1', 'Customer deposit / wallet liability', '{"debit":"cash_default","credit":"customer_deposits"}'),
    ('deposit_application', 'v1', 'Apply customer deposit to invoice AR', '{"debit":"customer_deposits","credit":"ar_control"}'),
    ('goods_receipt_grni', 'v1', 'Goods receipt before supplier bill', '{"debit":"inventory_control","credit":"grni"}'),
    ('approved_supplier_bill', 'v1', 'Approved supplier bill against GRNI/Expense', '{"debit":["grni","vat_recoverable"],"credit":"ap_control"}'),
    ('supplier_bill_payment', 'v1', 'Supplier bill cash/bank settlement', '{"debit":"ap_control","credit":"cash_default"}'),
    ('inventory_sale_cogs', 'v1', 'Inventory sale cost of goods sold', '{"debit":"cogs","credit":"inventory_control"}'),
    ('stock_adjustment', 'v1', 'Inventory stock adjustment / shrinkage', '{"debit":"inventory_adjustment","credit":"inventory_control"}'),
    ('owner_capital', 'v1', 'Owner capital contribution', '{"debit":"cash_default","credit":"owner_capital"}'),
    ('owner_drawings', 'v1', 'Owner drawing / distribution', '{"debit":"owner_drawings","credit":"cash_default"}'),
    ('loan_borrowed', 'v1', 'Loan borrowed origination', '{"debit":"cash_default","credit":"loans_payable"}'),
    ('loan_repayment', 'v1', 'Loan repayment principal/interest/fees', '{"debit":["loans_payable","interest_expense"],"credit":"cash_default"}'),
    ('investment_purchase', 'v1', 'Manual investment purchase/contribution', '{"debit":"investments","credit":"cash_default"}'),
    ('investment_sale', 'v1', 'Manual investment disposal', '{"debit":"cash_default","credit":"investments"}'),
    ('asset_purchase', 'v1', 'Personal/business asset acquisition', '{"debit":"personal_assets","credit":"cash_default"}'),
    ('asset_disposal', 'v1', 'Personal/business asset disposal', '{"debit":"cash_default","credit":"personal_assets"}'),
    ('tax_payment', 'v1', 'Tax liability remittance', '{"debit":"vat_payable","credit":"cash_default"}'),
    ('manual_journal', 'v1', 'Approved manual adjustment journal', '{"mode":"explicit_non_control"}'),
    ('reversal', 'v1', 'Exact opposite reversal of posted journal', '{"mode":"swap_debit_credit"}')
ON CONFLICT (template_key, version) DO NOTHING;

-- 3. Accounting Periods & Close Runs
CREATE TABLE IF NOT EXISTS accounting_periods (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CONSTRAINT accounting_periods_status_check CHECK (status IN ('open', 'soft_closed', 'closed', 'locked')),
    reporting_currency CHAR(3) NOT NULL DEFAULT 'NGN' CONSTRAINT accounting_periods_currency_check CHECK (reporting_currency ~ '^[A-Z]{3}$'),
    version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
    closed_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    closed_at TIMESTAMPTZ,
    locked_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    locked_at TIMESTAMPTZ,
    reopened_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    reopened_at TIMESTAMPTZ,
    reopen_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT accounting_periods_dates_check CHECK (end_date >= start_date),
    CONSTRAINT accounting_periods_ws_dates_uidx UNIQUE (workspace_id, start_date, end_date)
);

CREATE INDEX IF NOT EXISTS accounting_periods_ws_status_idx ON accounting_periods (workspace_id, status, start_date DESC);

CREATE TABLE IF NOT EXISTS period_close_runs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    accounting_period_id BIGINT NOT NULL REFERENCES accounting_periods(id) ON DELETE CASCADE,
    status TEXT NOT NULL CONSTRAINT period_close_runs_status_check CHECK (status IN ('passed', 'blocked', 'completed')),
    critical_failures INTEGER NOT NULL DEFAULT 0,
    warnings_count INTEGER NOT NULL DEFAULT 0,
    summary TEXT,
    run_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS period_close_checks (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    close_run_id BIGINT NOT NULL REFERENCES period_close_runs(id) ON DELETE CASCADE,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    check_key TEXT NOT NULL,
    label TEXT NOT NULL,
    severity TEXT NOT NULL CONSTRAINT period_close_checks_sev_check CHECK (severity IN ('critical', 'warning')),
    passed BOOLEAN NOT NULL,
    detail TEXT NOT NULL,
    difference_minor BIGINT NOT NULL DEFAULT 0
);

-- 4. Extend ledger_entries & ledger_lines for Blueprint 11 traceability & drill-down
ALTER TABLE ledger_entries DROP CONSTRAINT IF EXISTS ledger_entries_source_type_check;
ALTER TABLE ledger_entries ADD CONSTRAINT ledger_entries_source_type_check
    CHECK (source_type IN (
        'money_transaction','sale','purchase','invoice_payment','deposit','wallet_payment',
        'reversal','adjustment','goods_receipt','supplier_bill','supplier_advance',
        'supplier_advance_application','inventory_opening','cogs_sale','inventory_adjustment',
        'inventory_transfer_variance','stock_count_variance','supplier_return','supplier_credit',
        'supplier_refund','inventory_transfer','supplier_bill_reversal','supplier_credit_application',
        'opening_balance','loan_origination','loan_repayment','loan_reversal',
        'investment_event','asset_event','owner_transfer','manual_journal','tax_payment'
    ));

ALTER TABLE ledger_entries
    ADD COLUMN IF NOT EXISTS template_key TEXT,
    ADD COLUMN IF NOT EXISTS template_version TEXT,
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'posted' CONSTRAINT ledger_entries_status_check CHECK (status IN ('posted', 'reversed')),
    ADD COLUMN IF NOT EXISTS reversal_of_entry_id BIGINT REFERENCES ledger_entries(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS accounting_period_id BIGINT REFERENCES accounting_periods(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS outlet_id BIGINT REFERENCES inventory_locations(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS posted_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS ledger_entries_ws_idemp_uidx ON ledger_entries (workspace_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS ledger_entries_ws_period_idx ON ledger_entries (workspace_id, accounting_period_id, entry_date DESC);

ALTER TABLE ledger_lines
    ADD COLUMN IF NOT EXISTS chart_account_id BIGINT REFERENCES chart_accounts(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS party_id BIGINT REFERENCES counterparties(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS outlet_id BIGINT REFERENCES inventory_locations(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS tax_code_id BIGINT,
    ADD COLUMN IF NOT EXISTS dimension_tags JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS ledger_lines_ws_chart_acc_idx ON ledger_lines (workspace_id, chart_account_id);

-- 5. Manual Journal Drafts & Approvals
CREATE TABLE IF NOT EXISTS manual_journal_drafts (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    entry_date DATE NOT NULL,
    currency CHAR(3) NOT NULL DEFAULT 'NGN' CONSTRAINT manual_journal_currency_check CHECK (currency ~ '^[A-Z]{3}$'),
    currency_exponent INTEGER NOT NULL DEFAULT 2 CHECK (currency_exponent BETWEEN 0 AND 4),
    description TEXT NOT NULL,
    reference TEXT,
    evidence_key TEXT,
    status TEXT NOT NULL DEFAULT 'draft' CONSTRAINT manual_journal_status_check CHECK (status IN ('draft', 'pending_approval', 'approved', 'posted', 'rejected')),
    created_by_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    approved_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    posted_ledger_entry_id BIGINT REFERENCES ledger_entries(id) ON DELETE RESTRICT,
    rejection_reason TEXT,
    version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
    idempotency_key TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS manual_journal_drafts_idemp_uidx ON manual_journal_drafts (workspace_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS manual_journal_draft_lines (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    draft_id BIGINT NOT NULL REFERENCES manual_journal_drafts(id) ON DELETE CASCADE,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    chart_account_id BIGINT NOT NULL REFERENCES chart_accounts(id) ON DELETE RESTRICT,
    debit_minor BIGINT NOT NULL DEFAULT 0 CHECK (debit_minor >= 0),
    credit_minor BIGINT NOT NULL DEFAULT 0 CHECK (credit_minor >= 0),
    description TEXT,
    outlet_id BIGINT REFERENCES inventory_locations(id) ON DELETE SET NULL,
    party_id BIGINT REFERENCES counterparties(id) ON DELETE SET NULL,
    CONSTRAINT manual_journal_line_one_side_check CHECK ((debit_minor > 0 AND credit_minor = 0) OR (credit_minor > 0 AND debit_minor = 0))
);

-- 6. Tax Codes, Tax Periods, Tax Schedule Items & Tax Payments
CREATE TABLE IF NOT EXISTS tax_codes (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    tax_type TEXT NOT NULL CONSTRAINT tax_codes_type_check CHECK (tax_type IN ('vat', 'wht', 'other')),
    classification TEXT NOT NULL CONSTRAINT tax_codes_class_check CHECK (classification IN ('taxable', 'zero_rated', 'exempt', 'out_of_scope')),
    rate_bps INTEGER NOT NULL DEFAULT 0 CHECK (rate_bps >= 0 AND rate_bps <= 100000),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT tax_codes_ws_code_uidx UNIQUE (workspace_id, code)
);

CREATE TABLE IF NOT EXISTS tax_periods (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    tax_type TEXT NOT NULL CONSTRAINT tax_periods_type_check CHECK (tax_type IN ('vat', 'wht')),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CONSTRAINT tax_periods_status_check CHECK (status IN ('open', 'filed', 'paid')),
    output_tax_minor BIGINT NOT NULL DEFAULT 0,
    input_tax_minor BIGINT NOT NULL DEFAULT 0,
    net_tax_minor BIGINT NOT NULL DEFAULT 0,
    paid_minor BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT tax_periods_dates_check CHECK (end_date >= start_date)
);

CREATE TABLE IF NOT EXISTS tax_schedule_items (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    tax_period_id BIGINT REFERENCES tax_periods(id) ON DELETE SET NULL,
    tax_code_id BIGINT REFERENCES tax_codes(id) ON DELETE SET NULL,
    tax_type TEXT NOT NULL CONSTRAINT tax_schedule_type_check CHECK (tax_type IN ('vat', 'wht')),
    direction TEXT NOT NULL CONSTRAINT tax_schedule_dir_check CHECK (direction IN ('output', 'input', 'withheld_by_customer', 'withheld_from_supplier')),
    source_type TEXT NOT NULL,
    source_id BIGINT NOT NULL,
    counterparty_name TEXT,
    certificate_ref TEXT,
    taxable_base_minor BIGINT NOT NULL DEFAULT 0,
    tax_amount_minor BIGINT NOT NULL DEFAULT 0,
    rate_bps INTEGER NOT NULL DEFAULT 0,
    effective_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CONSTRAINT tax_schedule_status_check CHECK (status IN ('active', 'reversed', 'paid')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tax_schedule_items_ws_idx ON tax_schedule_items (workspace_id, tax_type, effective_date DESC);

CREATE TABLE IF NOT EXISTS tax_payments (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    tax_period_id BIGINT REFERENCES tax_periods(id) ON DELETE SET NULL,
    tax_type TEXT NOT NULL CONSTRAINT tax_payments_type_check CHECK (tax_type IN ('vat', 'wht', 'other')),
    money_account_id BIGINT NOT NULL REFERENCES money_accounts(id) ON DELETE RESTRICT,
    amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
    currency CHAR(3) NOT NULL DEFAULT 'NGN',
    currency_exponent INTEGER NOT NULL DEFAULT 2,
    payment_date DATE NOT NULL,
    reference TEXT,
    evidence_key TEXT,
    notes TEXT,
    money_transaction_id BIGINT REFERENCES money_transactions(id) ON DELETE RESTRICT,
    ledger_entry_id BIGINT REFERENCES ledger_entries(id) ON DELETE RESTRICT,
    idempotency_key TEXT,
    created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS tax_payments_idemp_uidx ON tax_payments (workspace_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

-- 7. Subledger Reconciliation, Projection Rebuilds & Report Exports
CREATE TABLE IF NOT EXISTS reconciliation_runs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    as_of_date DATE NOT NULL,
    status TEXT NOT NULL CONSTRAINT recon_runs_status_check CHECK (status IN ('passed', 'failed')),
    total_checks INTEGER NOT NULL DEFAULT 0,
    failed_checks INTEGER NOT NULL DEFAULT 0,
    run_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reconciliation_differences (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    run_id BIGINT NOT NULL REFERENCES reconciliation_runs(id) ON DELETE CASCADE,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    subledger_name TEXT NOT NULL,
    control_account_id BIGINT REFERENCES chart_accounts(id) ON DELETE SET NULL,
    gl_balance_minor BIGINT NOT NULL DEFAULT 0,
    subledger_balance_minor BIGINT NOT NULL DEFAULT 0,
    difference_minor BIGINT NOT NULL DEFAULT 0,
    status TEXT NOT NULL CONSTRAINT recon_diff_status_check CHECK (status IN ('matched', 'mismatch')),
    details TEXT
);

CREATE TABLE IF NOT EXISTS projection_rebuild_runs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    scope TEXT NOT NULL DEFAULT 'all',
    status TEXT NOT NULL DEFAULT 'completed' CONSTRAINT proj_rebuild_status_check CHECK (status IN ('queued', 'running', 'completed', 'failed')),
    before_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    after_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    verified BOOLEAN NOT NULL DEFAULT true,
    error_message TEXT,
    idempotency_key TEXT,
    created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS projection_rebuild_runs_idemp_uidx ON projection_rebuild_runs (workspace_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS report_exports (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    report_type TEXT NOT NULL,
    format TEXT NOT NULL CONSTRAINT report_exports_format_check CHECK (format IN ('csv', 'pdf')),
    filters JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'ready' CONSTRAINT report_exports_status_check CHECK (status IN ('ready', 'failed', 'expired')),
    row_count INTEGER NOT NULL DEFAULT 0,
    warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
    content_text TEXT NOT NULL DEFAULT '',
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
    created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS report_exports_ws_idx ON report_exports (workspace_id, created_at DESC);

-- 8. Seed Blueprint 11 RBAC Permissions across existing workspace roles
WITH role_perm_map(role_code, perm_code) AS (
    VALUES
        ('admin', 'ledger.view'), ('admin', 'ledger.view_detail'), ('admin', 'chart.manage'),
        ('admin', 'journal.create_manual'), ('admin', 'journal.approve_manual'), ('admin', 'journal.reverse'),
        ('admin', 'reports.view_basic'), ('admin', 'reports.view_accounting'), ('admin', 'reports.view_tax'), ('admin', 'reports.export'),
        ('admin', 'reconciliation.view'), ('admin', 'reconciliation.run'),
        ('admin', 'period.close'), ('admin', 'period.lock'), ('admin', 'period.reopen'),
        ('accountant', 'ledger.view'), ('accountant', 'ledger.view_detail'), ('accountant', 'chart.manage'),
        ('accountant', 'journal.create_manual'), ('accountant', 'journal.approve_manual'), ('accountant', 'journal.reverse'),
        ('accountant', 'reports.view_basic'), ('accountant', 'reports.view_accounting'), ('accountant', 'reports.view_tax'), ('accountant', 'reports.export'),
        ('accountant', 'reconciliation.view'), ('accountant', 'reconciliation.run'),
        ('accountant', 'period.close'),
        ('staff', 'reports.view_basic'),
        ('member', 'reports.view_basic')
)
INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, m.perm_code
FROM roles r
JOIN role_perm_map m ON m.role_code = r.code
ON CONFLICT (role_id, permission_code) DO NOTHING;
