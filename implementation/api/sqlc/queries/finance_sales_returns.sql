-- name: CreateSalesReturn :one
INSERT INTO sales_returns (
    workspace_id, return_number, sale_id, invoice_id,
    customer_id, customer_name, return_date, currency,
    currency_exponent, subtotal_minor, tax_amount_minor,
    total_amount_minor, reason, status, action_taken,
    created_by_user_id, idempotency_key
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
) RETURNING *;

-- name: GetSalesReturnByID :one
SELECT * FROM sales_returns
WHERE id = $1 AND workspace_id = $2;

-- name: ListSalesReturns :many
SELECT * FROM sales_returns
WHERE workspace_id = $1
  AND (sqlc.narg('customer_id')::bigint IS NULL OR customer_id = sqlc.narg('customer_id'))
  AND (sqlc.narg('status')::text IS NULL OR status = sqlc.narg('status'))
  AND (sqlc.narg('before_id')::bigint IS NULL OR id < sqlc.narg('before_id'))
ORDER BY return_date DESC, id DESC
LIMIT $2;

-- name: CreateSalesReturnItem :one
INSERT INTO sales_return_items (
    sales_return_id, workspace_id, description,
    catalogue_item_id, quantity, unit_price_minor,
    amount_minor, restock_inventory, outlet_id
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9
) RETURNING *;

-- name: ListSalesReturnItems :many
SELECT * FROM sales_return_items
WHERE sales_return_id = $1 AND workspace_id = $2
ORDER BY id ASC;

-- name: GetCustomerCredit :one
SELECT * FROM customer_credits
WHERE workspace_id = $1 AND customer_id = $2 AND currency = $3;

-- name: GetCustomerCreditForUpdate :one
SELECT * FROM customer_credits
WHERE workspace_id = $1 AND customer_id = $2 AND currency = $3
FOR UPDATE;

-- name: UpsertCustomerCredit :one
INSERT INTO customer_credits (
    workspace_id, customer_id, currency, balance_minor
) VALUES (
    $1, $2, $3, $4
) ON CONFLICT (workspace_id, customer_id, currency)
DO UPDATE SET
    balance_minor = customer_credits.balance_minor + EXCLUDED.balance_minor,
    updated_at = now()
RETURNING *;

-- name: UpdateCustomerCreditBalance :one
UPDATE customer_credits
SET balance_minor = $4,
    updated_at = now()
WHERE id = $1 AND workspace_id = $2 AND customer_id = $3
RETURNING *;

-- name: CreateCustomerCreditTransaction :one
INSERT INTO customer_credit_transactions (
    workspace_id, credit_id, direction, amount_minor,
    source_type, source_id, notes
) VALUES (
    $1, $2, $3, $4, $5, $6, $7
) RETURNING *;

-- name: ListCustomerCreditTransactions :many
SELECT * FROM customer_credit_transactions
WHERE workspace_id = $1 AND credit_id = $2
ORDER BY id DESC
LIMIT $3;
