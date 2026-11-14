-- Products v2: product detail, edits, outlets, collections, history and imports.

-- name: ListProductsV2 :many
SELECT
    p.id, p.workspace_id, p.name, p.description, p.kind, p.status, p.unit_name,
    p.short_description, p.long_description, p.image_urls, p.archived_at,
    p.created_at, p.updated_at,
    v.id AS default_variant_id, v.sku, v.barcode, v.selling_price_minor, v.cost_price_minor,
    v.compare_at_price_minor, v.currency, v.currency_exponent,
    COALESCE((SELECT SUM(b.quantity_on_hand) FROM inventory_balances b
              WHERE b.workspace_id = p.workspace_id AND b.product_id = p.id), 0)::numeric AS quantity_on_hand,
    (SELECT COUNT(*) FROM product_variants pv
      WHERE pv.workspace_id = p.workspace_id AND pv.product_id = p.id AND pv.is_active)::bigint AS variant_count
FROM products p
JOIN product_variants v ON v.product_id = p.id AND v.workspace_id = p.workspace_id AND v.is_default = true
WHERE p.workspace_id = @workspace_id
  AND (sqlc.narg('search')::text IS NULL OR p.name ILIKE '%' || sqlc.narg('search')::text || '%' OR v.sku ILIKE '%' || sqlc.narg('search')::text || '%')
  AND (sqlc.narg('status')::text IS NULL OR p.status = sqlc.narg('status')::text)
  AND (sqlc.narg('kind')::text IS NULL OR p.kind = sqlc.narg('kind')::text)
  AND (sqlc.narg('collection_id')::bigint IS NULL OR EXISTS (
        SELECT 1 FROM product_collection_items ci
        WHERE ci.workspace_id = p.workspace_id AND ci.product_id = p.id AND ci.collection_id = sqlc.narg('collection_id')::bigint))
  AND (sqlc.narg('before_id')::bigint IS NULL OR p.id < sqlc.narg('before_id')::bigint)
ORDER BY p.id DESC
LIMIT @row_limit;

-- name: UpdateProductV2 :one
UPDATE products
SET name = @name,
    description = sqlc.narg('description'),
    kind = @kind,
    status = @status,
    unit_name = @unit_name,
    short_description = sqlc.narg('short_description'),
    long_description = sqlc.narg('long_description'),
    image_urls = @image_urls,
    archived_at = sqlc.narg('archived_at'),
    updated_at = now()
WHERE workspace_id = @workspace_id AND id = @id
RETURNING *;

-- name: UpdateDefaultVariantV2 :one
UPDATE product_variants
SET sku = sqlc.narg('sku'),
    barcode = sqlc.narg('barcode'),
    selling_price_minor = @selling_price_minor,
    cost_price_minor = @cost_price_minor,
    compare_at_price_minor = sqlc.narg('compare_at_price_minor'),
    updated_at = now()
WHERE workspace_id = @workspace_id AND id = @id
RETURNING *;

-- name: SkuInUse :one
SELECT EXISTS (
    SELECT 1 FROM product_variants
    WHERE workspace_id = @workspace_id AND upper(sku) = upper(@sku::text)
      AND (sqlc.narg('except_variant_id')::bigint IS NULL OR id <> sqlc.narg('except_variant_id')::bigint)
)::boolean;

-- name: ListProductStockByOutlet :many
SELECT b.location_id, l.name AS location_name, b.quantity_on_hand, b.value_on_hand_minor
FROM inventory_balances b
JOIN inventory_locations l ON l.id = b.location_id AND l.workspace_id = b.workspace_id
WHERE b.workspace_id = @workspace_id AND b.product_id = @product_id
ORDER BY l.name;

-- name: ListProductOutletIDs :many
SELECT location_id FROM product_outlets
WHERE workspace_id = @workspace_id AND product_id = @product_id
ORDER BY location_id;

-- name: DeleteProductOutlets :exec
DELETE FROM product_outlets WHERE workspace_id = @workspace_id AND product_id = @product_id;

-- name: AddProductOutlet :exec
INSERT INTO product_outlets (workspace_id, product_id, location_id)
SELECT @workspace_id, @product_id, l.id FROM inventory_locations l
WHERE l.id = @location_id AND l.workspace_id = @workspace_id
ON CONFLICT DO NOTHING;

-- name: ListProductCollectionsV2 :many
SELECT c.*,
    (SELECT COUNT(*) FROM product_collection_items ci WHERE ci.collection_id = c.id)::bigint AS product_count
FROM product_collections c
WHERE c.workspace_id = @workspace_id
ORDER BY c.position, lower(c.name);

-- name: CreateProductCollection :one
INSERT INTO product_collections (workspace_id, name, description)
VALUES (@workspace_id, @name, sqlc.narg('description'))
RETURNING *;

-- name: UpdateProductCollection :one
UPDATE product_collections
SET name = @name, description = sqlc.narg('description'), updated_at = now()
WHERE workspace_id = @workspace_id AND id = @id
RETURNING *;

-- name: DeleteProductCollection :execrows
DELETE FROM product_collections WHERE workspace_id = @workspace_id AND id = @id;

-- name: ListProductCollectionIDs :many
SELECT collection_id FROM product_collection_items
WHERE workspace_id = @workspace_id AND product_id = @product_id
ORDER BY collection_id;

-- name: DeleteProductCollectionItems :exec
DELETE FROM product_collection_items WHERE workspace_id = @workspace_id AND product_id = @product_id;

-- name: AddProductCollectionItem :exec
INSERT INTO product_collection_items (workspace_id, collection_id, product_id)
SELECT @workspace_id, c.id, @product_id FROM product_collections c
WHERE c.id = @collection_id AND c.workspace_id = @workspace_id
ON CONFLICT DO NOTHING;

-- name: InsertProductPriceHistory :exec
INSERT INTO product_price_history (
    workspace_id, product_id, variant_id, old_selling_price_minor, new_selling_price_minor,
    old_cost_price_minor, new_cost_price_minor, currency, currency_exponent, changed_by_user_id
) VALUES (
    @workspace_id, @product_id, @variant_id, sqlc.narg('old_selling_price_minor'), @new_selling_price_minor,
    sqlc.narg('old_cost_price_minor'), @new_cost_price_minor, @currency, @currency_exponent, sqlc.narg('changed_by_user_id')
);

-- name: ListProductPriceHistory :many
SELECT * FROM product_price_history
WHERE workspace_id = @workspace_id AND product_id = @product_id
ORDER BY changed_at DESC, id DESC
LIMIT 100;

-- name: InsertProductEvent :exec
INSERT INTO product_events (workspace_id, product_id, event_type, summary, actor_user_id)
VALUES (@workspace_id, @product_id, @event_type, @summary, sqlc.narg('actor_user_id'));

-- name: ListProductEvents :many
SELECT * FROM product_events
WHERE workspace_id = @workspace_id AND product_id = @product_id
ORDER BY created_at DESC, id DESC
LIMIT 100;

-- name: InsertProductImportBatch :one
INSERT INTO product_import_batches (workspace_id, file_name, total_rows, created_count, failed_count, errors, created_by_user_id)
VALUES (@workspace_id, @file_name, @total_rows, @created_count, @failed_count, @errors, sqlc.narg('created_by_user_id'))
RETURNING *;

-- name: ListProductImportBatches :many
SELECT * FROM product_import_batches
WHERE workspace_id = @workspace_id
ORDER BY created_at DESC, id DESC
LIMIT 50;
