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

/** A non-posting supplier commitment created from an approved request. */
export interface PurchaseOrder {
  id: number;
  source_purchase_request_id: number;
  status: "draft" | "submitted" | "approved" | "issued" | "acknowledged" | "partially_received" | "fully_received" | "cancelled" | "partially_cancelled" | "closed";
  version: number;
  order_number?: string | null;
  currency: string;
  currency_exponent: number;
  total_minor: string;
  cancellation_reason?: string | null;
  closed_reason?: string | null;
  acknowledged_at?: string | null;
  acknowledgement_note?: string | null;
  lines?: PurchaseOrderLine[];
  events?: PurchaseOrderEvent[];
}

export interface ReceiptOptionLine {
  purchase_order_line_id: number;
  description: string;
  remaining_quantity: string;
}
export interface GoodsReceiptLine { id:number; purchase_order_line_id:number; product_id?:number|null; description:string; accepted_quantity:string; unit_cost_minor:string; line_total_minor:string; }
export interface GoodsReceipt { id:number; purchase_order_id:number; received_on:string; receipt_reference?:string|null; lines?:GoodsReceiptLine[]; }
export interface SupplierBill { id:number; goods_receipt_id:number; goods_receipt_linked?:boolean; bill_type?:"receipt"|"direct_expense"|"direct_service"; due_date?:string|null; overdue?:boolean; status:"draft"|"approved"|"partially_paid"|"paid"|"voided"; version:number; total_minor:string; outstanding_minor:string; }
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
export interface SupplierReturn { id:number; supplier_id:number; goods_receipt_id:number; status:"posted"|"cancelled"; total_minor:string; }
export interface SupplierReturnLineOption { id:number; product_name:string; remaining_quantity:string; unit_cost_minor:string; }
export interface ProcurementReport { as_of_date:string; open_purchase_order_count:number; open_purchase_order_minor:string; ordered_minor:string; received_minor:string; unbilled_receipt_count:number; grni_minor:string; ap_outstanding_minor:string; ap_overdue_minor:string; unapplied_advance_count:number; unapplied_advance_minor:string; }
export interface SupplierBillMatch { bill_id:number; receipt_id:number; ordered_minor:string; received_minor:string; billed_minor:string; open_to_bill_minor:string; variance_minor:string; result:string; requires_review:boolean; }

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
}
