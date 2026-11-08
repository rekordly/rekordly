CREATE TABLE social_link_attempts (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    target_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL CONSTRAINT social_link_attempts_provider_check CHECK (provider = 'google'),
    provider_issuer TEXT NOT NULL,
    provider_subject TEXT NOT NULL,
    normalized_email TEXT NOT NULL,
    proof_digest BYTEA NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'pending' CONSTRAINT social_link_attempts_status_check CHECK (status IN ('pending', 'completed', 'expired', 'revoked')),
    expires_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT social_link_attempts_expiry_check CHECK (expires_at > created_at),
    CONSTRAINT social_link_attempts_completion_check CHECK ((status = 'completed' AND completed_at IS NOT NULL) OR status <> 'completed')
);
CREATE INDEX social_link_attempts_target_status_idx ON social_link_attempts (target_user_id, status, expires_at);

CREATE INDEX invitations_active_token_idx ON invitations (token_digest, expires_at) WHERE status = 'pending';

-- Temporary launch entitlement snapshot. The billing module will own changes to
-- these resolved limits; invitation acceptance must still enforce them now.
ALTER TABLE workspaces
    ADD COLUMN staff_seat_limit INTEGER NOT NULL DEFAULT 2
        CONSTRAINT workspaces_staff_seat_limit_check CHECK (staff_seat_limit >= 0),
    ADD COLUMN accountant_seat_limit INTEGER NOT NULL DEFAULT 1
        CONSTRAINT workspaces_accountant_seat_limit_check CHECK (accountant_seat_limit >= 0);

