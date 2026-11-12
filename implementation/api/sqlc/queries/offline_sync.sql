-- name: CreateOfflineSyncSession :one
INSERT INTO offline_sync_sessions (
    user_id,
    workspace_id,
    installation_id,
    client_app_version,
    client_schema_version,
    manifest_version,
    entitlement_revision,
    permission_revision,
    status,
    client_timezone,
    expires_at
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, 'active', $9, $10
)
RETURNING *;

-- name: GetOfflineSyncSessionByUUID :one
SELECT * FROM offline_sync_sessions
WHERE session_uuid = $1 AND user_id = $2 AND workspace_id = $3;

-- name: CompleteOfflineSyncSession :one
UPDATE offline_sync_sessions
SET
    status = 'completed',
    command_count = $4,
    confirmed_count = $5,
    conflict_count = $6,
    failed_count = $7,
    completed_at = now(),
    updated_at = now()
WHERE session_uuid = $1 AND user_id = $2 AND workspace_id = $3
RETURNING *;

-- name: GetClientCommandReceiptByIdempotencyKey :one
SELECT * FROM client_command_receipts
WHERE user_id = $1 AND workspace_id = $2 AND idempotency_key = $3;

-- name: GetClientCommandReceiptByCommandID :one
SELECT * FROM client_command_receipts
WHERE user_id = $1 AND workspace_id = $2 AND client_command_id = $3;

-- name: InsertProcessingClientCommandReceipt :one
INSERT INTO client_command_receipts (
    user_id,
    workspace_id,
    sync_session_id,
    installation_id,
    client_command_id,
    idempotency_key,
    supersedes_client_command_id,
    command_type,
    schema_version,
    payload_hash,
    base_versions_json,
    dependencies_json,
    status,
    client_created_at
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'processing', $13
)
RETURNING *;

-- name: UpdateClientCommandReceiptOutcome :one
UPDATE client_command_receipts
SET
    status = $4,
    conflict_code = $5,
    safe_message = $6,
    conflict_fields_json = $7,
    allowed_resolutions_json = $8,
    current_snapshot_json = $9,
    server_resource_type = $10,
    server_resource_id = $11,
    server_resource_version = $12,
    local_id_mappings_json = $13,
    result_json = $14,
    http_status = $15,
    completed_at = CASE WHEN $4 IN ('confirmed', 'needs_review', 'failed_permanent', 'unsupported_version') THEN now() ELSE completed_at END,
    updated_at = now()
WHERE id = $1 AND user_id = $2 AND workspace_id = $3
RETURNING *;

-- name: ListRecentClientCommandReceipts :many
SELECT * FROM client_command_receipts
WHERE user_id = $1 AND workspace_id = $2
ORDER BY received_at DESC, id DESC
LIMIT $3;

-- name: InsertOfflineSyncEvent :one
INSERT INTO offline_sync_events (
    user_id,
    workspace_id,
    installation_id,
    client_command_id,
    command_type,
    schema_version,
    outcome,
    conflict_code,
    duration_ms
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9
)
RETURNING *;

-- name: CountOfflineSyncEventsByOutcome :many
SELECT outcome, COUNT(*)::bigint AS total
FROM offline_sync_events
WHERE workspace_id = $1 AND created_at >= $2
GROUP BY outcome;
