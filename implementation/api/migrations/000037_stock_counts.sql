CREATE TABLE IF NOT EXISTS stock_counts (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 count_number TEXT NOT NULL,
 location_id BIGINT NOT NULL REFERENCES inventory_locations(id) ON DELETE RESTRICT,
 status TEXT NOT NULL DEFAULT 'completed' CHECK(status IN ('draft','in_progress','completed','cancelled')),
 counted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 notes TEXT,
 idempotency_key TEXT NOT NULL,
 created_by_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,idempotency_key), UNIQUE(workspace_id,count_number)
);
CREATE TABLE IF NOT EXISTS stock_count_lines (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 count_id BIGINT NOT NULL REFERENCES stock_counts(id) ON DELETE CASCADE,
 product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
 expected_quantity NUMERIC(18,4) NOT NULL DEFAULT 0,
 counted_quantity NUMERIC(18,4) NOT NULL CHECK(counted_quantity >= 0),
 variance_quantity NUMERIC(18,4) NOT NULL,
 unit_cost_minor BIGINT NOT NULL DEFAULT 0 CHECK(unit_cost_minor >= 0)
);
