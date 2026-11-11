ALTER TABLE payments DROP CONSTRAINT payments_record_type_check;
ALTER TABLE payments ADD CONSTRAINT payments_record_type_check CHECK (linked_record_type IS NULL OR linked_record_type IN ('sale','purchase','invoice','supplier_bill'));
ALTER TABLE payment_allocations DROP CONSTRAINT payment_allocations_document_type_check;
ALTER TABLE payment_allocations ADD CONSTRAINT payment_allocations_document_type_check CHECK (document_type IN ('sale','purchase','invoice','supplier_bill'));
