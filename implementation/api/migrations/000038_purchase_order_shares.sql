CREATE TABLE IF NOT EXISTS purchase_order_shares (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 purchase_order_id BIGINT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
 token_hash TEXT NOT NULL,
 supplier_email TEXT,
 expires_at TIMESTAMPTZ NOT NULL,
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','acknowledged','declined','change_requested','revoked')),
 response_note TEXT,
 created_by_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 responded_at TIMESTAMPTZ,
 UNIQUE(token_hash)
);
CREATE INDEX IF NOT EXISTS purchase_order_shares_workspace_order_idx ON purchase_order_shares(workspace_id,purchase_order_id,id DESC);
