-- Closing/cancelling a PO must never delete a prior receipt, bill or payment.
-- These states only resolve the unreceived operational commitment.
ALTER TABLE purchase_orders DROP CONSTRAINT purchase_orders_status_check;
ALTER TABLE purchase_orders ADD CONSTRAINT purchase_orders_status_check CHECK (status IN ('draft','submitted','approved','issued','acknowledged','partially_received','fully_received','cancelled','partially_cancelled','closed'));
ALTER TABLE purchase_orders
    ADD COLUMN cancellation_reason TEXT,
    ADD COLUMN closed_reason TEXT,
    ADD COLUMN acknowledged_at TIMESTAMPTZ,
    ADD COLUMN acknowledgement_note TEXT;

ALTER TABLE purchase_order_command_log DROP CONSTRAINT purchase_order_command_log_command_check;
ALTER TABLE purchase_order_command_log ADD CONSTRAINT purchase_order_command_log_command_check CHECK (command IN ('submitted','approved','issued','acknowledge','cancel','cancel_remainder','close'));

CREATE TABLE purchase_order_events (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    purchase_order_id BIGINT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL CONSTRAINT purchase_order_events_type_check CHECK (event_type IN ('submitted','approved','issued','acknowledged','cancelled','remainder_cancelled','closed')),
    order_version INTEGER NOT NULL CONSTRAINT purchase_order_events_version_check CHECK (order_version > 0),
    note TEXT,
    actor_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX purchase_order_events_workspace_order_id_idx ON purchase_order_events (workspace_id, purchase_order_id, id ASC);
