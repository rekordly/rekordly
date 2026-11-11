-- Workspace-level procurement controls make approval policy explicit and auditable.
CREATE TABLE procurement_approval_policies (
    workspace_id BIGINT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
    approval_threshold_minor BIGINT NOT NULL DEFAULT 0 CHECK (approval_threshold_minor >= 0),
    allow_self_approval BOOLEAN NOT NULL DEFAULT TRUE,
    updated_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO procurement_approval_policies (workspace_id)
SELECT id FROM workspaces
ON CONFLICT (workspace_id) DO NOTHING;

CREATE TABLE procurement_attachments (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    purchase_request_id BIGINT REFERENCES purchase_requests(id) ON DELETE CASCADE,
    purchase_order_id BIGINT REFERENCES purchase_orders(id) ON DELETE CASCADE,
    goods_receipt_id BIGINT REFERENCES goods_receipts(id) ON DELETE CASCADE,
    supplier_bill_id BIGINT REFERENCES supplier_bills(id) ON DELETE CASCADE,
    storage_key TEXT NOT NULL,
    file_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    file_size_bytes BIGINT NOT NULL CHECK (file_size_bytes > 0),
    created_by_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT procurement_attachments_one_parent CHECK (num_nonnulls(purchase_request_id, purchase_order_id, goods_receipt_id, supplier_bill_id) = 1)
);
CREATE INDEX procurement_attachments_request_idx ON procurement_attachments(workspace_id, purchase_request_id, id DESC);
CREATE INDEX procurement_attachments_order_idx ON procurement_attachments(workspace_id, purchase_order_id, id DESC);
