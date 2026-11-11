-- name: GetGoodsReceiptByIdempotency :one
SELECT * FROM goods_receipts WHERE workspace_id=$1 AND idempotency_key=$2;
-- name: CreateGoodsReceipt :one
INSERT INTO goods_receipts(workspace_id,purchase_order_id,receipt_reference,delivery_reference,service_accepted,received_on,idempotency_key,created_by_user_id,location_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *;
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
INSERT INTO goods_receipt_lines(workspace_id,goods_receipt_id,purchase_order_line_id,product_id,accepted_quantity,unit_cost_minor,actual_unit_cost_minor,line_total_minor,line_notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *;
-- name: CreateInventoryReceiptMovement :exec
INSERT INTO inventory_movements(workspace_id,product_id,goods_receipt_line_id,location_id,movement_type,source_type,source_id,quantity_delta,value_delta_minor,occurred_on) VALUES($1,$2,$3,$4,'receipt','goods_receipt',$5,$6,$7,$8);
-- name: UpdatePurchaseOrderReceiptStatus :one
UPDATE purchase_orders SET status=$3,version=version+1,updated_at=now() WHERE workspace_id=$1 AND id=$2 RETURNING *;
-- name: ListGoodsReceipts :many
SELECT * FROM goods_receipts WHERE workspace_id=$1 AND (sqlc.narg('before_id')::bigint IS NULL OR id < sqlc.narg('before_id')) ORDER BY id DESC LIMIT $2;

-- name: GetGoodsReceiptDetail :one
SELECT gr.*, COALESCE(jsonb_agg(jsonb_build_object(
  'id', grl.id,
  'purchase_order_line_id', grl.purchase_order_line_id,
  'product_id', grl.product_id,
  'description', COALESCE(grl.description, pol.description),
  'accepted_quantity', grl.accepted_quantity,
  'rejected_quantity', grl.rejected_quantity,
  'unit_cost_minor', grl.unit_cost_minor,
  'actual_unit_cost_minor', COALESCE(grl.actual_unit_cost_minor, grl.unit_cost_minor),
  'landed_cost_minor', grl.landed_cost_minor,
  'effective_unit_cost_minor', COALESCE(grl.effective_unit_cost_minor, grl.actual_unit_cost_minor, grl.unit_cost_minor),
  'line_total_minor', grl.line_total_minor,
  'batch_number', grl.batch_number,
  'expiry_date', grl.expiry_date,
  'serial_numbers', grl.serial_numbers,
  'line_notes', grl.line_notes
) ORDER BY grl.id) FILTER (WHERE grl.id IS NOT NULL), '[]'::jsonb) AS lines
FROM goods_receipts gr
LEFT JOIN goods_receipt_lines grl ON grl.goods_receipt_id = gr.id AND grl.workspace_id = gr.workspace_id
LEFT JOIN purchase_order_lines pol ON pol.id = grl.purchase_order_line_id AND pol.workspace_id = gr.workspace_id
WHERE gr.workspace_id=$1 AND gr.id=$2
GROUP BY gr.id;
