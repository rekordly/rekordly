ALTER TABLE auth_rate_limits DROP CONSTRAINT auth_rate_limits_action_check;
ALTER TABLE auth_rate_limits ADD CONSTRAINT auth_rate_limits_action_check
    CHECK (action IN ('email_continue', 'password_sign_in', 'password_reset_request', 'otp_request', 'otp_verify', 'magic_request'));

CREATE INDEX otp_challenges_active_lookup_idx
    ON otp_challenges (recipient_digest, purpose, generation DESC, id DESC)
    WHERE consumed_at IS NULL AND invalidated_at IS NULL;

CREATE INDEX magic_link_challenges_active_lookup_idx
    ON magic_link_challenges (recipient_digest, purpose, generation DESC, id DESC)
    WHERE consumed_at IS NULL AND invalidated_at IS NULL;

