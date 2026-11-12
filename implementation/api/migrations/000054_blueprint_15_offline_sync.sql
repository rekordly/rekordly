-- Blueprint 15: Offline Sync, Conflicts and Recovery

CREATE TABLE IF NOT EXISTS offline_sync_sessions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    session_uuid UUID NOT NULL DEFAULT gen_random_uuid(),
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    installation_id TEXT NOT NULL,
    client_app_version TEXT NOT NULL DEFAULT '',
    client_schema_version INTEGER NOT NULL DEFAULT 1,
    manifest_version TEXT NOT NULL DEFAULT '',
    entitlement_revision BIGINT NOT NULL DEFAULT 0,
    permission_revision TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'expired', 'revoked')),
    command_count INTEGER NOT NULL DEFAULT 0,
    confirmed_count INTEGER NOT NULL DEFAULT 0,
    conflict_count INTEGER NOT NULL DEFAULT 0,
    failed_count INTEGER NOT NULL DEFAULT 0,
    client_timezone TEXT NOT NULL DEFAULT '',
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT offline_sync_sessions_uuid_uidx UNIQUE (session_uuid)
);

CREATE INDEX IF NOT EXISTS offline_sync_sessions_user_ws_idx
    ON offline_sync_sessions (user_id, workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS offline_sync_sessions_install_status_idx
    ON offline_sync_sessions (installation_id, status);

CREATE TABLE IF NOT EXISTS client_command_receipts (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    sync_session_id BIGINT REFERENCES offline_sync_sessions(id) ON DELETE SET NULL,
    installation_id TEXT NOT NULL,
    client_command_id TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    supersedes_client_command_id TEXT NOT NULL DEFAULT '',
    command_type TEXT NOT NULL,
    schema_version INTEGER NOT NULL DEFAULT 1,
    payload_hash TEXT NOT NULL,
    base_versions_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    dependencies_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN (
        'confirmed',
        'processing',
        'needs_review',
        'failed_permanent',
        'retry_later',
        'dependency_blocked',
        'unsupported_version'
    )),
    conflict_code TEXT NOT NULL DEFAULT '',
    safe_message TEXT NOT NULL DEFAULT '',
    conflict_fields_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    allowed_resolutions_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    current_snapshot_json JSONB,
    server_resource_type TEXT NOT NULL DEFAULT '',
    server_resource_id TEXT NOT NULL DEFAULT '',
    server_resource_version TEXT NOT NULL DEFAULT '',
    local_id_mappings_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    result_json JSONB,
    http_status INTEGER NOT NULL DEFAULT 200,
    client_created_at TIMESTAMPTZ,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '90 days'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT client_command_receipts_idemp_uidx UNIQUE (user_id, workspace_id, idempotency_key),
    CONSTRAINT client_command_receipts_cmd_uidx UNIQUE (user_id, workspace_id, client_command_id)
);

CREATE INDEX IF NOT EXISTS client_command_receipts_ws_status_idx
    ON client_command_receipts (workspace_id, status, received_at DESC);
CREATE INDEX IF NOT EXISTS client_command_receipts_expires_idx
    ON client_command_receipts (expires_at);

CREATE TABLE IF NOT EXISTS offline_sync_events (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    installation_id TEXT NOT NULL,
    client_command_id TEXT NOT NULL DEFAULT '',
    command_type TEXT NOT NULL DEFAULT '',
    schema_version INTEGER NOT NULL DEFAULT 1,
    outcome TEXT NOT NULL,
    conflict_code TEXT NOT NULL DEFAULT '',
    duration_ms INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS offline_sync_events_ws_created_idx
    ON offline_sync_events (workspace_id, created_at DESC);

ALTER TABLE money_records ADD COLUMN IF NOT EXISTS sync_version BIGINT NOT NULL DEFAULT 1;
ALTER TABLE budgets ADD COLUMN IF NOT EXISTS sync_version BIGINT NOT NULL DEFAULT 1;
