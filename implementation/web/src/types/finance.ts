export interface MoneyAccount {
  id: number;
  name: string;
  account_type: string;
  currency: string;
  currency_exponent: number;
  current_balance_minor: number | string;
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
  amount_minor: number | string;
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
