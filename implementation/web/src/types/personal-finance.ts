import type { Budget, MoneyAccount, MoneyCategory, MoneyRecordDraft } from "./finance.ts";

export interface PersonalSpendingCategory {
  category_name: string;
  category_id: number | null;
  total_minor: string;
}

export interface PersonalActivityItem {
  id: number;
  workspace_id: number;
  direction: "money_in" | "money_out" | "transfer";
  status: string;
  amount_minor: string;
  currency: string;
  currency_exponent: number;
  effective_date: string;
  money_account_id: number | null;
  account_name: string | null;
  destination_account_id: number | null;
  destination_account_name: string | null;
  category_id: number | null;
  category_name: string | null;
  counterparty_name: string | null;
  purpose: string;
  notes: string | null;
  reference: string | null;
  tags: unknown[];
  created_at: string;
  attachment_count: number;
}

export interface PersonalActivityResult {
  items: PersonalActivityItem[];
  drafts?: MoneyRecordDraft[];
  next_cursor?: { date: string; id: number };
  from_date: string;
  to_date: string;
}

export interface BudgetLineRow {
  id: number;
  budget_id: number;
  category_id: number | null;
  category_name: string | null;
  limit_minor: string;
  notes: string | null;
}

export interface BudgetLineStatus {
  line: BudgetLineRow;
  actual_spending_minor: string;
  remaining_minor: string;
  usage_basis_points: number;
  usage_percentage_formatted: string;
}

export interface BudgetAlertEvent {
  id: number;
  budget_id: number;
  threshold_percent: number;
  actual_minor: string;
  limit_minor: string;
  usage_basis_points: number;
  message: string;
  triggered_at: string;
}

export interface BudgetVersion {
  id: number;
  budget_id: number;
  version_number: number;
  change_reason: string | null;
  created_at: string;
}

export interface PersonalBudgetDetail {
  budget: Budget & {
    status: "draft" | "active" | "completed" | "archived";
    income_goal_minor: string;
    alert_thresholds: number[];
    version: number;
  };
  budget_amount_minor: string;
  actual_spending_minor: string;
  remaining_minor: string;
  usage_basis_points: number;
  usage_percentage_formatted: string;
  is_over_budget: boolean;
  lines: BudgetLineStatus[];
  alerts: BudgetAlertEvent[];
  versions: BudgetVersion[];
}

export interface LoanRecord {
  id: number;
  workspace_id: number;
  direction: "borrowed" | "lent";
  counterparty_name: string;
  principal_minor: string;
  outstanding_principal_minor: string;
  total_interest_paid_minor: string;
  total_fees_paid_minor: string;
  currency: string;
  currency_exponent: number;
  start_date: string;
  due_date: string | null;
  interest_rate_bps: number;
  interest_arrangement: string | null;
  money_account_id: number | null;
  is_opening_balance: boolean;
  status: string;
  notes: string | null;
  version: number;
}

export interface LoanEvent {
  id: number;
  loan_id: number;
  event_type: string;
  effective_date: string;
  total_amount_minor: string;
  principal_minor: string;
  interest_minor: string;
  fee_minor: string;
  is_reversed: boolean;
  notes: string | null;
  created_at: string;
}

export interface LoanScheduleItem {
  id: number;
  loan_id: number;
  installment_number: number;
  due_date: string;
  expected_total_minor: string;
  expected_principal_minor: string;
  expected_interest_minor: string;
  paid_minor: string;
  status: string;
}

export interface LoanDetail {
  loan: LoanRecord;
  derived_status: string;
  events: LoanEvent[];
  schedule: LoanScheduleItem[];
}

export interface InvestmentRecord {
  id: number;
  workspace_id: number;
  name: string;
  investment_type: "shares_funds" | "fixed_income" | "crypto" | "cooperative" | "other";
  institution_name: string | null;
  currency: string;
  currency_exponent: number;
  total_units: string;
  cost_basis_minor: string;
  total_income_minor: string;
  latest_manual_value_minor: string | null;
  latest_valuation_date: string | null;
  latest_valuation_source: string | null;
  status: "draft" | "active" | "disposed" | "archived";
  notes: string | null;
}

export interface InvestmentEvent {
  id: number;
  investment_id: number;
  event_type: string;
  effective_date: string;
  amount_minor: string;
  units_delta: string;
  cost_basis_delta_minor: string;
  realized_gain_loss_minor: string | null;
  gain_loss_status: string;
  notes: string | null;
}

export interface ValuationRecord {
  id: number;
  valuation_date: string;
  value_minor: string;
  source: string;
  notes: string | null;
  created_at: string;
}

export interface InvestmentDetail {
  investment: InvestmentRecord;
  events: InvestmentEvent[];
  valuations: ValuationRecord[];
}

export interface PersonalAssetRecord {
  id: number;
  workspace_id: number;
  name: string;
  asset_type: "vehicle" | "property" | "electronics_equipment" | "personal_item" | "other";
  currency: string;
  currency_exponent: number;
  acquisition_date: string | null;
  acquisition_cost_minor: string;
  is_opening_asset: boolean;
  latest_manual_value_minor: string | null;
  latest_valuation_date: string | null;
  latest_valuation_source: string | null;
  disposal_date: string | null;
  disposal_proceeds_minor: string | null;
  disposal_costs_minor: string | null;
  realized_gain_loss_minor: string | null;
  status: "draft" | "active" | "disposed" | "archived";
  notes: string | null;
}

export interface AssetEvent {
  id: number;
  asset_id: number;
  event_type: string;
  effective_date: string;
  amount_minor: string;
  disposal_costs_minor: string;
  counterparty_name: string | null;
  notes: string | null;
}

export interface AssetDetail {
  asset: PersonalAssetRecord;
  events: AssetEvent[];
  valuations: ValuationRecord[];
}

export interface PersonalTag {
  id: number;
  workspace_id: number;
  name: string;
  color: string | null;
  is_active: boolean;
}

export interface PersonalDashboard {
  from_date: string;
  to_date: string;
  as_of: string;
  currency: string;
  currency_exponent: number;
  cash_inflow_minor: string;
  cash_outflow_minor: string;
  net_cash_movement_minor: string;
  income_minor: string;
  expense_minor: string;
  net_income_minor: string;
  total_cash_balance_minor: string;
  accounts: MoneyAccount[];
  spending_by_category: PersonalSpendingCategory[];
  budgets: PersonalBudgetDetail[];
  recent_activity: PersonalActivityItem[];
  upcoming_loans: LoanDetail[];
  needs_review_count: number;
  basis_note: string;
}

export interface OwnerTransferGroup {
  id: number;
  owner_user_id: number;
  from_workspace_id: number;
  to_workspace_id: number;
  from_money_account_id: number;
  to_money_account_id: number;
  purpose: string;
  amount_minor: string;
  currency: string;
  currency_exponent: number;
  effective_date: string;
  notes: string | null;
  reference: string | null;
  status: string;
  created_at: string;
}

export interface AllOwnerSummary {
  from_date: string;
  to_date: string;
  as_of: string;
  workspaces: Array<{
    workspace_id: number;
    workspace_name: string;
    kind: "personal" | "business";
    currency: string;
    currency_exponent: number;
    cash_balance_minor: string;
    cash_inflow_minor: string;
    cash_outflow_minor: string;
    income_minor: string;
    expense_minor: string;
  }>;
  combined_by_currency: Array<{
    currency: string;
    currency_exponent: number;
    combined_cash_balance_minor: string;
    raw_inflow_minor: string;
    raw_outflow_minor: string;
    eliminated_transfer_minor: string;
    combined_inflow_minor: string;
    combined_outflow_minor: string;
    combined_net_cash_movement_minor: string;
  }>;
  excludes_invited_business_data: boolean;
  requires_target_workspace_to_post: boolean;
  projection_note: string;
}

export type PersonalAccountWithMeta = MoneyAccount & {
  institution_name?: string | null;
  masked_reference?: string | null;
  display_order?: number;
};

export type PersonalCategoryWithMeta = MoneyCategory & {
  parent_id?: number | null;
  is_archived?: boolean;
};
