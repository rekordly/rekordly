-- name: CreateDirectSupplierBill :one
INSERT INTO supplier_bills(workspace_id,goods_receipt_id,supplier_id,supplier_invoice_number,bill_date,due_date,currency,currency_exponent,total_minor,outstanding_minor,bill_type,expense_account_class,description,idempotency_key,created_by_user_id) VALUES($1,NULL,$2,$3,$4,$5,$6,$7,$8,$8,$9,$10,$11,$12,$13) RETURNING *;
-- name: ListOverdueSupplierBills :many
SELECT * FROM supplier_bills WHERE workspace_id=$1 AND due_date IS NOT NULL AND due_date < $2 AND status IN ('approved','partially_paid') ORDER BY due_date ASC,id ASC LIMIT $3;
