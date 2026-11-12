-- Blueprint 16: Settings, Security, Privacy, Deletion and Support

ALTER TABLE memberships
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'removed')),
    ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS user_profiles (
    user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    display_name TEXT NOT NULL DEFAULT '',
    avatar_file_id BIGINT,
    locale TEXT NOT NULL DEFAULT 'en-NG',
    timezone TEXT NOT NULL DEFAULT 'Africa/Lagos',
    date_format TEXT NOT NULL DEFAULT 'YYYY-MM-DD',
    time_format TEXT NOT NULL DEFAULT '24h',
    theme TEXT NOT NULL DEFAULT 'system' CHECK (theme IN ('light', 'dark', 'system')),
    density TEXT NOT NULL DEFAULT 'comfortable' CHECK (density IN ('comfortable', 'compact')),
    reduced_motion BOOLEAN NOT NULL DEFAULT false,
    high_contrast BOOLEAN NOT NULL DEFAULT false,
    default_landing_page TEXT NOT NULL DEFAULT '/dashboard',
    currency_display_mode TEXT NOT NULL DEFAULT 'symbol',
    occupation_label TEXT NOT NULL DEFAULT '',
    version BIGINT NOT NULL DEFAULT 1,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS contact_methods (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    method_type TEXT NOT NULL CHECK (method_type IN ('email', 'phone')),
    normalized_value TEXT NOT NULL,
    masked_value TEXT NOT NULL,
    verified_at TIMESTAMPTZ,
    is_primary BOOLEAN NOT NULL DEFAULT false,
    is_login BOOLEAN NOT NULL DEFAULT true,
    is_recovery BOOLEAN NOT NULL DEFAULT true,
    notify_eligible BOOLEAN NOT NULL DEFAULT true,
    added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at TIMESTAMPTZ,
    removed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS contact_methods_active_uidx
    ON contact_methods (method_type, normalized_value)
    WHERE removed_at IS NULL AND verified_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS contact_methods_user_idx
    ON contact_methods (user_id, removed_at);

CREATE TABLE IF NOT EXISTS contact_verification_challenges (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    contact_method_id BIGINT NOT NULL REFERENCES contact_methods(id) ON DELETE CASCADE,
    purpose TEXT NOT NULL DEFAULT 'verify_contact',
    destination_normalized TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 5,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recent_auth_grants (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id BIGINT,
    purpose TEXT NOT NULL,
    strength TEXT NOT NULL DEFAULT 'otp',
    verified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS recent_auth_grants_lookup_idx
    ON recent_auth_grants (user_id, purpose, expires_at DESC);

CREATE TABLE IF NOT EXISTS security_events (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id BIGINT,
    event_type TEXT NOT NULL,
    actor_type TEXT NOT NULL DEFAULT 'user',
    device_summary TEXT NOT NULL DEFAULT '',
    safe_context_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS security_events_user_idx
    ON security_events (user_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS workspace_settings_versions (
    workspace_id BIGINT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
    personal_settings_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    business_settings_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    version BIGINT NOT NULL DEFAULT 1,
    last_significant_change_at TIMESTAMPTZ,
    updated_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ownership_transfer_requests (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    from_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'cancelled', 'expired')),
    expires_at TIMESTAMPTZ NOT NULL,
    accepted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS policy_acceptances (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    policy_type TEXT NOT NULL,
    policy_version TEXT NOT NULL,
    content_hash TEXT NOT NULL DEFAULT '',
    published_url TEXT NOT NULL DEFAULT '',
    required BOOLEAN NOT NULL DEFAULT true,
    locale TEXT NOT NULL DEFAULT 'en-NG',
    source_context TEXT NOT NULL DEFAULT 'app',
    accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    withdrawn_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS consent_preferences (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    consent_key TEXT NOT NULL,
    granted BOOLEAN NOT NULL DEFAULT false,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT consent_preferences_user_key_uidx UNIQUE (user_id, consent_key)
);

CREATE TABLE IF NOT EXISTS export_requests (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id BIGINT REFERENCES workspaces(id) ON DELETE SET NULL,
    scope TEXT NOT NULL CHECK (scope IN ('account', 'personal_workspace', 'business_workspace', 'privacy_dsr')),
    format TEXT NOT NULL DEFAULT 'json_csv_bundle',
    status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'ready', 'failed', 'expired')),
    as_of_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    manifest_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    reconciliation_status TEXT NOT NULL DEFAULT 'pending',
    missing_files_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    checksum_sha256 TEXT NOT NULL DEFAULT '',
    artifact_payload_json JSONB,
    safe_error TEXT NOT NULL DEFAULT '',
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),
    downloaded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS privacy_requests (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id BIGINT REFERENCES workspaces(id) ON DELETE SET NULL,
    request_type TEXT NOT NULL CHECK (request_type IN ('access', 'correction', 'deletion', 'restriction', 'portability', 'consent_withdrawal', 'inquiry')),
    status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'verifying', 'in_review', 'fulfilled', 'denied', 'closed')),
    verification_status TEXT NOT NULL DEFAULT 'verified_session',
    summary TEXT NOT NULL DEFAULT '',
    decision_summary TEXT NOT NULL DEFAULT '',
    deadline_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 days'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS retention_policies (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    data_class TEXT NOT NULL,
    policy_version TEXT NOT NULL,
    purpose TEXT NOT NULL,
    lawful_basis TEXT NOT NULL,
    active_retention_days INTEGER NOT NULL,
    post_grace_action TEXT NOT NULL,
    backup_window_days INTEGER NOT NULL DEFAULT 30,
    effective_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT retention_policies_class_ver_uidx UNIQUE (data_class, policy_version)
);

INSERT INTO retention_policies (data_class, policy_version, purpose, lawful_basis, active_retention_days, post_grace_action, backup_window_days)
VALUES
    ('posted_accounting_journals', '2026-11.1', 'Statutory tax & bookkeeping evidence', 'legal_obligation', 2190, 'restrict_and_retain_until_statutory_expiry', 30),
    ('user_profile_and_contacts', '2026-11.1', 'Account identity & authentication', 'contract', 0, 'purge_and_tombstone', 30),
    ('support_attachments', '2026-11.1', 'Support diagnostics resolution', 'legitimate_interest', 180, 'purge_storage', 30)
ON CONFLICT (data_class, policy_version) DO NOTHING;

CREATE TABLE IF NOT EXISTS deletion_cases (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scope TEXT NOT NULL CHECK (scope IN ('account', 'personal_workspace', 'business_workspace')),
    workspace_id BIGINT REFERENCES workspaces(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'grace_restricted' CHECK (status IN (
        'deletion_requested',
        'grace_restricted',
        'restoring',
        'restored',
        'purge_review',
        'retention_hold',
        'purging',
        'purge_failed',
        'deleted'
    )),
    reason TEXT NOT NULL DEFAULT '',
    grace_deadline_at TIMESTAMPTZ NOT NULL,
    subscription_reconciled BOOLEAN NOT NULL DEFAULT false,
    public_access_revoked_at TIMESTAMPTZ,
    purge_manifest_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    cancelled_at TIMESTAMPTZ,
    purged_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS deletion_cases_user_idx ON deletion_cases (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS deletion_tasks (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    deletion_case_id BIGINT NOT NULL REFERENCES deletion_cases(id) ON DELETE CASCADE,
    processor_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'held')),
    evidence_ref TEXT NOT NULL DEFAULT '',
    last_error TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT deletion_tasks_case_proc_uidx UNIQUE (deletion_case_id, processor_name)
);

CREATE TABLE IF NOT EXISTS retention_holds (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    scope_type TEXT NOT NULL,
    scope_id BIGINT NOT NULL,
    reason_code TEXT NOT NULL,
    reason_detail TEXT NOT NULL,
    authorized_by TEXT NOT NULL,
    expires_at TIMESTAMPTZ,
    released_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS deletion_tombstones (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    subject_hash TEXT NOT NULL,
    scope TEXT NOT NULL,
    deletion_case_id BIGINT NOT NULL REFERENCES deletion_cases(id) ON DELETE CASCADE,
    backup_expiry_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS support_cases (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id BIGINT REFERENCES workspaces(id) ON DELETE SET NULL,
    category TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'SEV-3' CHECK (severity IN ('SEV-0', 'SEV-1', 'SEV-2', 'SEV-3')),
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'triaged', 'waiting_on_support', 'waiting_on_user', 'resolved', 'closed', 'security_incident')),
    summary TEXT NOT NULL,
    affected_module TEXT NOT NULL DEFAULT '',
    reference_id TEXT NOT NULL DEFAULT '',
    diagnostic_consent BOOLEAN NOT NULL DEFAULT false,
    diagnostic_bundle_json JSONB,
    preferred_channel TEXT NOT NULL DEFAULT 'in_app',
    verification_method TEXT NOT NULL DEFAULT 'authenticated_session',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS support_messages (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    support_case_id BIGINT NOT NULL REFERENCES support_cases(id) ON DELETE CASCADE,
    sender_type TEXT NOT NULL CHECK (sender_type IN ('user', 'support', 'system')),
    sender_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS support_access_grants (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    support_case_id BIGINT NOT NULL REFERENCES support_cases(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    actor_label TEXT NOT NULL,
    scope TEXT NOT NULL DEFAULT 'read_only_diagnostics',
    reason TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS support_access_events (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    grant_id BIGINT NOT NULL REFERENCES support_access_grants(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    actor_label TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_recovery_actions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    support_case_id BIGINT REFERENCES support_cases(id) ON DELETE SET NULL,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    action_type TEXT NOT NULL,
    reason TEXT NOT NULL,
    dry_run BOOLEAN NOT NULL DEFAULT true,
    idempotency_key TEXT NOT NULL,
    reconciliation_status TEXT NOT NULL DEFAULT 'pending',
    executed_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT admin_recovery_idemp_uidx UNIQUE (workspace_id, idempotency_key)
);
