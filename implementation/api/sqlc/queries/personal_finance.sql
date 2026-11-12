-- Blueprint 10: Personal Finance, Budgets, Loans, Assets, Investments, Owner Transfers & All Summary

-- ==================== Accounts ====================

-- name: ListMoneyAccountsOrdered :many
SELECT * FROM money_accounts
WHERE workspace_id = $1
  AND (sqlc.narg('is_active')::boolean IS NULL OR is_active = sqlc.narg('is_active'))
ORDER BY display_order ASC, id ASC;

-- name: GetMoneyAccountForUpdate :one
SELECT * FROM money_accounts
WHERE id = $1 AND workspace_id = $2
FOR UPDATE;

-- name: UpdateMoneyAccountDetails :one
UPDATE money_accounts
SET name = $3,
    institution_name = $4,
    masked_reference = $5,
    display_order = $6,
    icon = $7,
    color = $8,
    version = version + 1,
    updated_at = now()
WHERE id = $1 AND workspace_id = $2
RETURNING *;

-- name: SetMoneyAccountArchived :one
UPDATE money_accounts
SET is_active = $3,
    archived_at = CASE WHEN $3 = false THEN now() ELSE NULL END,
    version = version + 1,
    updated_at = now()
WHERE id = $1 AND workspace_id = $2
RETURNING *;

-- name: CountAccountTransactions :one
SELECT COUNT(*)::bigint FROM money_transactions
WHERE workspace_id = $1 AND (money_account_id = $2 OR destination_account_id = $2);

-- ==================== Categories & Tags ====================

-- name: UpdateCategoryDetails :one
UPDATE categories
SET name = $3,
    parent_id = $4,
    display_order = $5,
    icon = $6,
    color = $7,
    updated_at = now()
WHERE id = $1 AND workspace_id = $2
RETURNING *;

-- name: SetCategoryArchived :one
UPDATE categories
SET is_active = $3,
    is_archived = NOT $3,
    archived_at = CASE WHEN $3 = false THEN now() ELSE NULL END,
    updated_at = now()
WHERE id = $1 AND workspace_id = $2
RETURNING *;

-- name: CreatePersonalTag :one
INSERT INTO personal_tags (workspace_id, name, color)
VALUES ($1, $2, $3)
RETURNING *;

-- name: ListPersonalTags :many
SELECT * FROM personal_tags
WHERE workspace_id = $1 AND is_active = true
ORDER BY name ASC;

-- name: ArchivePersonalTag :one
UPDATE personal_tags
SET is_active = false, updated_at = now()
WHERE id = $1 AND workspace_id = $2
RETURNING *;

-- ==================== Personal Budgets, Lines, Versions & Alerts ====================

-- name: CreatePersonalBudget :one
INSERT INTO budgets (
    workspace_id, name, category_id, scope, period,
    amount_minor, income_goal_minor, currency, currency_exponent,
    start_date, end_date, is_active, status, alert_thresholds,
    copied_from_budget_id, timezone, notes, idempotency_key, created_by_user_id
) VALUES (
    $1, $2, $3, $4, $5,
    $6, $7, $8, $9,
    $10, $11, $12, $13, $14,
    $15, $16, $17, $18, $19
) RETURNING *;

-- name: UpdatePersonalBudgetPlan :one
UPDATE budgets
SET name = $3,
    amount_minor = $4,
    income_goal_minor = $5,
    start_date = $6,
    end_date = $7,
    status = $8,
    is_active = ($8 = 'active'),
    alert_thresholds = $9,
    notes = $10,
    version = version + 1,
    updated_at = now()
WHERE id = $1 AND workspace_id = $2
RETURNING *;

-- name: CreateBudgetLine :one
INSERT INTO budget_lines (workspace_id, budget_id, category_id, limit_minor, notes)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: ListBudgetLines :many
SELECT bl.*, c.name AS category_name
FROM budget_lines bl
LEFT JOIN categories c ON c.id = bl.category_id AND c.workspace_id = bl.workspace_id
WHERE bl.workspace_id = $1 AND bl.budget_id = $2
ORDER BY bl.id ASC;

-- name: DeleteBudgetLinesByBudget :exec
DELETE FROM budget_lines
WHERE workspace_id = $1 AND budget_id = $2;

-- name: CreateBudgetVersion :one
INSERT INTO budget_versions (workspace_id, budget_id, version_number, snapshot, changed_by_user_id, change_reason)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: ListBudgetVersions :many
SELECT * FROM budget_versions
WHERE workspace_id = $1 AND budget_id = $2
ORDER BY version_number DESC;

-- name: InsertBudgetAlertEvent :one
INSERT INTO budget_alert_events (
    workspace_id, budget_id, threshold_percent, actual_minor, limit_minor, usage_basis_points, message
) VALUES (
    $1, $2, $3, $4, $5, $6, $7
)
ON CONFLICT (workspace_id, budget_id, threshold_percent) DO NOTHING
RETURNING *;

-- name: ListBudgetAlertEvents :many
SELECT * FROM budget_alert_events
WHERE workspace_id = $1
  AND (sqlc.narg('budget_id')::bigint IS NULL OR budget_id = sqlc.narg('budget_id'))
ORDER BY triggered_at DESC, id DESC
LIMIT $2;

-- name: CalculatePersonalBudgetActual :one
WITH RECURSIVE cat_tree AS (
    SELECT id FROM categories WHERE workspace_id = $1 AND id = sqlc.narg('category_id')::bigint
    UNION ALL
    SELECT c.id FROM categories c
    INNER JOIN cat_tree ct ON c.parent_id = ct.id
    WHERE c.workspace_id = $1
)
SELECT COALESCE(SUM(mt.amount_minor), 0)::bigint AS actual_minor
FROM money_transactions mt
WHERE mt.workspace_id = $1
  AND mt.direction = 'money_out'
  AND mt.status = 'posted'
  AND mt.is_void = false
  AND mt.effective_date >= sqlc.arg('from_date')::date
  AND mt.effective_date <= sqlc.arg('to_date')::date
  AND mt.purpose NOT IN (
      'transfer', 'owner_transfer', 'opening_balance',
      'loan_principal', 'loan_lent', 'loan_repayment',
      'investment_purchase', 'investment_contribution', 'asset_acquisition'
  )
  AND (
      sqlc.narg('category_id')::bigint IS NULL
      OR mt.category_id IN (SELECT id FROM cat_tree)
  );

-- ==================== Loans ====================

-- name: CreateLoan :one
INSERT INTO loans (
    workspace_id, direction, counterparty_name, counterparty_id,
    principal_minor, outstanding_principal_minor, currency, currency_exponent,
    start_date, due_date, interest_rate_bps, interest_arrangement,
    money_account_id, is_opening_balance, status, notes, evidence_key,
    idempotency_key, created_by_user_id
) VALUES (
    $1, $2, $3, $4,
    $5, $6, $7, $8,
    $9, $10, $11, $12,
    $13, $14, $15, $16, $17,
    $18, $19
) RETURNING *;

-- name: GetLoanByID :one
SELECT * FROM loans
WHERE id = $1 AND workspace_id = $2;

-- name: GetLoanForUpdate :one
SELECT * FROM loans
WHERE id = $1 AND workspace_id = $2
FOR UPDATE;

-- name: GetLoanByIdempotency :one
SELECT * FROM loans
WHERE workspace_id = $1 AND idempotency_key = $2;

-- name: ListLoans :many
SELECT * FROM loans
WHERE workspace_id = $1
  AND (sqlc.narg('direction')::text IS NULL OR direction = sqlc.narg('direction'))
  AND (sqlc.narg('status')::text IS NULL OR status = sqlc.narg('status'))
ORDER BY
  CASE WHEN status IN ('overdue', 'active', 'partially_repaid') THEN 0 ELSE 1 END ASC,
  due_date ASC NULLS LAST,
  id DESC
LIMIT $2;

-- name: ListUpcomingLoanDueDates :many
SELECT * FROM loans
WHERE workspace_id = $1
  AND status IN ('active', 'partially_repaid', 'overdue')
  AND due_date IS NOT NULL
  AND due_date <= $2
ORDER BY due_date ASC, id ASC
LIMIT 10;

-- name: UpdateLoanBalancesAndStatus :one
UPDATE loans
SET outstanding_principal_minor = $3,
    total_interest_paid_minor = $4,
    total_fees_paid_minor = $5,
    status = $6,
    version = version + 1,
    updated_at = now()
WHERE id = $1 AND workspace_id = $2
RETURNING *;

-- name: CreateLoanEvent :one
INSERT INTO loan_events (
    workspace_id, loan_id, event_type, effective_date,
    total_amount_minor, principal_minor, interest_minor, fee_minor,
    money_account_id, money_transaction_id, ledger_entry_id, reversed_event_id,
    notes, idempotency_key, created_by_user_id
) VALUES (
    $1, $2, $3, $4,
    $5, $6, $7, $8,
    $9, $10, $11, $12,
    $13, $14, $15
) RETURNING *;

-- name: GetLoanEventByID :one
SELECT * FROM loan_events
WHERE id = $1 AND workspace_id = $2;

-- name: GetLoanEventByIdempotency :one
SELECT * FROM loan_events
WHERE workspace_id = $1 AND idempotency_key = $2;

-- name: ListLoanEvents :many
SELECT * FROM loan_events
WHERE workspace_id = $1 AND loan_id = $2
ORDER BY effective_date DESC, id DESC;

-- name: MarkLoanEventReversed :one
UPDATE loan_events
SET is_reversed = true
WHERE id = $1 AND workspace_id = $2 AND is_reversed = false
RETURNING *;

-- name: CreateLoanScheduleItem :one
INSERT INTO loan_schedule_items (
    workspace_id, loan_id, installment_number, due_date,
    expected_total_minor, expected_principal_minor, expected_interest_minor, reminder_enabled
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8
) RETURNING *;

-- name: ListLoanScheduleItems :many
SELECT * FROM loan_schedule_items
WHERE workspace_id = $1 AND loan_id = $2
ORDER BY installment_number ASC;

-- ==================== Investments ====================

-- name: CreateInvestment :one
INSERT INTO investments (
    workspace_id, name, investment_type, institution_name,
    currency, currency_exponent, status, notes, idempotency_key, created_by_user_id
) VALUES (
    $1, $2, $3, $4,
    $5, $6, $7, $8, $9, $10
) RETURNING *;

-- name: GetInvestmentByID :one
SELECT * FROM investments
WHERE id = $1 AND workspace_id = $2;

-- name: GetInvestmentForUpdate :one
SELECT * FROM investments
WHERE id = $1 AND workspace_id = $2
FOR UPDATE;

-- name: GetInvestmentByIdempotency :one
SELECT * FROM investments
WHERE workspace_id = $1 AND idempotency_key = $2;

-- name: ListInvestments :many
SELECT * FROM investments
WHERE workspace_id = $1
  AND (sqlc.narg('status')::text IS NULL OR status = sqlc.narg('status'))
ORDER BY id DESC
LIMIT $2;

-- name: UpdateInvestmentTotals :one
UPDATE investments
SET total_units = $3,
    cost_basis_minor = $4,
    total_income_minor = $5,
    status = $6,
    version = version + 1,
    updated_at = now()
WHERE id = $1 AND workspace_id = $2
RETURNING *;

-- name: UpdateInvestmentManualValuation :one
UPDATE investments
SET latest_manual_value_minor = $3,
    latest_valuation_date = $4,
    latest_valuation_source = $5,
    version = version + 1,
    updated_at = now()
WHERE id = $1 AND workspace_id = $2
RETURNING *;

-- name: CreateInvestmentEvent :one
INSERT INTO investment_events (
    workspace_id, investment_id, event_type, effective_date,
    amount_minor, units_delta, cost_basis_delta_minor, realized_gain_loss_minor,
    gain_loss_status, money_account_id, money_transaction_id, ledger_entry_id,
    notes, idempotency_key, created_by_user_id
) VALUES (
    $1, $2, $3, $4,
    $5, $6, $7, $8,
    $9, $10, $11, $12,
    $13, $14, $15
) RETURNING *;

-- name: GetInvestmentEventByIdempotency :one
SELECT * FROM investment_events
WHERE workspace_id = $1 AND idempotency_key = $2;

-- name: ListInvestmentEvents :many
SELECT * FROM investment_events
WHERE workspace_id = $1 AND investment_id = $2
ORDER BY effective_date DESC, id DESC;

-- name: CreateInvestmentValuation :one
INSERT INTO investment_valuations (
    workspace_id, investment_id, valuation_date, value_minor, source, notes, created_by_user_id
) VALUES (
    $1, $2, $3, $4, $5, $6, $7
) RETURNING *;

-- name: ListInvestmentValuations :many
SELECT * FROM investment_valuations
WHERE workspace_id = $1 AND investment_id = $2
ORDER BY valuation_date DESC, id DESC;

-- ==================== Personal Assets ====================

-- name: CreateAsset :one
INSERT INTO assets (
    workspace_id, name, asset_type, currency, currency_exponent,
    status, evidence_key, notes, idempotency_key, created_by_user_id
) VALUES (
    $1, $2, $3, $4, $5,
    $6, $7, $8, $9, $10
) RETURNING *;

-- name: GetAssetByID :one
SELECT * FROM assets
WHERE id = $1 AND workspace_id = $2;

-- name: GetAssetForUpdate :one
SELECT * FROM assets
WHERE id = $1 AND workspace_id = $2
FOR UPDATE;

-- name: GetAssetByIdempotency :one
SELECT * FROM assets
WHERE workspace_id = $1 AND idempotency_key = $2;

-- name: ListAssets :many
SELECT * FROM assets
WHERE workspace_id = $1
  AND (sqlc.narg('status')::text IS NULL OR status = sqlc.narg('status'))
ORDER BY id DESC
LIMIT $2;

-- name: UpdateAssetAcquisition :one
UPDATE assets
SET acquisition_date = $3,
    acquisition_cost_minor = $4,
    is_opening_asset = $5,
    money_account_id = $6,
    status = 'active',
    evidence_key = COALESCE($7, evidence_key),
    version = version + 1,
    updated_at = now()
WHERE id = $1 AND workspace_id = $2
RETURNING *;

-- name: UpdateAssetDisposal :one
UPDATE assets
SET disposal_date = $3,
    disposal_proceeds_minor = $4,
    disposal_costs_minor = $5,
    realized_gain_loss_minor = $6,
    status = 'disposed',
    version = version + 1,
    updated_at = now()
WHERE id = $1 AND workspace_id = $2
RETURNING *;

-- name: UpdateAssetManualValuation :one
UPDATE assets
SET latest_manual_value_minor = $3,
    latest_valuation_date = $4,
    latest_valuation_source = $5,
    version = version + 1,
    updated_at = now()
WHERE id = $1 AND workspace_id = $2
RETURNING *;

-- name: CreateAssetEvent :one
INSERT INTO asset_events (
    workspace_id, asset_id, event_type, effective_date,
    amount_minor, disposal_costs_minor, counterparty_name,
    money_account_id, money_transaction_id, ledger_entry_id,
    notes, evidence_key, idempotency_key, created_by_user_id
) VALUES (
    $1, $2, $3, $4,
    $5, $6, $7,
    $8, $9, $10,
    $11, $12, $13, $14
) RETURNING *;

-- name: GetAssetEventByIdempotency :one
SELECT * FROM asset_events
WHERE workspace_id = $1 AND idempotency_key = $2;

-- name: ListAssetEvents :many
SELECT * FROM asset_events
WHERE workspace_id = $1 AND asset_id = $2
ORDER BY effective_date DESC, id DESC;

-- name: CreateAssetValuation :one
INSERT INTO asset_valuations (
    workspace_id, asset_id, valuation_date, value_minor, source, notes, created_by_user_id
) VALUES (
    $1, $2, $3, $4, $5, $6, $7
) RETURNING *;

-- name: ListAssetValuations :many
SELECT * FROM asset_valuations
WHERE workspace_id = $1 AND asset_id = $2
ORDER BY valuation_date DESC, id DESC;

-- ==================== Owner Transfers & All Summary ====================

-- name: GetWorkspaceByIDAndOwner :one
SELECT * FROM workspaces
WHERE id = $1 AND owner_user_id = $2;

-- name: ListOwnedWorkspacesByUser :many
SELECT * FROM workspaces
WHERE owner_user_id = $1
ORDER BY CASE WHEN kind = 'personal' THEN 0 ELSE 1 END, id ASC;

-- name: CreateOwnerTransferGroup :one
INSERT INTO owner_transfer_groups (
    owner_user_id, from_workspace_id, to_workspace_id,
    from_money_account_id, to_money_account_id, purpose,
    amount_minor, currency, currency_exponent, effective_date,
    from_money_transaction_id, to_money_transaction_id,
    from_ledger_entry_id, to_ledger_entry_id,
    notes, reference, status, idempotency_key
) VALUES (
    $1, $2, $3,
    $4, $5, $6,
    $7, $8, $9, $10,
    $11, $12,
    $13, $14,
    $15, $16, $17, $18
) RETURNING *;

-- name: GetOwnerTransferGroupByIdempotency :one
SELECT * FROM owner_transfer_groups
WHERE owner_user_id = $1 AND idempotency_key = $2;

-- name: ListOwnerTransferGroupsByOwner :many
SELECT * FROM owner_transfer_groups
WHERE owner_user_id = $1
ORDER BY effective_date DESC, id DESC
LIMIT $2;

-- name: SumOwnerTransfersForWorkspaces :one
SELECT COALESCE(SUM(amount_minor), 0)::bigint AS total_eliminated_minor
FROM owner_transfer_groups
WHERE owner_user_id = $1
  AND status = 'posted'
  AND currency = $2
  AND effective_date >= sqlc.arg('from_date')::date
  AND effective_date <= sqlc.arg('to_date')::date
  AND from_workspace_id = ANY(sqlc.arg('workspace_ids')::bigint[])
  AND to_workspace_id = ANY(sqlc.arg('workspace_ids')::bigint[]);

-- ==================== Personal Dashboard & Activity ====================

-- name: GetPersonalPeriodCashMovement :one
SELECT
    COALESCE(SUM(CASE WHEN direction = 'money_in' THEN amount_minor ELSE 0 END), 0)::bigint AS cash_inflow_minor,
    COALESCE(SUM(CASE WHEN direction = 'money_out' THEN amount_minor ELSE 0 END), 0)::bigint AS cash_outflow_minor
FROM money_transactions
WHERE workspace_id = $1
  AND status = 'posted'
  AND is_void = false
  AND currency = $2
  AND effective_date >= sqlc.arg('from_date')::date
  AND effective_date <= sqlc.arg('to_date')::date
  AND direction IN ('money_in', 'money_out')
  AND purpose <> 'opening_balance';

-- name: GetPersonalPeriodIncomeExpense :one
SELECT
    COALESCE(SUM(CASE WHEN direction = 'money_in' THEN amount_minor ELSE 0 END), 0)::bigint AS income_minor,
    COALESCE(SUM(CASE WHEN direction = 'money_out' THEN amount_minor ELSE 0 END), 0)::bigint AS expense_minor
FROM money_transactions
WHERE workspace_id = $1
  AND status = 'posted'
  AND is_void = false
  AND currency = $2
  AND effective_date >= sqlc.arg('from_date')::date
  AND effective_date <= sqlc.arg('to_date')::date
  AND direction IN ('money_in', 'money_out')
  AND purpose NOT IN (
      'transfer', 'owner_transfer', 'opening_balance',
      'loan_borrowed', 'loan_repayment', 'loan_lent', 'loan_collection', 'loan_principal',
      'investment_purchase', 'investment_contribution', 'investment_disposal',
      'asset_acquisition', 'asset_disposal'
  );

-- name: GetPersonalSpendingByCategory :many
SELECT
    COALESCE(c.name, 'Unclassified') AS category_name,
    mt.category_id,
    COALESCE(SUM(mt.amount_minor), 0)::bigint AS total_minor
FROM money_transactions mt
LEFT JOIN categories c ON c.id = mt.category_id AND c.workspace_id = mt.workspace_id
WHERE mt.workspace_id = $1
  AND mt.direction = 'money_out'
  AND mt.status = 'posted'
  AND mt.is_void = false
  AND mt.currency = $2
  AND mt.effective_date >= sqlc.arg('from_date')::date
  AND mt.effective_date <= sqlc.arg('to_date')::date
  AND mt.purpose NOT IN (
      'transfer', 'owner_transfer', 'opening_balance',
      'loan_principal', 'loan_lent', 'loan_repayment',
      'investment_purchase', 'investment_contribution', 'asset_acquisition'
  )
GROUP BY c.name, mt.category_id
ORDER BY total_minor DESC;

-- name: CountPersonalNeedsReview :one
SELECT (
    (SELECT COUNT(*)::bigint FROM money_record_drafts mrd WHERE mrd.workspace_id = sqlc.arg('workspace_id') AND mrd.state IN ('saved', 'needs_review')) +
    (SELECT COUNT(*)::bigint FROM money_transactions mt2 WHERE mt2.workspace_id = sqlc.arg('workspace_id') AND mt2.status = 'posted' AND mt2.is_void = false AND mt2.category_id IS NULL AND mt2.direction IN ('money_in', 'money_out') AND mt2.purpose NOT IN ('transfer', 'owner_transfer', 'opening_balance'))
)::bigint AS needs_review_count;

-- name: ListPersonalActivity :many
SELECT
    mt.id,
    mt.workspace_id,
    mt.direction,
    mt.status,
    mt.amount_minor,
    mt.currency,
    mt.currency_exponent,
    mt.effective_date,
    mt.money_account_id,
    ma.name AS account_name,
    mt.destination_account_id,
    da.name AS destination_account_name,
    mt.category_id,
    c.name AS category_name,
    mt.counterparty_name,
    mt.purpose,
    mt.notes,
    mt.reference,
    mt.tags,
    mt.created_at,
    (SELECT COUNT(*)::bigint FROM attachments_metadata am WHERE am.workspace_id = mt.workspace_id AND am.transaction_id = mt.id) AS attachment_count
FROM money_transactions mt
LEFT JOIN money_accounts ma ON ma.id = mt.money_account_id AND ma.workspace_id = mt.workspace_id
LEFT JOIN money_accounts da ON da.id = mt.destination_account_id AND da.workspace_id = mt.workspace_id
LEFT JOIN categories c ON c.id = mt.category_id AND c.workspace_id = mt.workspace_id
WHERE mt.workspace_id = $1
  AND mt.effective_date >= sqlc.arg('from_date')::date
  AND mt.effective_date <= sqlc.arg('to_date')::date
  AND (
      sqlc.narg('cursor_date')::date IS NULL
      OR (mt.effective_date, mt.id) < (sqlc.narg('cursor_date')::date, sqlc.narg('cursor_id')::bigint)
  )
  AND (
      sqlc.narg('activity_tab')::text IS NULL
      OR sqlc.narg('activity_tab')::text = 'all'
      OR (sqlc.narg('activity_tab')::text = 'income' AND mt.direction = 'money_in' AND mt.purpose NOT IN ('transfer', 'owner_transfer', 'opening_balance', 'loan_borrowed', 'loan_collection', 'investment_disposal', 'asset_disposal'))
      OR (sqlc.narg('activity_tab')::text = 'expenses' AND mt.direction = 'money_out' AND mt.purpose NOT IN ('transfer', 'owner_transfer', 'opening_balance', 'loan_lent', 'loan_repayment', 'investment_purchase', 'investment_contribution', 'asset_acquisition'))
      OR (sqlc.narg('activity_tab')::text = 'transfers' AND (mt.direction = 'transfer' OR mt.purpose IN ('transfer', 'owner_transfer')))
      OR (sqlc.narg('activity_tab')::text = 'loans' AND mt.purpose IN ('loan_borrowed', 'loan_lent', 'loan_repayment', 'loan_collection', 'loan_principal'))
      OR (sqlc.narg('activity_tab')::text = 'investments' AND mt.purpose IN ('investment_purchase', 'investment_contribution', 'investment_income', 'investment_disposal'))
      OR (sqlc.narg('activity_tab')::text = 'assets' AND mt.purpose IN ('asset_acquisition', 'asset_disposal'))
  )
ORDER BY mt.effective_date DESC, mt.id DESC
LIMIT $2;
