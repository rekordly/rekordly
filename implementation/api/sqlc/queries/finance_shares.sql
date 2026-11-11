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
