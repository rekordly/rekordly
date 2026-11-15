-- Variant-level inventory. Existing balances and movements remain attached to
-- each product's default variant so historical quantities and value are preserved.
ALTER TABLE product_variants
    ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS position INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS product_variants_one_default_uidx
    ON product_variants (workspace_id, product_id) WHERE is_default;
-- The existing case-insensitive SKU index from 000014 already enforces this.

ALTER TABLE inventory_balances ADD COLUMN IF NOT EXISTS variant_id BIGINT;
UPDATE inventory_balances b SET variant_id = v.id
FROM product_variants v
WHERE v.workspace_id=b.workspace_id AND v.product_id=b.product_id AND v.is_default AND b.variant_id IS NULL;
ALTER TABLE inventory_balances ALTER COLUMN variant_id SET NOT NULL;
ALTER TABLE inventory_balances ADD CONSTRAINT inventory_balances_variant_fk
    FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE RESTRICT;
ALTER TABLE inventory_balances DROP CONSTRAINT inventory_balances_workspace_location_product_uidx;
CREATE UNIQUE INDEX IF NOT EXISTS inventory_balances_workspace_location_variant_uidx
    ON inventory_balances(workspace_id, location_id, variant_id);

ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS variant_id BIGINT;
UPDATE inventory_movements m SET variant_id=v.id
FROM product_variants v
WHERE v.workspace_id=m.workspace_id AND v.product_id=m.product_id AND v.is_default AND m.variant_id IS NULL;
ALTER TABLE inventory_movements ALTER COLUMN variant_id SET NOT NULL;
ALTER TABLE inventory_movements ADD CONSTRAINT inventory_movements_variant_fk
    FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS inventory_movements_workspace_variant_idx
    ON inventory_movements(workspace_id, variant_id, occurred_on DESC, id DESC);

-- Older stock paths still write the product's default variant. The database
-- fills that link so every new movement remains attributable to a variant.
CREATE FUNCTION inventory_default_variant() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.variant_id IS NULL THEN
        SELECT v.id INTO NEW.variant_id FROM product_variants v
        WHERE v.workspace_id = NEW.workspace_id AND v.product_id = NEW.product_id AND v.is_default;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM product_variants v WHERE v.workspace_id = NEW.workspace_id
        AND v.product_id = NEW.product_id AND v.id = NEW.variant_id) THEN
        RAISE EXCEPTION 'variant does not belong to this product';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER inventory_balances_default_variant BEFORE INSERT OR UPDATE ON inventory_balances
    FOR EACH ROW EXECUTE FUNCTION inventory_default_variant();
CREATE TRIGGER inventory_movements_default_variant BEFORE INSERT OR UPDATE ON inventory_movements
    FOR EACH ROW EXECUTE FUNCTION inventory_default_variant();
