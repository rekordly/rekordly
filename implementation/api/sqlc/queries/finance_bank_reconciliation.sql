-- name: CreateBankReconciliation :one
INSERT INTO bank_reconciliations (
    workspace_id, money_account_id, statement_date,
    statement_balance_minor, ledger_balance_minor, cleared_balance_minor,
    difference_minor, status, reconciliation_type, denominations, notes
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
) RETURNING *;

-- name: GetBankReconciliationByID :one
SELECT * FROM bank_reconciliations
WHERE id = $1 AND workspace_id = $2;

-- name: ListBankReconciliations :many
SELECT * FROM bank_reconciliations
WHERE workspace_id = $1
  AND (sqlc.narg('money_account_id')::bigint IS NULL OR money_account_id = sqlc.narg('money_account_id'))
ORDER BY statement_date DESC, id DESC
LIMIT $2;

-- name: UpdateBankReconciliationBalances :one
UPDATE bank_reconciliations
SET cleared_balance_minor = $3,
    difference_minor = $4,
    updated_at = NOW()
WHERE id = $1 AND workspace_id = $2
RETURNING *;

-- name: CompleteBankReconciliation :one
UPDATE bank_reconciliations
SET status = 'reconciled',
    cleared_balance_minor = $3,
    difference_minor = $4,
    reconciled_at = NOW(),
    reconciled_by_user_id = $5,
    updated_at = NOW()
WHERE id = $1 AND workspace_id = $2
RETURNING *;

-- name: CreateReconciliationMatch :one
INSERT INTO bank_reconciliation_matches (
    workspace_id, reconciliation_id, transaction_id, match_status
) VALUES (
    $1, $2, $3, $4
) RETURNING *;

-- name: ListReconciliationMatches :many
SELECT * FROM bank_reconciliation_matches
WHERE workspace_id = $1 AND reconciliation_id = $2
ORDER BY id ASC;

-- name: DeleteReconciliationMatch :exec
DELETE FROM bank_reconciliation_matches
WHERE workspace_id = $1 AND reconciliation_id = $2 AND transaction_id = $3;

-- name: CreateBankImportBatch :one
INSERT INTO bank_import_batches (
    workspace_id, money_account_id, file_name, row_count, imported_by_user_id
) VALUES (
    $1, $2, $3, $4, $5
) RETURNING *;

-- name: CreateBankLine :one
INSERT INTO bank_lines (
    workspace_id, batch_id, money_account_id, transaction_date,
    description, reference, direction, amount_minor, matched_transaction_id,
    match_status, fingerprint
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
) ON CONFLICT (workspace_id, money_account_id, fingerprint) DO NOTHING
RETURNING *;

-- name: ListBankLines :many
SELECT * FROM bank_lines
WHERE workspace_id = $1 AND money_account_id = $2
ORDER BY transaction_date DESC, id DESC
LIMIT $3;

-- name: UpdateBankLineMatch :one
UPDATE bank_lines
SET matched_transaction_id = $3,
    match_status = $4
WHERE id = $1 AND workspace_id = $2
RETURNING *;

-- name: ListAccountTransactionsForRecon :many
SELECT id, direction, amount_minor, currency, currency_exponent, effective_date, money_account_id, destination_account_id, counterparty_name, notes, reference, status
FROM money_transactions
WHERE workspace_id = $1
  AND (money_account_id = $2 OR destination_account_id = $2)
  AND status = 'posted'
  AND effective_date <= $3
ORDER BY effective_date DESC, id DESC
LIMIT $4;
