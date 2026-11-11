-- name: CreateSupplierAdvance :one
INSERT INTO supplier_advances (
    workspace_id, supplier_id, payment_id, currency, currency_exponent,
    original_minor, available_minor, created_by_user_id
) VALUES ($1, $2, $3, $4, $5, $6, $6, $7)
RETURNING *;

-- name: GetSupplierAdvanceForUpdate :one
SELECT * FROM supplier_advances
WHERE workspace_id = $1 AND id = $2
FOR UPDATE;

-- name: GetSupplierAdvanceByID :one
SELECT * FROM supplier_advances
WHERE workspace_id = $1 AND id = $2;

-- name: GetSupplierAdvanceByIdempotency :one
SELECT sa.*
FROM supplier_advances sa
JOIN payments p ON p.id = sa.payment_id AND p.workspace_id = sa.workspace_id
WHERE sa.workspace_id = $1 AND p.idempotency_key = $2;

-- name: ListSupplierAdvances :many
SELECT * FROM supplier_advances
WHERE workspace_id = $1
  AND (sqlc.narg('supplier_id')::bigint IS NULL OR supplier_id = sqlc.narg('supplier_id'))
  AND (sqlc.narg('before_id')::bigint IS NULL OR id < sqlc.narg('before_id'))
ORDER BY id DESC
LIMIT $2;

-- name: ApplySupplierAdvance :one
UPDATE supplier_advances
SET available_minor = available_minor - $3,
    status = CASE
        WHEN available_minor - $3 = 0 THEN 'applied'
        ELSE 'partially_applied'
    END,
    version = version + 1,
    updated_at = now()
WHERE workspace_id = $1
  AND id = $2
  AND available_minor >= $3
  AND status IN ('open', 'partially_applied')
RETURNING *;

-- name: CreateSupplierAdvanceApplication :one
INSERT INTO supplier_advance_applications (
    workspace_id, supplier_advance_id, supplier_bill_id, amount_minor,
    idempotency_key, created_by_user_id
) VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: GetSupplierAdvanceApplicationByIdempotency :one
SELECT * FROM supplier_advance_applications
WHERE workspace_id = $1 AND idempotency_key = $2;
