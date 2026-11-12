import { apiClient, workspaceHeaders } from "./api.ts";
import { buildQueryString } from "./utils.ts";
import type {
  AccountingPeriod,
  ChartAccount,
  JournalDetail,
  LedgerEntry,
  LedgerReportResult,
  ManualJournalDraft,
  PeriodCloseChecklistResult,
  ProjectionRebuildRun,
  ReconciliationRunDetail,
  ReportExportRow,
  TaxCode,
  TaxScheduleItem,
} from "../types/ledger.ts";

export const ledgerKeys = {
  chart: (workspaceId: number) => ["ledger", workspaceId, "chart"] as const,
  journals: (workspaceId: number, filterKey: string) => ["ledger", workspaceId, "journals", filterKey] as const,
  journal: (workspaceId: number, id: number) => ["ledger", workspaceId, "journal", id] as const,
  manualDrafts: (workspaceId: number) => ["ledger", workspaceId, "manual-drafts"] as const,
  report: (workspaceId: number, type: string, from: string, to: string) =>
    ["ledger", workspaceId, "report", type, from, to] as const,
  exports: (workspaceId: number) => ["ledger", workspaceId, "exports"] as const,
  reconciliations: (workspaceId: number) => ["ledger", workspaceId, "reconciliations"] as const,
  rebuilds: (workspaceId: number) => ["ledger", workspaceId, "rebuilds"] as const,
  periods: (workspaceId: number) => ["ledger", workspaceId, "periods"] as const,
  taxCodes: (workspaceId: number) => ["ledger", workspaceId, "tax-codes"] as const,
  taxSchedules: (workspaceId: number) => ["ledger", workspaceId, "tax-schedules"] as const,
};

function idempHeaders(workspaceId: number, idempotencyKey?: string): Readonly<Record<string, string>> {
  const base = workspaceHeaders(workspaceId);
  return idempotencyKey ? { ...base, "Idempotency-Key": idempotencyKey } : base;
}

export const ledgerApi = {
  listChartAccounts: (workspaceId: number) =>
    apiClient.get<ChartAccount[]>("/api/v1/ledger/chart-of-accounts", { headers: workspaceHeaders(workspaceId) }),

  seedChartDefaults: (workspaceId: number) =>
    apiClient.post<object, ChartAccount[]>("/api/v1/ledger/chart-of-accounts/seed-defaults", {}, {
      headers: workspaceHeaders(workspaceId),
    }),

  createChartAccount: (
    workspaceId: number,
    payload: { code: string; name: string; account_class: string; subtype: string; parent_id?: number; description?: string },
  ) =>
    apiClient.post<typeof payload, ChartAccount>("/api/v1/ledger/chart-of-accounts", payload, {
      headers: workspaceHeaders(workspaceId),
    }),

  archiveChartAccount: (workspaceId: number, id: number) =>
    apiClient.post<object, ChartAccount>(`/api/v1/ledger/chart-of-accounts/${id}/archive`, {}, {
      headers: workspaceHeaders(workspaceId),
    }),

  listJournals: (
    workspaceId: number,
    params?: { from_date?: string; to_date?: string; source_type?: string; chart_account_id?: number; limit?: number },
  ) =>
    apiClient.get<{ items: LedgerEntry[]; next_cursor?: { date: string; id: number } }>(
      `/api/v1/ledger/journals${buildQueryString(params ?? {})}`,
      { headers: workspaceHeaders(workspaceId) },
    ),

  getJournalDetail: (workspaceId: number, id: number) =>
    apiClient.get<JournalDetail>(`/api/v1/ledger/journals/${id}`, { headers: workspaceHeaders(workspaceId) }),

  reverseJournal: (workspaceId: number, id: number, reason: string, idempotencyKey: string) =>
    apiClient.post<{ reason: string; allow_next_open_period: boolean }, JournalDetail>(
      `/api/v1/ledger/journals/${id}/commands/reverse`,
      { reason, allow_next_open_period: true },
      { headers: idempHeaders(workspaceId, idempotencyKey) },
    ),

  listManualDrafts: (workspaceId: number) =>
    apiClient.get<ManualJournalDraft[]>("/api/v1/ledger/manual-journal-drafts", {
      headers: workspaceHeaders(workspaceId),
    }),

  createManualDraft: (
    workspaceId: number,
    payload: {
      entry_date: string;
      currency: string;
      description: string;
      reference?: string;
      lines: Array<{ chart_account_id: number; debit?: string; credit?: string; description?: string }>;
    },
    idempotencyKey: string,
  ) =>
    apiClient.post<typeof payload, { draft: ManualJournalDraft }>("/api/v1/ledger/manual-journal-drafts", payload, {
      headers: idempHeaders(workspaceId, idempotencyKey),
    }),

  postManualDraft: (workspaceId: number, draftId: number, idempotencyKey: string) =>
    apiClient.post<{ draft_id: number }, JournalDetail>(
      "/api/v1/ledger/commands/post-manual-journal",
      { draft_id: draftId },
      { headers: idempHeaders(workspaceId, idempotencyKey) },
    ),

  getReport: (workspaceId: number, reportType: string, params: { from_date: string; to_date: string; currency: string }) =>
    apiClient.get<LedgerReportResult>(
      `/api/v1/ledger/reports/ledger/${reportType}${buildQueryString(params)}`,
      { headers: workspaceHeaders(workspaceId) },
    ),

  exportReport: (
    workspaceId: number,
    payload: { report_type: string; format: "csv" | "pdf"; from_date: string; to_date: string; currency: string },
  ) =>
    apiClient.post<typeof payload, ReportExportRow>("/api/v1/ledger/report-exports", payload, {
      headers: workspaceHeaders(workspaceId),
    }),

  listReportExports: (workspaceId: number) =>
    apiClient.get<ReportExportRow[]>("/api/v1/ledger/reports/exports", { headers: workspaceHeaders(workspaceId) }),

  listReconciliations: (workspaceId: number) =>
    apiClient.get<ReconciliationRunDetail[]>("/api/v1/ledger/reconciliations/subledger", {
      headers: workspaceHeaders(workspaceId),
    }),

  runReconciliation: (workspaceId: number, asOfDate?: string) =>
    apiClient.post<{ as_of_date?: string }, ReconciliationRunDetail>(
      "/api/v1/ledger/reconciliations/subledger",
      { as_of_date: asOfDate },
      { headers: workspaceHeaders(workspaceId) },
    ),

  listProjectionRebuilds: (workspaceId: number) =>
    apiClient.get<ProjectionRebuildRun[]>("/api/v1/ledger/projection-rebuilds", {
      headers: workspaceHeaders(workspaceId),
    }),

  runProjectionRebuild: (workspaceId: number, scope: string, idempotencyKey: string) =>
    apiClient.post<{ scope: string }, ProjectionRebuildRun>(
      "/api/v1/ledger/projection-rebuilds",
      { scope },
      { headers: idempHeaders(workspaceId, idempotencyKey) },
    ),

  listPeriods: (workspaceId: number) =>
    apiClient.get<AccountingPeriod[]>("/api/v1/ledger/periods", { headers: workspaceHeaders(workspaceId) }),

  createPeriod: (
    workspaceId: number,
    payload: { name: string; start_date: string; end_date: string; reporting_currency: string },
  ) =>
    apiClient.post<typeof payload, AccountingPeriod>("/api/v1/ledger/periods", payload, {
      headers: workspaceHeaders(workspaceId),
    }),

  runPeriodChecklist: (workspaceId: number, periodId: number) =>
    apiClient.post<object, PeriodCloseChecklistResult>(`/api/v1/ledger/periods/${periodId}/commands/checklist`, {}, {
      headers: workspaceHeaders(workspaceId),
    }),

  closePeriod: (workspaceId: number, periodId: number) =>
    apiClient.post<object, AccountingPeriod>(`/api/v1/ledger/periods/${periodId}/commands/close`, {}, {
      headers: workspaceHeaders(workspaceId),
    }),

  lockPeriod: (workspaceId: number, periodId: number) =>
    apiClient.post<object, AccountingPeriod>(`/api/v1/ledger/periods/${periodId}/commands/lock`, {}, {
      headers: workspaceHeaders(workspaceId),
    }),

  reopenPeriod: (workspaceId: number, periodId: number, reason: string) =>
    apiClient.post<{ reason: string }, AccountingPeriod>(
      `/api/v1/ledger/periods/${periodId}/commands/reopen`,
      { reason },
      { headers: workspaceHeaders(workspaceId) },
    ),

  listTaxCodes: (workspaceId: number) =>
    apiClient.get<TaxCode[]>("/api/v1/ledger/tax-codes", { headers: workspaceHeaders(workspaceId) }),

  createTaxCode: (
    workspaceId: number,
    payload: { code: string; name: string; tax_type: string; classification: string; rate_bps: number },
  ) =>
    apiClient.post<typeof payload, TaxCode>("/api/v1/ledger/tax-codes", payload, {
      headers: workspaceHeaders(workspaceId),
    }),

  listTaxSchedules: (workspaceId: number) =>
    apiClient.get<TaxScheduleItem[]>("/api/v1/ledger/tax-schedules", { headers: workspaceHeaders(workspaceId) }),

  recordTaxPayment: (
    workspaceId: number,
    payload: { tax_type: string; money_account_id: number; amount: string; currency: string; payment_date: string; reference?: string },
    idempotencyKey: string,
  ) =>
    apiClient.post<typeof payload, unknown>("/api/v1/ledger/commands/record-tax-payment", payload, {
      headers: idempHeaders(workspaceId, idempotencyKey),
    }),
};
