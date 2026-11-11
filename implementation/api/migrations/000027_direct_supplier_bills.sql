-- Supplier bills may be receipt-backed or direct expense/service documents.
ALTER TABLE supplier_bills ALTER COLUMN goods_receipt_id DROP NOT NULL;
ALTER TABLE supplier_bills ADD COLUMN bill_type TEXT NOT NULL DEFAULT 'receipt' CHECK (bill_type IN ('receipt','direct_expense','direct_service'));
ALTER TABLE supplier_bills ADD COLUMN expense_account_class TEXT NOT NULL DEFAULT 'expense' CHECK (expense_account_class IN ('expense','asset'));
ALTER TABLE supplier_bills ADD COLUMN description TEXT;
CREATE INDEX supplier_bills_workspace_overdue_idx ON supplier_bills(workspace_id,due_date,status,id DESC);
