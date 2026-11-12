export interface AIUsageSummary {
  plan_entitled: boolean;
  monthly_credit_limit: number;
  credits_used: number;
  credits_reserved: number;
  credits_remaining: number;
  per_user_daily_limit: number;
  user_daily_used: number;
  default_provider: string;
  provider_configured: boolean;
}

export interface AIRequestRecord {
  id: number;
  workspace_id: number;
  user_id: number;
  mode: "sync" | "async";
  status: "received" | "queued" | "running" | "succeeded" | "failed" | "rejected";
  provider: string | null;
  model: string | null;
  latency_ms: number;
  structured_valid: boolean;
  failure_class: string | null;
  job_id: number | null;
  created_at: string;
}

export interface AIDraft {
  id: number;
  workspace_id: number;
  ai_request_id: number;
  schema_version: string;
  scope: "personal" | "business" | "unknown";
  direction: "money_in" | "money_out" | "transfer" | "unknown";
  purpose: string;
  amount_major: string;
  amount_minor: string;
  currency: string;
  currency_exponent: number;
  effective_date: string | null;
  account_id: number | null;
  account_alias: string | null;
  category_id: number | null;
  category_alias: string | null;
  counterparty_id: number | null;
  counterparty_alias: string | null;
  description: string;
  field_confidence: Record<string, { confidence: string; source: string }>;
  missing_fields: string[];
  warnings: string[];
  clarification_options: string[];
  route_to_manual_flow: string | null;
  status: "draft" | "needs_review" | "confirmed" | "discarded";
  confirmed_record_type: string | null;
  confirmed_record_id: number | null;
  created_at: string;
}

export interface AIMoneyDraftResult {
  request: AIRequestRecord;
  drafts: AIDraft[];
  job?: BackgroundJob;
}

export interface ImportBatch {
  id: number;
  workspace_id: number;
  target_account_id: number | null;
  default_currency: string;
  status: "uploaded" | "mapped" | "analyzing" | "ready" | "confirming" | "completed" | "partially_failed" | "undone";
  total_rows: number;
  valid_count: number;
  duplicate_count: number;
  match_count: number;
  invalid_count: number;
  excluded_count: number;
  posted_count: number;
  failed_count: number;
  created_at: string;
}

export interface ImportReconciliation {
  id: number;
  batch_id: number;
  source_row_count: number;
  posted_count: number;
  matched_count: number;
  duplicate_excluded_count: number;
  failed_unresolved_count: number;
  reconciled: boolean;
  currency_totals: Record<string, string>;
}

export interface ImportBatchDetail {
  batch: ImportBatch;
  headers: string[];
  reconciliation?: ImportReconciliation;
}

export interface ImportUploadResult {
  batch: ImportBatch;
  headers: string[];
  sample_rows: string[][];
  delimiter: string;
}

export interface ImportMappingPreviewRow {
  row_number: number;
  effective_date: string;
  description: string;
  direction: string;
  amount_minor: string;
  currency: string;
  valid: boolean;
  error?: string;
}

export interface ImportRow {
  id: number;
  batch_id: number;
  row_number: number;
  external_tx_id: string;
  effective_date: string | null;
  description: string;
  amount_minor: string;
  signed_amount_minor: string;
  currency: string;
  direction: "money_in" | "money_out" | "transfer";
  purpose: string;
  account_id: number | null;
  category_id: number | null;
  state: "parsed" | "invalid" | "duplicate_exact" | "match_suggested" | "matched" | "draft_ready" | "confirming" | "posted" | "failed" | "excluded";
  error_code: string;
  error_message: string;
  suggestion_source: "rule" | "ai" | "manual";
}

export interface ImportUndoResult {
  preview: boolean;
  eligible_count: number;
  blocked_count: number;
  reversed_count: number;
  unlinked_count: number;
  blocked_reasons?: string[];
}

export interface BackgroundJob {
  id: number;
  workspace_id: number;
  job_type: string;
  state: "queued" | "running" | "retry_scheduled" | "succeeded" | "failed" | "dead_letter" | "cancelled";
  attempts: number;
  max_attempts: number;
  last_error_class: string | null;
  last_error_message: string | null;
  created_at: string;
}

export interface FailedJob {
  id: number;
  job_id: number;
  workspace_id: number;
  job_type: string;
  source_type: string;
  source_id: number;
  attempts: number;
  last_error_class: string;
  last_error_message: string;
  status: "open" | "retried" | "cancelled";
  retried_job_id: number | null;
  created_at: string;
}

export interface AutomationRule {
  id: number;
  workspace_id: number;
  rule_key: string;
  name: string;
  rule_type: string;
  version: number;
  is_enabled: boolean;
  last_run_at: string | null;
}

export interface AutomationExecution {
  id: number;
  rule_id: number;
  status: "succeeded" | "failed" | "skipped";
  summary: string;
  affected_count: number;
  created_at: string;
}
