-- name: CreateEstimate :one
INSERT INTO estimates (
    workspace_id, estimate_number, customer_id, customer_name,
    issue_date, expiry_date, currency, currency_exponent,
    subtotal_minor, tax_amount_minor, total_amount_minor,
    status, notes, terms, idempotency_key, created_by_user_id
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
) RETURNING *;

-- name: GetEstimateByID :one
SELECT * FROM estimates
WHERE id = $1 AND workspace_id = $2;

-- name: GetEstimateByIDForUpdate :one
SELECT * FROM estimates
WHERE id = $1 AND workspace_id = $2
FOR UPDATE;

-- name: GetEstimateByIdempotency :one
SELECT * FROM estimates
WHERE workspace_id = $1 AND idempotency_key = $2;

-- name: GetEstimateByNumber :one
SELECT * FROM estimates
WHERE workspace_id = $1 AND lower(estimate_number) = lower($2);

-- name: ListEstimates :many
SELECT * FROM estimates
WHERE workspace_id = $1
  AND (sqlc.narg('from_date')::date IS NULL OR issue_date >= sqlc.narg('from_date'))
  AND (sqlc.narg('to_date')::date IS NULL OR issue_date <= sqlc.narg('to_date'))
  AND (sqlc.narg('status')::text IS NULL OR status = sqlc.narg('status'))
  AND (sqlc.narg('customer_id')::bigint IS NULL OR customer_id = sqlc.narg('customer_id'))
  AND (sqlc.narg('before_id')::bigint IS NULL OR id < sqlc.narg('before_id'))
  AND (sqlc.narg('search')::text IS NULL OR estimate_number ILIKE '%' || sqlc.narg('search')::text || '%' OR customer_name ILIKE '%' || sqlc.narg('search')::text || '%')
ORDER BY issue_date DESC, id DESC
LIMIT $2;

-- name: UpdateDraftEstimate :one
UPDATE estimates
SET customer_id = $3,
    customer_name = $4,
    issue_date = $5,
    expiry_date = $6,
    subtotal_minor = $7,
    tax_amount_minor = $8,
    total_amount_minor = $9,
    notes = $10,
    terms = $11,
    updated_at = now()
WHERE id = $1 AND workspace_id = $2 AND status = 'draft'
RETURNING *;

-- name: UpdateEstimateStatus :one
UPDATE estimates
SET status = $3,
    updated_at = now()
WHERE id = $1 AND workspace_id = $2
RETURNING *;

-- name: MarkEstimateConverted :one
UPDATE estimates
SET status = 'converted',
    converted_invoice_id = $3,
    updated_at = now()
WHERE id = $1 AND workspace_id = $2
RETURNING *;

-- name: CreateEstimateItem :one
INSERT INTO estimate_items (
    estimate_id, workspace_id, description, quantity,
    unit_price_minor, amount_minor
) VALUES (
    $1, $2, $3, $4, $5, $6
) RETURNING *;

-- name: ListEstimateItems :many
SELECT * FROM estimate_items
WHERE estimate_id = $1 AND workspace_id = $2
ORDER BY id ASC;

-- name: DeleteEstimateItems :exec
DELETE FROM estimate_items
WHERE estimate_id = $1 AND workspace_id = $2;
