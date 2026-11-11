-- name: GetPurchaseOrderBySource :one
SELECT * FROM purchase_orders WHERE workspace_id=$1 AND source_purchase_request_id=$2;
-- name: GetPurchaseOrderByIdempotency :one
SELECT * FROM purchase_orders WHERE workspace_id=$1 AND idempotency_key=$2;
-- name: GetPurchaseOrderByID :one
SELECT * FROM purchase_orders WHERE workspace_id=$1 AND id=$2;
-- name: CreatePurchaseOrder :one
INSERT INTO purchase_orders(workspace_id,source_purchase_request_id,supplier_id,currency,currency_exponent,total_minor,idempotency_key,created_by_user_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *;
-- name: CreatePurchaseOrderLine :exec
INSERT INTO purchase_order_lines(workspace_id,purchase_order_id,source_purchase_request_line_id,product_id,description,quantity,unit_name,expected_unit_cost_minor,line_total_minor) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9);
-- name: ListPurchaseOrders :many
SELECT * FROM purchase_orders WHERE workspace_id=$1 AND (sqlc.narg('before_id')::bigint IS NULL OR id < sqlc.narg('before_id')) ORDER BY id DESC LIMIT $2;
-- name: GetPurchaseOrderForUpdate :one
SELECT * FROM purchase_orders WHERE workspace_id=$1 AND id=$2 FOR UPDATE;
-- name: AdvancePurchaseOrder :one
UPDATE purchase_orders SET status=$4,version=version+1,approved_by_user_id=CASE WHEN $4='approved' THEN $5 ELSE approved_by_user_id END,issued_by_user_id=CASE WHEN $4='issued' THEN $5 ELSE issued_by_user_id END,issued_at=CASE WHEN $4='issued' THEN now() ELSE issued_at END,order_number=CASE WHEN $4='issued' THEN $6 ELSE order_number END,acknowledged_at=CASE WHEN $4='acknowledged' THEN now() ELSE acknowledged_at END,acknowledgement_note=CASE WHEN $4='acknowledged' THEN 'Supplier acknowledgement recorded' ELSE acknowledgement_note END,updated_at=now() WHERE workspace_id=$1 AND id=$2 AND version=$3 RETURNING *;
-- name: NextPurchaseOrderSequence :one
INSERT INTO purchase_order_sequences(workspace_id,next_value) VALUES($1,2) ON CONFLICT(workspace_id) DO UPDATE SET next_value=purchase_order_sequences.next_value+1 RETURNING next_value-1;
-- name: GetPurchaseOrderCommand :one
SELECT purchase_order_id,command,expected_version FROM purchase_order_command_log WHERE workspace_id=$1 AND idempotency_key=$2;
-- name: CreatePurchaseOrderCommand :exec
INSERT INTO purchase_order_command_log(workspace_id,purchase_order_id,command,expected_version,idempotency_key,actor_user_id) VALUES($1,$2,$3,$4,$5,$6);

-- name: CreatePurchaseOrderEvent :one
INSERT INTO purchase_order_events(workspace_id,purchase_order_id,event_type,order_version,note,actor_user_id)
VALUES($1,$2,$3,$4,$5,$6)
RETURNING *;

-- name: ListPurchaseOrderEvents :many
SELECT * FROM purchase_order_events
WHERE workspace_id=$1 AND purchase_order_id=$2
ORDER BY id ASC;

-- name: ResolvePurchaseOrder :one
UPDATE purchase_orders
SET status=$4,
    cancellation_reason=CASE WHEN $4 IN ('cancelled','partially_cancelled') THEN $5 ELSE cancellation_reason END,
    closed_reason=CASE WHEN $4='closed' THEN $5 ELSE closed_reason END,
    version=version+1,
    updated_at=now()
WHERE workspace_id=$1 AND id=$2 AND version=$3
RETURNING *;

-- name: CountUnbilledReceiptsForPurchaseOrder :one
SELECT count(*)
FROM goods_receipts gr
WHERE gr.workspace_id=$1
  AND gr.purchase_order_id=$2
  AND NOT EXISTS (
      SELECT 1 FROM supplier_bills sb
      WHERE sb.workspace_id=gr.workspace_id AND sb.goods_receipt_id=gr.id
  );
