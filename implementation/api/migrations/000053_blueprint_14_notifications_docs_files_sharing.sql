-- Blueprint 14: Notifications, Documents, Files & Sharing

-- 1. Extend Notifications & Add Outbox + Preferences + Email Suppressions
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_category_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_category_check CHECK (
    category IN (
        'system', 'finance', 'invoice', 'inventory', 'team', 'approval',
        'security', 'financial_document', 'operations', 'review_required', 'delivery', 'billing', 'insight'
    )
);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS template_key TEXT NOT NULL DEFAULT '';
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS template_version TEXT NOT NULL DEFAULT 'v1';
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS severity TEXT NOT NULL DEFAULT 'info';
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS resource_type TEXT NOT NULL DEFAULT '';
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS resource_id BIGINT NOT NULL DEFAULT 0;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS action_key TEXT NOT NULL DEFAULT '';
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS dedupe_key TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_user_dedupe_uidx ON notifications (user_id, dedupe_key)
    WHERE dedupe_key IS NOT NULL AND dedupe_key <> '';

CREATE TABLE IF NOT EXISTS notification_preferences (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id BIGINT REFERENCES workspaces(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    channel TEXT NOT NULL CONSTRAINT notif_pref_channel_check CHECK (channel IN ('in_app', 'email')),
    enabled BOOLEAN NOT NULL DEFAULT true,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT notif_pref_uidx UNIQUE (user_id, workspace_id, category, channel)
);

CREATE TABLE IF NOT EXISTS notification_outbox (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    category TEXT NOT NULL,
    template_key TEXT NOT NULL,
    template_version TEXT NOT NULL DEFAULT 'v1',
    severity TEXT NOT NULL DEFAULT 'info',
    resource_type TEXT NOT NULL DEFAULT '',
    resource_id BIGINT NOT NULL DEFAULT 0,
    action_key TEXT NOT NULL DEFAULT '',
    action_url TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    recipient_user_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    safe_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    dedupe_key TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending' CONSTRAINT notif_outbox_status_check CHECK (status IN ('pending', 'projected', 'failed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    projected_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS notif_outbox_pending_idx ON notification_outbox (status, id) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS email_suppressions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    email_digest TEXT NOT NULL,
    email_masked TEXT NOT NULL,
    reason TEXT NOT NULL CONSTRAINT email_suppression_reason_check CHECK (reason IN ('hard_bounce', 'complaint')),
    provider_event_id TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT email_suppressions_ws_digest_uidx UNIQUE (workspace_id, email_digest)
);

-- 2. Immutable Document Artifacts & Render Jobs
CREATE TABLE IF NOT EXISTS document_artifacts (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    document_type TEXT NOT NULL,
    document_id BIGINT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    render_schema_version TEXT NOT NULL DEFAULT 'pdf-snapshot.v1',
    snapshot_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    snapshot_hash TEXT NOT NULL,
    pdf_bytes BYTEA NOT NULL DEFAULT ''::bytea,
    pdf_hash TEXT NOT NULL DEFAULT '',
    byte_size BIGINT NOT NULL DEFAULT 0,
    page_count INTEGER NOT NULL DEFAULT 1,
    mime_type TEXT NOT NULL DEFAULT 'application/pdf',
    status TEXT NOT NULL DEFAULT 'queued'
        CONSTRAINT doc_artifacts_status_check CHECK (status IN ('queued', 'rendering', 'ready', 'failed', 'superseded')),
    superseded_by_id BIGINT REFERENCES document_artifacts(id) ON DELETE SET NULL,
    created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS doc_artifacts_ws_doc_idx ON document_artifacts (workspace_id, document_type, document_id, version DESC);

CREATE TABLE IF NOT EXISTS render_jobs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    artifact_id BIGINT NOT NULL REFERENCES document_artifacts(id) ON DELETE CASCADE,
    document_type TEXT NOT NULL,
    document_id BIGINT NOT NULL,
    idempotency_key TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued' CONSTRAINT render_jobs_status_check CHECK (status IN ('queued', 'processing', 'ready', 'failed')),
    attempts INTEGER NOT NULL DEFAULT 0,
    error_message TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at TIMESTAMPTZ,
    CONSTRAINT render_jobs_ws_idemp_uidx UNIQUE (workspace_id, idempotency_key)
);

-- 3. Private Files, File Links & Retention Lifecycle
CREATE TABLE IF NOT EXISTS files (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    uploaded_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    file_class TEXT NOT NULL
        CONSTRAINT files_class_check CHECK (file_class IN ('public_media', 'private_evidence', 'generated_artifact', 'temporary_upload', 'export_archive', 'quarantined')),
    original_filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    byte_size BIGINT NOT NULL,
    sha256_hash TEXT NOT NULL DEFAULT '',
    provider TEXT NOT NULL DEFAULT 'cloudinary',
    provider_public_id TEXT NOT NULL,
    provider_resource_type TEXT NOT NULL DEFAULT 'auto',
    provider_delivery_type TEXT NOT NULL DEFAULT 'authenticated'
        CONSTRAINT files_delivery_type_check CHECK (provider_delivery_type IN ('upload', 'authenticated')),
    provider_version TEXT NOT NULL DEFAULT '',
    scan_status TEXT NOT NULL DEFAULT 'pending' CONSTRAINT files_scan_check CHECK (scan_status IN ('pending', 'clean', 'quarantined')),
    retention_policy TEXT NOT NULL DEFAULT 'standard',
    delete_after TIMESTAMPTZ,
    deletion_status TEXT NOT NULL DEFAULT 'active'
        CONSTRAINT files_deletion_check CHECK (deletion_status IN ('active', 'scheduled', 'deleted', 'delete_failed')),
    storage_reservation_id BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS files_ws_idx ON files (workspace_id, file_class, created_at DESC);

CREATE TABLE IF NOT EXISTS file_links (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    file_id BIGINT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    resource_type TEXT NOT NULL,
    resource_id BIGINT NOT NULL,
    linked_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    unlinked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS file_links_file_idx ON file_links (file_id, unlinked_at);

-- 4. Guest Share Grants, Access Events & Deliveries
CREATE TABLE IF NOT EXISTS share_grants (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    resource_type TEXT NOT NULL,
    resource_id BIGINT NOT NULL,
    artifact_id BIGINT REFERENCES document_artifacts(id) ON DELETE SET NULL,
    version INTEGER NOT NULL DEFAULT 1,
    permissions JSONB NOT NULL DEFAULT '["view","download"]'::jsonb,
    purpose TEXT NOT NULL DEFAULT 'guest_portal',
    created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    revoked_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    access_count INTEGER NOT NULL DEFAULT 0,
    download_count INTEGER NOT NULL DEFAULT 0,
    last_accessed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS share_grants_ws_res_idx ON share_grants (workspace_id, resource_type, resource_id, created_at DESC);

CREATE TABLE IF NOT EXISTS share_access_events (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    share_grant_id BIGINT REFERENCES share_grants(id) ON DELETE CASCADE,
    workspace_id BIGINT REFERENCES workspaces(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL CONSTRAINT share_access_type_check CHECK (event_type IN ('viewed', 'downloaded', 'handoff_opened', 'denied')),
    ip_hash TEXT NOT NULL DEFAULT '',
    user_agent_redacted TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS deliveries (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    document_type TEXT NOT NULL,
    document_id BIGINT NOT NULL,
    artifact_id BIGINT REFERENCES document_artifacts(id) ON DELETE SET NULL,
    share_grant_id BIGINT REFERENCES share_grants(id) ON DELETE SET NULL,
    channel TEXT NOT NULL CONSTRAINT deliveries_channel_check CHECK (channel IN ('email', 'whatsapp_handoff', 'copy_link')),
    recipient_masked TEXT NOT NULL DEFAULT '',
    recipient_digest TEXT NOT NULL DEFAULT '',
    template_key TEXT NOT NULL DEFAULT 'document_share',
    template_version TEXT NOT NULL DEFAULT 'v1',
    status TEXT NOT NULL DEFAULT 'queued'
        CONSTRAINT deliveries_status_check CHECK (status IN ('draft', 'queued', 'processing', 'accepted', 'delivered', 'opened', 'bounced', 'complained', 'retry_scheduled', 'failed', 'handoff_opened')),
    provider TEXT NOT NULL DEFAULT 'resend',
    provider_message_id TEXT NOT NULL DEFAULT '',
    idempotency_key TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    is_resend BOOLEAN NOT NULL DEFAULT false,
    resend_of_delivery_id BIGINT REFERENCES deliveries(id) ON DELETE SET NULL,
    last_error_class TEXT NOT NULL DEFAULT '',
    last_error_message TEXT NOT NULL DEFAULT '',
    created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT deliveries_ws_idemp_uidx UNIQUE (workspace_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS deliveries_ws_doc_idx ON deliveries (workspace_id, document_type, document_id, created_at DESC);

CREATE TABLE IF NOT EXISTS delivery_attempts (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    delivery_id BIGINT NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    attempt_number INTEGER NOT NULL,
    status TEXT NOT NULL,
    provider_message_id TEXT NOT NULL DEFAULT '',
    error_class TEXT NOT NULL DEFAULT '',
    error_message TEXT NOT NULL DEFAULT '',
    retryable BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS email_webhook_events (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    provider TEXT NOT NULL DEFAULT 'resend',
    event_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    provider_message_id TEXT NOT NULL DEFAULT '',
    signature_valid BOOLEAN NOT NULL DEFAULT false,
    event_occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    processing_state TEXT NOT NULL DEFAULT 'received',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT email_webhook_events_uidx UNIQUE (provider, event_id)
);

-- 5. Seed Blueprint 14 RBAC Permissions
WITH role_perm_map(role_code, perm_code) AS (
    VALUES
        ('admin', 'notifications.view'), ('admin', 'notifications.manage_preferences'),
        ('admin', 'documents.render'), ('admin', 'documents.view_artifacts'),
        ('admin', 'shares.create'), ('admin', 'shares.revoke'),
        ('admin', 'documents.send'), ('admin', 'deliveries.view'), ('admin', 'deliveries.retry'),
        ('admin', 'files.manage'), ('admin', 'files.link'), ('admin', 'files.delete'), ('admin', 'evidence.view_private'),
        ('accountant', 'notifications.view'), ('accountant', 'notifications.manage_preferences'),
        ('accountant', 'documents.render'), ('accountant', 'documents.view_artifacts'), ('accountant', 'evidence.view_private'),
        ('staff', 'notifications.view'), ('staff', 'notifications.manage_preferences'),
        ('staff', 'documents.render'), ('staff', 'documents.view_artifacts'),
        ('staff', 'shares.create'), ('staff', 'documents.send'), ('staff', 'deliveries.view'),
        ('staff', 'files.manage'), ('staff', 'files.link'),
        ('member', 'notifications.view'), ('member', 'notifications.manage_preferences')
)
INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, m.perm_code
FROM roles r
JOIN role_perm_map m ON m.role_code = r.code
ON CONFLICT (role_id, permission_code) DO NOTHING;
