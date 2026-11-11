-- name: GetSupplierReturnByIdempotency :one
SELECT * FROM supplier_returns WHERE workspace_id=$1 AND idempotency_key=$2;
-- name: GetSupplierReturnSource :one
SELECT sr.id, sr.workspace_id, sr.supplier_id, sr.goods_receipt_id, sr.effective_on, sr.reason, sr.total_minor, sr.status, sr.idempotency_key, sr.created_by_user_id, sr.created_at, po.currency, po.currency_exponent FROM supplier_returns sr JOIN goods_receipts gr ON gr.id=sr.goods_receipt_id AND gr.workspace_id=sr.workspace_id JOIN purchase_orders po ON po.id=gr.purchase_order_id AND po.workspace_id=gr.workspace_id WHERE sr.workspace_id=$1 AND sr.id=$2;
-- name: GetReceiptForReturn :one
SELECT gr.id, gr.workspace_id, gr.purchase_order_id, po.supplier_id, po.currency, po.currency_exponent, gr.location_id FROM goods_receipts gr JOIN purchase_orders po ON po.id=gr.purchase_order_id AND po.workspace_id=gr.workspace_id WHERE gr.workspace_id=$1 AND gr.id=$2 FOR UPDATE;
-- name: GetReceiptLineForReturn :one
SELECT grl.id, grl.workspace_id, grl.goods_receipt_id, grl.product_id, grl.accepted_quantity, grl.unit_cost_minor, gr.location_id, p.kind FROM goods_receipt_lines grl JOIN goods_receipts gr ON gr.id=grl.goods_receipt_id AND gr.workspace_id=grl.workspace_id JOIN products p ON p.id=grl.product_id AND p.workspace_id=grl.workspace_id WHERE grl.workspace_id=$1 AND grl.id=$2 AND grl.goods_receipt_id=$3 FOR UPDATE;
-- name: ListReturnableReceiptLines :many
SELECT grl.id, p.name AS product_name, grl.accepted_quantity, grl.unit_cost_minor, (grl.accepted_quantity-COALESCE((SELECT sum(srl.quantity) FROM supplier_return_lines srl JOIN supplier_returns sr ON sr.id=srl.supplier_return_id AND sr.workspace_id=srl.workspace_id WHERE srl.workspace_id=$1 AND srl.goods_receipt_line_id=grl.id AND sr.status='posted'),0))::numeric AS remaining_quantity FROM goods_receipt_lines grl JOIN products p ON p.id=grl.product_id AND p.workspace_id=grl.workspace_id WHERE grl.workspace_id=$1 AND grl.goods_receipt_id=$2 AND p.kind='stock_tracked' ORDER BY grl.id;
-- name: ListSupplierReturns :many
SELECT * FROM supplier_returns WHERE workspace_id=$1 ORDER BY id DESC LIMIT $2;
-- name: GetReturnedQuantityForReceiptLine :one
SELECT COALESCE(sum(srl.quantity),0)::numeric AS quantity FROM supplier_return_lines srl JOIN supplier_returns sr ON sr.id=srl.supplier_return_id AND sr.workspace_id=srl.workspace_id WHERE srl.workspace_id=$1 AND srl.goods_receipt_line_id=$2 AND sr.status='posted';
-- name: CreateSupplierReturn :one
INSERT INTO supplier_returns(workspace_id,supplier_id,goods_receipt_id,effective_on,reason,total_minor,idempotency_key,created_by_user_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *;
-- name: CreateSupplierReturnLine :one
INSERT INTO supplier_return_lines(workspace_id,supplier_return_id,goods_receipt_line_id,product_id,location_id,quantity,value_minor) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *;
-- name: GetInventoryBalanceForUpdate :one
SELECT * FROM inventory_balances WHERE workspace_id=$1 AND location_id=$2 AND product_id=$3 FOR UPDATE;
-- name: ApplyInventoryBalanceDelta :one
UPDATE inventory_balances SET quantity_on_hand=quantity_on_hand+$4,value_on_hand_minor=value_on_hand_minor+$5,version=version+1,updated_at=now() WHERE workspace_id=$1 AND location_id=$2 AND product_id=$3 AND quantity_on_hand+$4 >= 0 AND value_on_hand_minor+$5 >= 0 RETURNING *;
-- name: GetSupplierCreditByIdempotency :one
SELECT * FROM supplier_credits WHERE workspace_id=$1 AND idempotency_key=$2;
-- name: GetSupplierCreditsForReturnTotal :one
SELECT COALESCE(sum(amount_minor), 0)::bigint AS amount_minor
FROM supplier_credits
WHERE workspace_id=$1 AND supplier_return_id=$2 AND status <> 'cancelled';
-- name: CreateSupplierCredit :one
INSERT INTO supplier_credits(workspace_id,supplier_id,supplier_return_id,supplier_bill_id,currency,currency_exponent,amount_minor,outstanding_minor,reason,idempotency_key,created_by_user_id) VALUES($1,$2,$3,$4,$5,$6,$7,$7,$8,$9,$10) RETURNING *;
-- name: GetSupplierCreditForUpdate :one
SELECT * FROM supplier_credits WHERE workspace_id=$1 AND id=$2 FOR UPDATE;
-- name: ApplySupplierCreditToBill :one
UPDATE supplier_bills SET outstanding_minor=outstanding_minor-$3,status=CASE WHEN outstanding_minor-$3=0 THEN 'paid' ELSE 'partially_paid' END,version=version+1,updated_at=now() WHERE workspace_id=$1 AND id=$2 AND outstanding_minor >= $3 AND status IN ('approved','partially_paid') RETURNING *;
-- name: ApplySupplierCreditBalance :one
UPDATE supplier_credits SET outstanding_minor=outstanding_minor-$3,status=CASE WHEN outstanding_minor-$3=0 THEN 'refunded' ELSE 'partially_refunded' END WHERE workspace_id=$1 AND id=$2 AND outstanding_minor >= $3 RETURNING *;
-- name: GetSupplierRefundByIdempotency :one
SELECT * FROM supplier_refunds WHERE workspace_id=$1 AND idempotency_key=$2;
-- name: CreateSupplierRefund :one
INSERT INTO supplier_refunds(workspace_id,supplier_id,supplier_credit_id,supplier_advance_id,amount_minor,currency,currency_exponent,refund_date,idempotency_key,reason,created_by_user_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *;
