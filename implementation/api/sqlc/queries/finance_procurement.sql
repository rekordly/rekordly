-- name: CreatePurchaseRequest :one
INSERT INTO purchase_requests (
    workspace_id, supplier_id, status, version, needed_by, reason, reference, priority,
    currency, currency_exponent, estimated_total_minor, idempotency_key, created_by_user_id
) VALUES (
    $1, $2, 'draft', 1, $3, $4, $5, $6, $7, $8, $9, $10, $11
) RETURNING *;

-- name: CreatePurchaseRequestLine :one
INSERT INTO purchase_request_lines (
    workspace_id, purchase_request_id, product_id, description, quantity, unit_name,
    estimated_unit_price_minor, estimated_line_total_minor
) VALUES (
    $1, $2, $3, $4, sqlc.arg('quantity')::numeric, $5, $6, $7
) RETURNING id;

-- name: GetPurchaseRequestByID :one
SELECT * FROM purchase_requests
WHERE id = $1 AND workspace_id = $2;

-- name: GetPurchaseRequestForUpdate :one
SELECT * FROM purchase_requests
WHERE id = $1 AND workspace_id = $2
FOR UPDATE;

-- name: GetPurchaseRequestByIdempotency :one
SELECT * FROM purchase_requests
WHERE workspace_id = $1 AND idempotency_key = $2;

-- name: GetPurchaseRequestLines :many
SELECT id, workspace_id, purchase_request_id, product_id, description,
       quantity::text AS quantity, unit_name, estimated_unit_price_minor,
       estimated_line_total_minor, created_at
FROM purchase_request_lines
WHERE workspace_id = $1 AND purchase_request_id = $2
ORDER BY id ASC;

-- name: ListPurchaseRequests :many
SELECT * FROM purchase_requests
WHERE workspace_id = $1
  AND (sqlc.narg('status')::text IS NULL OR status = sqlc.narg('status'))
  AND (sqlc.narg('before_id')::bigint IS NULL OR id < sqlc.narg('before_id'))
ORDER BY id DESC
LIMIT $2;

-- name: GetPurchaseRequestCommandByIdempotency :one
SELECT purchase_request_id, command, expected_version
FROM purchase_request_command_log
WHERE workspace_id = $1 AND idempotency_key = $2;

-- name: CreatePurchaseRequestCommand :one
INSERT INTO purchase_request_command_log (
    workspace_id, purchase_request_id, command, expected_version, idempotency_key, actor_user_id
) VALUES ($1, $2, $3, $4, $5, $6)
RETURNING id;

-- name: SubmitPurchaseRequest :one
UPDATE purchase_requests
SET status = 'submitted',
    version = version + 1,
    submitted_by_user_id = $4,
    submitted_at = now(),
    latest_decision_reason = NULL,
    updated_at = now()
WHERE id = $1 AND workspace_id = $2 AND status IN ('draft', 'changes_requested') AND version = $3
RETURNING *;
-- name: ResolvePurchaseRequest :one
UPDATE purchase_requests
SET status = $4,
    latest_decision_reason = $5,
    version = version + 1,
    updated_at = now()
WHERE id = $1 AND workspace_id = $2 AND version = $3
RETURNING *;

-- name: ApprovePurchaseRequest :one
UPDATE purchase_requests
SET status = 'approved',
    version = version + 1,
    approved_by_user_id = $4,
    approved_at = now(),
    updated_at = now()
WHERE id = $1 AND workspace_id = $2 AND status = 'submitted' AND version = $3
RETURNING *;

-- name: CreatePurchaseRequestDecision :one
INSERT INTO purchase_request_decisions (
    workspace_id, purchase_request_id, command, request_version, reason, actor_user_id
) VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: ListPurchaseRequestDecisions :many
SELECT id, workspace_id, purchase_request_id, command, request_version, reason, actor_user_id, created_at
FROM purchase_request_decisions
WHERE workspace_id = $1 AND purchase_request_id = $2
ORDER BY id ASC;

-- name: ListPurchaseRequestDecisionsWithActor :many
SELECT
    d.id, d.workspace_id, d.purchase_request_id, d.command, d.request_version, d.reason, d.actor_user_id, d.created_at,
    COALESCE(NULLIF(u.display_name, ''), 'Team')::text AS actor_name
FROM purchase_request_decisions d
LEFT JOIN users u ON u.id = d.actor_user_id
WHERE d.workspace_id = $1 AND d.purchase_request_id = $2
ORDER BY d.id ASC;

-- name: CountUnreadDocumentMessages :one
SELECT count(*)::bigint AS unread_count
FROM external_messages m
WHERE m.workspace_id = $1
  AND m.document_type = $2
  AND m.document_id = $3
  AND m.sender_type = 'guest'
  AND m.id > COALESCE(
    (SELECT last_read_message_id FROM document_message_reads r
     WHERE r.workspace_id = m.workspace_id
       AND r.user_id = $4
       AND r.document_type = m.document_type
       AND r.document_id = m.document_id),
    0
  );

-- name: UpsertDocumentMessageRead :exec
INSERT INTO document_message_reads (workspace_id, user_id, document_type, document_id, last_read_message_id, updated_at)
VALUES ($1, $2, $3, $4, $5, now())
ON CONFLICT (workspace_id, user_id, document_type, document_id)
DO UPDATE SET
  last_read_message_id = GREATEST(document_message_reads.last_read_message_id, EXCLUDED.last_read_message_id),
  updated_at = now();

-- name: InsertDocumentFile :one
INSERT INTO document_files (workspace_id, document_type, document_id, evidence_asset_id, created_by_user_id)
VALUES (@workspace_id, @document_type, @document_id, @evidence_asset_id, @created_by_user_id)
RETURNING *;

-- name: DeleteDocumentFile :execrows
DELETE FROM document_files
WHERE workspace_id = @workspace_id AND document_type = @document_type AND document_id = @document_id AND id = @id;

-- name: ListDocumentFiles :many
SELECT
    df.id, df.evidence_asset_id AS evidence_id, ea.original_file_name AS file_name, ea.mime_type, ea.byte_size AS size_bytes, df.created_at,
    COALESCE(NULLIF(u.display_name, ''), 'Team')::text AS uploaded_by_name
FROM document_files df
JOIN evidence_assets ea ON ea.id = df.evidence_asset_id AND ea.workspace_id = df.workspace_id
LEFT JOIN users u ON u.id = df.created_by_user_id
WHERE df.workspace_id = @workspace_id AND df.document_type = @document_type AND df.document_id = @document_id
ORDER BY df.created_at DESC, df.id DESC;
