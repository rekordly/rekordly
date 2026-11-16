-- Documents linked to one purchase order, for its detail page.

-- name: ListPurchaseOrderReceipts :many
SELECT gr.id, gr.receipt_reference, gr.received_on
FROM goods_receipts gr
WHERE gr.workspace_id = $1 AND gr.purchase_order_id = $2
ORDER BY gr.received_on, gr.id;

-- name: ListPurchaseOrderBills :many
SELECT sb.id, sb.goods_receipt_id, sb.supplier_invoice_number, sb.bill_date, sb.due_date, sb.status, sb.total_minor, sb.outstanding_minor, sb.approved_at
FROM supplier_bills sb
JOIN goods_receipts gr ON gr.id = sb.goods_receipt_id AND gr.workspace_id = sb.workspace_id
WHERE sb.workspace_id = $1 AND gr.purchase_order_id = $2 AND sb.status NOT IN ('reversed', 'voided', 'rejected')
ORDER BY sb.bill_date, sb.id;

-- name: ListBilledQuantityByPurchaseOrderLine :many
SELECT COALESCE(sbl.purchase_order_line_id, grl.purchase_order_line_id)::bigint AS purchase_order_line_id,
       COALESCE(SUM(sbl.quantity), 0)::numeric AS billed_quantity
FROM supplier_bill_lines sbl
JOIN supplier_bills sb ON sb.id = sbl.supplier_bill_id AND sb.workspace_id = sbl.workspace_id
LEFT JOIN goods_receipt_lines grl ON grl.id = sbl.goods_receipt_line_id AND grl.workspace_id = sbl.workspace_id
JOIN goods_receipts gr ON gr.id = sb.goods_receipt_id AND gr.workspace_id = sb.workspace_id
WHERE sbl.workspace_id = $1 AND gr.purchase_order_id = $2 AND sb.status NOT IN ('reversed', 'voided', 'rejected')
  AND COALESCE(sbl.purchase_order_line_id, grl.purchase_order_line_id) IS NOT NULL
GROUP BY COALESCE(sbl.purchase_order_line_id, grl.purchase_order_line_id);

-- name: ListRejectedQuantityByPurchaseOrderLine :many
SELECT grl.purchase_order_line_id::bigint AS purchase_order_line_id, COALESCE(SUM(grl.rejected_quantity), 0)::numeric AS rejected_quantity
FROM goods_receipt_lines grl
JOIN goods_receipts gr ON gr.id = grl.goods_receipt_id AND gr.workspace_id = grl.workspace_id
WHERE grl.workspace_id = $1 AND gr.purchase_order_id = $2 AND grl.purchase_order_line_id IS NOT NULL
GROUP BY grl.purchase_order_line_id;
