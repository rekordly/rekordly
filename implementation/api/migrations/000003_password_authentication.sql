ALTER TABLE sessions ADD COLUMN csrf_digest BYTEA;

CREATE TABLE auth_rate_limits (
    subject_digest BYTEA NOT NULL,
    action TEXT NOT NULL CONSTRAINT auth_rate_limits_action_check CHECK (action IN ('email_continue', 'password_sign_in', 'password_reset_request')),
    window_started_at TIMESTAMPTZ NOT NULL,
    attempt_count INTEGER NOT NULL DEFAULT 0 CONSTRAINT auth_rate_limits_attempt_count_check CHECK (attempt_count >= 0),
    blocked_until TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (subject_digest, action)
);
CREATE INDEX auth_rate_limits_blocked_until_idx ON auth_rate_limits (blocked_until) WHERE blocked_until IS NOT NULL;

