-- name: ListRolePermissions :many
SELECT permission_code FROM role_permissions
WHERE role_id = $1
ORDER BY permission_code ASC;

-- name: AddRolePermission :exec
INSERT INTO role_permissions (role_id, permission_code)
VALUES ($1, $2)
ON CONFLICT (role_id, permission_code) DO NOTHING;

-- name: DeleteRolePermission :exec
DELETE FROM role_permissions
WHERE role_id = $1 AND permission_code = $2;

-- name: CreateNotification :one
INSERT INTO notifications (
    workspace_id, user_id, category, title, body, action_url
) VALUES (
    $1, $2, $3, $4, $5, $6
) RETURNING *;

-- name: ListNotificationsForUser :many
SELECT * FROM notifications
WHERE user_id = $1
  AND (sqlc.narg('workspace_id')::bigint IS NULL OR workspace_id IS NULL OR workspace_id = sqlc.narg('workspace_id'))
ORDER BY created_at DESC, id DESC
LIMIT $2;

-- name: MarkNotificationRead :one
UPDATE notifications
SET is_read = true,
    read_at = NOW()
WHERE id = $1 AND user_id = $2
RETURNING *;

-- name: MarkAllNotificationsRead :exec
UPDATE notifications
SET is_read = true,
    read_at = NOW()
WHERE user_id = $1
  AND (sqlc.narg('workspace_id')::bigint IS NULL OR workspace_id IS NULL OR workspace_id = sqlc.narg('workspace_id'))
  AND is_read = false;

-- name: CountUnreadNotifications :one
SELECT COUNT(*) FROM notifications
WHERE user_id = $1
  AND (sqlc.narg('workspace_id')::bigint IS NULL OR workspace_id IS NULL OR workspace_id = sqlc.narg('workspace_id'))
  AND is_read = false;

-- name: GetWorkspaceProfile :one
SELECT id, kind, name, slug, base_currency, timezone, business_type, country, address, contact_phone, contact_email, status, owner_user_id, created_at, updated_at
FROM workspaces
WHERE id = $1;

-- name: UpdateWorkspaceProfile :one
UPDATE workspaces
SET name = $2,
    timezone = $3,
    business_type = $4,
    country = $5,
    address = $6,
    contact_phone = $7,
    contact_email = $8,
    updated_at = NOW()
WHERE id = $1
RETURNING id, kind, name, slug, base_currency, timezone, business_type, country, address, contact_phone, contact_email, status, owner_user_id, created_at, updated_at;

-- name: ListWorkspaceMembers :many
SELECT m.id, m.workspace_id, m.user_id, m.role_id, m.is_owner, m.outlet_scope, m.status, m.joined_at,
       u.display_name, r.code AS role_code, r.name AS role_name
FROM memberships m
JOIN users u ON u.id = m.user_id
JOIN roles r ON r.id = m.role_id
WHERE m.workspace_id = $1 AND m.status <> 'removed'
ORDER BY m.is_owner DESC, m.joined_at ASC;

-- name: ListWorkspaceRoles :many
SELECT id, workspace_id, code, name, is_system
FROM roles
WHERE workspace_id = $1 OR is_system = true
ORDER BY id ASC;

-- name: ListWorkspaceInvitations :many
SELECT i.id, i.workspace_id, i.role_id, r.code AS role_code, r.name AS role_name,
       i.destination_normalized, i.outlet_scope, i.status, i.expires_at, i.created_at
FROM invitations i
JOIN roles r ON r.id = i.role_id
WHERE i.workspace_id = $1 AND i.status = 'pending'
ORDER BY i.created_at DESC;
