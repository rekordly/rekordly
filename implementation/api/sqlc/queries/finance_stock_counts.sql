-- name: CreateStockCount :one
INSERT INTO stock_counts (
    workspace_id, count_number, location_id, scope,
    status, notes, idempotency_key, created_by_user_id
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING *;

-- name: GetStockCount :one
SELECT sc.*, il.name AS location_name
FROM stock_counts sc
JOIN inventory_locations il ON il.id = sc.location_id AND il.workspace_id = sc.workspace_id
WHERE sc.workspace_id = $1 AND sc.id = $2;

-- name: GetStockCountForUpdate :one
SELECT * FROM stock_counts
WHERE workspace_id = $1 AND id = $2 FOR UPDATE;

-- name: GetStockCountByIdempotency :one
SELECT * FROM stock_counts
WHERE workspace_id = $1 AND idempotency_key = $2;

-- name: UpdateStockCountStatus :one
UPDATE stock_counts
SET status = $3,
    counted_at = COALESCE($4, counted_at),
    updated_at = now()
WHERE workspace_id = $1 AND id = $2
RETURNING *;

-- name: ListStockCounts :many
SELECT sc.*, il.name AS location_name
FROM stock_counts sc
JOIN inventory_locations il ON il.id = sc.location_id AND il.workspace_id = sc.workspace_id
WHERE sc.workspace_id = $1
  AND (sqlc.narg('location_id')::bigint IS NULL OR sc.location_id = sqlc.narg('location_id'))
  AND (sqlc.narg('status')::text IS NULL OR sc.status = sqlc.narg('status'))
ORDER BY sc.id DESC
LIMIT $2;

-- name: CreateStockCountLine :one
INSERT INTO stock_count_lines (
    workspace_id, count_id, product_id, variant_id,
    expected_quantity, counted_quantity, variance_quantity, unit_cost_minor
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING *;

-- name: ListStockCountLines :many
SELECT scl.*, p.name AS product_name, p.kind AS product_kind, pv.name AS variant_name
FROM stock_count_lines scl
JOIN products p ON p.id = scl.product_id AND p.workspace_id = scl.workspace_id
LEFT JOIN product_variants pv ON pv.id = scl.variant_id AND pv.workspace_id = scl.workspace_id
WHERE scl.workspace_id = $1 AND scl.count_id = $2
ORDER BY scl.id ASC;

-- name: UpdateStockCountLineCount :one
UPDATE stock_count_lines
SET counted_quantity = $4,
    variance_quantity = $5,
    unit_cost_minor = $6
WHERE workspace_id = $1 AND count_id = $2 AND id = $3
RETURNING *;
