-- Later inventory migrations rebuild the ledger source-type constraint. Re-assert
-- the supplier return/credit/refund event types before those events are posted.
ALTER TABLE ledger_entries DROP CONSTRAINT IF EXISTS ledger_entries_source_type_check;
ALTER TABLE ledger_entries ADD CONSTRAINT ledger_entries_source_type_check CHECK (source_type IN ('money_transaction','sale','purchase','invoice_payment','deposit','wallet_payment','reversal','adjustment','goods_receipt','supplier_bill','supplier_advance','supplier_advance_application','inventory_opening','cogs_sale','inventory_adjustment','inventory_transfer_variance','stock_count_variance','supplier_return','supplier_credit','supplier_refund'));
