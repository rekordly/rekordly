-- Blueprint 18: Review Items & Idempotent Event Consumption

CREATE TABLE IF NOT EXISTS review_items (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    review_type TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'in_progress', 'blocked', 'resolved', 'dismissed', 'superseded')),
    source_aggregate_type TEXT NOT NULL,
    source_aggregate_id TEXT NOT NULL,
    source_version BIGINT NOT NULL DEFAULT 1,
    dedupe_key TEXT NOT NULL,
    safe_summary TEXT NOT NULL,
    resolved_by_event_id TEXT NOT NULL DEFAULT '',
    version BIGINT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT review_items_ws_dedupe_uidx UNIQUE (workspace_id, dedupe_key)
);

CREATE INDEX IF NOT EXISTS review_items_ws_state_idx ON review_items (workspace_id, state, created_at DESC);

CREATE TABLE IF NOT EXISTS event_consumptions (
    consumer_name TEXT NOT NULL,
    event_id TEXT NOT NULL,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    event_version INTEGER NOT NULL DEFAULT 1,
    consumed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (consumer_name, event_id)
);

CREATE INDEX IF NOT EXISTS event_consumptions_ws_idx ON event_consumptions (workspace_id, consumed_at DESC);
