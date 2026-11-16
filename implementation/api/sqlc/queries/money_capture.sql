-- name: CreateMoneyRecordDraft :one
INSERT INTO money_record_drafts (
    workspace_id, created_by_user_id, state, version, schema_version, entry_method,
    direction, scope_type, purpose, amount_minor, currency, currency_exponent,
    effective_date, money_account_id, destination_account_id, category_id,
    counterparty_id, counterparty_name, description, reference, tags, payload,
    ai_metadata, client_command_id, expires_at
) VALUES (
    $1, $2, $3, 1, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
    $16, $17, $18, $19, $20, $21, $22, $23, $24
) RETURNING *;

-- name: GetMoneyRecordDraft :one
SELECT * FROM money_record_drafts
WHERE id = $1 AND workspace_id = $2;

-- name: GetMoneyRecordDraftByClientCommandID :one
SELECT * FROM money_record_drafts
WHERE workspace_id = $1 AND client_command_id = $2;

-- name: GetMoneyRecordDraftForUpdate :one
SELECT * FROM money_record_drafts
WHERE id = $1 AND workspace_id = $2
FOR UPDATE;

-- name: ListMoneyRecordDrafts :many
SELECT * FROM money_record_drafts
WHERE workspace_id = $1
  AND (sqlc.narg('state')::text IS NULL OR state = sqlc.narg('state'))
  AND (sqlc.narg('before_id')::bigint IS NULL OR id < sqlc.narg('before_id'))
ORDER BY updated_at DESC, id DESC
LIMIT $2;

-- name: UpdateMoneyRecordDraft :one
UPDATE money_record_drafts
SET state = $3,
    version = version + 1,
    entry_method = $4,
    direction = $5,
    scope_type = $6,
    purpose = $7,
    amount_minor = $8,
    currency = $9,
    currency_exponent = $10,
    effective_date = $11,
    money_account_id = $12,
    destination_account_id = $13,
    category_id = $14,
    counterparty_id = $15,
    counterparty_name = $16,
    description = $17,
    reference = $18,
    tags = $19,
    payload = $20,
    ai_metadata = $21,
    expires_at = $22,
    updated_at = now()
WHERE id = $1 AND workspace_id = $2 AND version = $23 AND state IN ('saved', 'needs_review', 'failed')
RETURNING *;

-- name: DiscardMoneyRecordDraft :one
UPDATE money_record_drafts
SET state = 'discarded', discarded_at = now(), updated_at = now(), version = version + 1
WHERE id = $1 AND workspace_id = $2 AND version = $3 AND state IN ('saved', 'needs_review', 'failed')
RETURNING *;

-- name: MarkMoneyRecordDraftConfirmed :one
UPDATE money_record_drafts
SET state = 'confirmed', confirmed_record_id = $3, confirmed_at = now(), updated_at = now(), version = version + 1
WHERE id = $1 AND workspace_id = $2 AND version = $4 AND state IN ('saved', 'needs_review', 'failed')
RETURNING *;

-- name: CreateMoneyRecordDraftLink :one
INSERT INTO money_record_draft_links (
    draft_id, workspace_id, link_type, linked_record_id, allocated_amount_minor, metadata
) VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: ListMoneyRecordDraftLinks :many
SELECT * FROM money_record_draft_links
WHERE draft_id = $1 AND workspace_id = $2
ORDER BY id ASC;

-- name: CreateMoneyRecord :one
INSERT INTO money_records (
    workspace_id, draft_id, transaction_id, direction, scope_type, purpose, entry_method,
    status, amount_minor, currency, currency_exponent, effective_date, money_account_id,
    destination_account_id, category_id, counterparty_id, counterparty_name, description,
    reference, created_by_user_id, confirmed_by_user_id
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, 'confirmed', $8, $9, $10, $11, $12, $13, $14,
    $15, $16, $17, $18, $19, $20
) RETURNING *;

-- name: GetMoneyRecordByID :one
SELECT * FROM money_records
WHERE id = $1 AND workspace_id = $2;

-- name: GetMoneyRecordByDraftID :one
SELECT * FROM money_records
WHERE draft_id = $1 AND workspace_id = $2;

-- name: ListMoneyRecords :many
SELECT * FROM money_records
WHERE workspace_id = $1
  AND (sqlc.narg('status')::text IS NULL OR status = sqlc.narg('status'))
  AND (sqlc.narg('before_id')::bigint IS NULL OR id < sqlc.narg('before_id'))
ORDER BY effective_date DESC, id DESC
LIMIT $2;

-- name: CreateMoneyRecordPart :one
INSERT INTO money_record_parts (
    money_record_id, workspace_id, amount_minor, currency, purpose, category_id, transaction_id
) VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING *;

-- name: ListMoneyRecordParts :many
SELECT * FROM money_record_parts
WHERE money_record_id = $1 AND workspace_id = $2
ORDER BY id ASC;

-- name: CreateMoneyRecordLink :one
INSERT INTO money_record_links (
    money_record_id, workspace_id, link_type, linked_record_id, allocated_amount_minor, metadata
) VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: GetMoneyRecordLedgerEntry :one
SELECT le.*
FROM ledger_entries le
JOIN money_records mr ON mr.transaction_id = le.source_id
WHERE mr.id = $1
  AND mr.workspace_id = $2
  AND le.workspace_id = $2
  AND le.source_type = 'money_transaction';

-- name: ListMoneyRecordLinks :many
SELECT * FROM money_record_links
WHERE money_record_id = $1 AND workspace_id = $2
ORDER BY id ASC;

-- name: CreateEvidenceAsset :one
INSERT INTO evidence_assets (
    workspace_id, draft_id, money_record_id, uploaded_by_user_id, storage_provider,
    asset_id, delivery_type, original_file_name, byte_size, mime_type, sha256_hash,
    status, retention_until
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
RETURNING *;

-- name: CreateDocumentEvidenceAsset :one
INSERT INTO evidence_assets (
    workspace_id, uploaded_by_user_id, storage_provider,
    asset_id, delivery_type, original_file_name, byte_size, mime_type, sha256_hash,
    status, purpose
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'document')
RETURNING *;

-- name: ListEvidenceAssetsByDraftID :many
SELECT * FROM evidence_assets
WHERE workspace_id = $1 AND draft_id = $2 AND status <> 'deleted'
ORDER BY id ASC;

-- name: ListEvidenceAssetsByMoneyRecordID :many
SELECT * FROM evidence_assets
WHERE workspace_id = $1 AND money_record_id = $2 AND status <> 'deleted'
ORDER BY id ASC;

-- name: GetVerifiedEvidenceAssetByID :one
SELECT * FROM evidence_assets
WHERE workspace_id = $1 AND id = $2 AND status = 'verified';

-- name: GetEvidenceAssetByID :one
SELECT * FROM evidence_assets
WHERE workspace_id = $1 AND id = $2 AND status <> 'deleted';

-- name: AttachEvidenceAssetsToMoneyRecord :execrows
UPDATE evidence_assets
SET money_record_id = $3, updated_at = now()
WHERE workspace_id = $1 AND draft_id = $2 AND status IN ('pending', 'verified', 'quarantined');
