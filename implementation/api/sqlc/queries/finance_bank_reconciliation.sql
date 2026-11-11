-- name: CreateBankReconciliation :one
INSERT INTO bank_reconciliations (
    workspace_id, money_account_id, statement_date,
    statement_balance_minor, ledger_balance_minor, difference_minor,
    status, notes
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8
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

-- name: CompleteBankReconciliation :one
UPDATE bank_reconciliations
SET status = 'reconciled',
    difference_minor = 0,
    reconciled_at = NOW(),
    reconciled_by_user_id = $3,
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
