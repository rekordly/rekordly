-- 000047_blueprint_08_completion.sql
-- Blueprint 08 (Purchasing, Procurement & Payables) full closure:
-- Direct POs, PO versions/revisions, unplanned/rejected/batch/serial/landed-cost receipts,
-- supplier bill lines, multi-receipt/partial billing, tolerance/variance controls,
-- bill rejection/dispute/reversal, credit applications, and fine-grained RBAC.

-- 1. Purchase Requests & Purchase Orders: outlet tracking, direct PO support, discounts/tax, versioning
ALTER TABLE purchase_requests
    ADD COLUMN IF NOT EXISTS outlet_id BIGINT REFERENCES inventory_locations(id) ON DELETE SET NULL;

ALTER TABLE purchase_orders
    ALTER COLUMN source_purchase_request_id DROP NOT NULL;

ALTER TABLE purchase_orders
    ADD COLUMN IF NOT EXISTS outlet_id BIGINT REFERENCES inventory_locations(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS expected_date DATE,
    ADD COLUMN IF NOT EXISTS payment_terms TEXT,
    ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE purchase_order_lines
    ALTER COLUMN source_purchase_request_line_id DROP NOT NULL;

ALTER TABLE purchase_order_lines
    ADD COLUMN IF NOT EXISTS discount_minor BIGINT NOT NULL DEFAULT 0 CHECK (discount_minor >= 0),
    ADD COLUMN IF NOT EXISTS tax_amount_minor BIGINT NOT NULL DEFAULT 0 CHECK (tax_amount_minor >= 0);

ALTER TABLE purchase_order_events DROP CONSTRAINT IF EXISTS purchase_order_events_type_check;
ALTER TABLE purchase_order_events ADD CONSTRAINT purchase_order_events_type_check
    CHECK (event_type IN ('submitted','approved','issued','acknowledged','cancelled','remainder_cancelled','closed','revised'));

ALTER TABLE purchase_order_command_log DROP CONSTRAINT IF EXISTS purchase_order_command_log_command_check;
ALTER TABLE purchase_order_command_log ADD CONSTRAINT purchase_order_command_log_command_check
    CHECK (command IN ('submitted','approved','issued','acknowledge','cancel','cancel_remainder','close','revise'));

CREATE TABLE IF NOT EXISTS purchase_order_versions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    purchase_order_id BIGINT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    version INTEGER NOT NULL CHECK (version > 0),
    snapshot JSONB NOT NULL,
    change_reason TEXT,
    changed_by_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, purchase_order_id, version)
);
CREATE INDEX IF NOT EXISTS purchase_order_versions_po_idx ON purchase_order_versions (workspace_id, purchase_order_id, version DESC);

-- 2. Goods Receipts: unplanned receipts, supplier/currency context, rejected qty, batch/serial/expiry, landed cost
ALTER TABLE goods_receipts
    ALTER COLUMN purchase_order_id DROP NOT NULL;

ALTER TABLE goods_receipts
    ADD COLUMN IF NOT EXISTS supplier_id BIGINT REFERENCES counterparties(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'po' CHECK (source_type IN ('po', 'unplanned')),
    ADD COLUMN IF NOT EXISTS reason TEXT,
    ADD COLUMN IF NOT EXISTS currency CHAR(3) NOT NULL DEFAULT 'NGN' CHECK (currency ~ '^[A-Z]{3}$'),
    ADD COLUMN IF NOT EXISTS currency_exponent INTEGER NOT NULL DEFAULT 2 CHECK (currency_exponent BETWEEN 0 AND 4),
    ADD COLUMN IF NOT EXISTS landed_cost_minor BIGINT NOT NULL DEFAULT 0 CHECK (landed_cost_minor >= 0);

UPDATE goods_receipts gr
SET supplier_id = COALESCE(gr.supplier_id, po.supplier_id),
    currency = po.currency,
    currency_exponent = po.currency_exponent
FROM purchase_orders po
WHERE po.id = gr.purchase_order_id AND po.workspace_id = gr.workspace_id;

ALTER TABLE goods_receipt_lines
    ALTER COLUMN purchase_order_line_id DROP NOT NULL;

ALTER TABLE goods_receipt_lines
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS rejected_quantity NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (rejected_quantity >= 0),
    ADD COLUMN IF NOT EXISTS batch_number TEXT,
    ADD COLUMN IF NOT EXISTS expiry_date DATE,
    ADD COLUMN IF NOT EXISTS serial_numbers TEXT[],
    ADD COLUMN IF NOT EXISTS landed_cost_minor BIGINT NOT NULL DEFAULT 0 CHECK (landed_cost_minor >= 0),
    ADD COLUMN IF NOT EXISTS effective_unit_cost_minor BIGINT;

ALTER TABLE goods_receipt_lines DROP CONSTRAINT IF EXISTS goods_receipt_lines_accepted_quantity_check;
ALTER TABLE goods_receipt_lines DROP CONSTRAINT IF EXISTS goods_receipt_lines_quantity_check;
ALTER TABLE goods_receipt_lines ADD CONSTRAINT goods_receipt_lines_quantity_check
    CHECK (accepted_quantity >= 0 AND (accepted_quantity > 0 OR rejected_quantity > 0));

UPDATE goods_receipt_lines grl
SET description = COALESCE(grl.description, pol.description),
    effective_unit_cost_minor = COALESCE(grl.effective_unit_cost_minor, grl.actual_unit_cost_minor, grl.unit_cost_minor)
FROM purchase_order_lines pol
WHERE pol.id = grl.purchase_order_line_id AND pol.workspace_id = grl.workspace_id;

UPDATE goods_receipt_lines
SET effective_unit_cost_minor = COALESCE(effective_unit_cost_minor, actual_unit_cost_minor, unit_cost_minor)
WHERE effective_unit_cost_minor IS NULL;

-- 3. Supplier Bills: multi-receipt/partial billing, bill lines, tax/discount, variance, dispute/reject/reverse, credit applications
DO $$
DECLARE
    c_name TEXT;
BEGIN
    -- Drop unique(workspace_id, goods_receipt_id) to allow partial / multiple bills per receipt
    SELECT conname INTO c_name
    FROM pg_constraint
    WHERE conrelid = 'supplier_bills'::regclass
      AND contype = 'u'
      AND (
          SELECT array_agg(a.attname::text ORDER BY a.attnum)
          FROM pg_attribute a
          WHERE a.attrelid = conrelid AND a.attnum = ANY(conkey)
      ) = ARRAY['goods_receipt_id', 'workspace_id']
         OR (
          SELECT array_agg(a.attname::text ORDER BY a.attnum)
          FROM pg_attribute a
          WHERE a.attrelid = conrelid AND a.attnum = ANY(conkey)
      ) = ARRAY['workspace_id', 'goods_receipt_id'];
    IF c_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE supplier_bills DROP CONSTRAINT %I', c_name);
    END IF;

    -- Replace strict unique(workspace_id, supplier_id, supplier_invoice_number) with normalized partial unique index
    SELECT conname INTO c_name
    FROM pg_constraint
    WHERE conrelid = 'supplier_bills'::regclass
      AND contype = 'u'
      AND (
          SELECT array_agg(a.attname::text ORDER BY a.attname)
          FROM pg_attribute a
          WHERE a.attrelid = conrelid AND a.attnum = ANY(conkey)
      ) = ARRAY['supplier_id', 'supplier_invoice_number', 'workspace_id'];
    IF c_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE supplier_bills DROP CONSTRAINT %I', c_name);
    END IF;
END $$;

ALTER TABLE supplier_bills DROP CONSTRAINT IF EXISTS supplier_bills_status_check;
ALTER TABLE supplier_bills ADD CONSTRAINT supplier_bills_status_check
    CHECK (status IN ('draft','approved','disputed','rejected','partially_paid','paid','reversed','voided'));

ALTER TABLE supplier_bills
    ADD COLUMN IF NOT EXISTS outlet_id BIGINT REFERENCES inventory_locations(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS tax_amount_minor BIGINT NOT NULL DEFAULT 0 CHECK (tax_amount_minor >= 0),
    ADD COLUMN IF NOT EXISTS discount_minor BIGINT NOT NULL DEFAULT 0 CHECK (discount_minor >= 0),
    ADD COLUMN IF NOT EXISTS variance_minor BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS credited_minor BIGINT NOT NULL DEFAULT 0 CHECK (credited_minor >= 0),
    ADD COLUMN IF NOT EXISTS match_status TEXT NOT NULL DEFAULT 'exact',
    ADD COLUMN IF NOT EXISTS dispute_reason TEXT,
    ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS reversal_reason TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS supplier_bills_workspace_supplier_inv_norm_uidx
    ON supplier_bills (workspace_id, supplier_id, lower(btrim(supplier_invoice_number)))
    WHERE status NOT IN ('rejected', 'voided', 'reversed');

CREATE INDEX IF NOT EXISTS supplier_bills_workspace_receipt_idx
    ON supplier_bills (workspace_id, goods_receipt_id)
    WHERE goods_receipt_id IS NOT NULL;

ALTER TABLE supplier_bill_commands DROP CONSTRAINT IF EXISTS supplier_bill_commands_command_check;
ALTER TABLE supplier_bill_commands ADD CONSTRAINT supplier_bill_commands_command_check
    CHECK (command IN ('approve','reject','dispute','reverse','apply_credit'));

CREATE TABLE IF NOT EXISTS supplier_bill_lines (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    supplier_bill_id BIGINT NOT NULL REFERENCES supplier_bills(id) ON DELETE CASCADE,
    goods_receipt_line_id BIGINT REFERENCES goods_receipt_lines(id) ON DELETE RESTRICT,
    purchase_order_line_id BIGINT REFERENCES purchase_order_lines(id) ON DELETE RESTRICT,
    description TEXT NOT NULL,
    quantity NUMERIC(18,4) NOT NULL CHECK (quantity > 0),
    unit_cost_minor BIGINT NOT NULL CHECK (unit_cost_minor >= 0),
    discount_minor BIGINT NOT NULL DEFAULT 0 CHECK (discount_minor >= 0),
    tax_amount_minor BIGINT NOT NULL DEFAULT 0 CHECK (tax_amount_minor >= 0),
    line_total_minor BIGINT NOT NULL CHECK (line_total_minor > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS supplier_bill_lines_bill_idx ON supplier_bill_lines (workspace_id, supplier_bill_id, id);
CREATE INDEX IF NOT EXISTS supplier_bill_lines_receipt_line_idx ON supplier_bill_lines (workspace_id, goods_receipt_line_id);

CREATE TABLE IF NOT EXISTS supplier_bill_credit_applications (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    supplier_bill_id BIGINT NOT NULL REFERENCES supplier_bills(id) ON DELETE RESTRICT,
    supplier_credit_id BIGINT NOT NULL REFERENCES supplier_credits(id) ON DELETE RESTRICT,
    amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
    idempotency_key TEXT NOT NULL CHECK (length(btrim(idempotency_key)) > 0),
    applied_by_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS supplier_bill_credit_applications_bill_idx ON supplier_bill_credit_applications (workspace_id, supplier_bill_id);

ALTER TABLE ledger_entries DROP CONSTRAINT IF EXISTS ledger_entries_source_type_check;
ALTER TABLE ledger_entries ADD CONSTRAINT ledger_entries_source_type_check
    CHECK (source_type IN (
        'money_transaction','sale','purchase','invoice_payment','deposit','wallet_payment',
        'reversal','adjustment','goods_receipt','supplier_bill','supplier_advance',
        'supplier_advance_application','inventory_opening','cogs_sale','inventory_adjustment',
        'inventory_transfer_variance','stock_count_variance','supplier_return','supplier_credit',
        'supplier_refund','inventory_transfer','supplier_bill_reversal','supplier_credit_application'
    ));

-- 4. Approval policy & receiving tolerances
ALTER TABLE procurement_approval_policies
    ADD COLUMN IF NOT EXISTS price_variance_tolerance_bps INTEGER NOT NULL DEFAULT 0 CHECK (price_variance_tolerance_bps >= 0 AND price_variance_tolerance_bps <= 10000),
    ADD COLUMN IF NOT EXISTS qty_variance_tolerance_bps INTEGER NOT NULL DEFAULT 0 CHECK (qty_variance_tolerance_bps >= 0 AND qty_variance_tolerance_bps <= 10000),
    ADD COLUMN IF NOT EXISTS allow_unplanned_receipt BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS allow_over_receipt BOOLEAN NOT NULL DEFAULT FALSE;

-- 5. Seed Blueprint 08 fine-grained RBAC permissions across existing workspace roles
WITH role_perm_map(role_code, perm_code) AS (
    VALUES
        ('admin', 'purchases.request'), ('admin', 'purchases.approve_request'),
        ('admin', 'purchases.create_po'), ('admin', 'purchases.approve_po'), ('admin', 'purchases.issue_po'),
        ('admin', 'purchases.receive'), ('admin', 'purchases.receive_unplanned'),
        ('admin', 'purchases.create_bill'), ('admin', 'purchases.approve_bill'), ('admin', 'purchases.accept_variance'),
        ('admin', 'purchases.pay_supplier'), ('admin', 'purchases.manage_advance'),
        ('admin', 'purchases.return'), ('admin', 'purchases.close_po'),
        ('accountant', 'purchases.create_bill'), ('accountant', 'purchases.approve_bill'),
        ('accountant', 'purchases.accept_variance'), ('accountant', 'purchases.pay_supplier'),
        ('accountant', 'purchases.manage_advance'), ('accountant', 'purchases.return'),
        ('procurement', 'purchases.request'), ('procurement', 'purchases.approve_request'),
        ('procurement', 'purchases.create_po'), ('procurement', 'purchases.issue_po'),
        ('procurement', 'purchases.receive'), ('procurement', 'purchases.receive_unplanned'),
        ('procurement', 'purchases.create_bill'), ('procurement', 'purchases.return'), ('procurement', 'purchases.close_po'),
        ('inventory_manager', 'purchases.request'), ('inventory_manager', 'purchases.receive'),
        ('inventory_manager', 'purchases.receive_unplanned'), ('inventory_manager', 'purchases.return'),
        ('staff', 'purchases.request'),
        ('member', 'purchases.request')
)
INSERT INTO role_permissions (role_id, permission_code)
SELECT r.id, m.perm_code
FROM roles r
JOIN role_perm_map m ON m.role_code = r.code
ON CONFLICT (role_id, permission_code) DO NOTHING;
