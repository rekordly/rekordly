-- name: GetIncomeExpenseTotals :one
SELECT
    COALESCE(SUM(CASE WHEN ll.account_class = 'revenue' THEN ll.credit_minor - ll.debit_minor ELSE 0 END), 0)::bigint AS income_minor,
    COALESCE(SUM(CASE WHEN ll.account_class = 'expense' THEN ll.debit_minor - ll.credit_minor ELSE 0 END), 0)::bigint AS expense_minor
FROM ledger_lines ll
JOIN ledger_entries le ON le.id = ll.ledger_entry_id AND le.workspace_id = ll.workspace_id
WHERE ll.workspace_id = @workspace_id
  AND le.currency = @currency::text
  AND le.entry_date BETWEEN @from_date AND @to_date;

-- name: GetMonthlyIncomeExpense :many
SELECT
    to_char(le.entry_date, 'YYYY-MM')::text AS month,
    COALESCE(SUM(CASE WHEN ll.account_class = 'revenue' THEN ll.credit_minor - ll.debit_minor ELSE 0 END), 0)::bigint AS income_minor,
    COALESCE(SUM(CASE WHEN ll.account_class = 'expense' THEN ll.debit_minor - ll.credit_minor ELSE 0 END), 0)::bigint AS expense_minor
FROM ledger_lines ll
JOIN ledger_entries le ON le.id = ll.ledger_entry_id AND le.workspace_id = ll.workspace_id
WHERE ll.workspace_id = @workspace_id
  AND le.currency = @currency::text
  AND le.entry_date BETWEEN @from_date AND @to_date
GROUP BY 1
ORDER BY 1;

-- name: GetCashBalance :one
SELECT COALESCE(SUM(current_balance_minor), 0)::bigint AS balance_minor
FROM money_accounts
WHERE workspace_id = @workspace_id
  AND currency = @currency::text
  AND is_active = true;

-- name: GetSpendingByCategory :many
SELECT
    COALESCE(c.name, 'Uncategorized')::text AS category_name,
    SUM(spend.amount_minor)::bigint AS total_minor
FROM (
    SELECT t.category_id, t.amount_minor
    FROM money_transactions t
    WHERE t.workspace_id = @workspace_id
      AND t.currency = @currency::text
      AND t.direction = 'money_out'
      AND t.status = 'posted'
      AND t.effective_date BETWEEN @from_date AND @to_date
    UNION ALL
    SELECT p.category_id, p.total_amount_minor
    FROM purchases p
    WHERE p.workspace_id = @workspace_id
      AND p.currency = @currency::text
      AND p.status <> 'voided'
      AND p.purchase_date BETWEEN @from_date AND @to_date
) AS spend
LEFT JOIN categories c ON c.id = spend.category_id AND c.workspace_id = @workspace_id
GROUP BY 1
ORDER BY 2 DESC
LIMIT 8;

-- name: GetOpenBalances :one
-- What customers still owe and what is still owed to suppliers, right now.
-- Sales and invoices are separate records, so they are reported separately.
SELECT
    (SELECT COALESCE(SUM(s.total_amount_minor - s.paid_amount_minor), 0) FROM sales s
      WHERE s.workspace_id = @workspace_id AND s.currency = @currency::text AND s.status IN ('unpaid', 'partially_paid'))::bigint AS sales_unpaid_minor,
    (SELECT COUNT(*) FROM sales s
      WHERE s.workspace_id = @workspace_id AND s.currency = @currency::text AND s.status IN ('unpaid', 'partially_paid'))::bigint AS sales_unpaid_count,
    (SELECT COALESCE(SUM(i.total_amount_minor - i.paid_amount_minor), 0) FROM invoices i
      WHERE i.workspace_id = @workspace_id AND i.currency = @currency::text AND i.document_kind = 'invoice'
        AND i.status IN ('finalized', 'partially_paid'))::bigint AS invoices_unpaid_minor,
    (SELECT COUNT(*) FROM invoices i
      WHERE i.workspace_id = @workspace_id AND i.currency = @currency::text AND i.document_kind = 'invoice'
        AND i.status IN ('finalized', 'partially_paid'))::bigint AS invoices_unpaid_count,
    (SELECT COALESCE(SUM(i.total_amount_minor - i.paid_amount_minor), 0) FROM invoices i
      WHERE i.workspace_id = @workspace_id AND i.currency = @currency::text AND i.document_kind = 'invoice'
        AND i.status IN ('finalized', 'partially_paid') AND i.due_date < @today::date)::bigint AS invoices_overdue_minor,
    (SELECT COUNT(*) FROM invoices i
      WHERE i.workspace_id = @workspace_id AND i.currency = @currency::text AND i.document_kind = 'invoice'
        AND i.status IN ('finalized', 'partially_paid') AND i.due_date < @today::date)::bigint AS invoices_overdue_count,
    (SELECT COALESCE(SUM(p.total_amount_minor - p.paid_amount_minor), 0) FROM purchases p
      WHERE p.workspace_id = @workspace_id AND p.currency = @currency::text AND p.status IN ('unpaid', 'partially_paid'))::bigint AS purchases_unpaid_minor,
    (SELECT COUNT(*) FROM purchases p
      WHERE p.workspace_id = @workspace_id AND p.currency = @currency::text AND p.status IN ('unpaid', 'partially_paid'))::bigint AS purchases_unpaid_count;

-- name: GetSalesTotals :one
SELECT
    COALESCE(SUM(s.total_amount_minor), 0)::bigint AS total_minor,
    COALESCE(SUM(s.paid_amount_minor), 0)::bigint AS paid_minor,
    COUNT(*)::bigint AS sale_count
FROM sales s
WHERE s.workspace_id = @workspace_id
  AND s.currency = @currency::text
  AND s.status IN ('unpaid', 'partially_paid', 'paid')
  AND s.sale_date BETWEEN @from_date AND @to_date;

-- name: GetPurchaseTotals :one
SELECT
    COALESCE(SUM(p.total_amount_minor), 0)::bigint AS total_minor,
    COALESCE(SUM(p.paid_amount_minor), 0)::bigint AS paid_minor,
    COUNT(*)::bigint AS purchase_count
FROM purchases p
WHERE p.workspace_id = @workspace_id
  AND p.currency = @currency::text
  AND p.status IN ('unpaid', 'partially_paid', 'paid')
  AND p.purchase_date BETWEEN @from_date AND @to_date;

-- name: GetDailyIncomeExpense :many
SELECT
    le.entry_date::date AS day,
    COALESCE(SUM(CASE WHEN ll.account_class = 'revenue' THEN ll.credit_minor - ll.debit_minor ELSE 0 END), 0)::bigint AS income_minor,
    COALESCE(SUM(CASE WHEN ll.account_class = 'expense' THEN ll.debit_minor - ll.credit_minor ELSE 0 END), 0)::bigint AS expense_minor
FROM ledger_lines ll
JOIN ledger_entries le ON le.id = ll.ledger_entry_id AND le.workspace_id = ll.workspace_id
WHERE ll.workspace_id = @workspace_id
  AND le.currency = @currency::text
  AND le.entry_date BETWEEN @from_date AND @to_date
GROUP BY 1
ORDER BY 1;
