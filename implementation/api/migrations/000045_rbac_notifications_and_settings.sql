-- 000045_rbac_notifications_and_settings.sql
-- Blueprints 01 & 02: Granular RBAC Permissions, Workspace Profile Settings, and Notifications Center.

-- 1. Extend workspaces with business profile details
ALTER TABLE workspaces
    ADD COLUMN IF NOT EXISTS business_type TEXT,
    ADD COLUMN IF NOT EXISTS country TEXT,
    ADD COLUMN IF NOT EXISTS address TEXT,
    ADD COLUMN IF NOT EXISTS contact_phone TEXT,
    ADD COLUMN IF NOT EXISTS contact_email TEXT;

-- 2. Granular RBAC role_permissions table
CREATE TABLE IF NOT EXISTS role_permissions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    role_id BIGINT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_code TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT role_permissions_unique UNIQUE (role_id, permission_code)
);

CREATE INDEX IF NOT EXISTS role_permissions_role_idx ON role_permissions (role_id);

-- Backfill wildcard permission for existing owner roles
INSERT INTO role_permissions (role_id, permission_code)
SELECT id, '*'
FROM roles
WHERE code = 'owner'
ON CONFLICT (role_id, permission_code) DO NOTHING;

-- Backfill standard operational permissions for existing staff/member roles
INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, p.code
FROM roles r
CROSS JOIN (VALUES
    ('money.view'),
    ('money.create'),
    ('sales.view'),
    ('sales.create'),
    ('purchases.view'),
    ('inventory.view_quantity'),
    ('reports.view_basic')
) AS p(code)
WHERE r.code IN ('staff', 'member', 'admin')
ON CONFLICT (role_id, permission_code) DO NOTHING;

-- 3. Notifications Center table
CREATE TABLE IF NOT EXISTS notifications (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category TEXT NOT NULL DEFAULT 'system' CONSTRAINT notifications_category_check CHECK (category IN ('system', 'finance', 'invoice', 'inventory', 'team', 'approval')),
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    action_url TEXT,
    is_read BOOLEAN NOT NULL DEFAULT false,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notifications_user_ws_idx ON notifications (user_id, workspace_id, is_read, created_at DESC);
