-- name: CreateInvoiceShare :one
INSERT INTO invoice_shares (
    workspace_id, invoice_id, token_hash, expires_at
) VALUES (
    $1, $2, $3, $4
) RETURNING *;

-- name: GetInvoiceShareByHash :one
SELECT * FROM invoice_shares
WHERE token_hash = $1 AND status = 'active' AND expires_at > now();

-- name: IncrementInvoiceShareAccess :exec
UPDATE invoice_shares
SET access_count = access_count + 1,
    last_accessed_at = now()
WHERE id = $1;

-- name: RevokeInvoiceShare :exec
UPDATE invoice_shares
SET status = 'revoked'
WHERE id = $1 AND workspace_id = $2;

-- name: CreatePaymentReceipt :one
INSERT INTO payment_receipts (
    workspace_id, receipt_number, payment_id, invoice_id,
    amount_minor, currency, token_hash, issued_at
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8
) RETURNING *;

-- name: GetPaymentReceiptByHash :one
SELECT * FROM payment_receipts
WHERE token_hash = $1;

-- name: GetPaymentReceiptByPaymentID :one
SELECT * FROM payment_receipts
WHERE workspace_id = $1 AND payment_id = $2;

-- name: CreateEstimateShare :one
INSERT INTO estimate_shares (
    workspace_id, estimate_id, token_hash, allow_respond, expires_at, created_by_user_id
) VALUES (
    $1, $2, $3, $4, $5, $6
) RETURNING *;

-- name: GetEstimateShareByHash :one
SELECT * FROM estimate_shares
WHERE token_hash = $1 AND status = 'active' AND expires_at > now();

-- name: IncrementEstimateShareAccess :exec
UPDATE estimate_shares
SET access_count = access_count + 1,
    last_accessed_at = now()
WHERE id = $1;

-- name: RecordEstimateShareResponse :one
UPDATE estimate_shares
SET response_status = $2,
    responded_by_name = $3,
    response_comment = $4,
    responded_at = now()
WHERE id = $1
RETURNING *;

-- name: CreateCustomerStatementShare :one
INSERT INTO customer_statement_shares (
    workspace_id, customer_id, token_hash, from_date, to_date, expires_at, created_by_user_id
) VALUES (
    $1, $2, $3, $4, $5, $6, $7
) RETURNING *;

-- name: GetCustomerStatementShareByHash :one
SELECT * FROM customer_statement_shares
WHERE token_hash = $1 AND status = 'active' AND expires_at > now();

-- name: IncrementCustomerStatementShareAccess :exec
UPDATE customer_statement_shares
SET access_count = access_count + 1,
    last_accessed_at = now()
WHERE id = $1;
