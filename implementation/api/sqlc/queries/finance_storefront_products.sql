-- Storefront catalogue reads and focused product visibility edits.
-- name: ListStorefrontProductCards :many
SELECT p.id, p.name, COALESCE(p.image_urls->>0, '')::text AS image_url,
       COALESCE((SELECT MIN(pv.selling_price_minor) FROM product_variants pv
                 WHERE pv.workspace_id = p.workspace_id AND pv.product_id = p.id AND pv.is_active AND pv.archived_at IS NULL), 0)::bigint AS price_minor,
       (SELECT COUNT(*)::bigint FROM product_variants pv
        WHERE pv.workspace_id = p.workspace_id AND pv.product_id = p.id AND pv.is_active AND pv.archived_at IS NULL) AS variant_count,
       COALESCE((SELECT SUM(ib.quantity_on_hand - ib.reserved_quantity) FROM inventory_balances ib
                 WHERE ib.workspace_id = p.workspace_id AND ib.product_id = p.id), 0)::numeric > 0 AS in_stock,
       p.show_on_store,
       COALESCE((SELECT bool_or(sp.is_featured) FROM storefront_products sp
                 WHERE sp.workspace_id = p.workspace_id AND sp.storefront_id = @storefront_id AND sp.product_id = p.id), false)::boolean AS is_featured,
       COALESCE((SELECT array_agg(pci.collection_id ORDER BY pci.collection_id) FROM product_collection_items pci
                 WHERE pci.workspace_id = p.workspace_id AND pci.product_id = p.id), '{}')::bigint[] AS collection_ids
FROM products p
WHERE p.workspace_id = @workspace_id AND p.status <> 'archived' AND p.archived_at IS NULL
  AND (sqlc.narg('before_id')::bigint IS NULL OR p.id < sqlc.narg('before_id')::bigint)
  AND (sqlc.narg('store_filter')::text IS NULL OR (sqlc.narg('store_filter')::text = 'on' AND p.show_on_store) OR (sqlc.narg('store_filter')::text = 'hidden' AND NOT p.show_on_store)
       OR (sqlc.narg('store_filter')::text = 'out_of_stock' AND COALESCE((SELECT SUM(ib.quantity_on_hand - ib.reserved_quantity) FROM inventory_balances ib WHERE ib.workspace_id = p.workspace_id AND ib.product_id = p.id), 0) <= 0))
  AND (sqlc.narg('collection_id')::bigint IS NULL OR EXISTS (SELECT 1 FROM product_collection_items pci WHERE pci.workspace_id = p.workspace_id AND pci.product_id = p.id AND pci.collection_id = sqlc.narg('collection_id')::bigint))
ORDER BY p.id DESC
LIMIT @row_limit;

-- name: UpdateProductStoreVisibility :execrows
UPDATE products
SET show_on_store = @show_on_store, updated_at = now()
WHERE workspace_id = @workspace_id AND id = @product_id AND status <> 'archived' AND archived_at IS NULL;

-- name: UpdateStorefrontProductFeatured :execrows
UPDATE storefront_products
SET is_featured = @is_featured, updated_at = now()
WHERE workspace_id = @workspace_id AND storefront_id = @storefront_id AND product_id = @product_id;

-- name: ClearProductCollectionLinks :exec
DELETE FROM product_collection_items
WHERE workspace_id = @workspace_id AND product_id = @product_id;

-- name: AddProductCollectionLink :exec
INSERT INTO product_collection_items (workspace_id, collection_id, product_id)
VALUES (@workspace_id, @collection_id, @product_id)
ON CONFLICT (collection_id, product_id) DO NOTHING;

-- name: CountWorkspaceProductCollections :one
SELECT COUNT(*)::bigint FROM product_collections
WHERE workspace_id = @workspace_id AND id = ANY(@collection_ids::bigint[]);

-- name: GetStorefrontCatalogueMutation :one
SELECT id, workspace_id, idempotency_key, request_hash, created_at
FROM storefront_catalogue_mutations
WHERE workspace_id = @workspace_id AND idempotency_key = @idempotency_key;

-- name: CreateStorefrontCatalogueMutation :exec
INSERT INTO storefront_catalogue_mutations (workspace_id, idempotency_key, request_hash)
VALUES (@workspace_id, @idempotency_key, @request_hash);
