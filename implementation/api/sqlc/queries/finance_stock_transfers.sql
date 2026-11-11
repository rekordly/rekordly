-- name: CreateStockTransfer :one
INSERT INTO stock_transfers (
    workspace_id, transfer_number, source_location_id, destination_location_id,
    status, notes, idempotency_key, created_by_user_id
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING *;

-- name: GetStockTransfer :one
SELECT st.*, 
       src.name AS source_location_name,
       dst.name AS destination_location_name
FROM stock_transfers st
JOIN inventory_locations src ON src.id = st.source_location_id AND src.workspace_id = st.workspace_id
JOIN inventory_locations dst ON dst.id = st.destination_location_id AND dst.workspace_id = st.workspace_id
WHERE st.workspace_id = $1 AND st.id = $2;

-- name: GetStockTransferForUpdate :one
SELECT * FROM stock_transfers
WHERE workspace_id = $1 AND id = $2 FOR UPDATE;

-- name: GetStockTransferByIdempotency :one
SELECT * FROM stock_transfers
WHERE workspace_id = $1 AND idempotency_key = $2;

-- name: UpdateStockTransferStatus :one
UPDATE stock_transfers
SET status = $3,
    dispatched_at = COALESCE($4, dispatched_at),
    received_at = COALESCE($5, received_at),
    updated_at = now()
WHERE workspace_id = $1 AND id = $2
RETURNING *;

-- name: ListStockTransfers :many
SELECT st.*, 
       src.name AS source_location_name,
       dst.name AS destination_location_name
FROM stock_transfers st
JOIN inventory_locations src ON src.id = st.source_location_id AND src.workspace_id = st.workspace_id
JOIN inventory_locations dst ON dst.id = st.destination_location_id AND dst.workspace_id = st.workspace_id
WHERE st.workspace_id = $1
  AND (sqlc.narg('status')::text IS NULL OR st.status = sqlc.narg('status'))
  AND (sqlc.narg('location_id')::bigint IS NULL OR st.source_location_id = sqlc.narg('location_id') OR st.destination_location_id = sqlc.narg('location_id'))
ORDER BY st.id DESC
LIMIT $2;

-- name: CreateStockTransferLine :one
INSERT INTO stock_transfer_lines (
    workspace_id, transfer_id, product_id, variant_id,
    quantity_requested, quantity_dispatched, quantity_received, unit_cost_minor
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING *;

-- name: ListStockTransferLines :many
SELECT stl.*, p.name AS product_name, p.kind AS product_kind, pv.name AS variant_name
FROM stock_transfer_lines stl
JOIN products p ON p.id = stl.product_id AND p.workspace_id = stl.workspace_id
LEFT JOIN product_variants pv ON pv.id = stl.variant_id AND pv.workspace_id = stl.workspace_id
WHERE stl.workspace_id = $1 AND stl.transfer_id = $2
ORDER BY stl.id ASC;

-- name: UpdateStockTransferLineQuantities :one
UPDATE stock_transfer_lines
SET quantity_dispatched = $4,
    quantity_received = $5,
    unit_cost_minor = $6
WHERE workspace_id = $1 AND transfer_id = $2 AND id = $3
RETURNING *;
