-- 000049_blueprint_10_personal_finance.sql
-- Blueprint 10: Personal Finance, Budgets, Loans, Assets, Investments, Owner Transfers & All Summary

-- 1. Extend money_accounts for card/credit types, ordering, metadata, and archiving
ALTER TABLE money_accounts DROP CONSTRAINT IF EXISTS money_accounts_type_check;
ALTER TABLE money_accounts ADD CONSTRAINT money_accounts_type_check
    CHECK (account_type IN ('cash', 'bank', 'mobile_wallet', 'card', 'credit', 'clearing', 'other'));

ALTER TABLE money_accounts
    ADD COLUMN IF NOT EXISTS institution_name TEXT,
    ADD COLUMN IF NOT EXISTS masked_reference TEXT,
    ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS icon TEXT,
    ADD COLUMN IF NOT EXISTS color TEXT,
    ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS money_accounts_workspace_order_idx ON money_accounts (workspace_id, is_active, display_order ASC, id ASC);

-- 2. Extend categories for parent/group hierarchy, archiving, ordering, and metadata
ALTER TABLE categories
    ADD COLUMN IF NOT EXISTS parent_id BIGINT REFERENCES categories(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS icon TEXT,
    ADD COLUMN IF NOT EXISTS color TEXT;

CREATE INDEX IF NOT EXISTS categories_workspace_parent_idx ON categories (workspace_id, parent_id);

-- 3. Personal tags
CREATE TABLE IF NOT EXISTS personal_tags (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT personal_tags_workspace_name_uidx UNIQUE (workspace_id, name)
);

CREATE INDEX IF NOT EXISTS personal_tags_workspace_active_idx ON personal_tags (workspace_id, is_active, name);

-- 4. Extend money_transactions for tags and personal/owner-transfer tracking
ALTER TABLE money_transactions
    ADD COLUMN IF NOT EXISTS tags JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

-- 5. Extend ledger_entries source_type_check to support Blueprint 10 sources while preserving existing types
ALTER TABLE ledger_entries DROP CONSTRAINT IF EXISTS ledger_entries_source_type_check;
ALTER TABLE ledger_entries ADD CONSTRAINT ledger_entries_source_type_check
    CHECK (source_type IN (
        'money_transaction','sale','purchase','invoice_payment','deposit','wallet_payment',
        'reversal','adjustment','goods_receipt','supplier_bill','supplier_advance',
        'supplier_advance_application','inventory_opening','cogs_sale','inventory_adjustment',
        'inventory_transfer_variance','stock_count_variance','supplier_return','supplier_credit',
        'supplier_refund','inventory_transfer','supplier_bill_reversal','supplier_credit_application',
        'opening_balance','loan_origination','loan_repayment','loan_reversal',
        'investment_event','asset_event','owner_transfer'
    ));

-- 6. Extend budgets and add budget_lines, budget_versions, budget_alert_events
ALTER TABLE budgets
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active' CONSTRAINT budgets_status_check CHECK (status IN ('draft', 'active', 'completed', 'archived')),
    ADD COLUMN IF NOT EXISTS income_goal_minor BIGINT NOT NULL DEFAULT 0 CONSTRAINT budgets_income_goal_check CHECK (income_goal_minor >= 0),
    ADD COLUMN IF NOT EXISTS alert_thresholds JSONB NOT NULL DEFAULT '[50, 80, 100]'::jsonb,
    ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS copied_from_budget_id BIGINT REFERENCES budgets(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'Africa/Lagos';

CREATE INDEX IF NOT EXISTS budgets_workspace_status_idx ON budgets (workspace_id, status, start_date DESC);

CREATE TABLE IF NOT EXISTS budget_lines (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    budget_id BIGINT NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
    category_id BIGINT REFERENCES categories(id) ON DELETE RESTRICT,
    limit_minor BIGINT NOT NULL CONSTRAINT budget_lines_limit_check CHECK (limit_minor > 0),
    notes TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS budget_lines_budget_idx ON budget_lines (workspace_id, budget_id);
CREATE UNIQUE INDEX IF NOT EXISTS budget_lines_budget_cat_uidx ON budget_lines (budget_id, category_id) WHERE category_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS budget_versions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    budget_id BIGINT NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL CHECK (version_number > 0),
    snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    changed_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    change_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS budget_versions_lookup_idx ON budget_versions (workspace_id, budget_id, version_number DESC);

CREATE TABLE IF NOT EXISTS budget_alert_events (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    budget_id BIGINT NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
    threshold_percent INTEGER NOT NULL CHECK (threshold_percent > 0),
    actual_minor BIGINT NOT NULL,
    limit_minor BIGINT NOT NULL,
    usage_basis_points BIGINT NOT NULL,
    message TEXT NOT NULL,
    acknowledged_at TIMESTAMPTZ,
    triggered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT budget_alert_events_dedup_uidx UNIQUE (workspace_id, budget_id, threshold_percent)
);

CREATE INDEX IF NOT EXISTS budget_alert_events_ws_idx ON budget_alert_events (workspace_id, triggered_at DESC);

-- 7. Loans: loans, loan_events, loan_schedule_items
CREATE TABLE IF NOT EXISTS loans (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    direction TEXT NOT NULL CONSTRAINT loans_direction_check CHECK (direction IN ('borrowed', 'lent')),
    counterparty_name TEXT NOT NULL,
    counterparty_id BIGINT REFERENCES counterparties(id) ON DELETE SET NULL,
    principal_minor BIGINT NOT NULL CONSTRAINT loans_principal_check CHECK (principal_minor > 0),
    outstanding_principal_minor BIGINT NOT NULL CONSTRAINT loans_outstanding_check CHECK (outstanding_principal_minor >= 0),
    total_interest_paid_minor BIGINT NOT NULL DEFAULT 0 CONSTRAINT loans_interest_paid_check CHECK (total_interest_paid_minor >= 0),
    total_fees_paid_minor BIGINT NOT NULL DEFAULT 0 CONSTRAINT loans_fees_paid_check CHECK (total_fees_paid_minor >= 0),
    currency CHAR(3) NOT NULL DEFAULT 'NGN' CONSTRAINT loans_currency_check CHECK (currency ~ '^[A-Z]{3}$'),
    currency_exponent INTEGER NOT NULL DEFAULT 2 CONSTRAINT loans_exponent_check CHECK (currency_exponent BETWEEN 0 AND 4),
    start_date DATE NOT NULL,
    due_date DATE,
    interest_rate_bps INTEGER NOT NULL DEFAULT 0 CHECK (interest_rate_bps >= 0),
    interest_arrangement TEXT,
    money_account_id BIGINT REFERENCES money_accounts(id) ON DELETE RESTRICT,
    is_opening_balance BOOLEAN NOT NULL DEFAULT false,
    status TEXT NOT NULL DEFAULT 'active' CONSTRAINT loans_status_check CHECK (status IN ('draft', 'active', 'partially_repaid', 'repaid', 'overdue', 'written_off', 'reversed')),
    notes TEXT,
    evidence_key TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    idempotency_key TEXT,
    created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS loans_workspace_status_idx ON loans (workspace_id, status, due_date ASC);
CREATE INDEX IF NOT EXISTS loans_workspace_direction_idx ON loans (workspace_id, direction, id DESC);
CREATE UNIQUE INDEX IF NOT EXISTS loans_workspace_idemp_uidx ON loans (workspace_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS loan_events (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    loan_id BIGINT NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL CONSTRAINT loan_events_type_check CHECK (event_type IN ('origination', 'opening', 'repayment', 'principal_increase', 'forgiveness', 'write_off', 'reversal')),
    effective_date DATE NOT NULL,
    total_amount_minor BIGINT NOT NULL CHECK (total_amount_minor >= 0),
    principal_minor BIGINT NOT NULL DEFAULT 0 CHECK (principal_minor >= 0),
    interest_minor BIGINT NOT NULL DEFAULT 0 CHECK (interest_minor >= 0),
    fee_minor BIGINT NOT NULL DEFAULT 0 CHECK (fee_minor >= 0),
    money_account_id BIGINT REFERENCES money_accounts(id) ON DELETE RESTRICT,
    money_transaction_id BIGINT REFERENCES money_transactions(id) ON DELETE RESTRICT,
    ledger_entry_id BIGINT REFERENCES ledger_entries(id) ON DELETE RESTRICT,
    reversed_event_id BIGINT REFERENCES loan_events(id) ON DELETE RESTRICT,
    is_reversed BOOLEAN NOT NULL DEFAULT false,
    notes TEXT,
    idempotency_key TEXT,
    created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS loan_events_loan_idx ON loan_events (workspace_id, loan_id, effective_date DESC, id DESC);
CREATE UNIQUE INDEX IF NOT EXISTS loan_events_workspace_idemp_uidx ON loan_events (workspace_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS loan_schedule_items (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    loan_id BIGINT NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
    installment_number INTEGER NOT NULL CHECK (installment_number > 0),
    due_date DATE NOT NULL,
    expected_total_minor BIGINT NOT NULL CHECK (expected_total_minor > 0),
    expected_principal_minor BIGINT NOT NULL DEFAULT 0 CHECK (expected_principal_minor >= 0),
    expected_interest_minor BIGINT NOT NULL DEFAULT 0 CHECK (expected_interest_minor >= 0),
    paid_minor BIGINT NOT NULL DEFAULT 0 CHECK (paid_minor >= 0),
    status TEXT NOT NULL DEFAULT 'pending' CONSTRAINT loan_schedule_status_check CHECK (status IN ('pending', 'partial', 'paid', 'overdue')),
    reminder_enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS loan_schedule_items_loan_idx ON loan_schedule_items (workspace_id, loan_id, installment_number ASC);

-- 8. Investments: investments, investment_events, investment_valuations
CREATE TABLE IF NOT EXISTS investments (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    investment_type TEXT NOT NULL CONSTRAINT investments_type_check CHECK (investment_type IN ('shares_funds', 'fixed_income', 'crypto', 'cooperative', 'other')),
    institution_name TEXT,
    currency CHAR(3) NOT NULL DEFAULT 'NGN' CONSTRAINT investments_currency_check CHECK (currency ~ '^[A-Z]{3}$'),
    currency_exponent INTEGER NOT NULL DEFAULT 2 CONSTRAINT investments_exponent_check CHECK (currency_exponent BETWEEN 0 AND 4),
    total_units NUMERIC(20, 8) NOT NULL DEFAULT 0,
    cost_basis_minor BIGINT NOT NULL DEFAULT 0 CHECK (cost_basis_minor >= 0),
    total_income_minor BIGINT NOT NULL DEFAULT 0 CHECK (total_income_minor >= 0),
    latest_manual_value_minor BIGINT,
    latest_valuation_date DATE,
    latest_valuation_source TEXT,
    status TEXT NOT NULL DEFAULT 'draft' CONSTRAINT investments_status_check CHECK (status IN ('draft', 'active', 'disposed', 'archived')),
    notes TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    idempotency_key TEXT,
    created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS investments_workspace_status_idx ON investments (workspace_id, status, id DESC);
CREATE UNIQUE INDEX IF NOT EXISTS investments_workspace_idemp_uidx ON investments (workspace_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS investment_events (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    investment_id BIGINT NOT NULL REFERENCES investments(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL CONSTRAINT investment_events_type_check CHECK (event_type IN ('purchase', 'contribution', 'income', 'disposal', 'opening', 'reversal')),
    effective_date DATE NOT NULL,
    amount_minor BIGINT NOT NULL CHECK (amount_minor >= 0),
    units_delta NUMERIC(20, 8) NOT NULL DEFAULT 0,
    cost_basis_delta_minor BIGINT NOT NULL DEFAULT 0,
    realized_gain_loss_minor BIGINT,
    gain_loss_status TEXT NOT NULL DEFAULT 'not_applicable' CONSTRAINT investment_events_gl_status_check CHECK (gain_loss_status IN ('not_applicable', 'computed', 'needs_review')),
    money_account_id BIGINT REFERENCES money_accounts(id) ON DELETE RESTRICT,
    money_transaction_id BIGINT REFERENCES money_transactions(id) ON DELETE RESTRICT,
    ledger_entry_id BIGINT REFERENCES ledger_entries(id) ON DELETE RESTRICT,
    notes TEXT,
    idempotency_key TEXT,
    created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS investment_events_inv_idx ON investment_events (workspace_id, investment_id, effective_date DESC, id DESC);
CREATE UNIQUE INDEX IF NOT EXISTS investment_events_workspace_idemp_uidx ON investment_events (workspace_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS investment_valuations (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    investment_id BIGINT NOT NULL REFERENCES investments(id) ON DELETE CASCADE,
    valuation_date DATE NOT NULL,
    value_minor BIGINT NOT NULL CHECK (value_minor >= 0),
    source TEXT NOT NULL DEFAULT 'user_manual',
    notes TEXT,
    created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS investment_valuations_inv_idx ON investment_valuations (workspace_id, investment_id, valuation_date DESC, id DESC);

-- 9. Personal Assets: assets, asset_events, asset_valuations
CREATE TABLE IF NOT EXISTS assets (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    asset_type TEXT NOT NULL CONSTRAINT assets_type_check CHECK (asset_type IN ('vehicle', 'property', 'electronics_equipment', 'personal_item', 'other')),
    currency CHAR(3) NOT NULL DEFAULT 'NGN' CONSTRAINT assets_currency_check CHECK (currency ~ '^[A-Z]{3}$'),
    currency_exponent INTEGER NOT NULL DEFAULT 2 CONSTRAINT assets_exponent_check CHECK (currency_exponent BETWEEN 0 AND 4),
    acquisition_date DATE,
    acquisition_cost_minor BIGINT NOT NULL DEFAULT 0 CHECK (acquisition_cost_minor >= 0),
    is_opening_asset BOOLEAN NOT NULL DEFAULT false,
    money_account_id BIGINT REFERENCES money_accounts(id) ON DELETE RESTRICT,
    latest_manual_value_minor BIGINT,
    latest_valuation_date DATE,
    latest_valuation_source TEXT,
    disposal_date DATE,
    disposal_proceeds_minor BIGINT,
    disposal_costs_minor BIGINT,
    realized_gain_loss_minor BIGINT,
    status TEXT NOT NULL DEFAULT 'draft' CONSTRAINT assets_status_check CHECK (status IN ('draft', 'active', 'disposed', 'archived')),
    evidence_key TEXT,
    notes TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    idempotency_key TEXT,
    created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS assets_workspace_status_idx ON assets (workspace_id, status, id DESC);
CREATE UNIQUE INDEX IF NOT EXISTS assets_workspace_idemp_uidx ON assets (workspace_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS asset_events (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    asset_id BIGINT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL CONSTRAINT asset_events_type_check CHECK (event_type IN ('acquisition', 'opening', 'disposal', 'reversal')),
    effective_date DATE NOT NULL,
    amount_minor BIGINT NOT NULL CHECK (amount_minor >= 0),
    disposal_costs_minor BIGINT NOT NULL DEFAULT 0 CHECK (disposal_costs_minor >= 0),
    counterparty_name TEXT,
    money_account_id BIGINT REFERENCES money_accounts(id) ON DELETE RESTRICT,
    money_transaction_id BIGINT REFERENCES money_transactions(id) ON DELETE RESTRICT,
    ledger_entry_id BIGINT REFERENCES ledger_entries(id) ON DELETE RESTRICT,
    notes TEXT,
    evidence_key TEXT,
    idempotency_key TEXT,
    created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS asset_events_asset_idx ON asset_events (workspace_id, asset_id, effective_date DESC, id DESC);
CREATE UNIQUE INDEX IF NOT EXISTS asset_events_workspace_idemp_uidx ON asset_events (workspace_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS asset_valuations (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    asset_id BIGINT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    valuation_date DATE NOT NULL,
    value_minor BIGINT NOT NULL CHECK (value_minor >= 0),
    source TEXT NOT NULL DEFAULT 'user_manual',
    notes TEXT,
    created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS asset_valuations_asset_idx ON asset_valuations (workspace_id, asset_id, valuation_date DESC, id DESC);

-- 10. Owner transfer groups between Personal and owned Business workspaces
CREATE TABLE IF NOT EXISTS owner_transfer_groups (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    owner_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    from_workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
    to_workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
    from_money_account_id BIGINT NOT NULL REFERENCES money_accounts(id) ON DELETE RESTRICT,
    to_money_account_id BIGINT NOT NULL REFERENCES money_accounts(id) ON DELETE RESTRICT,
    purpose TEXT NOT NULL CONSTRAINT owner_transfer_purpose_check CHECK (purpose IN (
        'owner_capital_contribution',
        'owner_loan',
        'owner_loan_repayment',
        'owner_drawing_distribution',
        'business_expense_reimbursement',
        'personal_expense_paid_for_business'
    )),
    amount_minor BIGINT NOT NULL CONSTRAINT owner_transfer_amount_check CHECK (amount_minor > 0),
    currency CHAR(3) NOT NULL CONSTRAINT owner_transfer_currency_check CHECK (currency ~ '^[A-Z]{3}$'),
    currency_exponent INTEGER NOT NULL DEFAULT 2 CONSTRAINT owner_transfer_exponent_check CHECK (currency_exponent BETWEEN 0 AND 4),
    effective_date DATE NOT NULL,
    from_money_transaction_id BIGINT REFERENCES money_transactions(id) ON DELETE RESTRICT,
    to_money_transaction_id BIGINT REFERENCES money_transactions(id) ON DELETE RESTRICT,
    from_ledger_entry_id BIGINT REFERENCES ledger_entries(id) ON DELETE RESTRICT,
    to_ledger_entry_id BIGINT REFERENCES ledger_entries(id) ON DELETE RESTRICT,
    notes TEXT,
    reference TEXT,
    status TEXT NOT NULL DEFAULT 'posted' CONSTRAINT owner_transfer_status_check CHECK (status IN ('posted', 'reversed')),
    idempotency_key TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT owner_transfer_distinct_ws CHECK (from_workspace_id <> to_workspace_id),
    CONSTRAINT owner_transfer_owner_idemp_uidx UNIQUE (owner_user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS owner_transfer_groups_from_ws_idx ON owner_transfer_groups (from_workspace_id, effective_date DESC, id DESC);
CREATE INDEX IF NOT EXISTS owner_transfer_groups_to_ws_idx ON owner_transfer_groups (to_workspace_id, effective_date DESC, id DESC);
