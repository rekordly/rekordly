-- Blueprint 12: AI Assistant, Imports, Background Jobs & Deterministic Automation

-- ================= AI Quotas & Usage =================

-- name: EnsureWorkspaceAIQuota :one
INSERT INTO workspace_ai_quotas (workspace_id)
VALUES ($1)
ON CONFLICT (workspace_id) DO UPDATE SET updated_at = workspace_ai_quotas.updated_at
RETURNING *;

-- name: ReserveWorkspaceAICredit :one
UPDATE workspace_ai_quotas
SET credits_reserved = credits_reserved + $2,
    updated_at = now()
WHERE workspace_id = $1
  AND plan_entitled = true
  AND credits_used + credits_reserved + $2 <= monthly_credit_limit
RETURNING *;

-- name: ConsumeWorkspaceAICredit :one
UPDATE workspace_ai_quotas
SET credits_reserved = GREATEST(credits_reserved - $2, 0),
    credits_used = credits_used + $2,
    updated_at = now()
WHERE workspace_id = $1
RETURNING *;

-- name: ReleaseWorkspaceAICredit :one
UPDATE workspace_ai_quotas
SET credits_reserved = GREATEST(credits_reserved - $2, 0),
    updated_at = now()
WHERE workspace_id = $1
RETURNING *;

-- name: CountUserDailyAIRequests :one
SELECT COUNT(*)::bigint
FROM ai_requests
WHERE workspace_id = $1
  AND user_id = $2
  AND created_at >= date_trunc('day', now() AT TIME ZONE 'UTC')
  AND status <> 'rejected';

-- name: GetAIRequestByIdempotency :one
SELECT *
FROM ai_requests
WHERE workspace_id = $1 AND idempotency_key = $2;

-- name: GetAIRequestByID :one
SELECT *
FROM ai_requests
WHERE id = $1 AND workspace_id = $2;

-- name: CreateAIRequest :one
INSERT INTO ai_requests (
    workspace_id, user_id, idempotency_key, mode, status, input_char_count, redacted_summary
) VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING *;

-- name: UpdateAIRequestResult :one
UPDATE ai_requests
SET status = $3,
    provider = $4,
    model = $5,
    latency_ms = $6,
    input_tokens = $7,
    output_tokens = $8,
    structured_valid = $9,
    failure_class = $10,
    job_id = $11,
    updated_at = now()
WHERE id = $1 AND workspace_id = $2
RETURNING *;

-- name: CreateAIUsageReservation :one
INSERT INTO ai_usage_reservations (
    workspace_id, user_id, ai_request_id, idempotency_key, credits_reserved, status
) VALUES ($1, $2, $3, $4, $5, 'reserved')
ON CONFLICT (workspace_id, idempotency_key) DO NOTHING
RETURNING *;

-- name: GetAIUsageReservationByIdemp :one
SELECT *
FROM ai_usage_reservations
WHERE workspace_id = $1 AND idempotency_key = $2;

-- name: SettleAIUsageReservation :one
UPDATE ai_usage_reservations
SET status = $3,
    settled_at = now()
WHERE id = $1 AND workspace_id = $2 AND status = 'reserved'
RETURNING *;

-- name: CreateAIProviderUsageLog :one
INSERT INTO ai_provider_usage_logs (
    workspace_id, ai_request_id, provider, model, latency_ms, input_tokens, output_tokens, structured_valid, failure_class, is_fallback
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
RETURNING *;

-- name: CreateAIDraft :one
INSERT INTO ai_drafts (
    workspace_id, user_id, ai_request_id, schema_version, scope, direction, purpose,
    amount_major, amount_minor, currency, currency_exponent, effective_date,
    account_id, account_alias, category_id, category_alias, counterparty_id, counterparty_alias,
    description, field_confidence, missing_fields, warnings, clarification_options, route_to_manual_flow, status
) VALUES (
    $1, $2, $3, $4, $5, $6, $7,
    $8, $9, $10, $11, $12,
    $13, $14, $15, $16, $17, $18,
    $19, $20, $21, $22, $23, $24, $25
)
RETURNING *;

-- name: ListAIDraftsByRequest :many
SELECT *
FROM ai_drafts
WHERE workspace_id = $1 AND ai_request_id = $2
ORDER BY id ASC;

-- name: ListAIDraftsByWorkspace :many
SELECT *
FROM ai_drafts
WHERE workspace_id = $1
  AND (sqlc.narg('status')::text IS NULL OR status = sqlc.narg('status')::text)
ORDER BY created_at DESC, id DESC
LIMIT $2;

-- name: GetAIDraftByID :one
SELECT *
FROM ai_drafts
WHERE id = $1 AND workspace_id = $2;

-- name: UpdateAIDraftFields :one
UPDATE ai_drafts
SET scope = $3,
    direction = $4,
    purpose = $5,
    amount_major = $6,
    amount_minor = $7,
    currency = $8,
    currency_exponent = $9,
    effective_date = $10,
    account_id = $11,
    category_id = $12,
    counterparty_id = $13,
    description = $14,
    missing_fields = $15,
    warnings = $16,
    route_to_manual_flow = $17,
    status = $18,
    updated_at = now()
WHERE id = $1 AND workspace_id = $2 AND status IN ('draft', 'needs_review')
RETURNING *;

-- name: MarkAIDraftConfirmed :one
UPDATE ai_drafts
SET status = 'confirmed',
    confirmed_record_type = $3,
    confirmed_record_id = $4,
    updated_at = now()
WHERE id = $1 AND workspace_id = $2 AND status IN ('draft', 'needs_review')
RETURNING *;

-- name: DiscardAIDraft :one
UPDATE ai_drafts
SET status = 'discarded',
    updated_at = now()
WHERE id = $1 AND workspace_id = $2 AND status IN ('draft', 'needs_review')
RETURNING *;

-- ================= CSV Imports =================

-- name: CreateImportFile :one
INSERT INTO import_files (
    workspace_id, uploaded_by_user_id, original_filename, mime_type, byte_size,
    sha256_hash, encoding, delimiter, storage_key, raw_csv_text
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
RETURNING *;

-- name: GetImportFileByID :one
SELECT *
FROM import_files
WHERE id = $1 AND workspace_id = $2;

-- name: CreateImportMappingProfile :one
INSERT INTO import_mapping_profiles (
    workspace_id, name, mapping_json, date_format, decimal_separator, sign_convention, default_currency, default_account_id
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING *;

-- name: CreateImportBatch :one
INSERT INTO import_batches (
    workspace_id, import_file_id, target_account_id, default_currency, status, created_by_user_id
) VALUES ($1, $2, $3, $4, 'uploaded', $5)
RETURNING *;

-- name: ListImportBatches :many
SELECT *
FROM import_batches
WHERE workspace_id = $1
ORDER BY created_at DESC, id DESC
LIMIT $2;

-- name: GetImportBatchByID :one
SELECT *
FROM import_batches
WHERE id = $1 AND workspace_id = $2;

-- name: UpdateImportBatchMapping :one
UPDATE import_batches
SET mapping_profile_id = $3,
    target_account_id = $4,
    default_currency = $5,
    status = 'mapped',
    updated_at = now()
WHERE id = $1 AND workspace_id = $2
RETURNING *;

-- name: UpdateImportBatchCounts :one
UPDATE import_batches
SET status = $3,
    total_rows = $4,
    valid_count = $5,
    duplicate_count = $6,
    match_count = $7,
    invalid_count = $8,
    excluded_count = $9,
    posted_count = $10,
    failed_count = $11,
    updated_at = now()
WHERE id = $1 AND workspace_id = $2
RETURNING *;

-- name: DeleteImportRowsByBatch :exec
DELETE FROM import_rows
WHERE batch_id = $1 AND workspace_id = $2;

-- name: CreateImportRow :one
INSERT INTO import_rows (
    batch_id, workspace_id, row_number, row_fingerprint, external_tx_id, raw_data,
    effective_date, description, amount_minor, signed_amount_minor, currency, currency_exponent,
    direction, purpose, account_id, category_id, counterparty_id, balance_minor,
    transfer_pair_group, state, error_code, error_message, suggestion_source
) VALUES (
    $1, $2, $3, $4, $5, $6,
    $7, $8, $9, $10, $11, $12,
    $13, $14, $15, $16, $17, $18,
    $19, $20, $21, $22, $23
)
RETURNING *;

-- name: ListImportRowsByBatch :many
SELECT *
FROM import_rows
WHERE batch_id = $1 AND workspace_id = $2
  AND (sqlc.narg('state_filter')::text IS NULL OR state = sqlc.narg('state_filter')::text)
  AND id > $3
ORDER BY id ASC
LIMIT $4;

-- name: ListAllImportRowsByBatch :many
SELECT *
FROM import_rows
WHERE batch_id = $1 AND workspace_id = $2
ORDER BY row_number ASC, id ASC;

-- name: GetImportRowByID :one
SELECT *
FROM import_rows
WHERE id = $1 AND batch_id = $2 AND workspace_id = $3;

-- name: UpdateImportRow :one
UPDATE import_rows
SET effective_date = $4,
    description = $5,
    direction = $6,
    purpose = $7,
    account_id = $8,
    category_id = $9,
    counterparty_id = $10,
    state = $11,
    error_code = $12,
    error_message = $13,
    suggestion_source = 'manual',
    updated_at = now()
WHERE id = $1 AND batch_id = $2 AND workspace_id = $3
RETURNING *;

-- name: UpdateImportRowState :one
UPDATE import_rows
SET state = $4,
    error_code = $5,
    error_message = $6,
    updated_at = now()
WHERE id = $1 AND batch_id = $2 AND workspace_id = $3
RETURNING *;

-- name: CheckExistingImportFingerprint :one
SELECT id
FROM import_rows
WHERE workspace_id = $1
  AND row_fingerprint = $2
  AND state IN ('posted', 'matched')
LIMIT 1;

-- name: CheckExistingExternalTxID :one
SELECT id
FROM import_rows
WHERE workspace_id = $1
  AND external_tx_id = $2
  AND external_tx_id <> ''
  AND state IN ('posted', 'matched')
LIMIT 1;

-- name: CreateImportRowMatch :one
INSERT INTO import_row_matches (
    import_row_id, workspace_id, match_kind, matched_table, matched_id, confidence_label, reason, status
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING *;

-- name: ListImportRowMatches :many
SELECT *
FROM import_row_matches
WHERE import_row_id = $1 AND workspace_id = $2
ORDER BY id ASC;

-- name: CreateImportRowResult :one
INSERT INTO import_row_results (
    import_row_id, batch_id, workspace_id, idempotency_key, action, target_type, target_id, ledger_entry_id, error_message
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
ON CONFLICT (workspace_id, idempotency_key) DO UPDATE SET error_message = import_row_results.error_message
RETURNING *;

-- name: GetImportRowResultByIdemp :one
SELECT *
FROM import_row_results
WHERE workspace_id = $1 AND idempotency_key = $2;

-- name: ListImportRowResultsByBatch :many
SELECT *
FROM import_row_results
WHERE batch_id = $1 AND workspace_id = $2
ORDER BY id ASC;

-- name: CreateImportReconciliation :one
INSERT INTO import_reconciliations (
    batch_id, workspace_id, source_row_count, posted_count, matched_count,
    duplicate_excluded_count, failed_unresolved_count, reconciled, currency_totals
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
RETURNING *;

-- name: GetLatestImportReconciliation :one
SELECT *
FROM import_reconciliations
WHERE batch_id = $1 AND workspace_id = $2
ORDER BY id DESC
LIMIT 1;

-- ================= Background Jobs & Dead Letter =================

-- name: CreateJob :one
INSERT INTO jobs (
    workspace_id, user_id, job_type, schema_version, source_type, source_id,
    payload, state, priority, available_at, max_attempts, timeout_seconds, idempotency_key
) VALUES ($1, $2, $3, 'job.v1', $4, $5, $6, 'queued', $7, now(), $8, $9, $10)
RETURNING *;

-- name: GetJobByID :one
SELECT *
FROM jobs
WHERE id = $1 AND workspace_id = $2;

-- name: GetJobByIdempotency :one
SELECT *
FROM jobs
WHERE workspace_id = $1 AND job_type = $2 AND idempotency_key = $3;

-- name: ClaimNextJob :one
WITH next_job AS (
    SELECT id
    FROM jobs
    WHERE (state IN ('queued', 'retry_scheduled') AND available_at <= now())
       OR (state = 'running' AND lock_expires_at < now())
    ORDER BY priority ASC, available_at ASC, id ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1
)
UPDATE jobs j
SET state = 'running',
    attempts = j.attempts + 1,
    lock_owner = $1,
    lock_expires_at = now() + (j.timeout_seconds * interval '1 second'),
    started_at = COALESCE(j.started_at, now()),
    updated_at = now()
FROM next_job
WHERE j.id = next_job.id
RETURNING j.*;

-- name: CreateJobAttempt :one
INSERT INTO job_attempts (
    job_id, workspace_id, attempt_number, worker_id, status
) VALUES ($1, $2, $3, $4, 'running')
RETURNING *;

-- name: FinishJobAttempt :exec
UPDATE job_attempts
SET status = $2,
    error_class = $3,
    error_message = $4,
    finished_at = now()
WHERE id = $1;

-- name: MarkJobSucceeded :one
UPDATE jobs
SET state = 'succeeded',
    lock_owner = NULL,
    lock_expires_at = NULL,
    finished_at = now(),
    updated_at = now()
WHERE id = $1 AND workspace_id = $2
RETURNING *;

-- name: MarkJobRetryScheduled :one
UPDATE jobs
SET state = 'retry_scheduled',
    available_at = $3,
    lock_owner = NULL,
    lock_expires_at = NULL,
    last_error_class = $4,
    last_error_message = $5,
    updated_at = now()
WHERE id = $1 AND workspace_id = $2
RETURNING *;

-- name: MarkJobDeadLetter :one
UPDATE jobs
SET state = 'dead_letter',
    lock_owner = NULL,
    lock_expires_at = NULL,
    last_error_class = $3,
    last_error_message = $4,
    finished_at = now(),
    updated_at = now()
WHERE id = $1 AND workspace_id = $2
RETURNING *;

-- name: CreateFailedJob :one
INSERT INTO failed_jobs (
    job_id, workspace_id, job_type, source_type, source_id, attempts, last_error_class, last_error_message, status
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'open')
ON CONFLICT (job_id) DO UPDATE
SET attempts = EXCLUDED.attempts,
    last_error_class = EXCLUDED.last_error_class,
    last_error_message = EXCLUDED.last_error_message,
    status = 'open',
    updated_at = now()
RETURNING *;

-- name: ListFailedJobs :many
SELECT *
FROM failed_jobs
WHERE workspace_id = $1
ORDER BY created_at DESC, id DESC
LIMIT $2;

-- name: GetFailedJobByJobID :one
SELECT *
FROM failed_jobs
WHERE job_id = $1 AND workspace_id = $2;

-- name: MarkFailedJobRetried :one
UPDATE failed_jobs
SET status = 'retried',
    retried_job_id = $3,
    updated_at = now()
WHERE id = $1 AND workspace_id = $2
RETURNING *;

-- name: CancelFailedJob :one
UPDATE failed_jobs
SET status = 'cancelled',
    updated_at = now()
WHERE job_id = $1 AND workspace_id = $2 AND status = 'open'
RETURNING *;

-- ================= Deterministic Automation =================

-- name: UpsertAutomationRule :one
INSERT INTO automation_rules (
    workspace_id, rule_key, name, rule_type, version, is_enabled, config_json, created_by_user_id
) VALUES ($1, $2, $3, $4, 1, $5, $6, $7)
ON CONFLICT (workspace_id, rule_key) DO UPDATE
SET name = EXCLUDED.name,
    is_enabled = EXCLUDED.is_enabled,
    config_json = EXCLUDED.config_json,
    version = automation_rules.version + 1,
    updated_at = now()
RETURNING *;

-- name: ListAutomationRules :many
SELECT *
FROM automation_rules
WHERE workspace_id = $1
ORDER BY id ASC;

-- name: GetAutomationRuleByKey :one
SELECT *
FROM automation_rules
WHERE workspace_id = $1 AND rule_key = $2;

-- name: TouchAutomationRuleRun :exec
UPDATE automation_rules
SET last_run_at = now(),
    updated_at = now()
WHERE id = $1 AND workspace_id = $2;

-- name: CreateAutomationExecution :one
INSERT INTO automation_executions (
    rule_id, workspace_id, idempotency_key, status, summary, affected_count
) VALUES ($1, $2, $3, $4, $5, $6)
ON CONFLICT (workspace_id, idempotency_key) DO UPDATE SET summary = automation_executions.summary
RETURNING *;

-- name: ListAutomationExecutions :many
SELECT *
FROM automation_executions
WHERE workspace_id = $1
ORDER BY created_at DESC, id DESC
LIMIT $2;
