/** Minor-unit money from the API. Never do arithmetic on it in the browser. */
export type MinorAmount = number | string;

export interface MoneyAccount {
  id: number;
  name: string;
  account_type: string;
  currency: string;
  currency_exponent: number;
  current_balance_minor: MinorAmount;
  is_active: boolean;
}

export interface MoneyCategory {
  id: number;
  name: string;
  direction: string;
  scope: string;
  account_class: string;
  is_active: boolean;
}

/** A business catalogue item with its default sellable variant. */
export interface CatalogueItem {
  id: number;
  workspace_id: number;
  name: string;
  description?: string | null;
  kind: "service" | "non_stock" | "stock_tracked";
  status: "draft" | "active" | "archived";
  unit_name: string;
  default_variant_id: number;
  sku?: string | null;
  barcode?: string | null;
  selling_price_minor: MinorAmount;
  currency: string;
  currency_exponent: number;
  created_at: string;
  updated_at: string;
}

export interface InventoryBalance {
  id: number;
  location_id: number;
  location_name: string;
  product_id: number;
  product_name: string;
  product_kind: "stock_tracked" | "service" | "non_stock";
  quantity_on_hand: string;
  reserved_quantity: string;
  available_quantity: string;
  in_transit_quantity: string;
  value_on_hand_minor: MinorAmount;
  average_cost_minor: string;
  costing_method: "weighted_average";
  version: number;
}

export interface InventoryOutlet {
  id: number;
  workspace_id: number;
  name: string;
  location_type: "outlet" | "warehouse" | "store" | "other";
  code?: string | null;
  address?: string | null;
  phone?: string | null;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProductOption {
  id: number;
  product_id: number;
  name: string;
  position: number;
  values: string[];
}

export interface ProductVariant {
  id: number;
  product_id: number;
  name: string;
  sku?: string | null;
  barcode?: string | null;
  selling_price_minor: MinorAmount;
  cost_price_minor: MinorAmount;
  currency: string;
  currency_exponent: number;
  is_default: boolean;
  is_active: boolean;
  quantity_on_hand?: string;
  option_values?: Record<string, string>;
}

export interface StockReservation {
  id: number;
  location_id: number;
  location_name?: string;
  product_id: number;
  product_name?: string;
  variant_id?: number | null;
  order_id?: number | null;
  quantity: string;
  status: "active" | "fulfilled" | "released" | "expired";
  expires_at?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface StockTransferLine {
  id: number;
  product_id: number;
  product_name: string;
  variant_id?: number | null;
  variant_name?: string | null;
  quantity_requested: string;
  quantity_dispatched: string;
  quantity_received: string;
  unit_cost_minor: number;
}

export interface StockTransfer {
  id: number;
  transfer_number: string;
  source_location_id: number;
  source_location_name: string;
  destination_location_id: number;
  destination_location_name: string;
  status: "draft" | "dispatched" | "received" | "cancelled";
  dispatched_at?: string | null;
  received_at?: string | null;
  notes?: string | null;
  lines?: StockTransferLine[];
  created_at: string;
  updated_at: string;
}

export interface StockCountLine {
  id: number;
  product_id: number;
  product_name: string;
  variant_id?: number | null;
  variant_name?: string | null;
  expected_quantity: string;
  counted_quantity?: string | null;
  variance_quantity: string;
  unit_cost_minor: number;
}

export interface StockCount {
  id: number;
  count_number: string;
  location_id: number;
  location_name: string;
  scope: "full" | "category" | "custom";
  status: "draft" | "in_progress" | "completed" | "cancelled";
  counted_at?: string | null;
  notes?: string | null;
  lines?: StockCountLine[];
  created_at: string;
  updated_at: string;
}

export interface StockAdjustmentLine {
  id: number;
  product_id: number;
  product_name: string;
  variant_id?: number | null;
  variant_name?: string | null;
  quantity_delta: string;
  unit_cost_minor: number;
  total_cost_minor: number;
}

export interface StockAdjustment {
  id: number;
  adjustment_number: string;
  location_id: number;
  location_name: string;
  reason_code: "damage" | "spoilage" | "shrinkage" | "internal_use" | "correction" | "other";
  notes?: string | null;
  lines?: StockAdjustmentLine[];
  created_at: string;
  updated_at: string;
}

export interface PurchaseRequestLine {
  id: number;
  product_id?: number | null;
  description: string;
  quantity: string;
  unit_name: string;
  estimated_unit_price_minor: string;
  estimated_line_total_minor: string;
}

/** A non-posting procurement request. It is not a purchase, bill or receipt. */
export interface PurchaseRequest {
  id: number;
  supplier_id?: number | null;
  status: "draft" | "submitted" | "approved" | "rejected" | "changes_requested" | "cancelled";
  version: number;
  needed_by?: string | null;
  reason: string;
  reference?: string | null;
  priority: "low" | "normal" | "high" | "urgent";
  latest_decision_reason?: string | null;
  currency: string;
  currency_exponent: number;
  estimated_total_minor: string;
  created_by_user_id: number;
  submitted_at?: string | null;
  approved_at?: string | null;
  created_at: string;
  updated_at: string;
  lines?: PurchaseRequestLine[];
  decisions?: Array<{
    id: number;
    command: "submit" | "approve" | "reject" | "request_changes" | "cancel";
    request_version: number;
    reason?: string | null;
    actor_user_id: number;
    created_at: string;
  }>;
}

export interface PurchaseOrderLine {
  id: number;
  product_id?: number | null;
  description: string;
  quantity: string;
  unit_name: string;
  expected_unit_cost_minor: string;
  discount_minor?: string;
  tax_amount_minor?: string;
  line_total_minor: string;
}
export interface PurchaseOrderEvent {
  id: number;
  event_type: string;
  order_version: number;
  note?: string | null;
  actor_user_id: number;
  created_at: string;
}
export interface PurchaseOrderVersion {
  id: number;
  version: number;
  snapshot: unknown;
  change_reason?: string | null;
  changed_by_user_id: number;
  created_at: string;
}

/** A non-posting supplier commitment created from an approved request or directly. */
export interface PurchaseOrder {
  id: number;
  source_purchase_request_id: number;
  supplier_id?: number | null;
  outlet_id?: number | null;
  status: "draft" | "submitted" | "approved" | "issued" | "acknowledged" | "partially_received" | "fully_received" | "cancelled" | "partially_cancelled" | "closed";
  version: number;
  order_number?: string | null;
  expected_date?: string | null;
  payment_terms?: string | null;
  notes?: string | null;
  currency: string;
  currency_exponent: number;
  total_minor: string;
  cancellation_reason?: string | null;
  closed_reason?: string | null;
  acknowledged_at?: string | null;
  acknowledgement_note?: string | null;
  lines?: PurchaseOrderLine[];
  events?: PurchaseOrderEvent[];
  versions?: PurchaseOrderVersion[];
}

export interface ReceiptOptionLine {
  purchase_order_line_id: number;
  description: string;
  remaining_quantity: string;
}
export interface GoodsReceiptLine {
  id: number;
  purchase_order_line_id: number;
  product_id?: number | null;
  description: string;
  accepted_quantity: string;
  rejected_quantity?: string;
  unit_cost_minor: string;
  actual_unit_cost_minor?: string;
  landed_cost_minor?: string;
  effective_unit_cost_minor?: string;
  line_total_minor: string;
  batch_number?: string | null;
  expiry_date?: string | null;
  serial_numbers?: string[];
  notes?: string | null;
}
export interface GoodsReceipt {
  id: number;
  purchase_order_id: number;
  supplier_id?: number | null;
  location_id?: number | null;
  source_type?: "po" | "unplanned";
  reason?: string | null;
  received_on: string;
  currency?: string;
  currency_exponent?: number;
  total_minor?: string;
  landed_cost_minor?: string;
  receipt_reference?: string | null;
  delivery_reference?: string | null;
  service_accepted?: boolean;
  lines?: GoodsReceiptLine[];
}
export interface SupplierBillLine {
  id: number;
  goods_receipt_line_id?: number | null;
  purchase_order_line_id?: number | null;
  description: string;
  quantity: string;
  unit_cost_minor: string;
  discount_minor: string;
  tax_amount_minor: string;
  line_total_minor: string;
}
export interface SupplierBill {
  id: number;
  goods_receipt_id: number;
  supplier_id?: number;
  outlet_id?: number | null;
  supplier_invoice_number?: string;
  bill_date?: string;
  goods_receipt_linked?: boolean;
  bill_type?: "receipt" | "direct_expense" | "direct_service";
  due_date?: string | null;
  overdue?: boolean;
  status: "draft" | "approved" | "disputed" | "rejected" | "partially_paid" | "paid" | "reversed" | "voided";
  version: number;
  currency?: string;
  currency_exponent?: number;
  total_minor: string;
  outstanding_minor: string;
  tax_amount_minor?: string;
  discount_minor?: string;
  variance_minor?: string;
  credited_minor?: string;
  match_status?: string;
  dispute_reason?: string | null;
  reversal_reason?: string | null;
  lines?: SupplierBillLine[];
}
export interface SupplierAdvance {
  id: number;
  supplier_id: number;
  payment_id: number;
  currency: string;
  currency_exponent: number;
  original_minor: string;
  available_minor: string;
  status: "open" | "partially_applied" | "applied" | "refunded" | "voided";
  version: number;
}
export interface SupplierReturn { id: number; supplier_id: number; goods_receipt_id: number; status: "posted" | "cancelled"; total_minor: string; }
export interface SupplierReturnLineOption { id: number; product_name: string; remaining_quantity: string; unit_cost_minor: string; }
export interface SupplierCredit {
  id: number;
  supplier_id: number;
  supplier_return_id?: number | null;
  supplier_bill_id?: number | null;
  currency?: string;
  amount_minor: string;
  outstanding_minor: string;
  reason?: string;
  status: string;
  created_at?: string;
}
export interface SupplierRefund {
  id: number;
  supplier_id: number;
  supplier_credit_id?: number | null;
  supplier_advance_id?: number | null;
  amount_minor: string;
  currency: string;
  refund_date: string;
  reason: string;
  created_at: string;
}
export interface ProcurementApprovalPolicy {
  approval_threshold_minor: string;
  allow_self_approval: boolean;
  price_variance_tolerance_bps: number;
  qty_variance_tolerance_bps: number;
  allow_unplanned_receipt: boolean;
  allow_over_receipt: boolean;
}
export interface ProcurementAttachment {
  id: number;
  purchase_request_id?: number | null;
  purchase_order_id?: number | null;
  goods_receipt_id?: number | null;
  supplier_bill_id?: number | null;
  storage_key: string;
  file_name: string;
  mime_type: string;
  file_size_bytes: number;
  created_at: string;
}
export interface ProcurementReport {
  as_of_date: string;
  open_purchase_order_count: number;
  open_purchase_order_minor: string;
  ordered_minor: string;
  received_minor: string;
  unbilled_receipt_count: number;
  grni_minor: string;
  ap_outstanding_minor: string;
  ap_overdue_minor: string;
  unapplied_advance_count: number;
  unapplied_advance_minor: string;
  unapplied_credit_count?: number;
  unapplied_credit_minor?: string;
  ap_aging?: {
    current_minor: string;
    days_1_30_minor: string;
    days_31_60_minor: string;
    days_61_plus_minor: string;
  };
  aged_grni?: {
    receipt_id: number;
    receipt_reference?: string | null;
    purchase_order_id?: number | null;
    supplier_id?: number | null;
    received_on: string;
    age_days: number;
    grni_minor: string;
  }[];
  variance_bills?: {
    id: number;
    goods_receipt_id?: number | null;
    supplier_id: number;
    supplier_invoice_number: string;
    bill_date: string;
    total_minor: string;
    variance_minor: string;
    match_status: string;
    status: string;
  }[];
  pending_returns?: {
    id: number;
    supplier_id: number;
    goods_receipt_id: number;
    effective_on: string;
    total_minor: string;
    credited_minor: string;
    reason: string;
  }[];
}
export interface SupplierBillMatch { bill_id: number; receipt_id: number; ordered_minor: string; received_minor: string; billed_minor: string; open_to_bill_minor: string; variance_minor: string; result: string; requires_review: boolean; }

export interface MoneyTransaction {
  id: number;
  direction: "money_in" | "money_out" | "transfer";
  status: "draft" | "posted" | "voided" | "reversed";
  amount_minor: MinorAmount;
  currency: string;
  currency_exponent: number;
  effective_date: string;
  money_account_id?: number;
  destination_account_id?: number;
  category_id?: number;
  counterparty_name?: string;
  purpose: string;
  notes?: string;
  reference?: string;
  is_void: boolean;
  created_at: string;
  posted_at?: string;
}

/** A linked, cross-workspace expense. Amounts and ids stay as API strings. */
export interface MixedMoneyGroup {
  id: string;
  personal_workspace_id: string;
  business_workspace_id: string;
  paying_workspace_id: string;
  paying_money_account_id: string;
  personal_money_record_id: string | null;
  business_money_record_id: string | null;
  currency: string;
  currency_exponent: number;
  total_amount_minor: string;
  personal_amount_minor: string;
  business_amount_minor: string;
  reimbursed_amount_minor: string;
  outstanding_amount_minor: string;
  effective_date: string;
  status: "open" | "settled" | "reversed";
  settlement_version: number;
}

export interface MixedMoneyConfirmation {
  group: MixedMoneyGroup;
  was_duplicate: boolean;
}

export interface MixedMoneyReimbursementResult {
  group: MixedMoneyGroup;
  reimbursement: { id: string; amount_minor: string; currency: string; effective_date: string };
  was_duplicate: boolean;
}

export interface MoneyRecordDraft {
  id: string;
  workspace_id: string;
  state: "saved" | "needs_review" | "confirmed" | "discarded" | "failed";
  version: number;
  entry_method: "manual" | "ai_assisted" | "import" | "offline";
  direction: "money_in" | "money_out" | "transfer";
  scope_type: "personal" | "business" | "transfer" | "mixed";
  purpose: string;
  amount_minor: string;
  currency: string;
  currency_exponent: number;
  effective_date: string;
  money_account_id: string | null;
  destination_account_id: string | null;
  category_id: string | null;
  counterparty_name: string | null;
  description: string | null;
  reference: string | null;
  confirmed_record_id: string | null;
}

export interface MoneyRecordPreview {
  draft_id: string;
  version: number;
  can_confirm: boolean;
  balance_effect: string;
  accounting_effects: string[];
  warnings: string[];
}

export interface EvidenceAsset {
  id: string;
  asset_id: string;
  storage_provider: string;
  delivery_type: string;
  original_file_name: string;
  byte_size: string;
  mime_type: string;
  status: string;
}

export interface MoneyRecordDraftLink {
  id: string;
  draft_id: string;
  link_type: string;
  linked_record_id: string;
  allocated_amount_minor: string | null;
}

export interface EvidenceUploadAuthorization {
  provider: "cloudinary";
  upload_url: string;
  api_key: string;
  timestamp: string;
  signature: string;
  folder: string;
  public_id: string;
  type: "authenticated";
  resource_type: "auto";
  max_bytes: string;
  expires_at: string;
}

export interface EvidenceAccess {
  url: string;
  expires_at: string;
}

export interface MoneyRecordConfirmation {
  draft: MoneyRecordDraft;
  record: { id: string; status: string; amount_minor: string; currency: string; currency_exponent: number };
  evidence: EvidenceAsset[];
  was_duplicate: boolean;
}

export interface Contact {
  id: number;
  name: string;
  party_type: string;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
  opening_balance_minor?: MinorAmount;
  merged_into_id?: number | null;
  is_active: boolean;
  created_at?: string;
}

interface TradeRecord {
  id: number;
  total_amount_minor: MinorAmount;
  paid_amount_minor: MinorAmount;
  currency: string;
  currency_exponent: number;
  status: string;
  notes?: string | null;
  reference?: string | null;
}

export interface Sale extends TradeRecord {
  customer_id?: number | null;
  customer_name: string;
  sale_date: string;
}

export interface Purchase extends TradeRecord {
  supplier_id?: number | null;
  supplier_name: string;
  purchase_date: string;
  category_id?: number | null;
}

export interface Payment {
  id: number;
  direction: "incoming" | "outgoing";
  payment_date: string;
  total_amount_minor: MinorAmount;
  currency: string;
  currency_exponent: number;
  counterparty_id?: number | null;
  counterparty_name: string;
  linked_record_type?: string | null;
  linked_record_id?: number | null;
  status: string;
  notes?: string | null;
  reference?: string | null;
}

export interface PaymentLeg {
  id: number;
  payment_id: number;
  workspace_id: number;
  money_account_id: number;
  amount_minor: MinorAmount;
  created_at: string;
}

export interface PaymentDetail {
  payment: Payment;
  payment_legs: PaymentLeg[];
}

export interface DocumentTaxLine {
  id?: number;
  name: string;
  rate_bps: number;
  amount_minor: MinorAmount;
  is_compound: boolean;
  sort_order?: number;
}

export interface Invoice extends TradeRecord {
  customer_id: number;
  customer_name: string;
  invoice_number: string;
  issue_date: string;
  due_date: string;
  subtotal_minor: MinorAmount;
  discount_minor?: MinorAmount;
  delivery_fee_minor?: MinorAmount;
  tax_amount_minor: MinorAmount;
  document_kind?: "invoice" | "proforma";
  converted_from_proforma_id?: number | null;
  outlet_id?: number | null;
  terms?: string | null;
  notes?: string | null;
}

export interface InvoiceDetail {
  invoice: Invoice;
  items: InvoiceLineItem[];
  tax_lines?: DocumentTaxLine[];
  payments?: PaymentDetail[];
}

export interface Estimate {
  id: number;
  workspace_id: number;
  estimate_number: string;
  customer_id?: number | null;
  customer_name: string;
  issue_date: string;
  expiry_date: string;
  currency: string;
  currency_exponent: number;
  subtotal_minor: MinorAmount;
  discount_minor?: MinorAmount;
  delivery_fee_minor?: MinorAmount;
  tax_amount_minor: MinorAmount;
  total_amount_minor: MinorAmount;
  status: "draft" | "sent" | "accepted" | "declined" | "converted" | "expired";
  notes?: string | null;
  terms?: string | null;
  converted_invoice_id?: number | null;
  created_at: string;
  updated_at: string;
}

export interface EstimateItem {
  id: number;
  estimate_id: number;
  description: string;
  quantity: string;
  unit_price_minor: MinorAmount;
  discount_minor?: MinorAmount;
  amount_minor: MinorAmount;
}

export interface EstimateDetail {
  estimate: Estimate;
  items: EstimateItem[];
  tax_lines?: DocumentTaxLine[];
}

export interface InvoiceLineItem {
  id: number;
  invoice_id: number;
  description: string;
  quantity: number;
  unit_price_minor: MinorAmount;
  discount_minor?: MinorAmount;
  amount_minor: MinorAmount;
}

export interface DebitNote {
  id: number;
  workspace_id: number;
  debit_note_number: string;
  invoice_id?: number | null;
  customer_id: number;
  customer_name: string;
  issue_date: string;
  currency: string;
  currency_exponent: number;
  subtotal_minor: MinorAmount;
  tax_amount_minor: MinorAmount;
  total_amount_minor: MinorAmount;
  paid_amount_minor: MinorAmount;
  status: "draft" | "issued" | "paid" | "voided";
  reason?: string | null;
  notes?: string | null;
  created_at: string;
}

export interface DebitNoteItem {
  id: number;
  debit_note_id: number;
  description: string;
  quantity: number;
  unit_price_minor: MinorAmount;
  amount_minor: MinorAmount;
}

export interface DebitNoteDetail {
  debit_note: DebitNote;
  items: DebitNoteItem[];
}

export interface DocumentVersion {
  id: number;
  document_type: string;
  document_id: number;
  version_number: number;
  change_summary: string;
  created_at: string;
}

export interface ExternalPaymentEvidence {
  id: number;
  document_type: "invoice" | "debit_note";
  document_id: number;
  payer_name: string;
  payer_email?: string | null;
  amount_minor: MinorAmount;
  payment_date: string;
  payment_method: string;
  reference?: string | null;
  notes?: string | null;
  status: "pending" | "approved" | "rejected";
  review_note?: string | null;
  created_at: string;
}

export interface ExternalMessage {
  id: number;
  document_type: string;
  document_id: number;
  sender_type: "guest" | "team";
  sender_name: string;
  sender_email?: string | null;
  message: string;
  created_at: string;
}

export interface ExternalPartyLink {
  id: number;
  workspace_id: number;
  workspace_name: string;
  counterparty_id: number;
  counterparty_name: string;
  source_document_type: string;
  source_document_id: number;
  status: string;
  claimed_at: string;
}

export interface PurchaseOrderShareView {
  token?: string;
  status: string;
  supplier_email?: string | null;
  expires_at: string;
  order: PurchaseOrder;
}

export interface PublicInvoiceView {
  workspace_name: string;
  invoice: Invoice;
  items: InvoiceLineItem[];
  tax_lines?: DocumentTaxLine[];
  expires_at: string;
}

export interface PublicReceiptView {
  workspace_name: string;
  receipt: {
    id: number;
    receipt_number: string;
    amount_minor: MinorAmount;
    currency: string;
    issued_at: string;
  };
  payment: Payment;
  invoice?: Invoice | null;
}

export interface SalesReturn {
  id: number;
  workspace_id: number;
  return_number: string;
  sale_id?: number | null;
  invoice_id?: number | null;
  customer_id?: number | null;
  customer_name: string;
  return_date: string;
  currency: string;
  currency_exponent: number;
  subtotal_minor: MinorAmount;
  tax_amount_minor: MinorAmount;
  total_amount_minor: MinorAmount;
  reason: string;
  status: "draft" | "issued" | "applied" | "refunded" | "voided";
  action_taken: "customer_credit" | "refund" | "invoice_reduction";
  created_at: string;
}

export interface SalesReturnItem {
  id: number;
  sales_return_id: number;
  description: string;
  catalogue_item_id?: number | null;
  quantity: string;
  unit_price_minor: MinorAmount;
  amount_minor: MinorAmount;
  restock_inventory: boolean;
  outlet_id?: number | null;
}

export interface CustomerCredit {
  id: number;
  workspace_id: number;
  customer_id: number;
  currency: string;
  balance_minor: MinorAmount;
  updated_at: string;
}

export interface CustomerCreditTransaction {
  id: number;
  credit_id: number;
  direction: "credit" | "debit";
  amount_minor: MinorAmount;
  source_type: string;
  source_id?: number | null;
  notes?: string | null;
  created_at: string;
}

export interface CustomerWallet {
  id: number;
  customer_id: number;
  currency: string;
  currency_exponent: number;
  balance_minor: MinorAmount;
}

export interface WalletTransaction {
  id: number;
  transaction_type: string;
  amount_minor: MinorAmount;
  balance_after_minor: MinorAmount;
  notes?: string | null;
  reference?: string | null;
  created_at: string;
}

export interface BankReconciliation {
  id: number;
  workspace_id: number;
  money_account_id: number;
  statement_date: string;
  statement_balance_minor: MinorAmount;
  ledger_balance_minor: MinorAmount;
  cleared_balance_minor: MinorAmount;
  difference_minor: MinorAmount;
  status: "in_progress" | "reconciled" | "discarded";
  reconciliation_type: "bank" | "cash";
  denominations?: Record<string, number>;
  reconciled_at?: string | null;
  notes?: string | null;
  created_at: string;
}

export interface BankReconciliationMatch {
  id: number;
  reconciliation_id: number;
  transaction_id: number;
  match_status: "cleared" | "unmatched" | "disputed";
  cleared_at: string;
}

export interface ReconTransactionItem {
  id: number;
  direction: "money_in" | "money_out" | "transfer";
  signed_minor: number;
  amount_minor: number;
  currency: string;
  effective_date: string;
  party_name?: string;
  notes?: string;
  reference?: string;
  matched: boolean;
}

export interface BankReconDetail {
  reconciliation: BankReconciliation;
  matches: BankReconciliationMatch[];
  transactions: ReconTransactionItem[];
}

export interface BankLine {
  id: number;
  money_account_id: number;
  transaction_date: string;
  description: string;
  reference?: string | null;
  direction: "money_in" | "money_out";
  amount_minor: MinorAmount;
  matched_transaction_id?: number | null;
  match_status: "unmatched" | "suggested" | "matched" | "ignored";
}

export interface PublicEstimateView {
  workspace_name: string;
  estimate: Estimate & { discount_minor?: MinorAmount; delivery_fee_minor?: MinorAmount };
  items: EstimateItem[];
  allow_respond: boolean;
  response_status?: string;
  expires_at: string;
}

export interface PublicStatementView {
  workspace_name: string;
  customer: Contact;
  opening_balance_minor?: MinorAmount;
  opening_balance_entry?: { description: string; amount_minor: MinorAmount; date: string } | null;
  from_date?: string;
  to_date?: string;
  invoices: Invoice[];
  wallet_txs: WalletTransaction[];
  expires_at: string;
}

export interface WorkspaceProfileSettings {
  id: number;
  kind: "personal" | "business";
  name: string;
  slug: string;
  base_currency: string;
  timezone: string;
  business_type?: string | null;
  country?: string | null;
  address?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
}

export interface WorkspaceMemberRow {
  id: number;
  user_id: number;
  role_id: number;
  is_owner: boolean;
  outlet_scope?: { outlet_id?: number; outlet_ids?: number[] };
  status: string;
  joined_at: string;
  display_name?: string | null;
  role_code: string;
  role_name: string;
}

export interface WorkspaceRoleRow {
  id: number;
  code: string;
  name: string;
  is_system: boolean;
  permissions: string[];
}

export interface WorkspaceInvitationRow {
  id: number;
  role_code: string;
  role_name: string;
  destination_normalized: string;
  status: string;
  expires_at: string;
  created_at: string;
}

export interface WorkspaceNotification {
  id: number;
  workspace_id?: number | null;
  category: "system" | "finance" | "invoice" | "inventory" | "team" | "approval";
  title: string;
  body: string;
  action_url?: string | null;
  is_read: boolean;
  created_at: string;
}

export interface OnboardingChecklist {
  has_account: boolean;
  has_income: boolean;
  has_expense: boolean;
  has_customer: boolean;
  has_invoice: boolean;
  all_done: boolean;
}

export interface Budget {
  id: number;
  name: string;
  category_id?: number | null;
  scope: string;
  period: string;
  amount_minor: MinorAmount;
  currency: string;
  currency_exponent: number;
  start_date: string;
  end_date: string;
  is_active: boolean;
  notes?: string | null;
}

export interface BudgetStatus {
  budget: Budget;
  budget_amount_minor: MinorAmount;
  actual_spending_minor: MinorAmount;
  remaining_minor: MinorAmount;
  usage_basis_points: number;
  usage_percentage_formatted: string;
  is_over_budget: boolean;
}

export interface TaxSettings {
  tax_identification_number: string;
  default_vat_rate_basis_points: number;
  is_vat_registered: boolean;
}

export interface TaxReadinessReport {
  from_date: string;
  to_date: string;
  currency: string;
  output_vat: {
    taxable_sales_minor: MinorAmount;
    output_vat_minor: MinorAmount;
    total_gross_minor: MinorAmount;
    total_count: number;
  };
  input_vat: {
    taxable_purchases_minor: MinorAmount;
    input_vat_minor: MinorAmount;
    total_gross_minor: MinorAmount;
    purchases_count: number;
  };
  net_vat: { net_vat_payable_minor: MinorAmount; status: "payable" | "refundable" | "balanced" };
  tax_settings: TaxSettings;
}

export interface FinanceSummary {
  from_date: string;
  to_date: string;
  currency: string;
  currency_exponent: number;
  income_minor: string;
  expense_minor: string;
  net_minor: string;
  cash_balance_minor: string;
  monthly: { month: string; income_minor: string; expense_minor: string }[];
  spending_by_category: { category: string; total_minor: string }[];
  /** The comparison window just before this one (same days a month earlier for month windows). */
  previous?: { from_date: string; to_date: string; income_minor: string; expense_minor: string; net_minor: string };
  /** Unpaid amounts today, independent of the period. */
  open?: {
    sales_unpaid_minor: string;
    sales_unpaid_count: number;
    invoices_unpaid_minor: string;
    invoices_unpaid_count: number;
    invoices_overdue_minor: string;
    invoices_overdue_count: number;
    purchases_unpaid_minor: string;
    purchases_unpaid_count: number;
  };
  sales_minor?: string;
  sales_count?: number;
  /** Collected so far on the sales made in this period. */
  sales_paid_minor?: string;
  purchases_minor?: string;
  purchases_paid_minor?: string;
  purchases_count?: number;
  /** Seven consecutive days ending on to_date. */
  last_7_days?: { date: string; income_minor: string; expense_minor: string }[];
}


// Blueprint 09: Storefront, Catalogue Projection, Domains, Orders & Fulfilment

export interface StorefrontSettings {
  tagline?: string | null;
  description?: string | null;
  logo_url?: string | null;
  banner_url?: string | null;
  primary_color: string;
  accent_color: string;
  background_color: string;
  text_color: string;
  font_family: string;
  section_order: string[];
  contact_phone?: string | null;
  contact_email?: string | null;
  whatsapp_number?: string | null;
  address?: string | null;
  business_hours: Record<string, string>;
  social_links: Record<string, string>;
  delivery_methods: string[];
  delivery_guidance?: string | null;
  default_delivery_fee_minor: string;
  checkout_require_email: boolean;
  checkout_require_phone: boolean;
  return_policy?: string | null;
  privacy_policy?: string | null;
  terms_policy?: string | null;
  custom_policy?: string | null;
  seo_title?: string | null;
  seo_description?: string | null;
  seo_image_url?: string | null;
  seo_indexable: boolean;
  version: number;
}

export interface Storefront {
  id: number;
  workspace_id: number;
  name: string;
  slug: string;
  status: "draft" | "published" | "unpublished" | "suspended" | "grace" | "disabled";
  theme_key: "classic" | "modern" | "editorial" | "minimal";
  version: number;
  default_outlet_id?: number | null;
  currency: string;
  currency_exponent: number;
  reservation_ttl_hours: number;
  entitlement_status: "active" | "grace" | "expired";
  subdomain_host: string;
  published_product_count: number;
  settings: StorefrontSettings;
}

export interface StorefrontCollection {
  id: number;
  name: string;
  slug: string;
  description?: string | null;
  image_url?: string | null;
  position: number;
  is_visible: boolean;
}

export interface MerchantStorefrontProduct {
  id: number;
  product_id: number;
  variant_id: number;
  collection_id?: number | null;
  is_published: boolean;
  is_featured: boolean;
  public_title: string;
  public_description?: string | null;
  public_sku?: string | null;
  image_urls: string[];
  public_price_minor: string;
  currency: string;
  availability_policy: "in_out_stock" | "exact_quantity" | "low_stock" | "hide_unavailable" | "allow_request";
  low_stock_threshold: number;
  max_qty_per_order: number;
  contact_only: boolean;
  position: number;
  product_kind: string;
  variant_name: string;
}

export interface StorefrontDomain {
  id: number;
  hostname: string;
  domain_type: "subdomain" | "custom";
  status: string;
  verification_txt_host?: string | null;
  verification_token?: string | null;
  tls_status: string;
  check_attempts: number;
  last_error?: string | null;
  is_primary: boolean;
}

export interface StorefrontAnalytics {
  since_date: string;
  page_views: number;
  product_views: number;
  collection_views: number;
  searches: number;
  add_to_carts: number;
  checkouts_started: number;
  checkouts_submitted: number;
  orders_confirmed: number;
  orders_declined: number;
  orders_cancelled: number;
  orders_fulfilled: number;
}

export interface PublicStorefrontProduct {
  id: number;
  product_id: number;
  variant_id: number;
  collection_id?: number | null;
  is_featured: boolean;
  title: string;
  description?: string | null;
  sku?: string | null;
  image_urls: string[];
  price_minor: string;
  currency: string;
  currency_exponent: number;
  product_kind: string;
  variant_name: string;
  unit_name: string;
  availability_policy: string;
  availability_state: "in_stock" | "low_stock" | "out_of_stock" | "request_only";
  available_quantity?: string | null;
  max_qty_per_order: number;
  contact_only: boolean;
  seo_slug?: string | null;
  seo_title?: string | null;
  seo_description?: string | null;
}

export interface PublicStorefrontProjection {
  name: string;
  slug: string;
  theme_key: string;
  currency: string;
  currency_exponent: number;
  tagline?: string | null;
  description?: string | null;
  logo_url?: string | null;
  banner_url?: string | null;
  primary_color: string;
  accent_color: string;
  background_color: string;
  text_color: string;
  font_family: string;
  section_order: string[];
  contact_phone?: string | null;
  contact_email?: string | null;
  whatsapp_number?: string | null;
  address?: string | null;
  business_hours: Record<string, string>;
  social_links: Record<string, string>;
  delivery_methods: string[];
  delivery_guidance?: string | null;
  default_delivery_fee_minor: string;
  checkout_require_email: boolean;
  checkout_require_phone: boolean;
  return_policy?: string | null;
  privacy_policy?: string | null;
  terms_policy?: string | null;
  custom_policy?: string | null;
  seo_title?: string | null;
  seo_description?: string | null;
  seo_image_url?: string | null;
  seo_indexable: boolean;
  availability_as_of: string;
  collections: StorefrontCollection[];
  products: PublicStorefrontProduct[];
}

export interface ValidatedCartLine {
  storefront_product_id: number;
  title: string;
  variant_name: string;
  quantity: string;
  unit_price_minor: string;
  line_total_minor: string;
  availability_state: string;
  changed: boolean;
  change_reason?: string;
}

export interface ValidatedCart {
  cart_token?: string;
  currency: string;
  currency_exponent: number;
  subtotal_minor: string;
  estimated_tax_minor: string;
  delivery_fee_minor: string;
  estimated_total_minor: string;
  has_changes: boolean;
  lines: ValidatedCartLine[];
}

export interface GuestCheckoutConfirmation {
  order_reference: string;
  status_token?: string;
  commercial_status: string;
  fulfilment_status: string;
  payment_status: string;
  currency: string;
  total_minor: string;
  message: string;
}

export interface PublicOrderEvent {
  event_type: string;
  actor_type: string;
  message?: string | null;
  created_at: string;
}

export interface PublicOrderStatus {
  order_reference: string;
  storefront_name: string;
  storefront_slug: string;
  merchant_phone?: string | null;
  merchant_email?: string | null;
  merchant_whatsapp?: string | null;
  commercial_status: string;
  fulfilment_status: string;
  payment_status: string;
  version: number;
  currency: string;
  currency_exponent: number;
  subtotal_minor: string;
  delivery_fee_minor: string;
  total_minor: string;
  delivery_method: string;
  delivery_address?: string | null;
  payment_arrangement?: string | null;
  requires_customer_ack: boolean;
  latest_change_summary?: string | null;
  linked_invoice_share_token?: string | null;
  decline_or_cancel_reason?: string | null;
  lines: {
    title: string;
    variant_name?: string | null;
    unit_name: string;
    requested_quantity: string;
    confirmed_quantity: string;
    fulfilled_quantity: string;
    unit_price_minor: string;
    line_total_minor: string;
  }[];
  events: PublicOrderEvent[];
  created_at: string;
}

export interface MerchantOrderLine {
  id: number;
  product_id: number;
  variant_id?: number | null;
  product_kind: string;
  title: string;
  variant_name?: string | null;
  unit_name: string;
  requested_quantity: string;
  confirmed_quantity: string;
  fulfilled_quantity: string;
  unit_price_minor: string;
  line_total_minor: string;
  available_quantity: string;
  reservation_id?: number | null;
}

export interface MerchantOrder {
  id: number;
  order_reference: string;
  customer_id?: number | null;
  outlet_id?: number | null;
  commercial_status: string;
  fulfilment_status: string;
  payment_status: string;
  version: number;
  currency: string;
  currency_exponent: number;
  subtotal_minor: string;
  delivery_fee_minor: string;
  total_minor: string;
  delivery_method: string;
  customer_name: string;
  customer_phone?: string | null;
  customer_email?: string | null;
  organization_name?: string | null;
  delivery_address?: string | null;
  customer_note?: string | null;
  payment_arrangement?: string | null;
  linked_invoice_id?: number | null;
  decline_or_cancel_reason?: string | null;
  created_at: string;
  lines?: MerchantOrderLine[];
  events?: PublicOrderEvent[];
  suggested_customers?: { id: number; name: string; phone?: string | null; email?: string | null }[];
}
