-- Blueprints 01-06 completion queries

-- 1. Proforma document_kind & outlet_id helpers on invoices
-- name: SetInvoiceDocumentKind :one
UPDATE invoices
SET document_kind = $3,
    outlet_id = $4,
    converted_from_proforma_id = $5,
    updated_at = now()
WHERE id = $1 AND workspace_id = $2
RETURNING *;

-- name: ListInvoicesByKind :many
SELECT * FROM invoices
WHERE workspace_id = $1
  AND document_kind = $2
  AND (sqlc.narg('status')::text IS NULL OR status = sqlc.narg('status'))
  AND (sqlc.narg('customer_id')::bigint IS NULL OR customer_id = sqlc.narg('customer_id'))
  AND (sqlc.narg('outlet_id')::bigint IS NULL OR outlet_id IS NULL OR outlet_id = sqlc.narg('outlet_id'))
  AND (sqlc.narg('search')::text IS NULL OR invoice_number ILIKE '%' || sqlc.narg('search')::text || '%' OR customer_name ILIKE '%' || sqlc.narg('search')::text || '%')
ORDER BY issue_date DESC, id DESC
LIMIT $3;

-- 2. Invoice & Estimate Multi-Tax / Compound Tax Lines
-- name: CreateInvoiceTaxLine :one
INSERT INTO invoice_tax_lines (
    workspace_id, invoice_id, name, rate_bps, amount_minor, is_compound, sort_order
) VALUES (
    $1, $2, $3, $4, $5, $6, $7
) RETURNING *;

-- name: ListInvoiceTaxLines :many
SELECT * FROM invoice_tax_lines
WHERE invoice_id = $1 AND workspace_id = $2
ORDER BY sort_order ASC, id ASC;

-- name: DeleteInvoiceTaxLines :exec
DELETE FROM invoice_tax_lines
WHERE invoice_id = $1 AND workspace_id = $2;

-- name: CreateEstimateTaxLine :one
INSERT INTO estimate_tax_lines (
    workspace_id, estimate_id, name, rate_bps, amount_minor, is_compound, sort_order
) VALUES (
    $1, $2, $3, $4, $5, $6, $7
) RETURNING *;

-- name: ListEstimateTaxLines :many
SELECT * FROM estimate_tax_lines
WHERE estimate_id = $1 AND workspace_id = $2
ORDER BY sort_order ASC, id ASC;

-- name: DeleteEstimateTaxLines :exec
DELETE FROM estimate_tax_lines
WHERE estimate_id = $1 AND workspace_id = $2;

-- 3. Debit Notes
-- name: CreateDebitNote :one
INSERT INTO debit_notes (
    workspace_id, debit_note_number, invoice_id, customer_id, customer_name,
    issue_date, currency, currency_exponent, subtotal_minor, tax_amount_minor,
    total_amount_minor, paid_amount_minor, status, reason, notes,
    created_by_user_id, idempotency_key
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 0, $12, $13, $14, $15, $16
) RETURNING *;

-- name: GetDebitNoteByID :one
SELECT * FROM debit_notes
WHERE id = $1 AND workspace_id = $2;

-- name: GetDebitNoteByIdempotency :one
SELECT * FROM debit_notes
WHERE workspace_id = $1 AND idempotency_key = $2 AND status <> 'voided';

-- name: ListDebitNotes :many
SELECT * FROM debit_notes
WHERE workspace_id = $1
  AND (sqlc.narg('customer_id')::bigint IS NULL OR customer_id = sqlc.narg('customer_id'))
  AND (sqlc.narg('invoice_id')::bigint IS NULL OR invoice_id = sqlc.narg('invoice_id'))
ORDER BY issue_date DESC, id DESC
LIMIT $2;

-- name: CreateDebitNoteItem :one
INSERT INTO debit_note_items (
    debit_note_id, workspace_id, description, quantity, unit_price_minor, amount_minor
) VALUES (
    $1, $2, $3, $4, $5, $6
) RETURNING *;

-- name: ListDebitNoteItems :many
SELECT * FROM debit_note_items
WHERE debit_note_id = $1 AND workspace_id = $2
ORDER BY id ASC;

-- name: VoidDebitNote :one
UPDATE debit_notes
SET status = 'voided',
    void_reason = $3,
    voided_at = NOW(),
    updated_at = NOW()
WHERE id = $1 AND workspace_id = $2 AND status <> 'voided'
RETURNING *;

-- 4. Document Version / Revision History
-- name: CreateDocumentVersion :one
INSERT INTO document_versions (
    workspace_id, document_type, document_id, version_number, change_summary, snapshot, created_by_user_id
) VALUES (
    $1, $2, $3, $4, $5, $6, $7
) RETURNING *;

-- name: ListDocumentVersions :many
SELECT * FROM document_versions
WHERE workspace_id = $1 AND document_type = $2 AND document_id = $3
ORDER BY version_number DESC, id DESC;

-- name: NextDocumentVersionNumber :one
SELECT (COALESCE(MAX(version_number), 0) + 1)::integer FROM document_versions
WHERE workspace_id = $1 AND document_type = $2 AND document_id = $3;

-- 5. External Payment Evidence, Guest Messages & Claim Links
-- name: CreateExternalPaymentEvidence :one
INSERT INTO external_payment_evidences (
    workspace_id, document_type, document_id, share_id,
    payer_name, payer_email, amount_minor, payment_date, payment_method, reference, notes
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
) RETURNING *;

-- name: ListExternalPaymentEvidenceForDoc :many
SELECT * FROM external_payment_evidences
WHERE workspace_id = $1 AND document_type = $2 AND document_id = $3
ORDER BY created_at DESC;

-- name: ReviewExternalPaymentEvidence :one
UPDATE external_payment_evidences
SET status = $3,
    reviewed_by_user_id = $4,
    reviewed_at = NOW(),
    review_note = $5
WHERE id = $1 AND workspace_id = $2 AND status = 'pending'
RETURNING *;

-- name: CreateExternalMessage :one
INSERT INTO external_messages (
    workspace_id, document_type, document_id, share_id,
    sender_type, sender_name, sender_email, message
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8
) RETURNING *;

-- name: ListExternalMessagesForDoc :many
SELECT * FROM external_messages
WHERE workspace_id = $1 AND document_type = $2 AND document_id = $3
ORDER BY created_at ASC, id ASC;

-- name: UpsertExternalPartyLink :one
INSERT INTO external_party_links (
    workspace_id, counterparty_id, user_id, source_document_type, source_document_id, status
) VALUES (
    $1, $2, $3, $4, $5, 'active'
)
ON CONFLICT (workspace_id, counterparty_id, user_id)
DO UPDATE SET status = 'active', claimed_at = NOW()
RETURNING *;

-- name: ListExternalPartyLinksForUser :many
SELECT l.*, c.name AS counterparty_name, w.name AS workspace_name
FROM external_party_links l
JOIN counterparties c ON c.id = l.counterparty_id
JOIN workspaces w ON w.id = l.workspace_id
WHERE l.user_id = $1 AND l.status = 'active'
ORDER BY l.claimed_at DESC;

-- 6. Duplicate Counterparty Detection
-- name: FindPossibleDuplicateCounterparties :many
SELECT * FROM counterparties
WHERE workspace_id = $1
  AND merged_into_id IS NULL
  AND is_active = true
  AND (
    (sqlc.narg('name')::text IS NOT NULL AND lower(trim(name)) = lower(trim(sqlc.narg('name'))))
    OR (sqlc.narg('email')::text IS NOT NULL AND lower(trim(email)) = lower(trim(sqlc.narg('email'))))
    OR (sqlc.narg('phone')::text IS NOT NULL AND regexp_replace(phone, '\D', '', 'g') <> '' AND regexp_replace(phone, '\D', '', 'g') = regexp_replace(sqlc.narg('phone')::text, '\D', '', 'g'))
  )
ORDER BY id ASC;

-- 7. Outlet Scope & Team Membership Updates
-- name: UpdateMembershipOutletScope :one
UPDATE memberships
SET outlet_scope = $3,
    updated_at = NOW()
WHERE id = $1 AND workspace_id = $2 AND status <> 'removed'
RETURNING *;
