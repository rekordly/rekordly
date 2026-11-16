-- Migration 000063: supplier_bill_events, document_message_reads, and document_files

CREATE TABLE IF NOT EXISTS supplier_bill_events (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    supplier_bill_id BIGINT NOT NULL REFERENCES supplier_bills(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    bill_version INTEGER NOT NULL DEFAULT 1,
    note TEXT,
    actor_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS supplier_bill_events_bill_idx ON supplier_bill_events (workspace_id, supplier_bill_id, created_at ASC);

CREATE TABLE IF NOT EXISTS document_message_reads (
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    document_type TEXT NOT NULL,
    document_id BIGINT NOT NULL,
    last_read_message_id BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, user_id, document_type, document_id)
);

ALTER TABLE external_messages DROP CONSTRAINT IF EXISTS ext_messages_doc_type_check;
ALTER TABLE external_messages ADD CONSTRAINT ext_messages_doc_type_check
    CHECK (document_type IN ('invoice', 'estimate', 'purchase_order', 'statement', 'supplier_bill', 'goods_receipt', 'purchase'));

CREATE TABLE IF NOT EXISTS document_files (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    document_type TEXT NOT NULL,
    document_id BIGINT NOT NULL,
    evidence_asset_id BIGINT NOT NULL REFERENCES evidence_assets(id) ON DELETE CASCADE,
    created_by_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(workspace_id, document_type, document_id, evidence_asset_id)
);
CREATE INDEX IF NOT EXISTS document_files_doc_idx ON document_files (workspace_id, document_type, document_id);
