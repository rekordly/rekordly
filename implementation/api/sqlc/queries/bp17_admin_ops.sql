-- name: ListFeatureFlags :many
SELECT * FROM feature_flags ORDER BY flag_key ASC;

-- name: GetFeatureFlag :one
SELECT * FROM feature_flags WHERE flag_key = $1;

-- name: UpdateFeatureFlag :one
UPDATE feature_flags
SET
    enabled_in_env = $2,
    kill_switch_active = $3,
    updated_by = $4,
    updated_at = now()
WHERE flag_key = $1
RETURNING *;

-- name: GetMaintenanceMode :one
SELECT * FROM maintenance_modes WHERE id = 1;

-- name: UpdateMaintenanceMode :one
UPDATE maintenance_modes
SET
    mode = $1,
    scope = $2,
    reason = $3,
    owner_label = $4,
    activated_at = CASE WHEN $1 = 'normal' THEN NULL ELSE now() END,
    updated_at = now()
WHERE id = 1
RETURNING *;

-- name: CreateDeploymentRecord :one
INSERT INTO deployment_records (
    environment, commit_sha, image_tag, migration_version, feature_flags_snapshot, deployed_by, status
) VALUES (
    $1, $2, $3, $4, $5, $6, $7
)
RETURNING *;

-- name: ListDeploymentRecords :many
SELECT * FROM deployment_records ORDER BY created_at DESC, id DESC LIMIT $1;

-- name: CreateBackupRehearsalRecord :one
INSERT INTO backup_rehearsal_records (
    environment, backup_id, backup_source, checksum_sha256, rpo_seconds, rto_seconds, reconciled_journals, tombstones_replayed, status
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9
)
RETURNING *;

-- name: ListBackupRehearsalRecords :many
SELECT * FROM backup_rehearsal_records ORDER BY created_at DESC, id DESC LIMIT $1;

-- name: UpsertBetaCohortEntry :one
INSERT INTO beta_cohort_register (
    workspace_id, segment, use_case, consent_accepted, enabled_modules_json, onboarding_status, support_status, plan_intent
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8
)
ON CONFLICT (workspace_id) DO UPDATE SET
    segment = EXCLUDED.segment,
    use_case = EXCLUDED.use_case,
    consent_accepted = EXCLUDED.consent_accepted,
    enabled_modules_json = EXCLUDED.enabled_modules_json,
    onboarding_status = EXCLUDED.onboarding_status,
    support_status = EXCLUDED.support_status,
    plan_intent = EXCLUDED.plan_intent,
    updated_at = now()
RETURNING *;

-- name: ListBetaCohortEntries :many
SELECT * FROM beta_cohort_register ORDER BY created_at DESC LIMIT $1;

-- name: ListRecentOutboxJobs :many
SELECT id, job_type, aggregate_type, aggregate_id, status, attempts, available_at, locked_by, last_error_class, created_at, updated_at
FROM outbox_jobs
ORDER BY id DESC
LIMIT $1;

-- name: RetryOutboxJob :one
UPDATE outbox_jobs
SET status = 'pending', available_at = now(), locked_at = NULL, locked_by = NULL, updated_at = now()
WHERE id = $1
RETURNING id, job_type, aggregate_type, aggregate_id, status, attempts, available_at, locked_by, last_error_class, created_at, updated_at;
