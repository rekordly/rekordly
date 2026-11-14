-- name: CreateInvoice :one
INSERT INTO invoices (
    workspace_id, customer_id, customer_name, invoice_number,
    issue_date, due_date, subtotal_minor, tax_amount_minor,
    total_amount_minor, paid_amount_minor, currency, currency_exponent,
    status, notes, terms, idempotency_key, created_by_user_id
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
) RETURNING *;

-- name: GetInvoiceByID :one
SELECT * FROM invoices
WHERE id = $1 AND workspace_id = $2;

-- name: GetInvoiceByIDForUpdate :one
SELECT * FROM invoices
WHERE id = $1 AND workspace_id = $2
FOR UPDATE;

-- name: GetInvoiceByIdempotency :one
SELECT * FROM invoices
WHERE workspace_id = $1 AND idempotency_key = $2 AND status <> 'voided';

-- name: GetInvoiceByNumber :one
SELECT * FROM invoices
WHERE workspace_id = $1 AND lower(invoice_number) = lower($2);

-- name: ListInvoices :many
SELECT * FROM invoices
WHERE workspace_id = $1
  AND (sqlc.narg('from_date')::date IS NULL OR issue_date >= sqlc.narg('from_date'))
  AND (sqlc.narg('to_date')::date IS NULL OR issue_date <= sqlc.narg('to_date'))
  AND (sqlc.narg('status')::text IS NULL OR status = sqlc.narg('status'))
  AND (sqlc.narg('customer_id')::bigint IS NULL OR customer_id = sqlc.narg('customer_id'))
  AND (sqlc.narg('before_id')::bigint IS NULL OR id < sqlc.narg('before_id'))
  AND (sqlc.narg('search')::text IS NULL OR invoice_number ILIKE '%' || sqlc.narg('search')::text || '%' OR customer_name ILIKE '%' || sqlc.narg('search')::text || '%')
ORDER BY issue_date DESC, id DESC
LIMIT $2;

-- name: UpdateDraftInvoice :one
UPDATE invoices
SET customer_id = $3,
    customer_name = $4,
    issue_date = $5,
    due_date = $6,
    subtotal_minor = $7,
    tax_amount_minor = $8,
    total_amount_minor = $9,
    notes = $10,
    terms = $11,
    updated_at = now()
WHERE id = $1 AND workspace_id = $2 AND status = 'draft'
RETURNING *;

-- name: FinalizeInvoice :one
UPDATE invoices
SET status = 'finalized',
    finalized_at = now(),
    updated_at = now()
WHERE id = $1 AND workspace_id = $2 AND status = 'draft'
RETURNING *;

-- name: UpdateInvoicePaidAmount :one
UPDATE invoices
SET paid_amount_minor = paid_amount_minor + $3,
    status = CASE
        WHEN paid_amount_minor + $3 >= total_amount_minor THEN 'paid'
        WHEN paid_amount_minor + $3 > 0 THEN 'partially_paid'
        ELSE status
    END,
    updated_at = now()
WHERE id = $1 AND workspace_id = $2
RETURNING *;

-- name: VoidInvoice :one
UPDATE invoices
SET status = 'voided',
    voided_at = now(),
    void_reason = $3,
    updated_at = now()
WHERE id = $1 AND workspace_id = $2 AND status <> 'voided'
RETURNING *;

-- name: CreateInvoiceItem :one
INSERT INTO invoice_items (
    invoice_id, workspace_id, description, quantity, unit_price_minor, amount_minor, product_id, variant_id
) VALUES (
    $1, $2, $3, $4, $5, $6, sqlc.narg('product_id'), sqlc.narg('variant_id')
) RETURNING *;

-- name: ListInvoiceItemsByInvoiceID :many
SELECT * FROM invoice_items
WHERE invoice_id = $1 AND workspace_id = $2
ORDER BY id ASC;

-- name: DeleteInvoiceItemsByInvoiceID :execrows
DELETE FROM invoice_items
WHERE invoice_id = $1 AND workspace_id = $2;

-- name: GetOrCreateCustomerWallet :one
INSERT INTO customer_wallets (
    workspace_id, customer_id, currency, currency_exponent, balance_minor
) VALUES (
    $1, $2, $3, $4, 0
) ON CONFLICT (workspace_id, customer_id, currency)
DO UPDATE SET updated_at = now()
RETURNING *;

-- name: GetCustomerWallet :one
SELECT * FROM customer_wallets
WHERE workspace_id = $1 AND customer_id = $2 AND currency = $3;

-- name: UpdateCustomerWalletBalance :one
UPDATE customer_wallets
SET balance_minor = balance_minor + $4,
    updated_at = now()
WHERE workspace_id = $1 AND customer_id = $2 AND currency = $3
RETURNING *;

-- name: CreateWalletTransaction :one
INSERT INTO wallet_transactions (
    workspace_id, customer_id, transaction_type, amount_minor,
    balance_after_minor, money_account_id, invoice_id, notes, reference,
    idempotency_key, created_by_user_id
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
) RETURNING *;

-- name: ListWalletTransactions :many
SELECT * FROM wallet_transactions
WHERE workspace_id = $1 AND customer_id = $2
  AND (sqlc.narg('before_id')::bigint IS NULL OR id < sqlc.narg('before_id'))
ORDER BY id DESC
LIMIT $3;

-- name: SetInvoiceCharges :one
UPDATE invoices
SET discount_minor = $3,
    delivery_fee_minor = $4,
    total_amount_minor = $5,
    updated_at = now()
WHERE id = $1 AND workspace_id = $2
RETURNING *;

-- name: SetInvoiceItemDiscount :one
UPDATE invoice_items
SET discount_minor = $3,
    amount_minor = $4
WHERE id = $1 AND workspace_id = $2
RETURNING *;
