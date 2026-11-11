-- Supplier delivery references are an external identity; do not accept the
-- same reference twice in a workspace.
CREATE UNIQUE INDEX IF NOT EXISTS goods_receipts_workspace_reference_uidx
ON goods_receipts(workspace_id, receipt_reference)
WHERE receipt_reference IS NOT NULL AND length(btrim(receipt_reference)) > 0;
