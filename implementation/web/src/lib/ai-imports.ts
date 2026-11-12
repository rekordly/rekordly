import { apiClient, workspaceHeaders } from "./api.ts";
import { buildQueryString } from "./utils.ts";
import type {
  AIDraft,
  AIMoneyDraftResult,
  AIUsageSummary,
  AutomationExecution,
  AutomationRule,
  BackgroundJob,
  FailedJob,
  ImportBatch,
  ImportBatchDetail,
  ImportMappingPreviewRow,
  ImportRow,
  ImportUndoResult,
  ImportUploadResult,
} from "../types/ai-imports.ts";

export const aiImportsKeys = {
  aiUsage: (workspaceId: number) => ["bp12", workspaceId, "ai-usage"] as const,
  aiDrafts: (workspaceId: number, status = "") => ["bp12", workspaceId, "ai-drafts", status] as const,
  imports: (workspaceId: number) => ["bp12", workspaceId, "imports"] as const,
  importBatch: (workspaceId: number, batchId: number) => ["bp12", workspaceId, "import-batch", batchId] as const,
  importRows: (workspaceId: number, batchId: number, state: string) => ["bp12", workspaceId, "import-rows", batchId, state] as const,
  failedJobs: (workspaceId: number) => ["bp12", workspaceId, "failed-jobs"] as const,
  automations: (workspaceId: number) => ["bp12", workspaceId, "automations"] as const,
};

function idempHeaders(workspaceId: number, idempotencyKey?: string): Readonly<Record<string, string>> {
  const base = workspaceHeaders(workspaceId);
  return idempotencyKey ? { ...base, "Idempotency-Key": idempotencyKey } : base;
}

export const aiImportsApi = {
  // AI Capture & Drafts
  getAIUsage: (workspaceId: number) =>
    apiClient.get<AIUsageSummary>(`/api/v1/workspaces/${workspaceId}/ai/usage`, {
      headers: workspaceHeaders(workspaceId),
    }),

  parseMoneyDraft: (
    workspaceId: number,
    payload: { narration: string; scope_hint?: string; direction_hint?: string; async?: boolean },
    idempotencyKey: string,
  ) =>
    apiClient.post<typeof payload, AIMoneyDraftResult>(`/api/v1/workspaces/${workspaceId}/ai/money-drafts`, payload, {
      headers: idempHeaders(workspaceId, idempotencyKey),
    }),

  getAIRequest: (workspaceId: number, requestId: number) =>
    apiClient.get<AIMoneyDraftResult>(`/api/v1/workspaces/${workspaceId}/ai/requests/${requestId}`, {
      headers: workspaceHeaders(workspaceId),
    }),

  listAIDrafts: (workspaceId: number, status?: string) =>
    apiClient.get<AIDraft[]>(`/api/v1/workspaces/${workspaceId}/ai/drafts${buildQueryString({ status })}`, {
      headers: workspaceHeaders(workspaceId),
    }),

  updateAIDraft: (
    workspaceId: number,
    draftId: number,
    payload: {
      scope?: string;
      direction?: string;
      purpose?: string;
      amount_major?: string;
      currency?: string;
      effective_date?: string;
      account_id?: number;
      category_id?: number;
      description?: string;
    },
  ) =>
    apiClient.patch<typeof payload, AIDraft>(`/api/v1/workspaces/${workspaceId}/ai/drafts/${draftId}`, payload, {
      headers: workspaceHeaders(workspaceId),
    }),

  previewAIDraft: (workspaceId: number, draftId: number) =>
    apiClient.get<{
      template_key: string;
      total_debit_minor: string;
      total_credit_minor: string;
      lines: Array<{ chart_account_code: string; chart_account_name: string; debit_minor: string; credit_minor: string }>;
    }>(`/api/v1/workspaces/${workspaceId}/ai/drafts/${draftId}/preview`, {
      headers: workspaceHeaders(workspaceId),
    }),

  confirmAIDraft: (workspaceId: number, draftId: number, idempotencyKey: string) =>
    apiClient.post<object, unknown>(`/api/v1/workspaces/${workspaceId}/ai/drafts/${draftId}/commands/confirm`, {}, {
      headers: idempHeaders(workspaceId, idempotencyKey),
    }),

  discardAIDraft: (workspaceId: number, draftId: number) =>
    apiClient.post<object, AIDraft>(`/api/v1/workspaces/${workspaceId}/ai/drafts/${draftId}/commands/discard`, {}, {
      headers: workspaceHeaders(workspaceId),
    }),

  // CSV Imports
  listImports: (workspaceId: number) =>
    apiClient.get<ImportBatch[]>(`/api/v1/workspaces/${workspaceId}/imports`, {
      headers: workspaceHeaders(workspaceId),
    }),

  createImport: (
    workspaceId: number,
    payload: { filename: string; csv_content: string; target_account_id?: number; default_currency?: string },
  ) =>
    apiClient.post<typeof payload, ImportUploadResult>(`/api/v1/workspaces/${workspaceId}/imports`, payload, {
      headers: workspaceHeaders(workspaceId),
    }),

  getImportBatch: (workspaceId: number, batchId: number) =>
    apiClient.get<ImportBatchDetail>(`/api/v1/workspaces/${workspaceId}/imports/${batchId}`, {
      headers: workspaceHeaders(workspaceId),
    }),

  setImportMapping: (
    workspaceId: number,
    batchId: number,
    payload: {
      date_column: string;
      description_column: string;
      amount_column?: string;
      debit_column?: string;
      credit_column?: string;
      currency_column?: string;
      external_id_column?: string;
      date_format: string;
      decimal_separator: string;
      sign_convention: string;
      target_account_id: number;
      default_currency?: string;
    },
  ) =>
    apiClient.post<typeof payload, { batch: ImportBatch; preview: ImportMappingPreviewRow[] }>(
      `/api/v1/workspaces/${workspaceId}/imports/${batchId}/commands/set-mapping`,
      payload,
      { headers: workspaceHeaders(workspaceId) },
    ),

  analyzeImportBatch: (workspaceId: number, batchId: number) =>
    apiClient.post<object, ImportBatchDetail>(`/api/v1/workspaces/${workspaceId}/imports/${batchId}/commands/analyze`, {}, {
      headers: workspaceHeaders(workspaceId),
    }),

  listImportRows: (workspaceId: number, batchId: number, params?: { state?: string; after_id?: number; limit?: number }) =>
    apiClient.get<ImportRow[]>(
      `/api/v1/workspaces/${workspaceId}/imports/${batchId}/rows${buildQueryString(params ?? {})}`,
      { headers: workspaceHeaders(workspaceId) },
    ),

  updateImportRow: (
    workspaceId: number,
    batchId: number,
    rowId: number,
    payload: { description?: string; direction?: string; category_id?: number; state?: string },
  ) =>
    apiClient.patch<typeof payload, ImportRow>(`/api/v1/workspaces/${workspaceId}/imports/${batchId}/rows/${rowId}`, payload, {
      headers: workspaceHeaders(workspaceId),
    }),

  bulkImportAction: (
    workspaceId: number,
    batchId: number,
    payload: { row_ids: number[]; action: string; category_id?: number; account_id?: number },
  ) =>
    apiClient.post<typeof payload, { updated: number }>(
      `/api/v1/workspaces/${workspaceId}/imports/${batchId}/commands/bulk-action`,
      payload,
      { headers: workspaceHeaders(workspaceId) },
    ),

  confirmImportBatch: (workspaceId: number, batchId: number, rowIds?: number[]) =>
    apiClient.post<{ row_ids?: number[] }, ImportBatchDetail>(
      `/api/v1/workspaces/${workspaceId}/imports/${batchId}/commands/confirm`,
      { row_ids: rowIds },
      { headers: workspaceHeaders(workspaceId) },
    ),

  undoImportBatch: (workspaceId: number, batchId: number, preview: boolean) =>
    apiClient.post<{ preview: boolean }, ImportUndoResult>(
      `/api/v1/workspaces/${workspaceId}/imports/${batchId}/commands/undo`,
      { preview },
      { headers: workspaceHeaders(workspaceId) },
    ),

  // Jobs & Automation
  getJob: (workspaceId: number, jobId: number) =>
    apiClient.get<BackgroundJob>(`/api/v1/workspaces/${workspaceId}/jobs/${jobId}`, {
      headers: workspaceHeaders(workspaceId),
    }),

  listFailedJobs: (workspaceId: number) =>
    apiClient.get<FailedJob[]>(`/api/v1/workspaces/${workspaceId}/failed-jobs`, {
      headers: workspaceHeaders(workspaceId),
    }),

  retryFailedJob: (workspaceId: number, jobId: number) =>
    apiClient.post<object, BackgroundJob>(`/api/v1/workspaces/${workspaceId}/failed-jobs/${jobId}/commands/retry`, {}, {
      headers: workspaceHeaders(workspaceId),
    }),

  cancelFailedJob: (workspaceId: number, jobId: number) =>
    apiClient.post<object, FailedJob>(`/api/v1/workspaces/${workspaceId}/failed-jobs/${jobId}/commands/cancel`, {}, {
      headers: workspaceHeaders(workspaceId),
    }),

  listAutomations: (workspaceId: number) =>
    apiClient.get<{ rules: AutomationRule[]; executions: AutomationExecution[] }>(
      `/api/v1/workspaces/${workspaceId}/automations`,
      { headers: workspaceHeaders(workspaceId) },
    ),

  upsertAutomation: (
    workspaceId: number,
    ruleKey: string,
    payload: { name: string; rule_type: string; is_enabled: boolean; config?: Record<string, unknown> },
  ) =>
    apiClient.put<typeof payload, AutomationRule>(`/api/v1/workspaces/${workspaceId}/automations/${ruleKey}`, payload, {
      headers: workspaceHeaders(workspaceId),
    }),

  runAutomation: (workspaceId: number, ruleKey: string) =>
    apiClient.post<object, AutomationExecution>(`/api/v1/workspaces/${workspaceId}/automations/${ruleKey}/commands/run`, {}, {
      headers: workspaceHeaders(workspaceId),
    }),
};
