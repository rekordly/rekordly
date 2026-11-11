-- name: CreateStockReservation :one
INSERT INTO stock_reservations (
    workspace_id, location_id, product_id, variant_id,
    order_id, quantity, status, expires_at, notes, idempotency_key
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
RETURNING *;

-- name: GetStockReservation :one
SELECT * FROM stock_reservations
WHERE workspace_id = $1 AND id = $2;

-- name: GetStockReservationForUpdate :one
SELECT * FROM stock_reservations
WHERE workspace_id = $1 AND id = $2 FOR UPDATE;

-- name: GetStockReservationByIdempotency :one
SELECT * FROM stock_reservations
WHERE workspace_id = $1 AND idempotency_key = $2;

-- name: UpdateStockReservationStatus :one
UPDATE stock_reservations
SET status = $3,
    updated_at = now()
WHERE workspace_id = $1 AND id = $2
RETURNING *;

-- name: ListStockReservations :many
SELECT sr.*, il.name AS location_name, p.name AS product_name
FROM stock_reservations sr
JOIN inventory_locations il ON il.id = sr.location_id AND il.workspace_id = sr.workspace_id
JOIN products p ON p.id = sr.product_id AND p.workspace_id = sr.workspace_id
WHERE sr.workspace_id = $1
  AND (sqlc.narg('location_id')::bigint IS NULL OR sr.location_id = sqlc.narg('location_id'))
  AND (sqlc.narg('product_id')::bigint IS NULL OR sr.product_id = sqlc.narg('product_id'))
  AND (sqlc.narg('status')::text IS NULL OR sr.status = sqlc.narg('status'))
ORDER BY sr.id DESC
LIMIT $2;
