-- Approved mixed-expense accounting model:
-- a real payment stays in the paying workspace; the other workspace receives
-- a matched due-to/due-from balance. Reimbursements clear the pair atomically.

ALTER TABLE money_record_links DROP CONSTRAINT money_record_links_type_check;
ALTER TABLE money_record_links ADD CONSTRAINT money_record_links_type_check CHECK (
    link_type IN ('sale', 'purchase', 'invoice', 'supplier_bill', 'loan', 'tax_period', 'purchase_order', 'transfer', 'mixed_group', 'mixed_reimbursement', 'other')
);

CREATE TABLE mixed_money_groups (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    actor_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    personal_workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
    business_workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
    paying_workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
    paying_money_account_id BIGINT NOT NULL REFERENCES money_accounts(id) ON DELETE RESTRICT,
    personal_money_record_id BIGINT REFERENCES money_records(id) ON DELETE RESTRICT,
    business_money_record_id BIGINT REFERENCES money_records(id) ON DELETE RESTRICT,
    currency CHAR(3) NOT NULL CONSTRAINT mixed_money_groups_currency_check CHECK (currency ~ '^[A-Z]{3}$'),
    currency_exponent INTEGER NOT NULL CONSTRAINT mixed_money_groups_exponent_check CHECK (currency_exponent BETWEEN 0 AND 4),
    total_amount_minor BIGINT NOT NULL CONSTRAINT mixed_money_groups_total_check CHECK (total_amount_minor > 0),
    personal_amount_minor BIGINT NOT NULL CONSTRAINT mixed_money_groups_personal_check CHECK (personal_amount_minor >= 0),
    business_amount_minor BIGINT NOT NULL CONSTRAINT mixed_money_groups_business_check CHECK (business_amount_minor >= 0),
    reimbursed_amount_minor BIGINT NOT NULL DEFAULT 0 CONSTRAINT mixed_money_groups_reimbursed_check CHECK (reimbursed_amount_minor >= 0),
    effective_date DATE NOT NULL,
    description TEXT,
    reference TEXT,
    status TEXT NOT NULL DEFAULT 'open' CONSTRAINT mixed_money_groups_status_check CHECK (status IN ('open', 'settled', 'reversed')),
    settlement_version INTEGER NOT NULL DEFAULT 1 CONSTRAINT mixed_money_groups_settlement_version_check CHECK (settlement_version > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT mixed_money_groups_distinct_workspaces_check CHECK (personal_workspace_id <> business_workspace_id),
    CONSTRAINT mixed_money_groups_payer_check CHECK (paying_workspace_id IN (personal_workspace_id, business_workspace_id)),
    CONSTRAINT mixed_money_groups_allocation_check CHECK (personal_amount_minor + business_amount_minor = total_amount_minor),
    CONSTRAINT mixed_money_groups_mixed_portions_check CHECK (personal_amount_minor > 0 AND business_amount_minor > 0),
    CONSTRAINT mixed_money_groups_reimbursement_cap_check CHECK (
        reimbursed_amount_minor <= CASE
            WHEN paying_workspace_id = personal_workspace_id THEN business_amount_minor
            ELSE personal_amount_minor
        END
    )
);
CREATE INDEX mixed_money_groups_personal_workspace_idx ON mixed_money_groups (personal_workspace_id, effective_date DESC, id DESC);
CREATE INDEX mixed_money_groups_business_workspace_idx ON mixed_money_groups (business_workspace_id, effective_date DESC, id DESC);
CREATE INDEX mixed_money_groups_open_idx ON mixed_money_groups (status, id) WHERE status = 'open';

CREATE TABLE mixed_money_reimbursements (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    mixed_money_group_id BIGINT NOT NULL REFERENCES mixed_money_groups(id) ON DELETE RESTRICT,
    from_workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
    to_workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
    from_money_account_id BIGINT NOT NULL REFERENCES money_accounts(id) ON DELETE RESTRICT,
    to_money_account_id BIGINT NOT NULL REFERENCES money_accounts(id) ON DELETE RESTRICT,
    from_money_record_id BIGINT REFERENCES money_records(id) ON DELETE RESTRICT,
    to_money_record_id BIGINT REFERENCES money_records(id) ON DELETE RESTRICT,
    amount_minor BIGINT NOT NULL CONSTRAINT mixed_money_reimbursements_amount_check CHECK (amount_minor > 0),
    currency CHAR(3) NOT NULL CONSTRAINT mixed_money_reimbursements_currency_check CHECK (currency ~ '^[A-Z]{3}$'),
    effective_date DATE NOT NULL,
    created_by_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT mixed_money_reimbursements_workspace_pair_check CHECK (from_workspace_id <> to_workspace_id)
);
CREATE INDEX mixed_money_reimbursements_group_idx ON mixed_money_reimbursements (mixed_money_group_id, id);
CREATE INDEX mixed_money_reimbursements_from_workspace_idx ON mixed_money_reimbursements (from_workspace_id, effective_date DESC, id DESC);
