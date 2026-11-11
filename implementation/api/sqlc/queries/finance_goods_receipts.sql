-- name: GetGoodsReceiptByIdempotency :one
SELECT * FROM goods_receipts WHERE workspace_id=$1 AND idempotency_key=$2;
-- name: CreateGoodsReceipt :one
INSERT INTO goods_receipts(workspace_id,purchase_order_id,receipt_reference,received_on,idempotency_key,created_by_user_id,location_id) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *;
-- name: GetReceiptPurchaseOrderLinesForUpdate :many
SELECT pol.id,pol.product_id,pol.description,pol.quantity,pol.expected_unit_cost_minor,
  (SELECT p.kind FROM products p WHERE p.id=pol.product_id AND p.workspace_id=pol.workspace_id) AS product_kind
FROM purchase_order_lines pol
WHERE pol.workspace_id=$1 AND pol.purchase_order_id=$2 ORDER BY pol.id FOR UPDATE OF pol;
-- name: ListReceiptPurchaseOrderLines :many
SELECT id,description,quantity,expected_unit_cost_minor
FROM purchase_order_lines WHERE workspace_id=$1 AND purchase_order_id=$2 ORDER BY id;
-- name: ListReceivedQuantityByPurchaseOrderLine :many
SELECT grl.purchase_order_line_id,COALESCE(sum(grl.accepted_quantity),0)::numeric AS received_quantity
FROM goods_receipt_lines grl JOIN goods_receipts gr ON gr.id=grl.goods_receipt_id
WHERE grl.workspace_id=$1 AND gr.purchase_order_id=$2 GROUP BY grl.purchase_order_line_id;
-- name: CreateGoodsReceiptLine :one
INSERT INTO goods_receipt_lines(workspace_id,goods_receipt_id,purchase_order_line_id,product_id,accepted_quantity,unit_cost_minor,line_total_minor) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *;
-- name: CreateInventoryReceiptMovement :exec
INSERT INTO inventory_movements(workspace_id,product_id,goods_receipt_line_id,location_id,movement_type,source_type,source_id,quantity_delta,value_delta_minor,occurred_on) VALUES($1,$2,$3,$4,'receipt','goods_receipt',$5,$6,$7,$8);
-- name: UpdatePurchaseOrderReceiptStatus :one
UPDATE purchase_orders SET status=$3,version=version+1,updated_at=now() WHERE workspace_id=$1 AND id=$2 RETURNING *;
-- name: ListGoodsReceipts :many
SELECT * FROM goods_receipts WHERE workspace_id=$1 AND (sqlc.narg('before_id')::bigint IS NULL OR id < sqlc.narg('before_id')) ORDER BY id DESC LIMIT $2;
