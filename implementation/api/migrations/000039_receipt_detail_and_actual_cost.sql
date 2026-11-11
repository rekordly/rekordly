-- Blueprint 08: receipt evidence needs a delivery reference and the actual
-- accepted unit cost used for GRNI/inventory valuation. Existing receipts keep
-- their original expected cost through the backfill.
ALTER TABLE goods_receipts ADD COLUMN IF NOT EXISTS delivery_reference TEXT;
ALTER TABLE goods_receipts ADD COLUMN IF NOT EXISTS service_accepted BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE goods_receipt_lines ADD COLUMN IF NOT EXISTS actual_unit_cost_minor BIGINT;
ALTER TABLE goods_receipt_lines ADD COLUMN IF NOT EXISTS line_notes TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS goods_receipts_workspace_delivery_reference_uidx
  ON goods_receipts(workspace_id, delivery_reference)
  WHERE delivery_reference IS NOT NULL AND length(btrim(delivery_reference)) > 0;

UPDATE goods_receipt_lines
SET actual_unit_cost_minor = unit_cost_minor
WHERE actual_unit_cost_minor IS NULL;
