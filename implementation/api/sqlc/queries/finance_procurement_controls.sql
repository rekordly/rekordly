-- name: GetProcurementApprovalPolicy :one
SELECT * FROM procurement_approval_policies WHERE workspace_id=$1;

-- name: UpsertProcurementApprovalPolicy :one
INSERT INTO procurement_approval_policies(workspace_id,approval_threshold_minor,allow_self_approval,updated_by_user_id)
VALUES($1,$2,$3,$4)
ON CONFLICT(workspace_id) DO UPDATE SET approval_threshold_minor=EXCLUDED.approval_threshold_minor, allow_self_approval=EXCLUDED.allow_self_approval, updated_by_user_id=EXCLUDED.updated_by_user_id, updated_at=now()
RETURNING *;

-- name: CreateProcurementAttachment :one
INSERT INTO procurement_attachments(workspace_id,purchase_request_id,purchase_order_id,goods_receipt_id,supplier_bill_id,storage_key,file_name,mime_type,file_size_bytes,created_by_user_id)
VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *;

-- name: ListProcurementAttachments :many
SELECT * FROM procurement_attachments
WHERE workspace_id=$1 AND ((sqlc.narg('purchase_request_id')::bigint IS NULL OR purchase_request_id=sqlc.narg('purchase_request_id')) AND (sqlc.narg('purchase_order_id')::bigint IS NULL OR purchase_order_id=sqlc.narg('purchase_order_id')) AND (sqlc.narg('goods_receipt_id')::bigint IS NULL OR goods_receipt_id=sqlc.narg('goods_receipt_id')) AND (sqlc.narg('supplier_bill_id')::bigint IS NULL OR supplier_bill_id=sqlc.narg('supplier_bill_id')))
ORDER BY id DESC;

-- name: ProcurementParentExists :one
SELECT (
  (sqlc.narg('purchase_request_id')::bigint IS NULL OR EXISTS(SELECT 1 FROM purchase_requests pr WHERE pr.workspace_id=$1 AND pr.id=sqlc.narg('purchase_request_id'))) AND
  (sqlc.narg('purchase_order_id')::bigint IS NULL OR EXISTS(SELECT 1 FROM purchase_orders po WHERE po.workspace_id=$1 AND po.id=sqlc.narg('purchase_order_id'))) AND
  (sqlc.narg('goods_receipt_id')::bigint IS NULL OR EXISTS(SELECT 1 FROM goods_receipts gr WHERE gr.workspace_id=$1 AND gr.id=sqlc.narg('goods_receipt_id'))) AND
  (sqlc.narg('supplier_bill_id')::bigint IS NULL OR EXISTS(SELECT 1 FROM supplier_bills sb WHERE sb.workspace_id=$1 AND sb.id=sqlc.narg('supplier_bill_id')))
) AND num_nonnulls(sqlc.narg('purchase_request_id')::bigint, sqlc.narg('purchase_order_id')::bigint, sqlc.narg('goods_receipt_id')::bigint, sqlc.narg('supplier_bill_id')::bigint)=1 AS valid;
