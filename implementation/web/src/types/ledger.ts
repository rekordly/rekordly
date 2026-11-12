export interface ChartAccount {
  id: number;
  workspace_id: number;
  code: string;
  name: string;
  account_class: "asset" | "liability" | "equity" | "revenue" | "expense";
  subtype: string;
  parent_id: number | null;
  currency_restriction: string | null;
  is_system: boolean;
  is_control: boolean;
  control_subledger: string | null;
  is_active: boolean;
  template_version: string;
  description: string | null;
}

export interface LedgerEntry {
  id: number;
  workspace_id: number;
  source_type: string;
  source_id: number;
  entry_date: string;
  currency: string;
  currency_exponent: number;
  description: string | null;
  template_key: string | null;
  template_version: string | null;
  status: "posted" | "reversed";
  is_reversed: boolean;
  reversed_by_entry_id: number | null;
  reversal_of_entry_id: number | null;
  accounting_period_id: number | null;
  created_at: string;
}

export interface LedgerLineRow {
  id: number;
  ledger_entry_id: number;
  chart_account_id: number | null;
  chart_account_code: string | null;
  chart_account_name: string | null;
  money_account_name: string | null;
  account_class: string;
  debit_minor: string;
  credit_minor: string;
  description: string | null;
}

export interface JournalDetail {
  entry: LedgerEntry;
  lines: LedgerLineRow[];
  source_link: string;
  total_debit_minor: string;
  total_credit_minor: string;
}

export interface ManualJournalDraft {
  id: number;
  workspace_id: number;
  entry_date: string;
  currency: string;
  currency_exponent: number;
  description: string;
  reference: string | null;
  status: string;
  created_by_user_id: number;
  posted_ledger_entry_id: number | null;
  created_at: string;
}

export interface LedgerReportResult {
  report_type: string;
  title: string;
  from_date: string;
  to_date: string;
  as_of_date: string;
  currency: string;
  currency_exponent: number;
  basis: string;
  report_version: string;
  generated_at: string;
  invariant_passed: boolean;
  reconciliation_status: string;
  warnings: string[];
  columns: Array<{ key: string; label: string; align?: "left" | "right" }>;
  rows: Array<{
    key: string;
    label: string;
    values: Record<string, string>;
    chart_account_id?: number;
    source_type?: string;
    source_id?: number;
  }>;
  totals: Record<string, string>;
}

export interface ReportExportRow {
  id: number;
  report_type: string;
  format: string;
  status: string;
  row_count: number;
  warnings: string[];
  content_text?: string;
  expires_at: string;
  created_at: string;
}

export interface ReconciliationRunDetail {
  run: {
    id: number;
    as_of_date: string;
    status: "passed" | "failed";
    total_checks: number;
    failed_checks: number;
    created_at: string;
  };
  differences: Array<{
    id: number;
    subledger_name: string;
    gl_balance_minor: string;
    subledger_balance_minor: string;
    difference_minor: string;
    status: "matched" | "mismatch";
    details: string | null;
  }>;
}

export interface ProjectionRebuildRun {
  id: number;
  scope: string;
  status: string;
  verified: boolean;
  error_message: string | null;
  created_at: string;
}

export interface AccountingPeriod {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  status: "open" | "soft_closed" | "closed" | "locked";
  reporting_currency: string;
  version: number;
  closed_at: string | null;
  locked_at: string | null;
  reopened_at: string | null;
  reopen_reason: string | null;
}

export interface PeriodCloseChecklistResult {
  run: {
    id: number;
    status: string;
    critical_failures: number;
    warnings_count: number;
    summary: string | null;
    created_at: string;
  };
  checks: Array<{
    id: number;
    check_key: string;
    label: string;
    severity: "critical" | "warning";
    passed: boolean;
    detail: string;
    difference_minor: string;
  }>;
}

export interface TaxCode {
  id: number;
  code: string;
  name: string;
  tax_type: "vat" | "wht" | "other";
  classification: "taxable" | "zero_rated" | "exempt" | "out_of_scope";
  rate_bps: number;
}

export interface TaxScheduleItem {
  id: number;
  tax_type: "vat" | "wht";
  direction: string;
  source_type: string;
  source_id: number;
  counterparty_name: string | null;
  taxable_base_minor: string;
  tax_amount_minor: string;
  rate_bps: number;
  effective_date: string;
  status: string;
}
