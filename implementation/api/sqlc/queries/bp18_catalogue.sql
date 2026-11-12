-- name: UpsertReviewItem :one
INSERT INTO review_items (
    workspace_id, review_type, state, source_aggregate_type, source_aggregate_id, source_version, dedupe_key, safe_summary
) VALUES (
    $1, $2, 'open', $3, $4, $5, $6, $7
)
ON CONFLICT (workspace_id, dedupe_key) DO UPDATE SET
    source_version = GREATEST(review_items.source_version, EXCLUDED.source_version),
    safe_summary = EXCLUDED.safe_summary,
    updated_at = now()
RETURNING *;

-- name: ListReviewItemsByWorkspace :many
SELECT * FROM review_items
WHERE workspace_id = $1
ORDER BY created_at DESC, id DESC
LIMIT $2;

-- name: GetReviewItemByID :one
SELECT * FROM review_items
WHERE id = $1 AND workspace_id = $2;

-- name: TransitionReviewItemState :one
UPDATE review_items
SET state = $4, resolved_by_event_id = $5, version = version + 1, updated_at = now()
WHERE id = $1 AND workspace_id = $2 AND state = $3
RETURNING *;

-- name: RecordEventConsumption :execrows
INSERT INTO event_consumptions (consumer_name, event_id, workspace_id, event_type, event_version)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (consumer_name, event_id) DO NOTHING;
