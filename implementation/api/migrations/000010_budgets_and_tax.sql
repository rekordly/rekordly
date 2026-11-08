-- Budgets and Tax Settings Migration
-- FIN-BE-04: Budgets and tax-readiness aggregates

CREATE TABLE IF NOT EXISTS budgets (
    id BIGSERIAL PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    category_id BIGINT REFERENCES categories(id) ON DELETE SET NULL,
    scope VARCHAR(32) NOT NULL DEFAULT 'business' CHECK (scope IN ('personal', 'business', 'all')),
    period VARCHAR(32) NOT NULL DEFAULT 'monthly' CHECK (period IN ('monthly', 'quarterly', 'annual', 'custom')),
    amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'NGN',
    currency_exponent INT NOT NULL DEFAULT 2,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    notes TEXT,
    idempotency_key VARCHAR(255),
    created_by_user_id BIGINT REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_budget_dates CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_budgets_workspace_dates ON budgets (workspace_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_budgets_workspace_category ON budgets (workspace_id, category_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_budgets_workspace_idemp ON budgets (workspace_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS workspace_tax_settings (
    workspace_id BIGINT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
    tax_identification_number VARCHAR(100),
    default_vat_rate_basis_points INT NOT NULL DEFAULT 750, -- 7.5% default Nigerian VAT
    is_vat_registered BOOLEAN NOT NULL DEFAULT false,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Extend sales and purchases with tax fields for tax-readiness aggregates
ALTER TABLE sales
    ADD COLUMN IF NOT EXISTS subtotal_minor BIGINT,
    ADD COLUMN IF NOT EXISTS tax_amount_minor BIGINT NOT NULL DEFAULT 0;

ALTER TABLE purchases
    ADD COLUMN IF NOT EXISTS subtotal_minor BIGINT,
    ADD COLUMN IF NOT EXISTS tax_amount_minor BIGINT NOT NULL DEFAULT 0;

UPDATE sales SET subtotal_minor = total_amount_minor WHERE subtotal_minor IS NULL;
UPDATE purchases SET subtotal_minor = total_amount_minor WHERE subtotal_minor IS NULL;

