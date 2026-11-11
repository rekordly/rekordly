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
