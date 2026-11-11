-- Requests remain non-posting operational documents. This migration adds the
-- information needed to make a review decision explainable and auditable,
-- rather than storing a mutable status with no decision history.
ALTER TABLE purchase_requests
    ADD COLUMN priority TEXT NOT NULL DEFAULT 'normal'
        CONSTRAINT purchase_requests_priority_check CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    ADD COLUMN latest_decision_reason TEXT;

CREATE TABLE purchase_request_decisions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    purchase_request_id BIGINT NOT NULL REFERENCES purchase_requests(id) ON DELETE CASCADE,
    command TEXT NOT NULL CONSTRAINT purchase_request_decisions_command_check
        CHECK (command IN ('submit', 'approve', 'reject', 'request_changes', 'cancel')),
    request_version INTEGER NOT NULL CONSTRAINT purchase_request_decisions_version_check CHECK (request_version > 0),
    reason TEXT,
    actor_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX purchase_request_decisions_workspace_request_id_idx
    ON purchase_request_decisions (workspace_id, purchase_request_id, id DESC);
