-- name: CreateStockAdjustment :one
INSERT INTO stock_adjustments (
    workspace_id, adjustment_number, location_id, reason_code,
    notes, idempotency_key, created_by_user_id
) VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING *;

-- name: GetStockAdjustment :one
SELECT sa.*, il.name AS location_name
FROM stock_adjustments sa
JOIN inventory_locations il ON il.id = sa.location_id AND il.workspace_id = sa.workspace_id
WHERE sa.workspace_id = $1 AND sa.id = $2;

-- name: GetStockAdjustmentByIdempotency :one
SELECT * FROM stock_adjustments
WHERE workspace_id = $1 AND idempotency_key = $2;

-- name: ListStockAdjustments :many
SELECT sa.*, il.name AS location_name
FROM stock_adjustments sa
JOIN inventory_locations il ON il.id = sa.location_id AND il.workspace_id = sa.workspace_id
WHERE sa.workspace_id = $1
  AND (sqlc.narg('location_id')::bigint IS NULL OR sa.location_id = sqlc.narg('location_id'))
  AND (sqlc.narg('reason_code')::text IS NULL OR sa.reason_code = sqlc.narg('reason_code'))
ORDER BY sa.id DESC
LIMIT $2;

-- name: CreateStockAdjustmentLine :one
INSERT INTO stock_adjustment_lines (
    workspace_id, adjustment_id, product_id, variant_id,
    quantity_delta, unit_cost_minor, total_cost_minor
) VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING *;

-- name: ListStockAdjustmentLines :many
SELECT sal.*, p.name AS product_name, p.kind AS product_kind, pv.name AS variant_name
FROM stock_adjustment_lines sal
JOIN products p ON p.id = sal.product_id AND p.workspace_id = sal.workspace_id
LEFT JOIN product_variants pv ON pv.id = sal.variant_id AND pv.workspace_id = sal.workspace_id
WHERE sal.workspace_id = $1 AND sal.adjustment_id = $2
ORDER BY sal.id ASC;
