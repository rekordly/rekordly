-- Blueprint 08 completion queries

-- Direct PO & Revisions
-- name: CreateDirectPurchaseOrder :one
INSERT INTO purchase_orders(
    workspace_id, supplier_id, outlet_id, expected_date, payment_terms, notes,
    currency, currency_exponent, total_minor, idempotency_key, created_by_user_id
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
RETURNING *;

-- name: CreatePurchaseOrderDirectLine :one
INSERT INTO purchase_order_lines(
    workspace_id, purchase_order_id, source_purchase_request_line_id, product_id,
    description, quantity, unit_name, expected_unit_cost_minor,
    discount_minor, tax_amount_minor, line_total_minor
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
RETURNING *;

-- name: UpdatePurchaseOrderDraft :one
UPDATE purchase_orders
SET supplier_id=$4,
    outlet_id=$5,
    expected_date=$6,
    payment_terms=$7,
    notes=$8,
    currency=$9,
    currency_exponent=$10,
    total_minor=$11,
    version=version+1,
    updated_at=now()
WHERE workspace_id=$1 AND id=$2 AND version=$3
RETURNING *;

-- name: DeletePurchaseOrderLines :exec
DELETE FROM purchase_order_lines
WHERE workspace_id=$1 AND purchase_order_id=$2;

-- name: CreatePurchaseOrderVersionSnapshot :one
INSERT INTO purchase_order_versions(
    workspace_id, purchase_order_id, version, snapshot, change_reason, changed_by_user_id
) VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: ListPurchaseOrderVersions :many
SELECT * FROM purchase_order_versions
WHERE workspace_id=$1 AND purchase_order_id=$2
ORDER BY version DESC;

-- Extended Receipts
-- name: CreateExtendedGoodsReceipt :one
INSERT INTO goods_receipts(
    workspace_id, purchase_order_id, supplier_id, source_type, reason,
    currency, currency_exponent, receipt_reference, delivery_reference,
    service_accepted, received_on, idempotency_key, created_by_user_id,
    location_id, landed_cost_minor
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
RETURNING *;

-- name: CreateExtendedGoodsReceiptLine :one
INSERT INTO goods_receipt_lines(
    workspace_id, goods_receipt_id, purchase_order_line_id, product_id, description,
    accepted_quantity, rejected_quantity, unit_cost_minor, actual_unit_cost_minor,
    landed_cost_minor, effective_unit_cost_minor, line_total_minor,
    batch_number, expiry_date, serial_numbers, line_notes
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
RETURNING *;

-- name: GetGoodsReceiptLinesByReceipt :many
SELECT * FROM goods_receipt_lines
WHERE workspace_id=$1 AND goods_receipt_id=$2
ORDER BY id ASC;

-- name: GetGoodsReceiptByID :one
SELECT * FROM goods_receipts
WHERE workspace_id=$1 AND id=$2;

-- Supplier Bill Lines, Extended Bills, Credit Application & Status Actions
-- name: CreateSupplierBillWithDetails :one
INSERT INTO supplier_bills(
    workspace_id, goods_receipt_id, supplier_id, outlet_id, supplier_invoice_number,
    bill_date, due_date, currency, currency_exponent, total_minor, outstanding_minor,
    tax_amount_minor, discount_minor, variance_minor, match_status,
    bill_type, expense_account_class, description, idempotency_key, created_by_user_id
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
RETURNING *;

-- name: CreateSupplierBillLine :one
INSERT INTO supplier_bill_lines(
    workspace_id, supplier_bill_id, goods_receipt_line_id, purchase_order_line_id,
    description, quantity, unit_cost_minor, discount_minor, tax_amount_minor, line_total_minor
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
RETURNING *;

-- name: ListSupplierBillLines :many
SELECT * FROM supplier_bill_lines
WHERE workspace_id=$1 AND supplier_bill_id=$2
ORDER BY id ASC;

-- name: UpdateSupplierBillStatusCommand :one
UPDATE supplier_bills
SET status=$4,
    dispute_reason=CASE WHEN $5 <> '' THEN $5 ELSE dispute_reason END,
    reversal_reason=CASE WHEN $4='reversed' THEN $5 ELSE reversal_reason END,
    reversed_at=CASE WHEN $4='reversed' THEN now() ELSE reversed_at END,
    outstanding_minor=CASE WHEN $4 IN ('rejected','reversed') THEN 0 ELSE outstanding_minor END,
    version=version+1,
    updated_at=now()
WHERE workspace_id=$1 AND id=$2 AND version=$3
RETURNING *;

-- name: FindDuplicateSupplierBill :one
SELECT id, supplier_invoice_number, status
FROM supplier_bills
WHERE workspace_id=$1
  AND supplier_id=$2
  AND lower(btrim(supplier_invoice_number)) = lower(btrim($3))
  AND status NOT IN ('rejected', 'voided', 'reversed')
LIMIT 1;

-- name: SumPreviouslyBilledForReceiptLine :one
SELECT COALESCE(sum(sbl.line_total_minor), 0)::bigint AS billed_minor,
       COALESCE(sum(sbl.quantity), 0)::numeric AS billed_quantity
FROM supplier_bill_lines sbl
JOIN supplier_bills sb ON sb.id = sbl.supplier_bill_id AND sb.workspace_id = sbl.workspace_id
WHERE sbl.workspace_id=$1
  AND sbl.goods_receipt_line_id=$2
  AND sb.status NOT IN ('rejected', 'voided', 'reversed');

-- name: ApplyCreditToSupplierBill :one
UPDATE supplier_bills
SET outstanding_minor = outstanding_minor - $3,
    credited_minor = credited_minor + $3,
    status = CASE WHEN outstanding_minor - $3 = 0 THEN 'paid' ELSE 'partially_paid' END,
    version = version + 1,
    updated_at = now()
WHERE workspace_id=$1 AND id=$2 AND outstanding_minor >= $3 AND status IN ('approved','partially_paid')
RETURNING *;

-- name: CreateSupplierBillCreditApplication :one
INSERT INTO supplier_bill_credit_applications(
    workspace_id, supplier_bill_id, supplier_credit_id, amount_minor, idempotency_key, applied_by_user_id
) VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: GetSupplierBillCreditApplicationByIdempotency :one
SELECT * FROM supplier_bill_credit_applications
WHERE workspace_id=$1 AND idempotency_key=$2;

-- Supplier Credits & Refunds listing
-- name: ListSupplierCredits :many
SELECT * FROM supplier_credits
WHERE workspace_id=$1
ORDER BY id DESC
LIMIT $2;

-- name: ListSupplierRefunds :many
SELECT * FROM supplier_refunds
WHERE workspace_id=$1
ORDER BY id DESC
LIMIT $2;

-- Policy extension
-- name: UpsertProcurementApprovalPolicyExtended :one
INSERT INTO procurement_approval_policies(
    workspace_id, approval_threshold_minor, allow_self_approval,
    price_variance_tolerance_bps, qty_variance_tolerance_bps,
    allow_unplanned_receipt, allow_over_receipt, updated_by_user_id
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
ON CONFLICT(workspace_id) DO UPDATE SET
    approval_threshold_minor = EXCLUDED.approval_threshold_minor,
    allow_self_approval = EXCLUDED.allow_self_approval,
    price_variance_tolerance_bps = EXCLUDED.price_variance_tolerance_bps,
    qty_variance_tolerance_bps = EXCLUDED.qty_variance_tolerance_bps,
    allow_unplanned_receipt = EXCLUDED.allow_unplanned_receipt,
    allow_over_receipt = EXCLUDED.allow_over_receipt,
    updated_by_user_id = EXCLUDED.updated_by_user_id,
    updated_at = now()
RETURNING *;

-- Aging & Reconciliation Reports
-- name: GetApAgingBuckets :one
SELECT
    COALESCE(sum(CASE WHEN due_date IS NULL OR due_date >= $2 THEN outstanding_minor ELSE 0 END), 0)::bigint AS current_minor,
    COALESCE(sum(CASE WHEN due_date IS NOT NULL AND ($2::date - due_date) BETWEEN 1 AND 30 THEN outstanding_minor ELSE 0 END), 0)::bigint AS days_1_30_minor,
    COALESCE(sum(CASE WHEN due_date IS NOT NULL AND ($2::date - due_date) BETWEEN 31 AND 60 THEN outstanding_minor ELSE 0 END), 0)::bigint AS days_31_60_minor,
    COALESCE(sum(CASE WHEN due_date IS NOT NULL AND ($2::date - due_date) > 60 THEN outstanding_minor ELSE 0 END), 0)::bigint AS days_61_plus_minor
FROM supplier_bills
WHERE workspace_id=$1 AND status IN ('approved', 'partially_paid');

-- name: ListAgedUnbilledReceipts :many
SELECT
    gr.id AS receipt_id,
    gr.receipt_reference,
    gr.purchase_order_id,
    COALESCE(gr.supplier_id, po.supplier_id) AS supplier_id,
    gr.received_on,
    ($2::date - gr.received_on)::int AS age_days,
    COALESCE(sum(grl.line_total_minor), 0)::bigint AS grni_minor
FROM goods_receipts gr
LEFT JOIN purchase_orders po ON po.id=gr.purchase_order_id AND po.workspace_id=gr.workspace_id
JOIN goods_receipt_lines grl ON grl.goods_receipt_id=gr.id AND grl.workspace_id=gr.workspace_id
LEFT JOIN supplier_bills sb ON sb.goods_receipt_id=gr.id AND sb.workspace_id=gr.workspace_id AND sb.status NOT IN ('rejected','voided','reversed')
WHERE gr.workspace_id=$1 AND sb.id IS NULL
GROUP BY gr.id, gr.receipt_reference, gr.purchase_order_id, gr.supplier_id, po.supplier_id, gr.received_on
ORDER BY gr.received_on ASC, gr.id ASC
LIMIT 50;

-- name: ListVarianceSupplierBills :many
SELECT id, goods_receipt_id, supplier_id, supplier_invoice_number, bill_date, total_minor, variance_minor, match_status, status
FROM supplier_bills
WHERE workspace_id=$1
  AND status NOT IN ('rejected','voided','reversed')
  AND (variance_minor <> 0 OR match_status <> 'exact')
ORDER BY id DESC
LIMIT 50;

-- name: GetUnappliedCreditTotals :one
SELECT COALESCE(sum(outstanding_minor), 0)::bigint AS outstanding_minor,
       count(*)::bigint AS credit_count
FROM supplier_credits
WHERE workspace_id=$1 AND outstanding_minor > 0 AND status IN ('approved', 'partially_refunded');

-- name: ListReturnsAwaitingResolution :many
SELECT sr.id, sr.supplier_id, sr.goods_receipt_id, sr.effective_on, sr.total_minor, sr.reason,
       COALESCE((SELECT sum(sc.amount_minor) FROM supplier_credits sc WHERE sc.workspace_id=sr.workspace_id AND sc.supplier_return_id=sr.id AND sc.status <> 'cancelled'), 0)::bigint AS credited_minor
FROM supplier_returns sr
WHERE sr.workspace_id=$1 AND sr.status = 'posted'
  AND sr.total_minor > COALESCE((SELECT sum(sc.amount_minor) FROM supplier_credits sc WHERE sc.workspace_id=sr.workspace_id AND sc.supplier_return_id=sr.id AND sc.status <> 'cancelled'), 0)
ORDER BY sr.id DESC
LIMIT 50;
