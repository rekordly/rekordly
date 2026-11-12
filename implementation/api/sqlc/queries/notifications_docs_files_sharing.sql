-- Blueprint 14: Notifications, Documents, Files & Sharing

-- ================= Notifications & Outbox =================

-- name: ListUserNotifications :many
SELECT *
FROM notifications
WHERE user_id = $1
  AND (sqlc.narg('workspace_id')::bigint IS NULL OR workspace_id = sqlc.narg('workspace_id')::bigint)
  AND (sqlc.narg('category')::text IS NULL OR category = sqlc.narg('category')::text)
  AND (sqlc.arg('include_archived')::boolean OR archived_at IS NULL)
  AND ($2::bigint = 0 OR id < $2::bigint)
ORDER BY id DESC
LIMIT $3;

-- name: CountUserUnreadNotifications :one
SELECT COUNT(*)::bigint
FROM notifications
WHERE user_id = $1
  AND (sqlc.narg('workspace_id')::bigint IS NULL OR workspace_id = sqlc.narg('workspace_id')::bigint)
  AND is_read = false
  AND archived_at IS NULL;

-- name: MarkNotificationReadByID :one
UPDATE notifications
SET is_read = true, read_at = COALESCE(read_at, now())
WHERE id = $1 AND user_id = $2
RETURNING *;

-- name: MarkNotificationUnreadByID :one
UPDATE notifications
SET is_read = false, read_at = NULL
WHERE id = $1 AND user_id = $2
RETURNING *;

-- name: ArchiveNotificationByID :one
UPDATE notifications
SET archived_at = now()
WHERE id = $1 AND user_id = $2
RETURNING *;

-- name: MarkAllNotificationsReadForUser :exec
UPDATE notifications
SET is_read = true, read_at = COALESCE(read_at, now())
WHERE user_id = $1
  AND (sqlc.narg('workspace_id')::bigint IS NULL OR workspace_id = sqlc.narg('workspace_id')::bigint)
  AND is_read = false;

-- name: ListNotificationPreferences :many
SELECT *
FROM notification_preferences
WHERE user_id = $1
  AND (sqlc.narg('workspace_id')::bigint IS NULL OR workspace_id = sqlc.narg('workspace_id')::bigint)
ORDER BY category ASC, channel ASC;

-- name: UpsertNotificationPreference :one
INSERT INTO notification_preferences (user_id, workspace_id, category, channel, enabled)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (user_id, workspace_id, category, channel) DO UPDATE
SET enabled = EXCLUDED.enabled,
    updated_at = now()
RETURNING *;

-- name: CreateNotificationOutbox :one
INSERT INTO notification_outbox (
    workspace_id, event_type, category, template_key, template_version, severity,
    resource_type, resource_id, action_key, action_url, title, body,
    recipient_user_ids, safe_metadata, dedupe_key, status
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'pending')
RETURNING *;

-- name: ClaimPendingNotificationOutbox :many
SELECT *
FROM notification_outbox
WHERE status = 'pending'
ORDER BY id ASC
FOR UPDATE SKIP LOCKED
LIMIT 20;

-- name: MarkNotificationOutboxProjected :exec
UPDATE notification_outbox
SET status = 'projected', projected_at = now()
WHERE id = $1;

-- name: InsertProjectedNotification :exec
INSERT INTO notifications (
    workspace_id, user_id, category, template_key, template_version, severity,
    resource_type, resource_id, action_key, action_url, title, body, dedupe_key, metadata
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL AND dedupe_key <> '' DO NOTHING;

-- ================= Document Artifacts & Render Jobs =================

-- name: GetLatestDocumentArtifact :one
SELECT *
FROM document_artifacts
WHERE workspace_id = $1 AND document_type = $2 AND document_id = $3
ORDER BY version DESC, id DESC
LIMIT 1;

-- name: GetDocumentArtifactByID :one
SELECT *
FROM document_artifacts
WHERE id = $1 AND workspace_id = $2;

-- name: CreateDocumentArtifact :one
INSERT INTO document_artifacts (
    workspace_id, document_type, document_id, version, render_schema_version,
    snapshot_json, snapshot_hash, pdf_bytes, pdf_hash, byte_size, page_count, status, created_by_user_id
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
RETURNING *;

-- name: SupersedeDocumentArtifact :exec
UPDATE document_artifacts
SET status = 'superseded',
    superseded_by_id = $3
WHERE id = $1 AND workspace_id = $2;

-- name: GetRenderJobByIdemp :one
SELECT * FROM render_jobs WHERE workspace_id = $1 AND idempotency_key = $2;

-- name: GetRenderJobByID :one
SELECT * FROM render_jobs WHERE id = $1 AND workspace_id = $2;

-- name: CreateRenderJob :one
INSERT INTO render_jobs (
    workspace_id, artifact_id, document_type, document_id, idempotency_key, status, attempts, finished_at
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING *;

-- ================= Files & File Links =================

-- name: CreateFileRecord :one
INSERT INTO files (
    workspace_id, uploaded_by_user_id, file_class, original_filename, mime_type, byte_size,
    sha256_hash, provider, provider_public_id, provider_resource_type, provider_delivery_type,
    provider_version, scan_status, retention_policy, storage_reservation_id
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
RETURNING *;

-- name: GetFileByID :one
SELECT * FROM files WHERE id = $1 AND workspace_id = $2;

-- name: ListFilesByWorkspace :many
SELECT *
FROM files
WHERE workspace_id = $1 AND deletion_status <> 'deleted'
ORDER BY created_at DESC, id DESC
LIMIT $2;

-- name: FinalizeFileUpload :one
UPDATE files
SET sha256_hash = $3,
    provider_version = $4,
    scan_status = $5,
    file_class = CASE WHEN $5 = 'quarantined' THEN 'quarantined' ELSE file_class END,
    updated_at = now()
WHERE id = $1 AND workspace_id = $2
RETURNING *;

-- name: UpdateFileDeletionStatus :one
UPDATE files
SET deletion_status = $3,
    updated_at = now()
WHERE id = $1 AND workspace_id = $2
RETURNING *;

-- name: CreateFileLink :one
INSERT INTO file_links (file_id, workspace_id, resource_type, resource_id, linked_by_user_id)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: UnlinkFileLink :one
UPDATE file_links
SET unlinked_at = now()
WHERE id = $1 AND workspace_id = $2 AND unlinked_at IS NULL
RETURNING *;

-- name: CountActiveFileLinks :one
SELECT COUNT(*)::bigint
FROM file_links
WHERE file_id = $1 AND workspace_id = $2 AND unlinked_at IS NULL;

-- ================= Share Grants & Guest Portal =================

-- name: CreateShareGrant :one
INSERT INTO share_grants (
    workspace_id, token_hash, resource_type, resource_id, artifact_id, version,
    permissions, purpose, created_by_user_id, expires_at
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
RETURNING *;

-- name: ListShareGrantsByDocument :many
SELECT *
FROM share_grants
WHERE workspace_id = $1 AND resource_type = $2 AND resource_id = $3
ORDER BY created_at DESC, id DESC;

-- name: GetShareGrantByTokenHash :one
SELECT *
FROM share_grants
WHERE token_hash = $1;

-- name: RevokeShareGrant :one
UPDATE share_grants
SET revoked_at = now(),
    revoked_by_user_id = $3
WHERE id = $1 AND workspace_id = $2 AND revoked_at IS NULL
RETURNING *;

-- name: RevokeShareGrantsForFile :exec
UPDATE share_grants
SET revoked_at = now(),
    revoked_by_user_id = $3
WHERE workspace_id = $1 AND resource_type = 'file' AND resource_id = $2 AND revoked_at IS NULL;

-- name: RecordShareAccessCounter :exec
UPDATE share_grants
SET access_count = access_count + CASE WHEN $2 = 'viewed' THEN 1 ELSE 0 END,
    download_count = download_count + CASE WHEN $2 = 'downloaded' THEN 1 ELSE 0 END,
    last_accessed_at = now()
WHERE id = $1;

-- name: CreateShareAccessEvent :one
INSERT INTO share_access_events (share_grant_id, workspace_id, event_type, ip_hash, user_agent_redacted)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- ================= Deliveries, Suppressions & Webhooks =================

-- name: IsEmailSuppressed :one
SELECT * FROM email_suppressions WHERE workspace_id = $1 AND email_digest = $2 LIMIT 1;

-- name: UpsertEmailSuppression :one
INSERT INTO email_suppressions (workspace_id, email_digest, email_masked, reason, provider_event_id)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (workspace_id, email_digest) DO UPDATE SET reason = EXCLUDED.reason
RETURNING *;

-- name: GetDeliveryByIdemp :one
SELECT * FROM deliveries WHERE workspace_id = $1 AND idempotency_key = $2;

-- name: GetDeliveryByID :one
SELECT * FROM deliveries WHERE id = $1 AND workspace_id = $2;

-- name: GetDeliveryByProviderMsgID :one
SELECT * FROM deliveries WHERE provider_message_id = $1 AND provider_message_id <> '' LIMIT 1;

-- name: ListDeliveriesByDocument :many
SELECT *
FROM deliveries
WHERE workspace_id = $1 AND document_type = $2 AND document_id = $3
ORDER BY created_at DESC, id DESC;

-- name: CreateDelivery :one
INSERT INTO deliveries (
    workspace_id, document_type, document_id, artifact_id, share_grant_id, channel,
    recipient_masked, recipient_digest, template_key, template_version, status, provider,
    provider_message_id, idempotency_key, attempts, is_resend, resend_of_delivery_id,
    last_error_class, last_error_message, created_by_user_id
) VALUES (
    $1, $2, $3, $4, $5, $6,
    $7, $8, $9, $10, $11, $12,
    $13, $14, $15, $16, $17,
    $18, $19, $20
)
RETURNING *;

-- name: UpdateDeliveryStatus :one
UPDATE deliveries
SET status = $3,
    provider_message_id = CASE WHEN $4 <> '' THEN $4 ELSE provider_message_id END,
    attempts = $5,
    last_error_class = $6,
    last_error_message = $7,
    updated_at = now()
WHERE id = $1 AND workspace_id = $2
RETURNING *;

-- name: CreateDeliveryAttempt :one
INSERT INTO delivery_attempts (
    delivery_id, workspace_id, attempt_number, status, provider_message_id, error_class, error_message, retryable
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING *;

-- name: CreateEmailWebhookEvent :one
INSERT INTO email_webhook_events (provider, event_id, event_type, provider_message_id, signature_valid, event_occurred_at, processing_state)
VALUES ($1, $2, $3, $4, $5, $6, $7)
ON CONFLICT (provider, event_id) DO NOTHING
RETURNING *;
