-- A payment is the cash movement. Allocations say which open documents it settles.
-- `payments.linked_record_*` remains for backwards-compatible single-document reads.
CREATE TABLE payment_allocations (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    payment_id BIGINT NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    document_type TEXT NOT NULL CONSTRAINT payment_allocations_document_type_check
        CHECK (document_type IN ('sale', 'purchase', 'invoice')),
    document_id BIGINT NOT NULL,
    amount_minor BIGINT NOT NULL CONSTRAINT payment_allocations_amount_check CHECK (amount_minor > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT payment_allocations_payment_document_uidx UNIQUE (payment_id, document_type, document_id)
);
CREATE INDEX payment_allocations_document_idx ON payment_allocations (workspace_id, document_type, document_id);
CREATE INDEX payment_allocations_payment_idx ON payment_allocations (payment_id);

-- Preserve the meaning of existing one-document payments before new multi-document
-- allocations are created. The original linked fields stay untouched for compatibility.
INSERT INTO payment_allocations (payment_id, workspace_id, document_type, document_id, amount_minor)
SELECT id, workspace_id, linked_record_type, linked_record_id, total_amount_minor
FROM payments
WHERE status = 'posted'
  AND linked_record_type IS NOT NULL
  AND linked_record_id IS NOT NULL
ON CONFLICT (payment_id, document_type, document_id) DO NOTHING;
