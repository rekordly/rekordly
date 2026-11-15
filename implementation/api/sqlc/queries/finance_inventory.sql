-- name: GetOrCreateDefaultInventoryLocation :one
INSERT INTO inventory_locations (workspace_id, name, location_type)
VALUES ($1, 'Main outlet', 'outlet')
ON CONFLICT (workspace_id, name) DO UPDATE SET updated_at = now()
RETURNING *;

-- name: GetInventoryLocation :one
SELECT * FROM inventory_locations WHERE workspace_id = $1 AND id = $2 AND is_active = true;

-- name: CreateInventoryCostingSettings :one
INSERT INTO inventory_costing_settings (workspace_id, currency)
VALUES ($1, $2)
ON CONFLICT (workspace_id) DO UPDATE SET updated_at = now()
RETURNING *;

-- name: GetCostingSettings :one
SELECT * FROM inventory_costing_settings WHERE workspace_id = $1;

-- name: CreateInventoryOpeningEntry :one
INSERT INTO inventory_opening_entries (
    workspace_id, location_id, product_id, quantity, unit_cost_minor,
    value_minor, effective_on, reason, idempotency_key, created_by_user_id
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
RETURNING *;

-- name: GetInventoryOpeningByIdempotency :one
SELECT * FROM inventory_opening_entries WHERE workspace_id = $1 AND idempotency_key = $2;

-- name: CreateInventoryMovement :one
INSERT INTO inventory_movements (
    workspace_id, product_id, variant_id, goods_receipt_line_id, location_id,
    movement_type, source_type, source_id, quantity_delta, value_delta_minor, occurred_on
) VALUES (@workspace_id, @product_id,
    COALESCE(sqlc.narg('variant_id')::bigint,
      (SELECT v.id FROM product_variants v WHERE v.workspace_id = @workspace_id AND v.product_id = @product_id AND v.is_default)),
    @goods_receipt_line_id, @location_id, @movement_type, @source_type, @source_id,
    @quantity_delta, @value_delta_minor, @occurred_on)
RETURNING *;

-- name: UpsertInventoryBalance :one
INSERT INTO inventory_balances (
    workspace_id, location_id, product_id, variant_id, quantity_on_hand, value_on_hand_minor
) SELECT @workspace_id, @location_id, @product_id,
    COALESCE(sqlc.narg('variant_id')::bigint,
      (SELECT v.id FROM product_variants v WHERE v.workspace_id = @workspace_id AND v.product_id = @product_id AND v.is_default)),
    @quantity_on_hand, @value_on_hand_minor
  FROM products p WHERE p.workspace_id = @workspace_id AND p.id = @product_id
ON CONFLICT (workspace_id, location_id, variant_id) DO UPDATE
SET quantity_on_hand = inventory_balances.quantity_on_hand + EXCLUDED.quantity_on_hand,
    value_on_hand_minor = inventory_balances.value_on_hand_minor + EXCLUDED.value_on_hand_minor,
    version = inventory_balances.version + 1,
    updated_at = now()
RETURNING *;

-- name: GetInventoryBalance :one
SELECT * FROM inventory_balances b WHERE b.workspace_id = @workspace_id AND b.location_id = @location_id
  AND variant_id = COALESCE(sqlc.narg('variant_id')::bigint,
      (SELECT v.id FROM product_variants v WHERE v.workspace_id = @workspace_id AND v.product_id = @product_id AND v.is_default));

-- name: UpdateInventoryBalanceQuantities :one
UPDATE inventory_balances b
SET quantity_on_hand = @quantity_on_hand,
    reserved_quantity = @reserved_quantity,
    in_transit_quantity = @in_transit_quantity,
    value_on_hand_minor = @value_on_hand_minor,
    version = version + 1,
    updated_at = now()
WHERE b.workspace_id = @workspace_id AND b.location_id = @location_id
  AND b.variant_id = COALESCE(sqlc.narg('variant_id')::bigint,
      (SELECT v.id FROM product_variants v WHERE v.workspace_id = @workspace_id AND v.product_id = @product_id AND v.is_default))
RETURNING *;

-- name: ListInventoryBalances :many
SELECT ib.*, il.name AS location_name, p.name AS product_name, p.kind AS product_kind
FROM inventory_balances ib
JOIN inventory_locations il ON il.id = ib.location_id AND il.workspace_id = ib.workspace_id
JOIN products p ON p.id = ib.product_id AND p.workspace_id = ib.workspace_id
WHERE ib.workspace_id = $1
  AND (sqlc.narg('location_id')::bigint IS NULL OR ib.location_id = sqlc.narg('location_id'))
  AND (sqlc.narg('before_id')::bigint IS NULL OR ib.id < sqlc.narg('before_id'))
ORDER BY ib.id DESC
LIMIT $2;
