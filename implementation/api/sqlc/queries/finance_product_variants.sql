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
