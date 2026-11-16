-- name: CreateProduct :one
INSERT INTO products (
    workspace_id, name, description, kind, status, unit_name, idempotency_key, created_by_user_id, show_on_store
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9
) RETURNING *;

-- name: GetProductByID :one
SELECT * FROM products
WHERE id = $1 AND workspace_id = $2;

-- name: GetProductByIdempotency :one
SELECT * FROM products
WHERE workspace_id = $1 AND idempotency_key = $2;

-- name: CreateProductVariant :one
INSERT INTO product_variants (
    workspace_id, product_id, name, sku, barcode, selling_price_minor,
    currency, currency_exponent, is_default, is_active
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
) RETURNING *;

-- name: GetDefaultProductVariant :one
SELECT * FROM product_variants
WHERE workspace_id = $1 AND product_id = $2 AND is_default = true;

-- name: ListCatalogueItems :many
SELECT
    p.id, p.workspace_id, p.name, p.description, p.kind, p.status, p.unit_name,
    p.created_by_user_id, p.created_at, p.updated_at,
    v.id AS default_variant_id, v.sku, v.barcode, v.selling_price_minor,
    v.currency, v.currency_exponent
FROM products p
JOIN product_variants v ON v.product_id = p.id AND v.workspace_id = p.workspace_id AND v.is_default = true
WHERE p.workspace_id = $1
  AND (sqlc.narg('search')::text IS NULL OR p.name ILIKE '%' || sqlc.narg('search')::text || '%' OR v.sku ILIKE '%' || sqlc.narg('search')::text || '%')
  AND (sqlc.narg('before_id')::bigint IS NULL OR p.id < sqlc.narg('before_id'))
ORDER BY p.id DESC
LIMIT $2;
