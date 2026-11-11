CREATE TABLE purchase_order_command_log (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, purchase_order_id BIGINT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
 command TEXT NOT NULL CHECK(command IN ('submitted','approved','issued')), expected_version INTEGER NOT NULL CHECK(expected_version>0), idempotency_key TEXT NOT NULL, actor_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(workspace_id,idempotency_key)
);
