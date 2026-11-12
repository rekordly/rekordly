import { apiClient, workspaceHeaders } from "./api.ts";
import { buildQueryString } from "./utils.ts";
import type {
  AllOwnerSummary,
  AssetDetail,
  BudgetAlertEvent,
  InvestmentDetail,
  InvestmentRecord,
  LoanDetail,
  OwnerTransferGroup,
  PersonalAccountWithMeta,
  PersonalActivityResult,
  PersonalAssetRecord,
  PersonalBudgetDetail,
  PersonalCategoryWithMeta,
  PersonalDashboard,
  PersonalTag,
} from "../types/personal-finance.ts";

export const personalKeys = {
  workspace: (workspaceId: number) => ["personal", workspaceId] as const,
  dashboard: (workspaceId: number, from?: string, to?: string) =>
    ["personal", workspaceId, "dashboard", from ?? "", to ?? ""] as const,
  activity: (workspaceId: number, tab: string, from?: string, to?: string) =>
    ["personal", workspaceId, "activity", tab, from ?? "", to ?? ""] as const,
  accounts: (workspaceId: number) => ["personal", workspaceId, "accounts"] as const,
  budgets: (workspaceId: number) => ["personal", workspaceId, "budgets"] as const,
  loans: (workspaceId: number) => ["personal", workspaceId, "loans"] as const,
  investments: (workspaceId: number) => ["personal", workspaceId, "investments"] as const,
  assets: (workspaceId: number) => ["personal", workspaceId, "assets"] as const,
  tags: (workspaceId: number) => ["personal", workspaceId, "tags"] as const,
  ownerTransfers: () => ["owner", "transfers"] as const,
  allSummary: (from?: string, to?: string) => ["owner", "all-summary", from ?? "", to ?? ""] as const,
};

function idempHeaders(workspaceId: number, idempotencyKey?: string): Readonly<Record<string, string>> {
  const base = workspaceHeaders(workspaceId);
  return idempotencyKey ? { ...base, "Idempotency-Key": idempotencyKey } : base;
}

export const personalApi = {
  getDashboard: (workspaceId: number, params?: { from_date?: string; to_date?: string; currency?: string }) =>
    apiClient.get<PersonalDashboard>(
      `/api/v1/personal/dashboard${buildQueryString(params ?? {})}`,
      { headers: workspaceHeaders(workspaceId) },
    ),

  listActivity: (
    workspaceId: number,
    params?: { tab?: string; from_date?: string; to_date?: string; cursor_date?: string; cursor_id?: number; limit?: number },
  ) =>
    apiClient.get<PersonalActivityResult>(
      `/api/v1/personal/activity${buildQueryString(params ?? {})}`,
      { headers: workspaceHeaders(workspaceId) },
    ),

  listAccounts: (workspaceId: number) =>
    apiClient.get<PersonalAccountWithMeta[]>("/api/v1/personal/accounts", {
      headers: workspaceHeaders(workspaceId),
    }),

  createAccount: (
    workspaceId: number,
    payload: { name: string; account_type: string; currency: string; is_active?: boolean },
  ) =>
    apiClient.post<typeof payload, PersonalAccountWithMeta>("/api/v1/personal/accounts", payload, {
      headers: workspaceHeaders(workspaceId),
    }),

  recordOpeningBalance: (
    workspaceId: number,
    accountId: number,
    payload: { amount: string; as_of_date: string; direction?: string; note?: string },
    idempotencyKey: string,
  ) =>
    apiClient.post<typeof payload, unknown>(`/api/v1/personal/accounts/${accountId}/opening-balance`, payload, {
      headers: idempHeaders(workspaceId, idempotencyKey),
    }),

  archiveAccount: (workspaceId: number, accountId: number, archive: boolean) =>
    apiClient.post<object, { account: PersonalAccountWithMeta; warning?: string }>(
      `/api/v1/personal/accounts/${accountId}/${archive ? "archive" : "reactivate"}`,
      {},
      { headers: workspaceHeaders(workspaceId) },
    ),

  seedDefaultCategories: (workspaceId: number) =>
    apiClient.post<object, PersonalCategoryWithMeta[]>("/api/v1/personal/categories/seed-defaults", {}, {
      headers: workspaceHeaders(workspaceId),
    }),

  archiveCategory: (workspaceId: number, categoryId: number, archive: boolean) =>
    apiClient.post<object, PersonalCategoryWithMeta>(
      `/api/v1/personal/categories/${categoryId}/${archive ? "archive" : "reactivate"}`,
      {},
      { headers: workspaceHeaders(workspaceId) },
    ),

  listTags: (workspaceId: number) =>
    apiClient.get<PersonalTag[]>("/api/v1/personal/tags", { headers: workspaceHeaders(workspaceId) }),

  createTag: (workspaceId: number, payload: { name: string; color?: string }) =>
    apiClient.post<typeof payload, PersonalTag>("/api/v1/personal/tags", payload, { headers: workspaceHeaders(workspaceId) }),

  archiveTag: (workspaceId: number, tagId: number) =>
    apiClient.delete<PersonalTag>(`/api/v1/personal/tags/${tagId}`, { headers: workspaceHeaders(workspaceId) }),

  listBudgets: (workspaceId: number, status?: string) =>
    apiClient.get<PersonalBudgetDetail[]>(
      `/api/v1/personal/budgets${buildQueryString({ status })}`,
      { headers: workspaceHeaders(workspaceId) },
    ),

  createBudget: (
    workspaceId: number,
    payload: {
      name: string;
      period: string;
      amount: string;
      income_goal?: string;
      currency: string;
      category_id?: number;
      start_date: string;
      end_date: string;
      notes?: string;
    },
    idempotencyKey: string,
  ) =>
    apiClient.post<typeof payload, PersonalBudgetDetail>("/api/v1/personal/budgets", payload, {
      headers: idempHeaders(workspaceId, idempotencyKey),
    }),

  updateBudget: (
    workspaceId: number,
    budgetId: number,
    payload: { name?: string; amount?: string; income_goal?: string; status?: string; change_reason?: string },
  ) =>
    apiClient.patch<typeof payload, PersonalBudgetDetail>(`/api/v1/personal/budgets/${budgetId}`, payload, {
      headers: workspaceHeaders(workspaceId),
    }),

  copyBudget: (
    workspaceId: number,
    budgetId: number,
    payload: { name?: string; start_date: string; end_date: string; status?: string },
    idempotencyKey: string,
  ) =>
    apiClient.post<typeof payload, PersonalBudgetDetail>(`/api/v1/personal/budgets/${budgetId}/copy`, payload, {
      headers: idempHeaders(workspaceId, idempotencyKey),
    }),

  evaluateBudgetAlerts: (workspaceId: number, budgetId: number) =>
    apiClient.post<object, BudgetAlertEvent[]>(
      `/api/v1/personal/budgets/${budgetId}/evaluate-alerts`,
      {},
      { headers: workspaceHeaders(workspaceId) },
    ),

  listLoans: (workspaceId: number, params?: { direction?: string; status?: string }) =>
    apiClient.get<LoanDetail[]>(`/api/v1/personal/loans${buildQueryString(params ?? {})}`, {
      headers: workspaceHeaders(workspaceId),
    }),

  getLoan: (workspaceId: number, loanId: number) =>
    apiClient.get<LoanDetail>(`/api/v1/personal/loans/${loanId}`, {
      headers: workspaceHeaders(workspaceId),
    }),

  openBorrowedLoan: (
    workspaceId: number,
    payload: {
      counterparty_name: string;
      principal: string;
      currency: string;
      start_date: string;
      due_date?: string;
      money_account_id?: number;
      is_opening_balance?: boolean;
      notes?: string;
    },
    idempotencyKey: string,
  ) =>
    apiClient.post<typeof payload, LoanDetail>("/api/v1/personal/commands/open-borrowed-loan", payload, {
      headers: idempHeaders(workspaceId, idempotencyKey),
    }),

  lendMoney: (
    workspaceId: number,
    payload: {
      counterparty_name: string;
      principal: string;
      currency: string;
      start_date: string;
      due_date?: string;
      money_account_id?: number;
      is_opening_balance?: boolean;
      notes?: string;
    },
    idempotencyKey: string,
  ) =>
    apiClient.post<typeof payload, LoanDetail>("/api/v1/personal/commands/lend-money", payload, {
      headers: idempHeaders(workspaceId, idempotencyKey),
    }),

  recordLoanRepayment: (
    workspaceId: number,
    payload: {
      loan_id: number;
      money_account_id: number;
      effective_date: string;
      total_amount: string;
      principal: string;
      interest: string;
      fee: string;
      notes?: string;
    },
    idempotencyKey: string,
  ) =>
    apiClient.post<typeof payload, LoanDetail>("/api/v1/personal/commands/record-loan-repayment", payload, {
      headers: idempHeaders(workspaceId, idempotencyKey),
    }),

  reverseLoanEvent: (workspaceId: number, loanId: number, eventId: number, reason: string) =>
    apiClient.post<{ reason: string }, LoanDetail>(
      `/api/v1/personal/loans/${loanId}/events/${eventId}/reverse`,
      { reason },
      { headers: workspaceHeaders(workspaceId) },
    ),

  listInvestments: (workspaceId: number) =>
    apiClient.get<InvestmentRecord[]>("/api/v1/personal/investments", {
      headers: workspaceHeaders(workspaceId),
    }),

  getInvestment: (workspaceId: number, id: number) =>
    apiClient.get<InvestmentDetail>(`/api/v1/personal/investments/${id}`, {
      headers: workspaceHeaders(workspaceId),
    }),

  createInvestment: (
    workspaceId: number,
    payload: { name: string; investment_type: string; institution_name?: string; currency: string; notes?: string },
    idempotencyKey: string,
  ) =>
    apiClient.post<typeof payload, InvestmentDetail>("/api/v1/personal/investments", payload, {
      headers: idempHeaders(workspaceId, idempotencyKey),
    }),

  recordInvestmentEvent: (
    workspaceId: number,
    payload: {
      investment_id: number;
      event_type: string;
      effective_date: string;
      amount: string;
      units_delta?: string;
      money_account_id?: number;
      notes?: string;
    },
    idempotencyKey: string,
  ) =>
    apiClient.post<typeof payload, InvestmentDetail>("/api/v1/personal/commands/record-investment-event", payload, {
      headers: idempHeaders(workspaceId, idempotencyKey),
    }),

  recordInvestmentValuation: (
    workspaceId: number,
    investmentId: number,
    payload: { valuation_date: string; value: string; source?: string; notes?: string },
  ) =>
    apiClient.post<typeof payload, InvestmentDetail>(`/api/v1/personal/investments/${investmentId}/valuations`, payload, {
      headers: workspaceHeaders(workspaceId),
    }),

  listAssets: (workspaceId: number) =>
    apiClient.get<PersonalAssetRecord[]>("/api/v1/personal/assets", {
      headers: workspaceHeaders(workspaceId),
    }),

  getAsset: (workspaceId: number, id: number) =>
    apiClient.get<AssetDetail>(`/api/v1/personal/assets/${id}`, {
      headers: workspaceHeaders(workspaceId),
    }),

  createAsset: (
    workspaceId: number,
    payload: { name: string; asset_type: string; currency: string; notes?: string },
    idempotencyKey: string,
  ) =>
    apiClient.post<typeof payload, AssetDetail>("/api/v1/personal/assets", payload, {
      headers: idempHeaders(workspaceId, idempotencyKey),
    }),

  acquireAsset: (
    workspaceId: number,
    payload: {
      asset_id: number;
      acquisition_date: string;
      cost: string;
      is_opening_asset?: boolean;
      money_account_id?: number;
      notes?: string;
    },
    idempotencyKey: string,
  ) =>
    apiClient.post<typeof payload, AssetDetail>("/api/v1/personal/commands/acquire-asset", payload, {
      headers: idempHeaders(workspaceId, idempotencyKey),
    }),

  disposeAsset: (
    workspaceId: number,
    payload: {
      asset_id: number;
      disposal_date: string;
      proceeds: string;
      disposal_costs?: string;
      money_account_id: number;
      counterparty_name?: string;
      notes?: string;
    },
    idempotencyKey: string,
  ) =>
    apiClient.post<typeof payload, AssetDetail>("/api/v1/personal/commands/dispose-asset", payload, {
      headers: idempHeaders(workspaceId, idempotencyKey),
    }),

  recordAssetValuation: (
    workspaceId: number,
    assetId: number,
    payload: { valuation_date: string; value: string; source?: string; notes?: string },
  ) =>
    apiClient.post<typeof payload, AssetDetail>(`/api/v1/personal/assets/${assetId}/valuations`, payload, {
      headers: workspaceHeaders(workspaceId),
    }),

  listOwnerTransfers: (workspaceId: number) =>
    apiClient.get<OwnerTransferGroup[]>("/api/v1/owner/owner-transfers", {
      headers: workspaceHeaders(workspaceId),
    }),

  transferBetweenSpaces: (
    workspaceId: number,
    payload: {
      from_workspace_id: number;
      to_workspace_id: number;
      from_money_account_id: number;
      to_money_account_id: number;
      purpose: string;
      amount: string;
      currency: string;
      effective_date: string;
      notes?: string;
      reference?: string;
    },
    idempotencyKey: string,
  ) =>
    apiClient.post<typeof payload, unknown>("/api/v1/owner/commands/transfer-between-spaces", payload, {
      headers: idempHeaders(workspaceId, idempotencyKey),
    }),

  getAllSummary: (workspaceId: number, params?: { from_date?: string; to_date?: string }) =>
    apiClient.get<AllOwnerSummary>(
      `/api/v1/owner/all-summary${buildQueryString(params ?? {})}`,
      { headers: workspaceHeaders(workspaceId) },
    ),
};
