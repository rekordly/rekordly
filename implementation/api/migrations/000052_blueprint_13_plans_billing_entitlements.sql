-- Blueprint 13: Plans, Billing, Entitlements & Downgrades

-- 1. Commercial Mode Configuration
CREATE TABLE IF NOT EXISTS commercial_mode_config (
    id SMALLINT PRIMARY KEY DEFAULT 1 CONSTRAINT commercial_mode_singleton CHECK (id = 1),
    mode TEXT NOT NULL DEFAULT 'controlled_beta'
        CONSTRAINT commercial_mode_check CHECK (mode IN ('controlled_beta', 'pricing_intent', 'paid_pilot', 'public_paid', 'billing_paused')),
    beta_cohort TEXT NOT NULL DEFAULT 'december_beta_2026',
    past_due_days INTEGER NOT NULL DEFAULT 7,
    grace_days INTEGER NOT NULL DEFAULT 7,
    updated_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO commercial_mode_config (id, mode) VALUES (1, 'controlled_beta') ON CONFLICT (id) DO NOTHING;

-- 2. Immutable Versioned Plan Catalogue & Entitlement Definitions
CREATE TABLE IF NOT EXISTS plan_versions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    plan_code TEXT NOT NULL,
    version INTEGER NOT NULL,
    display_name TEXT NOT NULL,
    subject_type TEXT NOT NULL CONSTRAINT plan_versions_subject_check CHECK (subject_type IN ('personal', 'business')),
    billing_interval TEXT NOT NULL CONSTRAINT plan_versions_interval_check CHECK (billing_interval IN ('monthly', 'yearly', 'once')),
    currency CHAR(3) NOT NULL DEFAULT 'NGN',
    price_minor BIGINT NOT NULL CONSTRAINT plan_versions_price_check CHECK (price_minor >= 0),
    tax_behavior TEXT NOT NULL DEFAULT 'inclusive' CONSTRAINT plan_versions_tax_check CHECK (tax_behavior IN ('inclusive', 'exclusive', 'exempt')),
    is_available BOOLEAN NOT NULL DEFAULT true,
    is_addon BOOLEAN NOT NULL DEFAULT false,
    addon_type TEXT NOT NULL DEFAULT '',
    fair_use_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    downgrade_behavior JSONB NOT NULL DEFAULT '{}'::jsonb,
    effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
    effective_to TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT plan_versions_code_ver_uidx UNIQUE (plan_code, version)
);

CREATE TABLE IF NOT EXISTS plan_entitlement_definitions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    plan_version_id BIGINT NOT NULL REFERENCES plan_versions(id) ON DELETE CASCADE,
    feature_key TEXT NOT NULL,
    grant_type TEXT NOT NULL CONSTRAINT plan_ent_grant_type_check CHECK (grant_type IN ('boolean', 'integer', 'metered', 'enum', 'config')),
    bool_value BOOLEAN,
    int_value BIGINT,
    text_value TEXT,
    period_model TEXT NOT NULL DEFAULT 'lifetime_active'
        CONSTRAINT plan_ent_period_model_check CHECK (period_model IN ('calendar_month', 'subscription_cycle', 'lifetime_active', 'rolling_window', 'stored_balance', 'storage_snapshot')),
    definition_version INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT plan_ent_ver_key_uidx UNIQUE (plan_version_id, feature_key)
);

-- Seed immutable v1 plans and add-ons (NGN prices in minor units: kobo)
INSERT INTO plan_versions (plan_code, version, display_name, subject_type, billing_interval, currency, price_minor, is_addon, addon_type, fair_use_metadata) VALUES
    ('free', 1, 'Free', 'personal', 'monthly', 'NGN', 0, false, '', '{"note":"Bounded starter limits"}'),
    ('personal_plus_monthly', 1, 'Personal Plus (Monthly)', 'personal', 'monthly', 'NGN', 150000, false, '', '{"fair_use_records":5000}'),
    ('personal_plus_yearly', 1, 'Personal Plus (Yearly)', 'personal', 'yearly', 'NGN', 1500000, false, '', '{"fair_use_records":5000}'),
    ('business_monthly', 1, 'Business (Monthly)', 'business', 'monthly', 'NGN', 500000, false, '', '{"fair_use_records":25000}'),
    ('business_yearly', 1, 'Business (Yearly)', 'business', 'yearly', 'NGN', 5000000, false, '', '{"fair_use_records":25000}'),
    ('addon_staff', 1, 'Additional Staff Seat', 'business', 'monthly', 'NGN', 100000, true, 'extra_staff', '{}'),
    ('addon_outlet', 1, 'Additional Outlet', 'business', 'monthly', 'NGN', 150000, true, 'extra_outlet', '{}'),
    ('addon_business', 1, 'Additional Business Workspace', 'business', 'monthly', 'NGN', 300000, true, 'additional_business', '{}'),
    ('addon_custom_domain', 1, 'Custom Domain Connection', 'business', 'monthly', 'NGN', 100000, true, 'custom_domain', '{}'),
    ('addon_ai_pack', 1, '100 AI Draft Credits Pack', 'business', 'once', 'NGN', 100000, true, 'ai_credit_pack', '{}'),
    ('addon_storage_pack', 1, '10 GB Storage Pack', 'business', 'monthly', 'NGN', 100000, true, 'storage_pack', '{}')
ON CONFLICT (plan_code, version) DO NOTHING;

-- Helper CTE to seed feature keys across Free, Personal Plus, and Business v1
WITH pv AS (SELECT id, plan_code FROM plan_versions WHERE version = 1),
defs(plan_code, feature_key, grant_type, bool_val, int_val, text_val, period_model) AS (
    VALUES
        -- Free v1
        ('free', 'records.confirmed.monthly', 'metered', NULL, 100::bigint, NULL, 'calendar_month'),
        ('free', 'history.interactive.months', 'integer', NULL, 12::bigint, NULL, 'lifetime_active'),
        ('free', 'accounts.active.max', 'integer', NULL, 3::bigint, NULL, 'lifetime_active'),
        ('free', 'categories.custom.active.max', 'integer', NULL, 10::bigint, NULL, 'lifetime_active'),
        ('free', 'budgets.active.max', 'integer', NULL, 2::bigint, NULL, 'lifetime_active'),
        ('free', 'attachments.storage.bytes', 'integer', NULL, 52428800::bigint, NULL, 'storage_snapshot'),
        ('free', 'ai.draft.monthly', 'metered', NULL, 10::bigint, NULL, 'calendar_month'),
        ('free', 'ai.draft.pack_balance', 'metered', NULL, 0::bigint, NULL, 'stored_balance'),
        ('free', 'csv.import.enabled', 'boolean', false, NULL, NULL, 'lifetime_active'),
        ('free', 'exports.full.cooldown_days', 'config', NULL, 30::bigint, NULL, 'rolling_window'),
        ('free', 'offline.mode', 'enum', NULL, NULL, 'read_only', 'lifetime_active'),
        ('free', 'reports.personal.advanced', 'boolean', false, NULL, NULL, 'lifetime_active'),
        ('free', 'personal.loans.enabled', 'boolean', false, NULL, NULL, 'lifetime_active'),
        ('free', 'personal.assets.enabled', 'boolean', false, NULL, NULL, 'lifetime_active'),
        ('free', 'personal.investments.enabled', 'boolean', false, NULL, NULL, 'lifetime_active'),
        ('free', 'personal.insights.enabled', 'boolean', false, NULL, NULL, 'lifetime_active'),
        ('free', 'personal.alerts.enabled', 'boolean', false, NULL, NULL, 'lifetime_active'),
        ('free', 'personal.mixed_split.enabled', 'boolean', false, NULL, NULL, 'lifetime_active'),
        -- Personal Plus (monthly & yearly share same entitlements)
        ('personal_plus_monthly', 'records.confirmed.monthly', 'metered', NULL, 5000::bigint, NULL, 'calendar_month'),
        ('personal_plus_monthly', 'history.interactive.months', 'integer', NULL, 120::bigint, NULL, 'lifetime_active'),
        ('personal_plus_monthly', 'accounts.active.max', 'integer', NULL, 25::bigint, NULL, 'lifetime_active'),
        ('personal_plus_monthly', 'categories.custom.active.max', 'integer', NULL, 100::bigint, NULL, 'lifetime_active'),
        ('personal_plus_monthly', 'budgets.active.max', 'integer', NULL, 25::bigint, NULL, 'lifetime_active'),
        ('personal_plus_monthly', 'attachments.storage.bytes', 'integer', NULL, 2147483648::bigint, NULL, 'storage_snapshot'),
        ('personal_plus_monthly', 'ai.draft.monthly', 'metered', NULL, 100::bigint, NULL, 'calendar_month'),
        ('personal_plus_monthly', 'ai.draft.pack_balance', 'metered', NULL, 0::bigint, NULL, 'stored_balance'),
        ('personal_plus_monthly', 'csv.import.enabled', 'boolean', true, NULL, NULL, 'lifetime_active'),
        ('personal_plus_monthly', 'exports.full.cooldown_days', 'config', NULL, 1::bigint, NULL, 'rolling_window'),
        ('personal_plus_monthly', 'offline.mode', 'enum', NULL, NULL, 'draft_sync', 'lifetime_active'),
        ('personal_plus_monthly', 'reports.personal.advanced', 'boolean', true, NULL, NULL, 'lifetime_active'),
        ('personal_plus_monthly', 'personal.loans.enabled', 'boolean', true, NULL, NULL, 'lifetime_active'),
        ('personal_plus_monthly', 'personal.assets.enabled', 'boolean', true, NULL, NULL, 'lifetime_active'),
        ('personal_plus_monthly', 'personal.investments.enabled', 'boolean', true, NULL, NULL, 'lifetime_active'),
        ('personal_plus_monthly', 'personal.insights.enabled', 'boolean', true, NULL, NULL, 'lifetime_active'),
        ('personal_plus_monthly', 'personal.alerts.enabled', 'boolean', true, NULL, NULL, 'lifetime_active'),
        ('personal_plus_monthly', 'personal.mixed_split.enabled', 'boolean', true, NULL, NULL, 'lifetime_active'),
        ('personal_plus_yearly', 'records.confirmed.monthly', 'metered', NULL, 5000::bigint, NULL, 'calendar_month'),
        ('personal_plus_yearly', 'history.interactive.months', 'integer', NULL, 120::bigint, NULL, 'lifetime_active'),
        ('personal_plus_yearly', 'accounts.active.max', 'integer', NULL, 25::bigint, NULL, 'lifetime_active'),
        ('personal_plus_yearly', 'categories.custom.active.max', 'integer', NULL, 100::bigint, NULL, 'lifetime_active'),
        ('personal_plus_yearly', 'budgets.active.max', 'integer', NULL, 25::bigint, NULL, 'lifetime_active'),
        ('personal_plus_yearly', 'attachments.storage.bytes', 'integer', NULL, 2147483648::bigint, NULL, 'storage_snapshot'),
        ('personal_plus_yearly', 'ai.draft.monthly', 'metered', NULL, 100::bigint, NULL, 'calendar_month'),
        ('personal_plus_yearly', 'ai.draft.pack_balance', 'metered', NULL, 0::bigint, NULL, 'stored_balance'),
        ('personal_plus_yearly', 'csv.import.enabled', 'boolean', true, NULL, NULL, 'lifetime_active'),
        ('personal_plus_yearly', 'exports.full.cooldown_days', 'config', NULL, 1::bigint, NULL, 'rolling_window'),
        ('personal_plus_yearly', 'offline.mode', 'enum', NULL, NULL, 'draft_sync', 'lifetime_active'),
        ('personal_plus_yearly', 'reports.personal.advanced', 'boolean', true, NULL, NULL, 'lifetime_active'),
        ('personal_plus_yearly', 'personal.loans.enabled', 'boolean', true, NULL, NULL, 'lifetime_active'),
        ('personal_plus_yearly', 'personal.assets.enabled', 'boolean', true, NULL, NULL, 'lifetime_active'),
        ('personal_plus_yearly', 'personal.investments.enabled', 'boolean', true, NULL, NULL, 'lifetime_active'),
        ('personal_plus_yearly', 'personal.insights.enabled', 'boolean', true, NULL, NULL, 'lifetime_active'),
        ('personal_plus_yearly', 'personal.alerts.enabled', 'boolean', true, NULL, NULL, 'lifetime_active'),
        ('personal_plus_yearly', 'personal.mixed_split.enabled', 'boolean', true, NULL, NULL, 'lifetime_active'),
        -- Business (monthly & yearly)
        ('business_monthly', 'records.confirmed.monthly', 'metered', NULL, 25000::bigint, NULL, 'calendar_month'),
        ('business_monthly', 'history.interactive.months', 'integer', NULL, 120::bigint, NULL, 'lifetime_active'),
        ('business_monthly', 'accounts.active.max', 'integer', NULL, 30::bigint, NULL, 'lifetime_active'),
        ('business_monthly', 'categories.custom.active.max', 'integer', NULL, 200::bigint, NULL, 'lifetime_active'),
        ('business_monthly', 'budgets.active.max', 'integer', NULL, 50::bigint, NULL, 'lifetime_active'),
        ('business_monthly', 'attachments.storage.bytes', 'integer', NULL, 10737418240::bigint, NULL, 'storage_snapshot'),
        ('business_monthly', 'ai.draft.monthly', 'metered', NULL, 300::bigint, NULL, 'calendar_month'),
        ('business_monthly', 'ai.draft.pack_balance', 'metered', NULL, 0::bigint, NULL, 'stored_balance'),
        ('business_monthly', 'csv.import.enabled', 'boolean', true, NULL, NULL, 'lifetime_active'),
        ('business_monthly', 'exports.full.cooldown_days', 'config', NULL, 0::bigint, NULL, 'rolling_window'),
        ('business_monthly', 'offline.mode', 'enum', NULL, NULL, 'draft_sync', 'lifetime_active'),
        ('business_monthly', 'business.owned.max', 'integer', NULL, 1::bigint, NULL, 'lifetime_active'),
        ('business_monthly', 'business.staff.active.max', 'integer', NULL, 2::bigint, NULL, 'lifetime_active'),
        ('business_monthly', 'business.accountant.active.max', 'integer', NULL, 1::bigint, NULL, 'lifetime_active'),
        ('business_monthly', 'business.outlets.active.max', 'integer', NULL, 2::bigint, NULL, 'lifetime_active'),
        ('business_monthly', 'business.inventory.enabled', 'boolean', true, NULL, NULL, 'lifetime_active'),
        ('business_monthly', 'business.procurement.enabled', 'boolean', true, NULL, NULL, 'lifetime_active'),
        ('business_monthly', 'business.reports.financial', 'boolean', true, NULL, NULL, 'lifetime_active'),
        ('business_monthly', 'business.tax_readiness.enabled', 'boolean', true, NULL, NULL, 'lifetime_active'),
        ('business_monthly', 'business.storefront.enabled', 'boolean', true, NULL, NULL, 'lifetime_active'),
        ('business_monthly', 'business.storefront.active.max', 'integer', NULL, 1::bigint, NULL, 'lifetime_active'),
        ('business_monthly', 'business.custom_domain.active.max', 'integer', NULL, 0::bigint, NULL, 'lifetime_active'),
        ('business_monthly', 'business.ai_document_draft.enabled', 'boolean', true, NULL, NULL, 'lifetime_active'),
        ('business_yearly', 'records.confirmed.monthly', 'metered', NULL, 25000::bigint, NULL, 'calendar_month'),
        ('business_yearly', 'history.interactive.months', 'integer', NULL, 120::bigint, NULL, 'lifetime_active'),
        ('business_yearly', 'accounts.active.max', 'integer', NULL, 30::bigint, NULL, 'lifetime_active'),
        ('business_yearly', 'categories.custom.active.max', 'integer', NULL, 200::bigint, NULL, 'lifetime_active'),
        ('business_yearly', 'budgets.active.max', 'integer', NULL, 50::bigint, NULL, 'lifetime_active'),
        ('business_yearly', 'attachments.storage.bytes', 'integer', NULL, 10737418240::bigint, NULL, 'storage_snapshot'),
        ('business_yearly', 'ai.draft.monthly', 'metered', NULL, 300::bigint, NULL, 'calendar_month'),
        ('business_yearly', 'ai.draft.pack_balance', 'metered', NULL, 0::bigint, NULL, 'stored_balance'),
        ('business_yearly', 'csv.import.enabled', 'boolean', true, NULL, NULL, 'lifetime_active'),
        ('business_yearly', 'exports.full.cooldown_days', 'config', NULL, 0::bigint, NULL, 'rolling_window'),
        ('business_yearly', 'offline.mode', 'enum', NULL, NULL, 'draft_sync', 'lifetime_active'),
        ('business_yearly', 'business.owned.max', 'integer', NULL, 1::bigint, NULL, 'lifetime_active'),
        ('business_yearly', 'business.staff.active.max', 'integer', NULL, 2::bigint, NULL, 'lifetime_active'),
        ('business_yearly', 'business.accountant.active.max', 'integer', NULL, 1::bigint, NULL, 'lifetime_active'),
        ('business_yearly', 'business.outlets.active.max', 'integer', NULL, 2::bigint, NULL, 'lifetime_active'),
        ('business_yearly', 'business.inventory.enabled', 'boolean', true, NULL, NULL, 'lifetime_active'),
        ('business_yearly', 'business.procurement.enabled', 'boolean', true, NULL, NULL, 'lifetime_active'),
        ('business_yearly', 'business.reports.financial', 'boolean', true, NULL, NULL, 'lifetime_active'),
        ('business_yearly', 'business.tax_readiness.enabled', 'boolean', true, NULL, NULL, 'lifetime_active'),
        ('business_yearly', 'business.storefront.enabled', 'boolean', true, NULL, NULL, 'lifetime_active'),
        ('business_yearly', 'business.storefront.active.max', 'integer', NULL, 1::bigint, NULL, 'lifetime_active'),
        ('business_yearly', 'business.custom_domain.active.max', 'integer', NULL, 1::bigint, NULL, 'lifetime_active'),
        ('business_yearly', 'business.ai_document_draft.enabled', 'boolean', true, NULL, NULL, 'lifetime_active')
)
INSERT INTO plan_entitlement_definitions (plan_version_id, feature_key, grant_type, bool_value, int_value, text_value, period_model)
SELECT pv.id, d.feature_key, d.grant_type, d.bool_val, d.int_val, d.text_val, d.period_model
FROM defs d
JOIN pv ON pv.plan_code = d.plan_code
ON CONFLICT (plan_version_id, feature_key) DO NOTHING;

-- 3. Billing Subjects, Subscriptions, Add-ons & Overrides
CREATE TABLE IF NOT EXISTS billing_subjects (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    subject_type TEXT NOT NULL CONSTRAINT billing_subjects_type_check CHECK (subject_type IN ('personal', 'business')),
    workspace_id BIGINT NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
    owner_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    billing_name TEXT NOT NULL DEFAULT '',
    billing_email TEXT NOT NULL DEFAULT '',
    provider_customer_ref TEXT,
    status TEXT NOT NULL DEFAULT 'active' CONSTRAINT billing_subjects_status_check CHECK (status IN ('active', 'restricted', 'closed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subscriptions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    billing_subject_id BIGINT NOT NULL UNIQUE REFERENCES billing_subjects(id) ON DELETE CASCADE,
    plan_version_id BIGINT NOT NULL REFERENCES plan_versions(id) ON DELETE RESTRICT,
    state TEXT NOT NULL DEFAULT 'active'
        CONSTRAINT subscriptions_state_check CHECK (state IN ('pending', 'trialing', 'active', 'past_due', 'grace', 'cancel_at_period_end', 'expired', 'suspended', 'refunded', 'chargeback_review')),
    billing_interval TEXT NOT NULL DEFAULT 'monthly',
    current_period_start TIMESTAMPTZ NOT NULL DEFAULT now(),
    paid_through_at TIMESTAMPTZ,
    grace_ends_at TIMESTAMPTZ,
    cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
    cancelled_at TIMESTAMPTZ,
    provider_sub_ref TEXT,
    entitlement_revision BIGINT NOT NULL DEFAULT 1,
    state_reason TEXT NOT NULL DEFAULT 'initial_grant',
    last_event_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subscription_changes (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    billing_subject_id BIGINT NOT NULL REFERENCES billing_subjects(id) ON DELETE CASCADE,
    subscription_id BIGINT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    source_plan_version_id BIGINT NOT NULL REFERENCES plan_versions(id) ON DELETE RESTRICT,
    target_plan_version_id BIGINT NOT NULL REFERENCES plan_versions(id) ON DELETE RESTRICT,
    quote_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'quoted' CONSTRAINT sub_changes_status_check CHECK (status IN ('quoted', 'scheduled', 'completed', 'cancelled')),
    effective_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    idempotency_key TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT sub_changes_subject_idemp_uidx UNIQUE (billing_subject_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS add_on_instances (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    billing_subject_id BIGINT NOT NULL REFERENCES billing_subjects(id) ON DELETE CASCADE,
    addon_plan_version_id BIGINT NOT NULL REFERENCES plan_versions(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL DEFAULT 1 CONSTRAINT addon_qty_check CHECK (quantity > 0),
    is_recurring BOOLEAN NOT NULL DEFAULT true,
    state TEXT NOT NULL DEFAULT 'active' CONSTRAINT addon_state_check CHECK (state IN ('active', 'cancelled', 'expired')),
    effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ,
    idempotency_key TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT addon_subject_idemp_uidx UNIQUE (billing_subject_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS entitlement_overrides (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    billing_subject_id BIGINT NOT NULL REFERENCES billing_subjects(id) ON DELETE CASCADE,
    feature_key TEXT NOT NULL,
    grant_source TEXT NOT NULL CONSTRAINT ent_override_src_check CHECK (grant_source IN ('controlled_beta', 'founding_offer', 'trial', 'support_remediation', 'incident')),
    grant_version TEXT NOT NULL DEFAULT 'v1',
    cohort TEXT NOT NULL DEFAULT '',
    bool_value BOOLEAN,
    int_value BIGINT,
    text_value TEXT,
    priority INTEGER NOT NULL DEFAULT 100,
    reason TEXT NOT NULL,
    issuer_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    audit_ref TEXT NOT NULL DEFAULT '',
    effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ent_overrides_subject_idx ON entitlement_overrides (billing_subject_id, feature_key, expires_at);

-- 4. Atomic Usage Counters & Reservations
CREATE TABLE IF NOT EXISTS usage_counters (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    billing_subject_id BIGINT NOT NULL REFERENCES billing_subjects(id) ON DELETE CASCADE,
    feature_key TEXT NOT NULL,
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    consumed BIGINT NOT NULL DEFAULT 0 CONSTRAINT usage_consumed_check CHECK (consumed >= 0),
    reserved BIGINT NOT NULL DEFAULT 0 CONSTRAINT usage_reserved_check CHECK (reserved >= 0),
    manual_adjustment BIGINT NOT NULL DEFAULT 0,
    revision BIGINT NOT NULL DEFAULT 1,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT usage_counters_subj_key_period_uidx UNIQUE (billing_subject_id, feature_key, period_start)
);

CREATE TABLE IF NOT EXISTS usage_reservations (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    usage_counter_id BIGINT NOT NULL REFERENCES usage_counters(id) ON DELETE CASCADE,
    billing_subject_id BIGINT NOT NULL REFERENCES billing_subjects(id) ON DELETE CASCADE,
    feature_key TEXT NOT NULL,
    command_type TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    units BIGINT NOT NULL DEFAULT 1 CONSTRAINT usage_res_units_check CHECK (units > 0),
    status TEXT NOT NULL DEFAULT 'reserved' CONSTRAINT usage_res_status_check CHECK (status IN ('reserved', 'consumed', 'released', 'expired')),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '15 minutes'),
    settled_at TIMESTAMPTZ,
    terminal_reason TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT usage_res_subj_idemp_uidx UNIQUE (billing_subject_id, idempotency_key)
);

-- 5. Checkout, Billing Transactions, Webhooks, Documents, Refunds & Chargebacks
CREATE TABLE IF NOT EXISTS checkout_intents (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    billing_subject_id BIGINT NOT NULL REFERENCES billing_subjects(id) ON DELETE CASCADE,
    plan_version_id BIGINT NOT NULL REFERENCES plan_versions(id) ON DELETE RESTRICT,
    reference TEXT NOT NULL UNIQUE,
    amount_minor BIGINT NOT NULL,
    currency CHAR(3) NOT NULL DEFAULT 'NGN',
    status TEXT NOT NULL DEFAULT 'pending'
        CONSTRAINT checkout_status_check CHECK (status IN ('pending', 'verified', 'failed', 'expired', 'mismatch_review')),
    provider TEXT NOT NULL DEFAULT 'paystack',
    provider_access_code TEXT NOT NULL DEFAULT '',
    authorization_url TEXT NOT NULL DEFAULT '',
    idempotency_key TEXT NOT NULL,
    created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT checkout_subj_idemp_uidx UNIQUE (billing_subject_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS billing_transactions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    billing_subject_id BIGINT NOT NULL REFERENCES billing_subjects(id) ON DELETE CASCADE,
    subscription_id BIGINT REFERENCES subscriptions(id) ON DELETE SET NULL,
    checkout_intent_id BIGINT REFERENCES checkout_intents(id) ON DELETE SET NULL,
    tx_type TEXT NOT NULL CONSTRAINT billing_tx_type_check CHECK (tx_type IN ('charge', 'renewal', 'addon', 'refund')),
    amount_minor BIGINT NOT NULL,
    tax_minor BIGINT NOT NULL DEFAULT 0,
    currency CHAR(3) NOT NULL DEFAULT 'NGN',
    status TEXT NOT NULL DEFAULT 'pending'
        CONSTRAINT billing_tx_status_check CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded', 'partially_refunded')),
    provider_ref TEXT NOT NULL DEFAULT '',
    idempotency_key TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT billing_tx_subj_idemp_uidx UNIQUE (billing_subject_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS provider_events (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    provider TEXT NOT NULL DEFAULT 'paystack',
    event_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    provider_ref TEXT NOT NULL DEFAULT '',
    signature_valid BOOLEAN NOT NULL DEFAULT false,
    event_occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    processing_state TEXT NOT NULL DEFAULT 'received'
        CONSTRAINT provider_events_state_check CHECK (processing_state IN ('received', 'processed', 'ignored_out_of_order', 'mismatch_review', 'failed')),
    redacted_summary TEXT NOT NULL DEFAULT '',
    error_message TEXT NOT NULL DEFAULT '',
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT provider_events_uidx UNIQUE (provider, event_id)
);

CREATE TABLE IF NOT EXISTS billing_documents (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    billing_subject_id BIGINT NOT NULL REFERENCES billing_subjects(id) ON DELETE CASCADE,
    billing_transaction_id BIGINT REFERENCES billing_transactions(id) ON DELETE SET NULL,
    document_number TEXT NOT NULL UNIQUE,
    document_type TEXT NOT NULL CONSTRAINT billing_docs_type_check CHECK (document_type IN ('receipt', 'invoice', 'credit_note')),
    currency CHAR(3) NOT NULL DEFAULT 'NGN',
    subtotal_minor BIGINT NOT NULL DEFAULT 0,
    tax_minor BIGINT NOT NULL DEFAULT 0,
    total_minor BIGINT NOT NULL DEFAULT 0,
    service_period TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'issued',
    content_text TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS refunds (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    billing_transaction_id BIGINT NOT NULL REFERENCES billing_transactions(id) ON DELETE RESTRICT,
    billing_subject_id BIGINT NOT NULL REFERENCES billing_subjects(id) ON DELETE CASCADE,
    amount_minor BIGINT NOT NULL CONSTRAINT refunds_amt_check CHECK (amount_minor > 0),
    currency CHAR(3) NOT NULL DEFAULT 'NGN',
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CONSTRAINT refunds_status_check CHECK (status IN ('pending', 'succeeded', 'failed')),
    provider_refund_ref TEXT NOT NULL DEFAULT '',
    idempotency_key TEXT NOT NULL,
    requested_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT refunds_subj_idemp_uidx UNIQUE (billing_subject_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS chargeback_reviews (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    billing_transaction_id BIGINT NOT NULL REFERENCES billing_transactions(id) ON DELETE RESTRICT,
    billing_subject_id BIGINT NOT NULL REFERENCES billing_subjects(id) ON DELETE CASCADE,
    provider_dispute_ref TEXT NOT NULL UNIQUE,
    amount_minor BIGINT NOT NULL,
    currency CHAR(3) NOT NULL DEFAULT 'NGN',
    status TEXT NOT NULL DEFAULT 'open' CONSTRAINT chargeback_status_check CHECK (status IN ('open', 'won', 'lost', 'resolved')),
    evidence_due_at TIMESTAMPTZ,
    resolution_notes TEXT NOT NULL DEFAULT '',
    resolved_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS billing_reconciliation_runs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'completed',
    checked_count INTEGER NOT NULL DEFAULT 0,
    mismatch_count INTEGER NOT NULL DEFAULT 0,
    summary TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Seed Blueprint 13 RBAC Permissions (staff must NOT view billing instruments/documents)
WITH role_perm_map(role_code, perm_code) AS (
    VALUES
        ('admin', 'billing.view'), ('admin', 'billing.manage_plan'), ('admin', 'billing.cancel_resume'),
        ('admin', 'billing.purchase_addon'), ('admin', 'billing.view_documents'), ('admin', 'billing.request_refund'),
        ('admin', 'billing.manage_subjects'), ('admin', 'billing.reconcile'),
        ('accountant', 'billing.view'),
        ('member', 'billing.view')
)
INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, m.perm_code
FROM roles r
JOIN role_perm_map m ON m.role_code = r.code
ON CONFLICT (role_id, permission_code) DO NOTHING;
