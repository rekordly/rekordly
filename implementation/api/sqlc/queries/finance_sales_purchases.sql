-- name: CreateCounterparty :one
INSERT INTO counterparties (
    workspace_id, name, party_type, email, phone, notes, is_active
) VALUES (
    $1, $2, $3, $4, $5, $6, $7
) RETURNING *;

-- name: GetCounterpartyByID :one
SELECT * FROM counterparties
WHERE id = $1 AND workspace_id = $2;

-- name: ListCounterparties :many
SELECT * FROM counterparties
WHERE workspace_id = $1
  AND (sqlc.narg('party_type')::text IS NULL OR party_type = sqlc.narg('party_type') OR party_type = 'both')
  AND (sqlc.narg('is_active')::boolean IS NULL OR is_active = sqlc.narg('is_active'))
ORDER BY name ASC;

-- name: CreateSale :one
INSERT INTO sales (
    workspace_id, customer_id, customer_name, sale_date,
    total_amount_minor, paid_amount_minor, currency, currency_exponent,
    status, notes, reference, idempotency_key, created_by_user_id
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
) RETURNING *;

-- name: GetSaleByID :one
SELECT * FROM sales
WHERE id = $1 AND workspace_id = $2;

-- name: GetSaleByIdempotency :one
SELECT * FROM sales
WHERE workspace_id = $1 AND idempotency_key = $2 AND status <> 'voided';

-- name: ListSales :many
SELECT * FROM sales
WHERE workspace_id = $1
  AND (sqlc.narg('from_date')::date IS NULL OR sale_date >= sqlc.narg('from_date'))
  AND (sqlc.narg('to_date')::date IS NULL OR sale_date <= sqlc.narg('to_date'))
  AND (sqlc.narg('status')::text IS NULL OR status = sqlc.narg('status'))
  AND (sqlc.narg('customer_id')::bigint IS NULL OR customer_id = sqlc.narg('customer_id'))
  AND (sqlc.narg('before_id')::bigint IS NULL OR id < sqlc.narg('before_id'))
ORDER BY sale_date DESC, id DESC
LIMIT $2;

-- name: UpdateSalePaidAmount :one
UPDATE sales
SET paid_amount_minor = paid_amount_minor + $3,
    status = CASE
        WHEN paid_amount_minor + $3 >= total_amount_minor THEN 'paid'
        WHEN paid_amount_minor + $3 > 0 THEN 'partially_paid'
        ELSE status
    END,
    updated_at = now()
WHERE id = $1 AND workspace_id = $2
RETURNING *;

-- name: VoidSale :one
UPDATE sales
SET status = 'voided',
    updated_at = now()
WHERE id = $1 AND workspace_id = $2 AND status <> 'voided'
RETURNING *;

-- name: CreatePurchase :one
INSERT INTO purchases (
    workspace_id, supplier_id, supplier_name, purchase_date,
    total_amount_minor, paid_amount_minor, currency, currency_exponent,
    status, category_id, notes, reference, idempotency_key, created_by_user_id
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
) RETURNING *;

-- name: GetPurchaseByID :one
SELECT * FROM purchases
WHERE id = $1 AND workspace_id = $2;

-- name: GetPurchaseByIdempotency :one
SELECT * FROM purchases
WHERE workspace_id = $1 AND idempotency_key = $2 AND status <> 'voided';

-- name: ListPurchases :many
SELECT * FROM purchases
WHERE workspace_id = $1
  AND (sqlc.narg('from_date')::date IS NULL OR purchase_date >= sqlc.narg('from_date'))
  AND (sqlc.narg('to_date')::date IS NULL OR purchase_date <= sqlc.narg('to_date'))
  AND (sqlc.narg('status')::text IS NULL OR status = sqlc.narg('status'))
  AND (sqlc.narg('supplier_id')::bigint IS NULL OR supplier_id = sqlc.narg('supplier_id'))
  AND (sqlc.narg('before_id')::bigint IS NULL OR id < sqlc.narg('before_id'))
ORDER BY purchase_date DESC, id DESC
LIMIT $2;

-- name: UpdatePurchasePaidAmount :one
UPDATE purchases
SET paid_amount_minor = paid_amount_minor + $3,
    status = CASE
        WHEN paid_amount_minor + $3 >= total_amount_minor THEN 'paid'
        WHEN paid_amount_minor + $3 > 0 THEN 'partially_paid'
        ELSE status
    END,
    updated_at = now()
WHERE id = $1 AND workspace_id = $2
RETURNING *;

-- name: VoidPurchase :one
UPDATE purchases
SET status = 'voided',
    updated_at = now()
WHERE id = $1 AND workspace_id = $2 AND status <> 'voided'
RETURNING *;

-- name: CreatePayment :one
INSERT INTO payments (
    workspace_id, direction, payment_date, total_amount_minor, currency, currency_exponent,
    counterparty_id, counterparty_name, linked_record_type, linked_record_id,
    status, notes, reference, idempotency_key, created_by_user_id
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
) RETURNING *;

-- name: GetPaymentByID :one
SELECT * FROM payments
WHERE id = $1 AND workspace_id = $2;

-- name: GetPaymentByIdempotency :one
SELECT * FROM payments
WHERE workspace_id = $1 AND idempotency_key = $2 AND status <> 'voided';

-- name: ListPayments :many
SELECT * FROM payments
WHERE workspace_id = $1
  AND (sqlc.narg('from_date')::date IS NULL OR payment_date >= sqlc.narg('from_date'))
  AND (sqlc.narg('to_date')::date IS NULL OR payment_date <= sqlc.narg('to_date'))
  AND (sqlc.narg('direction')::text IS NULL OR direction = sqlc.narg('direction'))
  AND (sqlc.narg('status')::text IS NULL OR status = sqlc.narg('status'))
  AND (sqlc.narg('linked_record_type')::text IS NULL OR linked_record_type = sqlc.narg('linked_record_type'))
  AND (sqlc.narg('linked_record_id')::bigint IS NULL OR linked_record_id = sqlc.narg('linked_record_id'))
  AND (sqlc.narg('before_id')::bigint IS NULL OR id < sqlc.narg('before_id'))
ORDER BY payment_date DESC, id DESC
LIMIT $2;

-- name: CreatePaymentLeg :one
INSERT INTO payment_legs (
    payment_id, workspace_id, money_account_id, amount_minor
) VALUES (
    $1, $2, $3, $4
) RETURNING *;

-- name: ListPaymentLegsByPaymentID :many
SELECT * FROM payment_legs
WHERE payment_id = $1 AND workspace_id = $2
ORDER BY id ASC;

-- name: VoidPayment :one
UPDATE payments
SET status = 'voided',
    updated_at = now()
WHERE id = $1 AND workspace_id = $2 AND status = 'posted'
RETURNING *;
