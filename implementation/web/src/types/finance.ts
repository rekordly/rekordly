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

export interface Contact {
  id: number;
  name: string;
  party_type: string;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
  is_active: boolean;
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

export interface Invoice extends TradeRecord {
  customer_id: number;
  customer_name: string;
  invoice_number: string;
  issue_date: string;
  due_date: string;
  subtotal_minor: MinorAmount;
  tax_amount_minor: MinorAmount;
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
