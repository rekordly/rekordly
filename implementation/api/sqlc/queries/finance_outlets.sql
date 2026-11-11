-- name: CreateInventoryLocation :one
INSERT INTO inventory_locations (
    workspace_id, name, location_type, code, address, phone, is_default, is_active
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8
) RETURNING *;

-- name: GetInventoryLocationByID :one
SELECT * FROM inventory_locations
WHERE workspace_id = $1 AND id = $2;

-- name: GetInventoryLocationByCode :one
SELECT * FROM inventory_locations
WHERE workspace_id = $1 AND lower(code) = lower($2);

-- name: GetDefaultInventoryLocation :one
SELECT * FROM inventory_locations
WHERE workspace_id = $1 AND is_default = true AND is_active = true
LIMIT 1;

-- name: ListInventoryLocations :many
SELECT * FROM inventory_locations
WHERE workspace_id = $1
  AND (sqlc.narg('is_active')::boolean IS NULL OR is_active = sqlc.narg('is_active'))
ORDER BY is_default DESC, id ASC;

-- name: UpdateInventoryLocation :one
UPDATE inventory_locations
SET name = $3,
    location_type = $4,
    code = $5,
    address = $6,
    phone = $7,
    is_active = $8,
    updated_at = now()
WHERE workspace_id = $1 AND id = $2
RETURNING *;

-- name: ClearDefaultInventoryLocation :exec
UPDATE inventory_locations
SET is_default = false,
    updated_at = now()
WHERE workspace_id = $1;

-- name: SetDefaultInventoryLocation :one
UPDATE inventory_locations
SET is_default = true,
    updated_at = now()
WHERE workspace_id = $1 AND id = $2
RETURNING *;
