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
