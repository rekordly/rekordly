-- name: GetOrCreateUserProfile :one
INSERT INTO user_profiles (user_id, display_name)
SELECT u.id, u.display_name FROM users u WHERE u.id = $1
ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id
RETURNING *;

-- name: UpdateUserProfileVersioned :one
UPDATE user_profiles
SET
    display_name = $3,
    locale = $4,
    timezone = $5,
    date_format = $6,
    time_format = $7,
    theme = $8,
    density = $9,
    reduced_motion = $10,
    high_contrast = $11,
    default_landing_page = $12,
    currency_display_mode = $13,
    occupation_label = $14,
    version = version + 1,
    updated_at = now()
WHERE user_id = $1 AND version = $2
RETURNING *;

-- name: ListUserContactMethods :many
SELECT * FROM contact_methods
WHERE user_id = $1 AND removed_at IS NULL
ORDER BY is_primary DESC, id ASC;

-- name: GetUserContactMethodByID :one
SELECT * FROM contact_methods
WHERE id = $1 AND user_id = $2 AND removed_at IS NULL;

-- name: CreateContactMethod :one
INSERT INTO contact_methods (
    user_id, method_type, normalized_value, masked_value, is_primary, is_login, is_recovery, notify_eligible
) VALUES (
    $1, $2, $3, $4, false, $5, $6, true
)
RETURNING *;

-- name: CreateContactVerificationChallenge :one
INSERT INTO contact_verification_challenges (
    user_id, contact_method_id, purpose, destination_normalized, code_hash, expires_at
) VALUES (
    $1, $2, $3, $4, $5, $6
)
RETURNING *;

-- name: GetLatestActiveContactChallenge :one
SELECT * FROM contact_verification_challenges
WHERE contact_method_id = $1 AND user_id = $2 AND consumed_at IS NULL
ORDER BY id DESC
LIMIT 1;

-- name: IncrementContactChallengeAttempts :exec
UPDATE contact_verification_challenges SET attempts = attempts + 1 WHERE id = $1;

-- name: ConsumeContactChallenge :exec
UPDATE contact_verification_challenges SET consumed_at = now() WHERE id = $1;

-- name: MarkContactMethodVerified :one
UPDATE contact_methods
SET verified_at = now()
WHERE id = $1 AND user_id = $2 AND removed_at IS NULL
RETURNING *;

-- name: ClearPrimaryContactMethods :exec
UPDATE contact_methods SET is_primary = false WHERE user_id = $1 AND method_type = $2 AND removed_at IS NULL;

-- name: SetPrimaryContactMethod :one
UPDATE contact_methods
SET is_primary = true
WHERE id = $1 AND user_id = $2 AND removed_at IS NULL AND verified_at IS NOT NULL
RETURNING *;

-- name: SoftRemoveContactMethod :one
UPDATE contact_methods
SET removed_at = now(), is_primary = false
WHERE id = $1 AND user_id = $2 AND removed_at IS NULL
RETURNING *;

-- name: InsertRecentAuthGrant :one
INSERT INTO recent_auth_grants (user_id, session_id, purpose, strength, expires_at)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: GetValidRecentAuthGrant :one
SELECT * FROM recent_auth_grants
WHERE user_id = $1 AND purpose = $2 AND expires_at > now() AND consumed_at IS NULL
ORDER BY id DESC
LIMIT 1;

-- name: InsertSecurityEvent :one
INSERT INTO security_events (user_id, session_id, event_type, actor_type, device_summary, safe_context_json)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: ListSecurityEvents :many
SELECT * FROM security_events
WHERE user_id = $1
ORDER BY created_at DESC, id DESC
LIMIT $2;

-- name: GetOrCreateWorkspaceSettingsVersion :one
INSERT INTO workspace_settings_versions (workspace_id)
VALUES ($1)
ON CONFLICT (workspace_id) DO UPDATE SET workspace_id = EXCLUDED.workspace_id
RETURNING *;

-- name: UpdateWorkspaceSettingsVersioned :one
UPDATE workspace_settings_versions
SET
    personal_settings_json = $3,
    business_settings_json = $4,
    version = version + 1,
    last_significant_change_at = now(),
    updated_by_user_id = $5,
    updated_at = now()
WHERE workspace_id = $1 AND version = $2
RETURNING *;

-- name: CreateOwnershipTransferRequest :one
INSERT INTO ownership_transfer_requests (workspace_id, from_user_id, to_user_id, expires_at)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: GetOwnershipTransferRequestByID :one
SELECT * FROM ownership_transfer_requests WHERE id = $1;

-- name: AcceptOwnershipTransferRequest :one
UPDATE ownership_transfer_requests
SET status = 'accepted', accepted_at = now()
WHERE id = $1 AND status = 'pending' AND expires_at > now()
RETURNING *;

-- name: UpsertConsentPreference :one
INSERT INTO consent_preferences (user_id, consent_key, granted, updated_at)
VALUES ($1, $2, $3, now())
ON CONFLICT (user_id, consent_key) DO UPDATE SET granted = EXCLUDED.granted, updated_at = now()
RETURNING *;

-- name: ListConsentPreferences :many
SELECT * FROM consent_preferences WHERE user_id = $1 ORDER BY consent_key ASC;

-- name: InsertPolicyAcceptance :one
INSERT INTO policy_acceptances (user_id, policy_type, policy_version, content_hash, published_url, required, locale, source_context)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING *;

-- name: ListPolicyAcceptances :many
SELECT * FROM policy_acceptances WHERE user_id = $1 ORDER BY accepted_at DESC;

-- name: CreateExportRequest :one
INSERT INTO export_requests (
    user_id, workspace_id, scope, format, status, manifest_json, reconciliation_status, missing_files_json, checksum_sha256, artifact_payload_json
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
)
RETURNING *;

-- name: GetExportRequestByID :one
SELECT * FROM export_requests WHERE id = $1 AND user_id = $2;

-- name: ListExportRequestsByUser :many
SELECT * FROM export_requests WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2;

-- name: CreatePrivacyRequest :one
INSERT INTO privacy_requests (user_id, workspace_id, request_type, summary)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: GetPrivacyRequestByID :one
SELECT * FROM privacy_requests WHERE id = $1 AND user_id = $2;

-- name: ListPrivacyRequestsByUser :many
SELECT * FROM privacy_requests WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2;

-- name: CreateDeletionCase :one
INSERT INTO deletion_cases (user_id, scope, workspace_id, status, reason, grace_deadline_at, subscription_reconciled, public_access_revoked_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, now())
RETURNING *;

-- name: GetDeletionCaseByID :one
SELECT * FROM deletion_cases WHERE id = $1 AND user_id = $2;

-- name: ListDeletionCasesByUser :many
SELECT * FROM deletion_cases WHERE user_id = $1 ORDER BY created_at DESC;

-- name: CancelDeletionCase :one
UPDATE deletion_cases
SET status = 'restored', cancelled_at = now(), updated_at = now()
WHERE id = $1 AND user_id = $2 AND status IN ('deletion_requested', 'grace_restricted') AND grace_deadline_at > now()
RETURNING *;

-- name: CreateDeletionTask :one
INSERT INTO deletion_tasks (deletion_case_id, processor_name, status, evidence_ref, last_error)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (deletion_case_id, processor_name) DO UPDATE SET
    status = EXCLUDED.status,
    evidence_ref = EXCLUDED.evidence_ref,
    last_error = EXCLUDED.last_error,
    updated_at = now()
RETURNING *;

-- name: ListDeletionTasksByCase :many
SELECT * FROM deletion_tasks WHERE deletion_case_id = $1 ORDER BY id ASC;

-- name: ListActiveRetentionHolds :many
SELECT * FROM retention_holds
WHERE scope_type = $1 AND scope_id = $2 AND released_at IS NULL AND (expires_at IS NULL OR expires_at > now());

-- name: CreateRetentionHold :one
INSERT INTO retention_holds (scope_type, scope_id, reason_code, reason_detail, authorized_by, expires_at)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: CreateDeletionTombstone :one
INSERT INTO deletion_tombstones (subject_hash, scope, deletion_case_id, backup_expiry_at)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: UpdateDeletionCaseStatus :one
UPDATE deletion_cases
SET status = $2, purge_manifest_json = $3, purged_at = CASE WHEN $2 = 'deleted' THEN now() ELSE purged_at END, updated_at = now()
WHERE id = $1
RETURNING *;

-- name: CreateSupportCase :one
INSERT INTO support_cases (
    user_id, workspace_id, category, severity, summary, affected_module, reference_id, diagnostic_consent, diagnostic_bundle_json, preferred_channel
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
)
RETURNING *;

-- name: GetSupportCaseByID :one
SELECT * FROM support_cases WHERE id = $1 AND user_id = $2;

-- name: ListSupportCasesByUser :many
SELECT * FROM support_cases WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2;

-- name: AddSupportMessage :one
INSERT INTO support_messages (support_case_id, sender_type, sender_user_id, body)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: ListSupportMessages :many
SELECT * FROM support_messages WHERE support_case_id = $1 ORDER BY created_at ASC, id ASC;

-- name: CreateSupportAccessGrant :one
INSERT INTO support_access_grants (support_case_id, user_id, workspace_id, actor_label, scope, reason, expires_at)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING *;

-- name: RevokeSupportAccessGrant :one
UPDATE support_access_grants
SET revoked_at = now()
WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL
RETURNING *;

-- name: ListSupportAccessGrantsByUser :many
SELECT * FROM support_access_grants WHERE user_id = $1 ORDER BY created_at DESC;

-- name: InsertSupportAccessEvent :one
INSERT INTO support_access_events (grant_id, action, actor_label)
VALUES ($1, $2, $3)
RETURNING *;
