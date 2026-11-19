-- Merchant design editor. Every operation is tenant scoped and versions the settings row.
-- name: GetStorefrontDesignState :one
SELECT sf.id AS storefront_id, sf.workspace_id, sf.name, sf.slug, sf.status,
       sf.theme_key AS published_theme_key, sf.version AS storefront_version,
       sf.currency, sf.currency_exponent, st.brand, st.sections, st.draft_name,
       st.draft_theme_key, st.draft_brand, st.draft_sections, st.theme_drafts,
       st.published_at, st.version AS design_version,
       st.contact_phone, st.contact_email, st.whatsapp_number, st.address, st.business_hours
FROM storefronts sf
JOIN storefront_settings st ON st.storefront_id = sf.id AND st.workspace_id = sf.workspace_id
WHERE sf.workspace_id = $1;

-- name: SaveStorefrontDesignDraft :one
UPDATE storefront_settings st
SET draft_theme_key = sqlc.arg('draft_theme_key')::text,
    draft_name = sqlc.arg('draft_name')::text,
    draft_brand = sqlc.arg('draft_brand')::jsonb,
    draft_sections = sqlc.arg('draft_sections')::jsonb,
    theme_drafts = st.theme_drafts || jsonb_build_object(
        st.draft_theme_key, jsonb_build_object('name', st.draft_name, 'brand', st.draft_brand, 'sections', st.draft_sections),
        sqlc.arg('draft_theme_key')::text, jsonb_build_object('name', sqlc.arg('draft_name')::text, 'brand', sqlc.arg('draft_brand')::jsonb, 'sections', sqlc.arg('draft_sections')::jsonb)
    ),
    version = st.version + 1,
    updated_at = now()
WHERE st.workspace_id = sqlc.arg('workspace_id') AND st.storefront_id = sqlc.arg('storefront_id') AND st.version = sqlc.arg('expected_version')
RETURNING st.version;

-- name: PublishStorefrontDesignDraft :one
UPDATE storefronts sf
SET name = st.draft_name,
    theme_key = st.draft_theme_key,
    status = 'published',
    published_at = now(),
    version = sf.version + 1,
    updated_at = now()
FROM storefront_settings st
WHERE sf.workspace_id = sqlc.arg('workspace_id') AND sf.id = sqlc.arg('storefront_id')
  AND st.workspace_id = sf.workspace_id AND st.storefront_id = sf.id AND st.version = sqlc.arg('expected_version')
RETURNING sf.*;

-- name: PublishStorefrontDesignSettings :one
UPDATE storefront_settings
SET brand = draft_brand,
    sections = draft_sections,
    published_at = now(),
    version = version + 1,
    updated_at = now()
WHERE workspace_id = sqlc.arg('workspace_id') AND storefront_id = sqlc.arg('storefront_id')
RETURNING *;

-- name: DiscardStorefrontDesignDraft :one
UPDATE storefront_settings st
SET draft_theme_key = sf.theme_key,
    draft_name = sf.name,
    draft_brand = st.brand,
    draft_sections = st.sections,
    theme_drafts = (st.theme_drafts - st.draft_theme_key) || jsonb_build_object(
        sf.theme_key, jsonb_build_object('name', sf.name, 'brand', st.brand, 'sections', st.sections)
    ),
    version = st.version + 1,
    updated_at = now()
FROM storefronts sf
WHERE st.workspace_id = sqlc.arg('workspace_id') AND st.storefront_id = sqlc.arg('storefront_id')
  AND st.version = sqlc.arg('expected_version')
  AND sf.workspace_id = st.workspace_id AND sf.id = st.storefront_id
RETURNING st.version;

-- name: CreateStorefrontDesignEvent :exec
INSERT INTO storefront_design_events (workspace_id, storefront_id, actor_user_id, event_type, idempotency_key, request_hash, version)
VALUES (sqlc.arg('workspace_id'), sqlc.arg('storefront_id'), sqlc.arg('actor_user_id'), sqlc.arg('event_type'), sqlc.arg('idempotency_key'), sqlc.arg('request_hash'), sqlc.arg('version'));

-- name: CreateStorefrontSettingsEvent :exec
INSERT INTO storefront_design_events (workspace_id, storefront_id, actor_user_id, event_type, idempotency_key, request_hash, version)
VALUES (sqlc.arg('workspace_id'), sqlc.arg('storefront_id'), NULL, 'settings_updated', sqlc.arg('idempotency_key'), sqlc.arg('request_hash'), sqlc.arg('version'));

-- name: GetStorefrontDesignEventByKey :one
SELECT id, workspace_id, storefront_id, actor_user_id, event_type, idempotency_key, request_hash, version, created_at
FROM storefront_design_events
WHERE workspace_id = sqlc.arg('workspace_id') AND idempotency_key = sqlc.arg('idempotency_key');

