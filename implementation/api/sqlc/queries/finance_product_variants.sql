-- name: CreateProductOption :one
INSERT INTO product_options (
    workspace_id, product_id, name, position
) VALUES (
    $1, $2, $3, $4
) RETURNING *;

-- name: ListProductOptions :many
SELECT * FROM product_options
WHERE workspace_id = $1 AND product_id = $2
ORDER BY position ASC, id ASC;

-- name: CreateProductOptionValue :one
INSERT INTO product_option_values (
    workspace_id, option_id, product_id, value, position
) VALUES (
    $1, $2, $3, $4, $5
) RETURNING *;

-- name: ListProductOptionValues :many
SELECT * FROM product_option_values
WHERE workspace_id = $1 AND product_id = $2
ORDER BY option_id ASC, position ASC, id ASC;

-- name: CreateVariant :one
INSERT INTO product_variants (
    workspace_id, product_id, name, sku, barcode,
    selling_price_minor, cost_price_minor, currency, currency_exponent,
    is_default, is_active
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
) RETURNING *;

-- name: GetVariantByID :one
SELECT * FROM product_variants
WHERE workspace_id = $1 AND id = $2;

-- name: ListVariantsByProductID :many
SELECT * FROM product_variants
WHERE workspace_id = $1 AND product_id = $2
ORDER BY is_default DESC, id ASC;

-- name: UpdateVariant :one
UPDATE product_variants
SET name = $3,
    sku = $4,
    barcode = $5,
    selling_price_minor = $6,
    cost_price_minor = $7,
    is_active = $8,
    updated_at = now()
WHERE workspace_id = $1 AND id = $2
RETURNING *;

-- name: BindVariantOptionValue :exec
INSERT INTO variant_option_values (
    workspace_id, variant_id, option_value_id
) VALUES (
    $1, $2, $3
) ON CONFLICT (variant_id, option_value_id) DO NOTHING;

-- name: ListVariantOptionValuesForProduct :many
SELECT vov.variant_id, pov.id as option_value_id, pov.option_id, po.name as option_name, pov.value as option_value
FROM variant_option_values vov
JOIN product_option_values pov ON pov.id = vov.option_value_id
JOIN product_options po ON po.id = pov.option_id
WHERE vov.workspace_id = $1 AND pov.product_id = $2
ORDER BY vov.variant_id ASC, po.position ASC;

-- name: UpdateProductOption :exec
UPDATE product_options SET name = @name, position = @position
WHERE workspace_id = @workspace_id AND product_id = @product_id AND id = @id;

-- name: UpdateProductOptionValue :exec
UPDATE product_option_values SET value = @value, position = @position
WHERE workspace_id = @workspace_id AND product_id = @product_id AND option_id = @option_id AND id = @id;

-- name: UpdateOptionVariant :one
UPDATE product_variants SET name = @name, sku = sqlc.narg('sku'), barcode = sqlc.narg('barcode'),
  selling_price_minor = @selling_price_minor, cost_price_minor = @cost_price_minor,
  compare_at_price_minor = sqlc.narg('compare_at_price_minor'), is_active = @is_active,
  archived_at = NULL, position = @position, updated_at = now()
WHERE workspace_id = @workspace_id AND product_id = @product_id AND id = @id AND NOT is_default
RETURNING *;

-- name: ArchiveOptionVariant :exec
UPDATE product_variants SET is_active = false, archived_at = now(), updated_at = now()
WHERE workspace_id = @workspace_id AND product_id = @product_id AND id = @id AND NOT is_default;

-- name: DeleteUnusedOptionVariant :execrows
DELETE FROM product_variants v WHERE v.workspace_id = @workspace_id AND v.product_id = @product_id
  AND v.id = @id AND NOT v.is_default
  AND NOT EXISTS (SELECT 1 FROM inventory_balances b WHERE b.workspace_id = v.workspace_id AND b.variant_id = v.id)
  AND NOT EXISTS (SELECT 1 FROM inventory_movements m WHERE m.workspace_id = v.workspace_id AND m.variant_id = v.id)
  AND NOT EXISTS (SELECT 1 FROM sale_items si WHERE si.workspace_id = v.workspace_id AND si.variant_id = v.id)
  AND NOT EXISTS (SELECT 1 FROM purchase_items pi WHERE pi.workspace_id = v.workspace_id AND pi.variant_id = v.id)
  AND NOT EXISTS (SELECT 1 FROM invoice_items ii WHERE ii.workspace_id = v.workspace_id AND ii.variant_id = v.id)
  AND NOT EXISTS (SELECT 1 FROM product_price_history ph WHERE ph.workspace_id = v.workspace_id AND ph.variant_id = v.id);

-- name: ClearVariantOptionValues :exec
DELETE FROM variant_option_values WHERE workspace_id = @workspace_id AND variant_id = @variant_id;

-- name: CountVariantStock :one
SELECT COALESCE(SUM(quantity_on_hand), 0)::numeric FROM inventory_balances
WHERE workspace_id = @workspace_id AND variant_id = @variant_id;

-- name: ListVariantStockByProduct :many
SELECT b.variant_id, b.location_id, l.name AS location_name, b.quantity_on_hand
FROM inventory_balances b JOIN inventory_locations l ON l.id = b.location_id AND l.workspace_id = b.workspace_id
WHERE b.workspace_id = @workspace_id AND b.product_id = @product_id
ORDER BY b.variant_id, l.name;

-- name: DeleteProductOptionsByProductID :exec
DELETE FROM product_options WHERE workspace_id = @workspace_id AND product_id = @product_id;

-- name: ArchiveAllOptionVariantsByProductID :exec
UPDATE product_variants SET is_active = false, archived_at = now(), updated_at = now()
WHERE workspace_id = @workspace_id AND product_id = @product_id AND NOT is_default;
