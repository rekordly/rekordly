-- name: CreateUser :one
INSERT INTO users (display_name, locale, timezone)
VALUES ($1, $2, $3)
RETURNING *;

-- name: GetUserByID :one
SELECT * FROM users WHERE id = $1;

-- name: CreateEmailIdentity :one
INSERT INTO auth_identities (user_id, provider, normalized_identifier, display_identifier, verified_at)
VALUES ($1, 'email', $2, $3, $4)
RETURNING *;

-- name: GetActiveEmailIdentity :one
SELECT * FROM auth_identities
WHERE provider = 'email' AND status = 'active' AND normalized_identifier = $1;

-- name: CreateGoogleIdentity :one
INSERT INTO auth_identities (user_id, provider, provider_issuer, provider_subject, normalized_identifier, display_identifier, verified_at)
VALUES ($1, 'google', $2, $3, $4, $5, $6)
RETURNING *;

-- name: GetActiveGoogleIdentity :one
SELECT * FROM auth_identities
WHERE provider = 'google' AND status = 'active' AND provider_issuer = $1 AND provider_subject = $2;

-- name: GetActivePasswordCredential :one
SELECT * FROM password_credentials WHERE user_id = $1 AND status = 'active';

-- name: GetPasswordSignInRecord :one
SELECT u.id AS user_id, u.status AS user_status, u.onboarding_status, pc.encoded_hash
FROM auth_identities ai
JOIN users u ON u.id = ai.user_id
JOIN password_credentials pc ON pc.user_id = u.id AND pc.status = 'active'
WHERE ai.provider = 'email' AND ai.status = 'active' AND ai.normalized_identifier = $1;

-- name: GetActivePreAuthSessionByDigest :one
SELECT s.* FROM sessions s
JOIN users u ON u.id = s.user_id
WHERE s.refresh_digest = $1
  AND s.session_kind = 'pre_auth'
  AND s.revoked_at IS NULL
  AND s.expires_at > now()
  AND u.status = 'active'
FOR UPDATE OF s;

-- name: GetActiveUserIDByEmail :one
SELECT u.id
FROM auth_identities ai
JOIN users u ON u.id = ai.user_id
WHERE ai.provider = 'email' AND ai.status = 'active' AND ai.normalized_identifier = $1 AND u.status = 'active';

-- name: CreatePasswordCredential :one
INSERT INTO password_credentials (user_id, encoded_hash)
VALUES ($1, $2)
RETURNING *;

-- name: ReplaceActivePasswordCredential :execrows
UPDATE password_credentials
SET status = 'replaced', replaced_at = now(), updated_at = now()
WHERE user_id = $1 AND status = 'active';

-- name: RehashActivePasswordCredential :execrows
UPDATE password_credentials
SET encoded_hash = $2, updated_at = now(), last_rehashed_at = now()
WHERE user_id = $1 AND status = 'active';

-- name: CreateOTPChallenge :one
INSERT INTO otp_challenges (user_id, recipient_digest, code_digest, purpose, generation, expires_at)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: GetOTPChallengeForUpdate :one
SELECT * FROM otp_challenges WHERE id = $1 FOR UPDATE;

-- name: ConsumeOTPChallenge :one
UPDATE otp_challenges SET consumed_at = now()
WHERE id = $1 AND consumed_at IS NULL AND invalidated_at IS NULL AND expires_at > now() AND attempts < max_attempts
RETURNING *;

-- name: IncrementOTPAttempts :one
UPDATE otp_challenges SET attempts = attempts + 1
WHERE id = $1 AND consumed_at IS NULL AND invalidated_at IS NULL AND attempts < max_attempts
RETURNING *;

-- name: CreateMagicLinkChallenge :one
INSERT INTO magic_link_challenges (user_id, recipient_digest, token_digest, purpose, safe_return_context, generation, expires_at)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING *;

-- name: ConsumeMagicLinkChallenge :one
UPDATE magic_link_challenges SET consumed_at = now()
WHERE token_digest = $1 AND purpose = $2 AND consumed_at IS NULL AND invalidated_at IS NULL AND expires_at > now()
RETURNING *;

-- name: CreateOAuthLoginAttempt :one
INSERT INTO oauth_login_attempts (provider, state_digest, nonce_digest, pkce_verifier_digest, safe_return_context, expires_at)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: CompleteOAuthLoginAttempt :one
UPDATE oauth_login_attempts SET status = 'completed', completed_at = now()
WHERE state_digest = $1 AND status = 'pending' AND expires_at > now()
RETURNING *;

-- name: CreateSession :one
INSERT INTO sessions (user_id, family_id, refresh_digest, csrf_digest, previous_session_id, session_kind, device_label, user_agent_summary, ip_prefix, expires_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
RETURNING *;

-- name: GetSessionByRefreshDigestForUpdate :one
SELECT * FROM sessions WHERE refresh_digest = $1 FOR UPDATE;

-- name: RevokeSession :execrows
UPDATE sessions SET revoked_at = now(), revocation_reason = $2
WHERE id = $1 AND revoked_at IS NULL;

-- name: RevokeSessionFamily :execrows
UPDATE sessions SET revoked_at = now(), revocation_reason = $2
WHERE family_id = $1 AND revoked_at IS NULL;

-- name: RevokeOtherUserSessions :execrows
UPDATE sessions SET revoked_at = now(), revocation_reason = $3
WHERE user_id = $1 AND id <> $2 AND revoked_at IS NULL;

-- name: ListActiveUserSessions :many
SELECT * FROM sessions
WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()
ORDER BY last_seen_at DESC, id DESC;

-- name: UpsertOnboardingProgress :one
INSERT INTO onboarding_progress (user_id, flow_version, current_step, selected_roles, selected_space_choice, preferences)
VALUES ($1, $2, $3, $4, $5, $6)
ON CONFLICT (user_id) DO UPDATE SET
    flow_version = EXCLUDED.flow_version,
    current_step = EXCLUDED.current_step,
    selected_roles = EXCLUDED.selected_roles,
    selected_space_choice = EXCLUDED.selected_space_choice,
    preferences = EXCLUDED.preferences,
    updated_at = now()
RETURNING *;

-- name: CreateWorkspace :one
INSERT INTO workspaces (kind, name, slug, base_currency, timezone, owner_user_id)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: CreateMembership :one
INSERT INTO memberships (workspace_id, user_id, role_id, is_owner, outlet_scope)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: GetInvitationByTokenDigestForUpdate :one
SELECT * FROM invitations WHERE token_digest = $1 FOR UPDATE;

-- name: AcceptInvitation :one
UPDATE invitations
SET status = 'accepted', accepted_by_user_id = $2, accepted_at = now(), updated_at = now()
WHERE id = $1 AND status = 'pending' AND expires_at > now()
RETURNING *;

-- name: EnqueueOutboxJob :one
INSERT INTO outbox_jobs (job_type, aggregate_type, aggregate_id, payload, available_at)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: CreateIdempotencyRecord :one
INSERT INTO idempotency_records (actor_user_id, operation, key_digest, request_digest, expires_at)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: ConsumePasswordResetChallenge :one
UPDATE magic_link_challenges
SET consumed_at = now()
WHERE token_digest = $1
  AND purpose = 'password_reset'
  AND user_id IS NOT NULL
  AND consumed_at IS NULL
  AND invalidated_at IS NULL
  AND expires_at > now()
RETURNING *;

-- name: CheckAuthRateLimit :one
SELECT blocked_until
FROM auth_rate_limits
WHERE subject_digest = $1 AND action = $2;

-- name: RecordAuthRateLimitFailure :one
INSERT INTO auth_rate_limits (subject_digest, action, window_started_at, attempt_count, blocked_until)
VALUES ($1, $2, now(), 1, NULL)
ON CONFLICT (subject_digest, action) DO UPDATE SET
    window_started_at = CASE
        WHEN auth_rate_limits.window_started_at < now() - sqlc.arg(window_seconds)::integer * interval '1 second' THEN now()
        ELSE auth_rate_limits.window_started_at
    END,
    attempt_count = CASE
        WHEN auth_rate_limits.window_started_at < now() - sqlc.arg(window_seconds)::integer * interval '1 second' THEN 1
        ELSE auth_rate_limits.attempt_count + 1
    END,
    blocked_until = CASE
        WHEN auth_rate_limits.window_started_at >= now() - sqlc.arg(window_seconds)::integer * interval '1 second'
             AND auth_rate_limits.attempt_count + 1 >= sqlc.arg(max_attempts)::integer
        THEN now() + sqlc.arg(block_seconds)::integer * interval '1 second'
        ELSE auth_rate_limits.blocked_until
    END,
    updated_at = now()
RETURNING *;

-- name: ClearAuthRateLimit :execrows
DELETE FROM auth_rate_limits WHERE subject_digest = $1 AND action = $2;

-- name: EnqueuePasswordResetPreparation :one
INSERT INTO outbox_jobs (job_type, aggregate_type, aggregate_id, payload, available_at)
VALUES ('prepare_password_reset', 'user', $1::text, jsonb_build_object('user_id', $1::bigint), now())
RETURNING *;

-- name: EnqueueAuthEmailJob :one
INSERT INTO outbox_jobs (job_type, aggregate_type, aggregate_id, payload, available_at)
VALUES ($1, 'auth_email', $2, $3, now())
RETURNING *;

-- name: GetLatestOTPChallengeForUpdate :one
SELECT * FROM otp_challenges
WHERE recipient_digest = $1 AND purpose = $2
ORDER BY generation DESC, id DESC
LIMIT 1
FOR UPDATE;

-- name: ConsumeExactOTPChallenge :one
UPDATE otp_challenges SET consumed_at = now()
WHERE id = $1 AND consumed_at IS NULL AND invalidated_at IS NULL AND expires_at > now() AND attempts < max_attempts
RETURNING *;

-- name: GetMagicLinkChallenge :one
SELECT * FROM magic_link_challenges WHERE token_digest = $1 AND purpose = 'sign_in';

-- name: ConsumeSignInMagicLink :one
UPDATE magic_link_challenges SET consumed_at = now()
WHERE token_digest = $1 AND purpose = 'sign_in' AND consumed_at IS NULL AND invalidated_at IS NULL AND expires_at > now()
RETURNING *;

-- name: UserHasActivePassword :one
SELECT EXISTS(SELECT 1 FROM password_credentials WHERE user_id = $1 AND status = 'active');

-- name: CreateSocialLinkAttempt :one
INSERT INTO social_link_attempts (target_user_id, provider, provider_issuer, provider_subject, normalized_email, proof_digest, expires_at)
VALUES ($1, 'google', $2, $3, $4, $5, $6)
RETURNING *;

-- name: GetSocialLinkAttemptForUpdate :one
SELECT * FROM social_link_attempts
WHERE proof_digest = $1 AND provider = 'google'
FOR UPDATE;

-- name: CompleteSocialLinkAttempt :one
UPDATE social_link_attempts SET status = 'completed', completed_at = now()
WHERE id = $1 AND status = 'pending' AND expires_at > now()
RETURNING *;

-- name: GetActiveFullSessionByDigest :one
SELECT s.* FROM sessions s
JOIN users u ON u.id = s.user_id
WHERE s.refresh_digest = $1 AND s.session_kind = 'full' AND s.revoked_at IS NULL AND s.expires_at > now() AND u.status = 'active';

-- name: InviterHasActiveMembership :one
SELECT EXISTS(
    SELECT 1 FROM memberships
    WHERE workspace_id = $1 AND user_id = $2 AND status = 'active'
);

-- name: InvitationRoleIsAllowed :one
SELECT EXISTS(
    SELECT 1 FROM roles
    WHERE id = $1 AND (workspace_id = $2 OR (is_system AND workspace_id IS NULL))
);

-- name: GetActiveEmailForUser :one
SELECT * FROM auth_identities
WHERE user_id = $1 AND provider = 'email' AND status = 'active';

-- name: GetActiveMembership :one
SELECT * FROM memberships
WHERE workspace_id = $1 AND user_id = $2 AND status <> 'removed';

-- name: InvitationHasSeatCapacity :one
SELECT EXISTS(
    SELECT 1
    FROM workspaces w
    JOIN roles r ON r.id = sqlc.arg(role_id)
    WHERE w.id = sqlc.arg(workspace_id)
      AND w.kind = 'business'
      AND w.status = 'active'
      AND (r.workspace_id = w.id OR (r.is_system AND r.workspace_id IS NULL))
      AND (
          (r.code = 'accountant' AND (
              SELECT count(*)
              FROM memberships m
              JOIN roles mr ON mr.id = m.role_id
              WHERE m.workspace_id = w.id AND m.status = 'active' AND NOT m.is_owner AND mr.code = 'accountant'
          ) < w.accountant_seat_limit)
          OR
          (r.code <> 'accountant' AND (
              SELECT count(*)
              FROM memberships m
              JOIN roles mr ON mr.id = m.role_id
              WHERE m.workspace_id = w.id AND m.status = 'active' AND NOT m.is_owner AND mr.code <> 'accountant'
          ) < w.staff_seat_limit)
      )
);

-- name: CountActiveNonGoogleLoginRecoveryMethods :one
SELECT
    (SELECT count(*) FROM password_credentials pc WHERE pc.user_id = sqlc.arg(target_user_id) AND pc.status = 'active')
  + (SELECT count(*) FROM auth_identities ai WHERE ai.user_id = sqlc.arg(target_user_id) AND ai.provider = 'email' AND ai.status = 'active');

-- name: UnlinkGoogleIdentities :execrows
UPDATE auth_identities
SET status = 'unlinked', unlinked_at = now(), updated_at = now()
WHERE user_id = $1 AND provider = 'google' AND status = 'active';

