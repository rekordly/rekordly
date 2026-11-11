-- name: CreateMoneyAccount :one
INSERT INTO money_accounts (
    workspace_id, name, account_type, currency, currency_exponent, opening_balance_minor, current_balance_minor, is_active
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8
) RETURNING *;

-- name: GetMoneyAccountByID :one
SELECT * FROM money_accounts
WHERE id = $1 AND workspace_id = $2;

-- name: GetMoneyAccountByName :one
SELECT * FROM money_accounts
WHERE workspace_id = $1 AND lower(name) = lower($2);

-- name: ListMoneyAccounts :many
SELECT * FROM money_accounts
WHERE workspace_id = $1 AND (sqlc.narg('is_active')::boolean IS NULL OR is_active = sqlc.narg('is_active'))
ORDER BY id ASC;

-- name: UpdateMoneyAccountBalance :one
UPDATE money_accounts
SET current_balance_minor = current_balance_minor + $3,
    updated_at = now()
WHERE id = $1 AND workspace_id = $2
RETURNING *;

-- name: CreateCategory :one
INSERT INTO categories (
    workspace_id, name, direction, scope, account_class, is_system, is_active
) VALUES (
    $1, $2, $3, $4, $5, $6, $7
) RETURNING *;

-- name: GetCategoryByID :one
SELECT * FROM categories
WHERE id = $1 AND workspace_id = $2;

-- name: GetCategoryByNameAndDirection :one
SELECT * FROM categories
WHERE workspace_id = $1 AND lower(name) = lower($2) AND direction = $3;

-- name: ListCategories :many
SELECT * FROM categories
WHERE workspace_id = $1
  AND (sqlc.narg('direction')::text IS NULL OR direction = sqlc.narg('direction') OR direction = 'both')
  AND (sqlc.narg('scope')::text IS NULL OR scope = sqlc.narg('scope') OR scope = 'both')
  AND (sqlc.narg('is_active')::boolean IS NULL OR is_active = sqlc.narg('is_active'))
ORDER BY is_system DESC, name ASC;

-- name: CreateMoneyTransaction :one
INSERT INTO money_transactions (
    workspace_id, direction, status, amount_minor, currency, currency_exponent,
    effective_date, money_account_id, destination_account_id, category_id,
    counterparty_name, purpose, notes, reference, idempotency_key,
    created_by_user_id, posted_at
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
) RETURNING *;

-- name: GetMoneyTransactionByID :one
SELECT * FROM money_transactions
WHERE id = $1 AND workspace_id = $2;

-- name: GetMoneyTransactionByIdempotency :one
SELECT * FROM money_transactions
WHERE workspace_id = $1 AND idempotency_key = $2 AND status <> 'voided';

-- name: ListMoneyTransactions :many
SELECT * FROM money_transactions
WHERE workspace_id = $1
  AND (sqlc.narg('from_date')::date IS NULL OR effective_date >= sqlc.narg('from_date'))
  AND (sqlc.narg('to_date')::date IS NULL OR effective_date <= sqlc.narg('to_date'))
  AND (sqlc.narg('status')::text IS NULL OR status = sqlc.narg('status'))
  AND (sqlc.narg('direction')::text IS NULL OR direction = sqlc.narg('direction'))
  AND (sqlc.narg('before_id')::bigint IS NULL OR id < sqlc.narg('before_id'))
  AND (sqlc.narg('search')::text IS NULL OR purpose ILIKE '%' || sqlc.narg('search')::text || '%' OR counterparty_name ILIKE '%' || sqlc.narg('search')::text || '%' OR reference ILIKE '%' || sqlc.narg('search')::text || '%')
ORDER BY effective_date DESC, id DESC
LIMIT $2;

-- name: PostMoneyTransaction :one
UPDATE money_transactions
SET status = 'posted',
    posted_at = now(),
    updated_at = now()
WHERE id = $1 AND workspace_id = $2 AND status = 'draft'
RETURNING *;

-- name: VoidMoneyTransaction :one
UPDATE money_transactions
SET status = 'voided',
    is_void = true,
    voided_at = now(),
    void_reason = $3,
    updated_at = now()
WHERE id = $1 AND workspace_id = $2 AND status = 'posted'
RETURNING *;

-- name: CreateReversalTransaction :one
INSERT INTO money_transactions (
    workspace_id, direction, status, amount_minor, currency, currency_exponent,
    effective_date, money_account_id, destination_account_id, category_id,
    counterparty_name, purpose, notes, reference, reversal_of_id,
    created_by_user_id, posted_at
) VALUES (
    $1, $2, 'reversed', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, now()
) RETURNING *;

-- name: CreateLedgerEntry :one
INSERT INTO ledger_entries (
    workspace_id, source_type, source_id, entry_date, currency, currency_exponent, description
) VALUES (
    $1, $2, $3, $4, $5, $6, $7
) RETURNING *;

-- name: CreateLedgerLine :one
INSERT INTO ledger_lines (
    ledger_entry_id, workspace_id, account_id, account_class, debit_minor, credit_minor, description
) VALUES (
    $1, $2, $3, $4, $5, $6, $7
) RETURNING *;

-- name: GetLedgerEntryByID :one
SELECT * FROM ledger_entries
WHERE id = $1 AND workspace_id = $2;

-- name: GetLedgerLinesByEntryID :many
SELECT * FROM ledger_lines
WHERE ledger_entry_id = $1 AND workspace_id = $2
ORDER BY id ASC;

-- name: MarkLedgerEntryReversed :one
UPDATE ledger_entries
SET is_reversed = true,
    reversed_by_entry_id = $3
WHERE id = $1 AND workspace_id = $2
RETURNING *;

-- name: CreateAttachmentMetadata :one
INSERT INTO attachments_metadata (
    workspace_id, transaction_id, storage_key, file_name, file_size_bytes, mime_type, sha256_hash
) VALUES (
    $1, $2, $3, $4, $5, $6, $7
) RETURNING *;

-- name: ListAttachmentsByTransactionID :many
SELECT * FROM attachments_metadata
WHERE transaction_id = $1 AND workspace_id = $2
ORDER BY id ASC;
