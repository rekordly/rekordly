-- name: CreateSaleItem :one
INSERT INTO sale_items (workspace_id, sale_id, product_id, variant_id, description, quantity, unit_price_minor, amount_minor)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING *;

-- name: ListSaleItems :many
SELECT * FROM sale_items WHERE workspace_id = $1 AND sale_id = $2 ORDER BY id;

-- name: CreatePurchaseItem :one
INSERT INTO purchase_items (workspace_id, purchase_id, product_id, variant_id, description, quantity, unit_cost_minor, amount_minor)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING *;

-- name: ListPurchaseItems :many
SELECT * FROM purchase_items WHERE workspace_id = $1 AND purchase_id = $2 ORDER BY id;

-- name: SetSaleLocation :exec
UPDATE sales SET location_id = $3 WHERE workspace_id = $1 AND id = $2;

-- name: SetPurchaseLocation :exec
UPDATE purchases SET location_id = $3 WHERE workspace_id = $1 AND id = $2;

-- name: ListMovementsBySource :many
SELECT * FROM inventory_movements
WHERE workspace_id = $1 AND source_type = $2 AND source_id = $3
ORDER BY id;

-- name: ListProductMovements :many
SELECT m.id, m.movement_type, m.source_type, m.source_id, m.quantity_delta, m.value_delta_minor,
       m.occurred_on, m.created_at, m.location_id,
       COALESCE(l.name, '')::text AS location_name,
       COALESCE(sa.reference, pu.reference, inv.invoice_number, ad.adjustment_number, '')::text AS source_reference,
       COALESCE(sa.customer_name, pu.supplier_name, inv.customer_name, ad.reason_code, '')::text AS source_party
FROM inventory_movements m
LEFT JOIN inventory_locations l ON l.id = m.location_id
LEFT JOIN sales sa ON m.source_type = 'sale' AND sa.id = m.source_id
LEFT JOIN purchases pu ON m.source_type = 'purchase' AND pu.id = m.source_id
LEFT JOIN invoices inv ON m.source_type = 'invoice' AND inv.id = m.source_id
LEFT JOIN stock_adjustments ad ON m.source_type = 'inventory_adjustment' AND ad.id = m.source_id
WHERE m.workspace_id = $1 AND m.product_id = $2
  AND (sqlc.narg('before_id')::bigint IS NULL OR m.id < sqlc.narg('before_id')::bigint)
ORDER BY m.occurred_on DESC, m.id DESC
LIMIT $3;
