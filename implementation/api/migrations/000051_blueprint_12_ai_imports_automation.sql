-- Blueprint 12: AI Assistant, Imports, Background Jobs & Deterministic Automation

-- 1. AI Quotas, Requests, Usage Reservations, Drafts & Provider Usage
CREATE TABLE IF NOT EXISTS workspace_ai_quotas (
    workspace_id BIGINT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
    plan_entitled BOOLEAN NOT NULL DEFAULT true,
    monthly_credit_limit INTEGER NOT NULL DEFAULT 100,
    credits_used INTEGER NOT NULL DEFAULT 0 CONSTRAINT workspace_ai_credits_used_check CHECK (credits_used >= 0),
    credits_reserved INTEGER NOT NULL DEFAULT 0 CONSTRAINT workspace_ai_credits_reserved_check CHECK (credits_reserved >= 0),
    per_user_daily_limit INTEGER NOT NULL DEFAULT 30,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT workspace_ai_credits_bound_check CHECK (credits_used + credits_reserved <= monthly_credit_limit)
);

CREATE TABLE IF NOT EXISTS jobs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    job_type TEXT NOT NULL,
    schema_version TEXT NOT NULL DEFAULT 'job.v1',
    source_type TEXT NOT NULL DEFAULT '',
    source_id BIGINT NOT NULL DEFAULT 0,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    state TEXT NOT NULL DEFAULT 'queued'
        CONSTRAINT jobs_state_check CHECK (state IN ('queued', 'running', 'retry_scheduled', 'succeeded', 'failed', 'dead_letter', 'cancelled')),
    priority INTEGER NOT NULL DEFAULT 100,
    available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    timeout_seconds INTEGER NOT NULL DEFAULT 60,
    lock_owner TEXT,
    lock_expires_at TIMESTAMPTZ,
    last_error_class TEXT,
    last_error_message TEXT,
    idempotency_key TEXT,
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS jobs_claim_idx ON jobs (state, priority, available_at, id)
    WHERE state IN ('queued', 'retry_scheduled');
CREATE INDEX IF NOT EXISTS jobs_workspace_idx ON jobs (workspace_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS jobs_workspace_idemp_uidx ON jobs (workspace_id, job_type, idempotency_key)
    WHERE idempotency_key IS NOT NULL AND idempotency_key <> '';

CREATE TABLE IF NOT EXISTS job_attempts (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    job_id BIGINT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    attempt_number INTEGER NOT NULL,
    worker_id TEXT NOT NULL,
    status TEXT NOT NULL CONSTRAINT job_attempts_status_check CHECK (status IN ('running', 'succeeded', 'failed', 'timed_out')),
    error_class TEXT,
    error_message TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS job_attempts_job_idx ON job_attempts (job_id, attempt_number DESC);

CREATE TABLE IF NOT EXISTS failed_jobs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    job_id BIGINT NOT NULL UNIQUE REFERENCES jobs(id) ON DELETE CASCADE,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    job_type TEXT NOT NULL,
    source_type TEXT NOT NULL DEFAULT '',
    source_id BIGINT NOT NULL DEFAULT 0,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error_class TEXT NOT NULL,
    last_error_message TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'open' CONSTRAINT failed_jobs_status_check CHECK (status IN ('open', 'retried', 'cancelled')),
    retried_job_id BIGINT REFERENCES jobs(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS failed_jobs_ws_idx ON failed_jobs (workspace_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS ai_requests (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    idempotency_key TEXT NOT NULL,
    mode TEXT NOT NULL DEFAULT 'sync' CONSTRAINT ai_requests_mode_check CHECK (mode IN ('sync', 'async')),
    status TEXT NOT NULL DEFAULT 'received'
        CONSTRAINT ai_requests_status_check CHECK (status IN ('received', 'queued', 'running', 'succeeded', 'failed', 'rejected')),
    provider TEXT,
    model TEXT,
    latency_ms INTEGER NOT NULL DEFAULT 0,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    structured_valid BOOLEAN NOT NULL DEFAULT false,
    failure_class TEXT,
    input_char_count INTEGER NOT NULL DEFAULT 0,
    redacted_summary TEXT NOT NULL DEFAULT '',
    job_id BIGINT REFERENCES jobs(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ai_requests_ws_idemp_uidx UNIQUE (workspace_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS ai_requests_ws_user_idx ON ai_requests (workspace_id, user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ai_usage_reservations (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ai_request_id BIGINT REFERENCES ai_requests(id) ON DELETE CASCADE,
    idempotency_key TEXT NOT NULL,
    credits_reserved INTEGER NOT NULL DEFAULT 1 CONSTRAINT ai_usage_credits_check CHECK (credits_reserved > 0),
    status TEXT NOT NULL DEFAULT 'reserved' CONSTRAINT ai_usage_res_status_check CHECK (status IN ('reserved', 'consumed', 'released')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    settled_at TIMESTAMPTZ,
    CONSTRAINT ai_usage_res_ws_idemp_uidx UNIQUE (workspace_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS ai_provider_usage_logs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    ai_request_id BIGINT REFERENCES ai_requests(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    latency_ms INTEGER NOT NULL DEFAULT 0,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    structured_valid BOOLEAN NOT NULL DEFAULT false,
    failure_class TEXT,
    is_fallback BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_drafts (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ai_request_id BIGINT NOT NULL REFERENCES ai_requests(id) ON DELETE CASCADE,
    schema_version TEXT NOT NULL DEFAULT 'money-draft.v1',
    scope TEXT NOT NULL DEFAULT 'unknown' CONSTRAINT ai_drafts_scope_check CHECK (scope IN ('personal', 'business', 'unknown')),
    direction TEXT NOT NULL DEFAULT 'unknown' CONSTRAINT ai_drafts_direction_check CHECK (direction IN ('money_in', 'money_out', 'transfer', 'unknown')),
    purpose TEXT NOT NULL DEFAULT 'unknown',
    amount_major TEXT NOT NULL DEFAULT '',
    amount_minor BIGINT NOT NULL DEFAULT 0,
    currency CHAR(3) NOT NULL DEFAULT 'NGN',
    currency_exponent SMALLINT NOT NULL DEFAULT 2,
    effective_date DATE,
    account_id BIGINT REFERENCES money_accounts(id) ON DELETE SET NULL,
    account_alias TEXT,
    category_id BIGINT REFERENCES categories(id) ON DELETE SET NULL,
    category_alias TEXT,
    counterparty_id BIGINT REFERENCES counterparties(id) ON DELETE SET NULL,
    counterparty_alias TEXT,
    description TEXT NOT NULL DEFAULT '',
    field_confidence JSONB NOT NULL DEFAULT '{}'::jsonb,
    missing_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
    warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
    clarification_options JSONB NOT NULL DEFAULT '[]'::jsonb,
    route_to_manual_flow TEXT,
    status TEXT NOT NULL DEFAULT 'needs_review' CONSTRAINT ai_drafts_status_check CHECK (status IN ('draft', 'needs_review', 'confirmed', 'discarded')),
    confirmed_record_type TEXT,
    confirmed_record_id BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_drafts_ws_status_idx ON ai_drafts (workspace_id, status, created_at DESC);

-- 2. CSV Import Tables
CREATE TABLE IF NOT EXISTS import_files (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    uploaded_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    original_filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    byte_size BIGINT NOT NULL,
    sha256_hash TEXT NOT NULL,
    encoding TEXT NOT NULL DEFAULT 'utf-8',
    delimiter TEXT NOT NULL DEFAULT ',',
    storage_key TEXT NOT NULL,
    raw_csv_text TEXT NOT NULL DEFAULT '',
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS import_mapping_profiles (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    mapping_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    date_format TEXT NOT NULL DEFAULT 'YYYY-MM-DD',
    decimal_separator TEXT NOT NULL DEFAULT '.',
    sign_convention TEXT NOT NULL DEFAULT 'signed',
    default_currency CHAR(3) NOT NULL DEFAULT 'NGN',
    default_account_id BIGINT REFERENCES money_accounts(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS import_batches (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    import_file_id BIGINT NOT NULL REFERENCES import_files(id) ON DELETE RESTRICT,
    mapping_profile_id BIGINT REFERENCES import_mapping_profiles(id) ON DELETE SET NULL,
    target_account_id BIGINT REFERENCES money_accounts(id) ON DELETE SET NULL,
    default_currency CHAR(3) NOT NULL DEFAULT 'NGN',
    status TEXT NOT NULL DEFAULT 'uploaded'
        CONSTRAINT import_batches_status_check CHECK (status IN ('uploaded', 'mapped', 'analyzing', 'ready', 'confirming', 'completed', 'partially_failed', 'undone')),
    total_rows INTEGER NOT NULL DEFAULT 0,
    valid_count INTEGER NOT NULL DEFAULT 0,
    duplicate_count INTEGER NOT NULL DEFAULT 0,
    match_count INTEGER NOT NULL DEFAULT 0,
    invalid_count INTEGER NOT NULL DEFAULT 0,
    excluded_count INTEGER NOT NULL DEFAULT 0,
    posted_count INTEGER NOT NULL DEFAULT 0,
    failed_count INTEGER NOT NULL DEFAULT 0,
    created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS import_batches_ws_idx ON import_batches (workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS import_rows (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    batch_id BIGINT NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    row_number INTEGER NOT NULL,
    row_fingerprint TEXT NOT NULL,
    external_tx_id TEXT NOT NULL DEFAULT '',
    raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    effective_date DATE,
    description TEXT NOT NULL DEFAULT '',
    amount_minor BIGINT NOT NULL DEFAULT 0,
    signed_amount_minor BIGINT NOT NULL DEFAULT 0,
    currency CHAR(3) NOT NULL DEFAULT 'NGN',
    currency_exponent SMALLINT NOT NULL DEFAULT 2,
    direction TEXT NOT NULL DEFAULT 'money_out' CONSTRAINT import_rows_dir_check CHECK (direction IN ('money_in', 'money_out', 'transfer')),
    purpose TEXT NOT NULL DEFAULT '',
    account_id BIGINT REFERENCES money_accounts(id) ON DELETE SET NULL,
    category_id BIGINT REFERENCES categories(id) ON DELETE SET NULL,
    counterparty_id BIGINT REFERENCES counterparties(id) ON DELETE SET NULL,
    balance_minor BIGINT,
    transfer_pair_group TEXT NOT NULL DEFAULT '',
    state TEXT NOT NULL DEFAULT 'parsed'
        CONSTRAINT import_rows_state_check CHECK (state IN ('parsed', 'invalid', 'duplicate_exact', 'match_suggested', 'matched', 'draft_ready', 'confirming', 'posted', 'failed', 'excluded')),
    error_code TEXT NOT NULL DEFAULT '',
    error_message TEXT NOT NULL DEFAULT '',
    suggestion_source TEXT NOT NULL DEFAULT 'rule' CONSTRAINT import_rows_sug_src_check CHECK (suggestion_source IN ('rule', 'ai', 'manual')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT import_rows_batch_row_uidx UNIQUE (batch_id, row_number)
);

CREATE INDEX IF NOT EXISTS import_rows_batch_state_idx ON import_rows (batch_id, state, id);
CREATE INDEX IF NOT EXISTS import_rows_ws_fp_idx ON import_rows (workspace_id, row_fingerprint);

CREATE TABLE IF NOT EXISTS import_row_matches (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    import_row_id BIGINT NOT NULL REFERENCES import_rows(id) ON DELETE CASCADE,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    match_kind TEXT NOT NULL CONSTRAINT import_row_matches_kind_check CHECK (match_kind IN ('exact_duplicate', 'probable_match', 'existing_payment')),
    matched_table TEXT NOT NULL,
    matched_id BIGINT NOT NULL,
    confidence_label TEXT NOT NULL DEFAULT 'medium',
    reason TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'suggested' CONSTRAINT import_row_matches_status_check CHECK (status IN ('suggested', 'accepted', 'rejected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS import_row_matches_row_idx ON import_row_matches (import_row_id);

CREATE TABLE IF NOT EXISTS import_row_results (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    import_row_id BIGINT NOT NULL REFERENCES import_rows(id) ON DELETE CASCADE,
    batch_id BIGINT NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    idempotency_key TEXT NOT NULL,
    action TEXT NOT NULL CONSTRAINT import_row_results_action_check CHECK (action IN ('posted', 'matched', 'reversed', 'unlinked')),
    target_type TEXT NOT NULL,
    target_id BIGINT NOT NULL,
    ledger_entry_id BIGINT,
    error_message TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT import_row_results_ws_idemp_uidx UNIQUE (workspace_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS import_reconciliations (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    batch_id BIGINT NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    source_row_count INTEGER NOT NULL DEFAULT 0,
    posted_count INTEGER NOT NULL DEFAULT 0,
    matched_count INTEGER NOT NULL DEFAULT 0,
    duplicate_excluded_count INTEGER NOT NULL DEFAULT 0,
    failed_unresolved_count INTEGER NOT NULL DEFAULT 0,
    reconciled BOOLEAN NOT NULL DEFAULT false,
    currency_totals JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Deterministic Automation Rules & Executions
CREATE TABLE IF NOT EXISTS automation_rules (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    rule_key TEXT NOT NULL,
    name TEXT NOT NULL,
    rule_type TEXT NOT NULL CONSTRAINT automation_rules_type_check CHECK (rule_type IN (
        'budget_threshold', 'invoice_due_reminder', 'bill_due_reminder',
        'low_stock_alert', 'expiry_alert', 'import_categorization',
        'document_delivery_retry', 'domain_verification_poll'
    )),
    version INTEGER NOT NULL DEFAULT 1,
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    last_run_at TIMESTAMPTZ,
    created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT automation_rules_ws_key_uidx UNIQUE (workspace_id, rule_key)
);

CREATE TABLE IF NOT EXISTS automation_executions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    rule_id BIGINT NOT NULL REFERENCES automation_rules(id) ON DELETE CASCADE,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    idempotency_key TEXT NOT NULL,
    status TEXT NOT NULL CONSTRAINT automation_exec_status_check CHECK (status IN ('succeeded', 'failed', 'skipped')),
    summary TEXT NOT NULL DEFAULT '',
    affected_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT automation_exec_ws_idemp_uidx UNIQUE (workspace_id, idempotency_key)
);

-- 4. Seed Blueprint 12 RBAC Permissions
WITH role_perm_map(role_code, perm_code) AS (
    VALUES
        ('admin', 'ai.use'), ('admin', 'ai.view_usage'),
        ('admin', 'imports.create'), ('admin', 'imports.review'), ('admin', 'imports.confirm'), ('admin', 'imports.undo'),
        ('admin', 'automation.manage'), ('admin', 'jobs.view_failures'), ('admin', 'jobs.retry'),
        ('accountant', 'ai.use'), ('accountant', 'ai.view_usage'),
        ('accountant', 'imports.create'), ('accountant', 'imports.review'), ('accountant', 'imports.confirm'), ('accountant', 'imports.undo'),
        ('accountant', 'jobs.view_failures'),
        ('staff', 'ai.use'), ('staff', 'imports.create'), ('staff', 'imports.review'),
        ('member', 'ai.use')
)
INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, m.perm_code
FROM roles r
JOIN role_perm_map m ON m.role_code = r.code
ON CONFLICT (role_id, permission_code) DO NOTHING;
