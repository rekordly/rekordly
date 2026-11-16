-- name: GetReceiptBillSource :one
SELECT gr.id AS receipt_id, COALESCE(gr.supplier_id, po.supplier_id) AS supplier_id, COALESCE(po.currency, gr.currency) AS currency, COALESCE(po.currency_exponent, gr.currency_exponent) AS currency_exponent, gr.location_id AS outlet_id, COALESCE(sum(grl.line_total_minor),0)::bigint AS total_minor FROM goods_receipts gr LEFT JOIN purchase_orders po ON po.id=gr.purchase_order_id AND po.workspace_id=gr.workspace_id JOIN goods_receipt_lines grl ON grl.goods_receipt_id=gr.id AND grl.workspace_id=gr.workspace_id WHERE gr.workspace_id=$1 AND gr.id=$2 GROUP BY gr.id, gr.supplier_id, po.supplier_id, po.currency, gr.currency, po.currency_exponent, gr.currency_exponent, gr.location_id;
-- name: GetThreeWayMatchTotals :one
SELECT COALESCE((SELECT sum(pol.line_total_minor) FROM purchase_order_lines pol WHERE pol.workspace_id=gr.workspace_id AND pol.purchase_order_id=gr.purchase_order_id),0)::bigint AS ordered_minor, COALESCE(sum(grl.line_total_minor),0)::bigint AS received_minor, COALESCE((SELECT sum(sb.total_minor) FROM supplier_bills sb WHERE sb.workspace_id=gr.workspace_id AND sb.goods_receipt_id=gr.id AND sb.status NOT IN ('rejected','voided','reversed')),0)::bigint AS billed_minor FROM goods_receipts gr JOIN goods_receipt_lines grl ON grl.goods_receipt_id=gr.id AND grl.workspace_id=gr.workspace_id WHERE gr.workspace_id=$1 AND gr.id=$2 GROUP BY gr.workspace_id,gr.purchase_order_id,gr.id;
-- name: GetSupplierBillByIdempotency :one
SELECT * FROM supplier_bills WHERE workspace_id=$1 AND idempotency_key=$2;
-- name: CreateSupplierBill :one
INSERT INTO supplier_bills(workspace_id,goods_receipt_id,supplier_id,supplier_invoice_number,bill_date,due_date,currency,currency_exponent,total_minor,outstanding_minor,idempotency_key,created_by_user_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,$10,$11) RETURNING *;
-- name: GetSupplierBillForUpdate :one
SELECT * FROM supplier_bills WHERE workspace_id=$1 AND id=$2 FOR UPDATE;
-- name: SettleSupplierBill :one
UPDATE supplier_bills SET outstanding_minor=outstanding_minor-$3,status=CASE WHEN outstanding_minor-$3=0 THEN 'paid' ELSE 'partially_paid' END,version=version+1,updated_at=now() WHERE workspace_id=$1 AND id=$2 AND outstanding_minor >= $3 AND status IN ('approved','partially_paid') RETURNING *;
-- name: GetSupplierBill :one
SELECT * FROM supplier_bills WHERE workspace_id=$1 AND id=$2;
-- name: GetSupplierBillCommand :one
SELECT supplier_bill_id,command,expected_version FROM supplier_bill_commands WHERE workspace_id=$1 AND idempotency_key=$2;
-- name: CreateSupplierBillCommand :exec
INSERT INTO supplier_bill_commands(workspace_id,supplier_bill_id,command,expected_version,idempotency_key,actor_user_id) VALUES($1,$2,$3,$4,$5,$6);
-- name: ApproveSupplierBill :one
UPDATE supplier_bills SET status='approved',version=version+1,approved_by_user_id=$4,approved_at=now(),updated_at=now() WHERE workspace_id=$1 AND id=$2 AND version=$3 AND status='draft' RETURNING *;
-- name: ListSupplierBills :many
SELECT * FROM supplier_bills WHERE workspace_id=$1 AND (sqlc.narg('before_id')::bigint IS NULL OR id<sqlc.narg('before_id')) ORDER BY id DESC LIMIT $2;

-- name: GetSupplierBillByGoodsReceiptID :one
SELECT * FROM supplier_bills
WHERE workspace_id = $1
  AND goods_receipt_id = $2
  AND status NOT IN ('rejected', 'voided', 'reversed')
ORDER BY id DESC
LIMIT 1;

-- name: ListSupplierBillLinesWithVariance :many
SELECT
    sbl.id, sbl.workspace_id, sbl.supplier_bill_id, sbl.goods_receipt_line_id, sbl.purchase_order_line_id,
    sbl.description, sbl.quantity, sbl.unit_cost_minor, sbl.discount_minor, sbl.tax_amount_minor, sbl.line_total_minor, sbl.created_at,
    COALESCE(grl.unit_cost_minor, pol.expected_unit_cost_minor, sbl.unit_cost_minor)::bigint AS expected_unit_cost_minor,
    (sbl.unit_cost_minor - COALESCE(grl.unit_cost_minor, pol.expected_unit_cost_minor, sbl.unit_cost_minor))::bigint AS variance_minor
FROM supplier_bill_lines sbl
LEFT JOIN goods_receipt_lines grl ON grl.id = sbl.goods_receipt_line_id AND grl.workspace_id = sbl.workspace_id
LEFT JOIN purchase_order_lines pol ON pol.id = sbl.purchase_order_line_id AND pol.workspace_id = sbl.workspace_id
WHERE sbl.workspace_id = @workspace_id AND sbl.supplier_bill_id = @supplier_bill_id
ORDER BY sbl.id ASC;

-- name: ListSupplierBillPayments :many
SELECT
    p.id, p.payment_date, p.total_amount_minor AS amount_minor,
    COALESCE(p.reference, '')::text AS reference,
    COALESCE(ma.name, '')::text AS account_name
FROM payments p
LEFT JOIN payment_legs pl ON pl.payment_id = p.id AND pl.workspace_id = p.workspace_id
LEFT JOIN money_accounts ma ON ma.id = pl.money_account_id AND ma.workspace_id = pl.workspace_id
WHERE p.workspace_id = @workspace_id
  AND p.linked_record_type = 'supplier_bill'
  AND p.linked_record_id = @supplier_bill_id
  AND p.status = 'posted'
ORDER BY p.payment_date DESC, p.id DESC;

-- name: InsertSupplierBillEvent :exec
INSERT INTO supplier_bill_events (workspace_id, supplier_bill_id, event_type, bill_version, note, actor_user_id)
VALUES (@workspace_id, @supplier_bill_id, @event_type, @bill_version, sqlc.narg('note'), @actor_user_id);

-- name: ListSupplierBillEvents :many
SELECT
    e.id, e.workspace_id, e.supplier_bill_id, e.event_type, e.bill_version, e.note, e.created_at,
    COALESCE(NULLIF(u.display_name, ''), 'Team')::text AS actor_name
FROM supplier_bill_events e
JOIN users u ON u.id = e.actor_user_id
WHERE e.workspace_id = @workspace_id AND e.supplier_bill_id = @supplier_bill_id
ORDER BY e.created_at DESC, e.id DESC;
