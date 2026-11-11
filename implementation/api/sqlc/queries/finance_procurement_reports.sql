-- name: GetOpenPurchaseOrderTotals :one
SELECT count(*)::bigint AS order_count, COALESCE(sum(total_minor),0)::bigint AS total_minor FROM purchase_orders WHERE workspace_id=$1 AND status IN ('draft','submitted','approved','issued','acknowledged','partially_received','partially_cancelled');
-- name: GetGrniTotals :one
SELECT COALESCE(sum(grl.line_total_minor),0)::bigint AS total_minor, count(DISTINCT gr.id)::bigint AS receipt_count FROM goods_receipts gr JOIN goods_receipt_lines grl ON grl.goods_receipt_id=gr.id AND grl.workspace_id=gr.workspace_id LEFT JOIN supplier_bills sb ON sb.goods_receipt_id=gr.id AND sb.workspace_id=gr.workspace_id WHERE gr.workspace_id=$1 AND sb.id IS NULL;
-- name: GetApTotals :one
SELECT COALESCE(sum(outstanding_minor),0)::bigint AS outstanding_minor, COALESCE(sum(CASE WHEN due_date IS NOT NULL AND due_date < $2 AND status IN ('approved','partially_paid') THEN outstanding_minor ELSE 0 END),0)::bigint AS overdue_minor FROM supplier_bills WHERE workspace_id=$1 AND status IN ('approved','partially_paid');
-- name: GetAdvanceTotals :one
SELECT COALESCE(sum(available_minor),0)::bigint AS available_minor, count(*)::bigint AS advance_count FROM supplier_advances WHERE workspace_id=$1 AND available_minor > 0;
