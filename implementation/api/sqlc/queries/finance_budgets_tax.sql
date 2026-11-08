-- Budgets and Tax Queries
-- FIN-BE-04: Budgets and tax-readiness aggregates

-- name: CreateBudget :one
INSERT INTO budgets (
    workspace_id, name, category_id, scope, period,
    amount_minor, currency, currency_exponent, start_date, end_date,
    is_active, notes, idempotency_key, created_by_user_id
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
) RETURNING *;

-- name: GetBudgetByID :one
SELECT * FROM budgets
WHERE id = $1 AND workspace_id = $2;

-- name: GetBudgetByIdempotency :one
SELECT * FROM budgets
WHERE workspace_id = $1 AND idempotency_key = $2;

-- name: ListBudgets :many
SELECT * FROM budgets
WHERE workspace_id = $1
  AND (sqlc.narg('scope')::text IS NULL OR scope = sqlc.narg('scope'))
  AND (sqlc.narg('is_active')::boolean IS NULL OR is_active = sqlc.narg('is_active'))
  AND (sqlc.narg('from_date')::date IS NULL OR end_date >= sqlc.narg('from_date'))
  AND (sqlc.narg('to_date')::date IS NULL OR start_date <= sqlc.narg('to_date'))
ORDER BY start_date DESC, id DESC
LIMIT $2;

-- name: CountActiveBudgets :one
SELECT COUNT(*)::bigint FROM budgets
WHERE workspace_id = $1 AND is_active = true;

-- name: UpdateBudget :one
UPDATE budgets
SET name = $3,
    amount_minor = $4,
    start_date = $5,
    end_date = $6,
    notes = $7,
    is_active = $8,
    updated_at = now()
WHERE id = $1 AND workspace_id = $2
RETURNING *;

-- name: DeleteBudget :exec
DELETE FROM budgets
WHERE id = $1 AND workspace_id = $2;

-- name: CalculateBudgetActualSpending :one
SELECT COALESCE(SUM(amount_minor), 0)::bigint AS actual_minor
FROM money_transactions
WHERE workspace_id = $1
  AND direction = 'money_out'
  AND status = 'posted'
  AND effective_date >= sqlc.arg('from_date')::date
  AND effective_date <= sqlc.arg('to_date')::date
  AND (sqlc.narg('category_id')::bigint IS NULL OR category_id = sqlc.narg('category_id'));

-- name: CalculateOutputVatInvoices :one
SELECT
    COALESCE(SUM(subtotal_minor), 0)::bigint AS taxable_subtotal_minor,
    COALESCE(SUM(tax_amount_minor), 0)::bigint AS output_vat_minor,
    COALESCE(SUM(total_amount_minor), 0)::bigint AS total_sales_minor,
    COUNT(*)::bigint AS count
FROM invoices
WHERE workspace_id = $1
  AND status IN ('finalized', 'paid')
  AND issue_date >= sqlc.arg('from_date')::date
  AND issue_date <= sqlc.arg('to_date')::date;

-- name: CalculateOutputVatSales :one
SELECT
    COALESCE(SUM(subtotal_minor), 0)::bigint AS taxable_subtotal_minor,
    COALESCE(SUM(tax_amount_minor), 0)::bigint AS output_vat_minor,
    COALESCE(SUM(total_amount_minor), 0)::bigint AS total_sales_minor,
    COUNT(*)::bigint AS count
FROM sales
WHERE workspace_id = $1
  AND status IN ('confirmed', 'paid', 'partial')
  AND sale_date >= sqlc.arg('from_date')::date
  AND sale_date <= sqlc.arg('to_date')::date;

-- name: CalculateInputVatPurchases :one
SELECT
    COALESCE(SUM(subtotal_minor), 0)::bigint AS taxable_subtotal_minor,
    COALESCE(SUM(tax_amount_minor), 0)::bigint AS input_vat_minor,
    COALESCE(SUM(total_amount_minor), 0)::bigint AS total_purchases_minor,
    COUNT(*)::bigint AS count
FROM purchases
WHERE workspace_id = $1
  AND status IN ('confirmed', 'paid', 'partial')
  AND purchase_date >= sqlc.arg('from_date')::date
  AND purchase_date <= sqlc.arg('to_date')::date;

-- name: GetWorkspaceTaxSettings :one
SELECT * FROM workspace_tax_settings
WHERE workspace_id = $1;

-- name: UpsertWorkspaceTaxSettings :one
INSERT INTO workspace_tax_settings (
    workspace_id, tax_identification_number, default_vat_rate_basis_points, is_vat_registered, updated_at
) VALUES (
    $1, $2, $3, $4, now()
)
ON CONFLICT (workspace_id) DO UPDATE
SET tax_identification_number = EXCLUDED.tax_identification_number,
    default_vat_rate_basis_points = EXCLUDED.default_vat_rate_basis_points,
    is_vat_registered = EXCLUDED.is_vat_registered,
    updated_at = now()
RETURNING *;
