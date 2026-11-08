CREATE TABLE users (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    display_name TEXT,
    locale TEXT NOT NULL DEFAULT 'en-NG',
    timezone TEXT NOT NULL DEFAULT 'Africa/Lagos',
    status TEXT NOT NULL DEFAULT 'active' CONSTRAINT users_status_check CHECK (status IN ('active', 'suspended', 'disabled')),
    onboarding_status TEXT NOT NULL DEFAULT 'identity_verified' CONSTRAINT users_onboarding_status_check CHECK (onboarding_status IN ('identity_verified', 'preferences_saved', 'core_creating', 'core_complete', 'activated')),
    onboarding_version INTEGER NOT NULL DEFAULT 1 CONSTRAINT users_onboarding_version_check CHECK (onboarding_version > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE auth_identities (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL CONSTRAINT auth_identities_provider_check CHECK (provider IN ('email', 'google')),
    provider_issuer TEXT,
    provider_subject TEXT,
    normalized_identifier TEXT,
    display_identifier TEXT,
    status TEXT NOT NULL DEFAULT 'active' CONSTRAINT auth_identities_status_check CHECK (status IN ('active', 'unlinked', 'disabled')),
    verified_at TIMESTAMPTZ NOT NULL,
    linked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    unlinked_at TIMESTAMPTZ,
    linking_audit_event_id BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT auth_identities_provider_fields_check CHECK (
        (provider = 'email' AND normalized_identifier IS NOT NULL AND provider_issuer IS NULL AND provider_subject IS NULL)
        OR
        (provider = 'google' AND provider_issuer IS NOT NULL AND provider_subject IS NOT NULL)
    ),
    CONSTRAINT auth_identities_unlinked_state_check CHECK (
        (status = 'unlinked' AND unlinked_at IS NOT NULL) OR (status <> 'unlinked')
    )
);
CREATE INDEX auth_identities_user_id_idx ON auth_identities (user_id);
CREATE UNIQUE INDEX auth_identities_active_email_uidx ON auth_identities (normalized_identifier)
    WHERE provider = 'email' AND status = 'active';
CREATE UNIQUE INDEX auth_identities_active_google_uidx ON auth_identities (provider_issuer, provider_subject)
    WHERE provider = 'google' AND status = 'active';

CREATE TABLE password_credentials (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    encoded_hash TEXT NOT NULL,
    algorithm TEXT NOT NULL DEFAULT 'argon2id' CONSTRAINT password_credentials_algorithm_check CHECK (algorithm = 'argon2id'),
    algorithm_version INTEGER NOT NULL DEFAULT 19 CONSTRAINT password_credentials_algorithm_version_check CHECK (algorithm_version > 0),
    status TEXT NOT NULL DEFAULT 'active' CONSTRAINT password_credentials_status_check CHECK (status IN ('active', 'replaced', 'disabled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_rehashed_at TIMESTAMPTZ,
    replaced_at TIMESTAMPTZ
);
CREATE INDEX password_credentials_user_id_idx ON password_credentials (user_id);
CREATE UNIQUE INDEX password_credentials_active_user_uidx ON password_credentials (user_id) WHERE status = 'active';

CREATE TABLE otp_challenges (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
    recipient_digest BYTEA NOT NULL,
    code_digest BYTEA NOT NULL,
    purpose TEXT NOT NULL CONSTRAINT otp_challenges_purpose_check CHECK (purpose IN ('registration', 'sign_in', 'invitation', 'password_reset', 'contact_change')),
    generation INTEGER NOT NULL DEFAULT 1 CONSTRAINT otp_challenges_generation_check CHECK (generation > 0),
    attempts INTEGER NOT NULL DEFAULT 0 CONSTRAINT otp_challenges_attempts_check CHECK (attempts >= 0),
    max_attempts INTEGER NOT NULL DEFAULT 5 CONSTRAINT otp_challenges_max_attempts_check CHECK (max_attempts > 0),
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    invalidated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT otp_challenges_expiry_check CHECK (expires_at > created_at),
    CONSTRAINT otp_challenges_terminal_state_check CHECK (consumed_at IS NULL OR invalidated_at IS NULL)
);
CREATE INDEX otp_challenges_recipient_purpose_created_idx ON otp_challenges (recipient_digest, purpose, created_at DESC);
CREATE INDEX otp_challenges_user_id_idx ON otp_challenges (user_id);

CREATE TABLE magic_link_challenges (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
    recipient_digest BYTEA NOT NULL,
    token_digest BYTEA NOT NULL UNIQUE,
    purpose TEXT NOT NULL CONSTRAINT magic_link_challenges_purpose_check CHECK (purpose IN ('registration', 'sign_in', 'invitation', 'password_reset', 'contact_change')),
    safe_return_context JSONB NOT NULL DEFAULT '{}'::jsonb,
    generation INTEGER NOT NULL DEFAULT 1 CONSTRAINT magic_link_challenges_generation_check CHECK (generation > 0),
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    invalidated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT magic_link_challenges_expiry_check CHECK (expires_at > created_at),
    CONSTRAINT magic_link_challenges_terminal_state_check CHECK (consumed_at IS NULL OR invalidated_at IS NULL)
);
CREATE INDEX magic_link_challenges_recipient_purpose_created_idx ON magic_link_challenges (recipient_digest, purpose, created_at DESC);
CREATE INDEX magic_link_challenges_user_id_idx ON magic_link_challenges (user_id);

CREATE TABLE oauth_login_attempts (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    provider TEXT NOT NULL CONSTRAINT oauth_login_attempts_provider_check CHECK (provider = 'google'),
    state_digest BYTEA NOT NULL UNIQUE,
    nonce_digest BYTEA NOT NULL,
    pkce_verifier_digest BYTEA NOT NULL,
    safe_return_context JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'pending' CONSTRAINT oauth_login_attempts_status_check CHECK (status IN ('pending', 'completed', 'failed', 'expired')),
    failure_class TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT oauth_login_attempts_expiry_check CHECK (expires_at > created_at),
    CONSTRAINT oauth_login_attempts_completion_check CHECK ((status = 'completed' AND completed_at IS NOT NULL) OR status <> 'completed')
);
CREATE INDEX oauth_login_attempts_status_expires_idx ON oauth_login_attempts (status, expires_at);

CREATE TABLE sessions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    family_id UUID NOT NULL,
    refresh_digest BYTEA NOT NULL UNIQUE,
    previous_session_id BIGINT REFERENCES sessions(id) ON DELETE SET NULL,
    replaced_by_session_id BIGINT REFERENCES sessions(id) ON DELETE SET NULL,
    session_kind TEXT NOT NULL DEFAULT 'full' CONSTRAINT sessions_kind_check CHECK (session_kind IN ('pre_auth', 'full')),
    device_label TEXT,
    user_agent_summary TEXT,
    ip_prefix TEXT,
    issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    rotated_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    revocation_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT sessions_expiry_check CHECK (expires_at > issued_at),
    CONSTRAINT sessions_revocation_check CHECK (revoked_at IS NULL OR revocation_reason IS NOT NULL)
);
CREATE INDEX sessions_user_active_idx ON sessions (user_id, expires_at DESC) WHERE revoked_at IS NULL;
CREATE INDEX sessions_family_id_idx ON sessions (family_id);
CREATE INDEX sessions_previous_session_id_idx ON sessions (previous_session_id);
CREATE INDEX sessions_replaced_by_session_id_idx ON sessions (replaced_by_session_id);

CREATE TABLE onboarding_progress (
    user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    flow_version INTEGER NOT NULL DEFAULT 1 CONSTRAINT onboarding_progress_flow_version_check CHECK (flow_version > 0),
    current_step TEXT NOT NULL DEFAULT 'identity_verified',
    selected_roles TEXT[] NOT NULL DEFAULT '{}',
    selected_space_choice TEXT CONSTRAINT onboarding_progress_space_choice_check CHECK (selected_space_choice IS NULL OR selected_space_choice IN ('personal', 'business', 'all')),
    preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE workspaces (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    kind TEXT NOT NULL CONSTRAINT workspaces_kind_check CHECK (kind IN ('personal', 'business')),
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    base_currency CHAR(3) NOT NULL,
    timezone TEXT NOT NULL DEFAULT 'Africa/Lagos',
    status TEXT NOT NULL DEFAULT 'active' CONSTRAINT workspaces_status_check CHECK (status IN ('active', 'suspended', 'closed')),
    owner_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT workspaces_slug_format_check CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
    CONSTRAINT workspaces_currency_format_check CHECK (base_currency ~ '^[A-Z]{3}$')
);
CREATE UNIQUE INDEX workspaces_slug_uidx ON workspaces (lower(slug));
CREATE UNIQUE INDEX workspaces_personal_owner_uidx ON workspaces (owner_user_id) WHERE kind = 'personal' AND status <> 'closed';
CREATE INDEX workspaces_owner_user_id_idx ON workspaces (owner_user_id);

CREATE TABLE roles (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT REFERENCES workspaces(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    is_system BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT roles_scope_check CHECK ((is_system AND workspace_id IS NULL) OR (NOT is_system AND workspace_id IS NOT NULL))
);
CREATE UNIQUE INDEX roles_system_code_uidx ON roles (code) WHERE is_system;
CREATE UNIQUE INDEX roles_workspace_code_uidx ON roles (workspace_id, code) WHERE NOT is_system;
CREATE INDEX roles_workspace_id_idx ON roles (workspace_id);

CREATE TABLE memberships (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id BIGINT NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
    is_owner BOOLEAN NOT NULL DEFAULT false,
    outlet_scope JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'active' CONSTRAINT memberships_status_check CHECK (status IN ('active', 'suspended', 'removed')),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX memberships_active_workspace_user_uidx ON memberships (workspace_id, user_id) WHERE status <> 'removed';
CREATE UNIQUE INDEX memberships_active_workspace_owner_uidx ON memberships (workspace_id) WHERE is_owner AND status = 'active';
CREATE INDEX memberships_workspace_id_idx ON memberships (workspace_id);
CREATE INDEX memberships_user_id_idx ON memberships (user_id);
CREATE INDEX memberships_role_id_idx ON memberships (role_id);

CREATE TABLE invitations (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    invited_by_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    accepted_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    role_id BIGINT NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
    destination_normalized TEXT NOT NULL,
    destination_digest BYTEA NOT NULL,
    token_digest BYTEA NOT NULL UNIQUE,
    outlet_scope JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'pending' CONSTRAINT invitations_status_check CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
    expires_at TIMESTAMPTZ NOT NULL,
    accepted_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT invitations_expiry_check CHECK (expires_at > created_at),
    CONSTRAINT invitations_acceptance_check CHECK ((status = 'accepted' AND accepted_at IS NOT NULL AND accepted_by_user_id IS NOT NULL) OR status <> 'accepted'),
    CONSTRAINT invitations_revocation_check CHECK ((status = 'revoked' AND revoked_at IS NOT NULL) OR status <> 'revoked')
);
CREATE INDEX invitations_workspace_status_idx ON invitations (workspace_id, status, created_at DESC);
CREATE INDEX invitations_invited_by_user_id_idx ON invitations (invited_by_user_id);
CREATE INDEX invitations_accepted_by_user_id_idx ON invitations (accepted_by_user_id);
CREATE INDEX invitations_role_id_idx ON invitations (role_id);
CREATE INDEX invitations_destination_status_idx ON invitations (destination_digest, status, expires_at);

CREATE TABLE audit_events (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    workspace_id BIGINT REFERENCES workspaces(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL,
    subject_type TEXT NOT NULL,
    subject_id TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_actor_created_idx ON audit_events (actor_user_id, created_at DESC);
CREATE INDEX audit_events_workspace_created_idx ON audit_events (workspace_id, created_at DESC);
CREATE INDEX audit_events_subject_idx ON audit_events (subject_type, subject_id, created_at DESC);

ALTER TABLE auth_identities
    ADD CONSTRAINT auth_identities_linking_audit_event_fk
    FOREIGN KEY (linking_audit_event_id) REFERENCES audit_events(id) ON DELETE SET NULL;
CREATE INDEX auth_identities_linking_audit_event_id_idx ON auth_identities (linking_audit_event_id);

CREATE TABLE outbox_jobs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    job_type TEXT NOT NULL,
    aggregate_type TEXT NOT NULL,
    aggregate_id TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'pending' CONSTRAINT outbox_jobs_status_check CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    attempts INTEGER NOT NULL DEFAULT 0 CONSTRAINT outbox_jobs_attempts_check CHECK (attempts BETWEEN 0 AND 3),
    available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    locked_at TIMESTAMPTZ,
    locked_by TEXT,
    completed_at TIMESTAMPTZ,
    last_error_class TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX outbox_jobs_claim_idx ON outbox_jobs (status, available_at, id) WHERE status = 'pending';

CREATE TABLE idempotency_records (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    actor_user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
    operation TEXT NOT NULL,
    key_digest BYTEA NOT NULL,
    request_digest BYTEA NOT NULL,
    status TEXT NOT NULL DEFAULT 'processing' CONSTRAINT idempotency_records_status_check CHECK (status IN ('processing', 'completed', 'failed')),
    response_code INTEGER,
    response_body JSONB,
    resource_type TEXT,
    resource_id TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT idempotency_records_expiry_check CHECK (expires_at > created_at),
    CONSTRAINT idempotency_records_response_check CHECK ((status = 'completed' AND response_code IS NOT NULL) OR status <> 'completed')
);
CREATE UNIQUE INDEX idempotency_records_actor_operation_key_uidx ON idempotency_records (actor_user_id, operation, key_digest) NULLS NOT DISTINCT;
CREATE INDEX idempotency_records_expires_at_idx ON idempotency_records (expires_at);

