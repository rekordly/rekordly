-- Blueprint 17: Admin Operations, Observability and Deployment

CREATE TABLE IF NOT EXISTS feature_flags (
    flag_key TEXT PRIMARY KEY,
    description TEXT NOT NULL,
    owner TEXT NOT NULL DEFAULT 'platform',
    default_enabled BOOLEAN NOT NULL DEFAULT false,
    scope TEXT NOT NULL DEFAULT 'global',
    enabled_in_env BOOLEAN NOT NULL DEFAULT false,
    kill_switch_active BOOLEAN NOT NULL DEFAULT false,
    review_at TIMESTAMPTZ,
    dependencies_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    updated_by TEXT NOT NULL DEFAULT 'system',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO feature_flags (flag_key, description, owner, default_enabled, scope, enabled_in_env, kill_switch_active)
VALUES
    ('ai.capture.enabled', 'Allow AI-assisted money/document draft parsing', 'ai-ops', true, 'global', true, false),
    ('offline.queued_writes.enabled', 'Allow queued offline financial confirmations (Blueprint 15 launch gate)', 'sync-ops', false, 'global', false, false),
    ('billing.paid_checkout.enabled', 'Allow Paystack paid checkout outside controlled beta', 'billing-ops', false, 'global', false, false),
    ('storefront.public_orders.enabled', 'Allow public storefront order intake', 'commerce-ops', true, 'global', true, false),
    ('exports.ownership.enabled', 'Allow complete ownership portability exports', 'privacy-ops', true, 'global', true, false)
ON CONFLICT (flag_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS maintenance_modes (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    mode TEXT NOT NULL DEFAULT 'normal' CHECK (mode IN ('normal', 'degraded_feature', 'read_only', 'scheduled_maintenance', 'emergency_security_lock')),
    scope TEXT NOT NULL DEFAULT 'global',
    reason TEXT NOT NULL DEFAULT '',
    owner_label TEXT NOT NULL DEFAULT 'system',
    activated_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO maintenance_modes (id, mode, scope, reason, owner_label)
VALUES (1, 'normal', 'global', 'Nominal operation', 'system')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS deployment_records (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    environment TEXT NOT NULL,
    commit_sha TEXT NOT NULL,
    image_tag TEXT NOT NULL DEFAULT '',
    migration_version TEXT NOT NULL DEFAULT '',
    feature_flags_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    deployed_by TEXT NOT NULL DEFAULT 'ci',
    status TEXT NOT NULL DEFAULT 'deployed' CHECK (status IN ('deployed', 'rolled_back', 'failed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS deployment_records_env_idx ON deployment_records (environment, created_at DESC);

CREATE TABLE IF NOT EXISTS backup_rehearsal_records (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    environment TEXT NOT NULL,
    backup_id TEXT NOT NULL,
    backup_source TEXT NOT NULL DEFAULT 'pg_dump_logical',
    checksum_sha256 TEXT NOT NULL,
    rpo_seconds INTEGER NOT NULL DEFAULT 0,
    rto_seconds INTEGER NOT NULL DEFAULT 0,
    reconciled_journals BIGINT NOT NULL DEFAULT 0,
    tombstones_replayed BIGINT NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'verified' CHECK (status IN ('verified', 'failed')),
    verified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS beta_cohort_register (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    segment TEXT NOT NULL,
    use_case TEXT NOT NULL,
    consent_accepted BOOLEAN NOT NULL DEFAULT false,
    enabled_modules_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    onboarding_status TEXT NOT NULL DEFAULT 'invited',
    support_status TEXT NOT NULL DEFAULT 'healthy',
    plan_intent TEXT NOT NULL DEFAULT 'controlled_beta',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT beta_cohort_ws_uidx UNIQUE (workspace_id)
);
