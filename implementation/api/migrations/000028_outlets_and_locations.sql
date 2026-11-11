-- Blueprint 07: Outlets and locations management
ALTER TABLE inventory_locations
    ADD COLUMN IF NOT EXISTS code TEXT,
    ADD COLUMN IF NOT EXISTS address TEXT,
    ADD COLUMN IF NOT EXISTS phone TEXT,
    ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS inventory_locations_workspace_code_uidx
    ON inventory_locations (workspace_id, lower(code))
    WHERE code IS NOT NULL AND btrim(code) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS inventory_locations_one_default_idx
    ON inventory_locations (workspace_id)
    WHERE is_default;

-- Ensure every workspace with existing locations has exactly one default location
UPDATE inventory_locations l
SET is_default = true
WHERE l.id = (
    SELECT id FROM inventory_locations
    WHERE workspace_id = l.workspace_id AND is_active = true
    ORDER BY id ASC
    LIMIT 1
) AND NOT EXISTS (
    SELECT 1 FROM inventory_locations
    WHERE workspace_id = l.workspace_id AND is_default = true
);
