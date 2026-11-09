// Money stays a string in the browser. The Go API is the only place that does
// arithmetic; this file only moves decimal strings and formats minor units.

import { apiClient, workspaceHeaders } from "./api.ts";
import { buildQueryString } from "./utils.ts";
import type {
  Budget,
  BudgetStatus,
  Contact,
  CustomerWallet,
  FinanceSummary,
  MoneyAccount,
  MoneyCategory,
  MoneyTransaction,
  TaxReadinessReport,
  TaxSettings,
  WalletTransaction,
} from "@/types/finance";

export type { MoneyAccount, MoneyCategory, MoneyTransaction } from "@/types/finance";

/** Insert thousands separators into a digit string without converting it to a number. */
export function groupDigitString(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Format a minor-unit amount without converting it through JavaScript arithmetic. */
export function formatMinorAmount(amount: number | string, currency: string, exponent: number): string {
  const raw = String(amount);
  if (!/^-?\d+$/.test(raw)) return `${currency} ${raw}`;
  const negative = raw.startsWith("-");
  const padded = (negative ? raw.slice(1) : raw).padStart(exponent + 1, "0");
  const whole = exponent === 0 ? padded : padded.slice(0, -exponent);
  const fraction = exponent === 0 ? "" : `.${padded.slice(-exponent)}`;
  return `${negative ? "-" : ""}${currency} ${groupDigitString(whole)}${fraction}`;
}

/** Allowed typing pattern for a major-unit amount in a currency with this exponent. */
export function moneyInputPattern(exponent: number): RegExp {
  return exponent > 0 ? new RegExp(`^\\d*(\\.\\d{0,${exponent}})?$`) : /^\d*$/;
}

interface WorkspaceScoped {
  workspaceId: number;
}

export interface CreateTransactionInput extends WorkspaceScoped {
  idempotencyKey: string;
  direction: MoneyTransaction["direction"];
  amount: string;
  currency: string;
  effective_date: string;
  money_account_id: number;
  destination_account_id?: number;
  category_id?: number;
  purpose: string;
  counterparty_name?: string;
  notes?: string;
  status?: "draft" | "posted";
}

export const moneyApi = {
  async listAccounts({ workspaceId }: WorkspaceScoped) {
    const result = await apiClient.get<{ accounts: MoneyAccount[] }>("/api/v1/accounts", {
      headers: workspaceHeaders(workspaceId),
    });
    return result.accounts;
  },
  async listCategories({ workspaceId, direction }: WorkspaceScoped & { direction?: string }) {
    const result = await apiClient.get<{ categories: MoneyCategory[] }>(
      `/api/v1/categories${buildQueryString({ direction })}`,
      { headers: workspaceHeaders(workspaceId) },
    );
    return result.categories;
  },
  async listTransactions({
    workspaceId,
    direction,
    status,
  }: WorkspaceScoped & { direction?: string; status?: string }) {
    const result = await apiClient.get<{ transactions: MoneyTransaction[] }>(
      `/api/v1/transactions${buildQueryString({ direction, status, limit: 50 })}`,
      { headers: workspaceHeaders(workspaceId) },
    );
    return result.transactions;
  },
  createTransaction({ workspaceId, idempotencyKey, ...body }: CreateTransactionInput) {
    return apiClient.post<typeof body, { transaction: MoneyTransaction }>("/api/v1/transactions", body, {
      headers: { ...workspaceHeaders(workspaceId), "Idempotency-Key": idempotencyKey },
    });
  },
  voidTransaction({
    workspaceId,
    idempotencyKey,
    id,
    reason,
  }: WorkspaceScoped & { idempotencyKey: string; id: number; reason: string }) {
    return apiClient.post<{ reason: string }, { transaction: MoneyTransaction }>(
      `/api/v1/transactions/${id}/void`,
      { reason },
      { headers: { ...workspaceHeaders(workspaceId), "Idempotency-Key": idempotencyKey } },
    );
  },
};

// ─── Workspace-scoped requests ────────────────────────────────────────

type QueryParams = Record<string, string | number | undefined>;

function scopedGet<T>(workspaceId: number, path: string, params: QueryParams = {}): Promise<T> {
  return apiClient.get<T>(`${path}${buildQueryString(params)}`, { headers: workspaceHeaders(workspaceId) });
}

function scopedPost<T>(workspaceId: number, path: string, body: unknown, idempotencyKey?: string): Promise<T> {
  return apiClient.post<unknown, T>(path, body, {
    headers: {
      ...workspaceHeaders(workspaceId),
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
  });
}

export const RECORD_PAGE_SIZE = 25;

export type RecordResource = "transactions" | "sales" | "purchases" | "payments" | "invoices";

/** One cursor page of a financial list; the server caps page size and date window. */
export async function listRecords<T>(
  workspaceId: number,
  resource: RecordResource,
  params: QueryParams = {},
): Promise<T[]> {
  const result = await scopedGet<Record<RecordResource, T[]>>(workspaceId, `/api/v1/${resource}`, {
    limit: RECORD_PAGE_SIZE,
    ...params,
  });
  return result[resource] ?? [];
}

export const financeApi = {
  summary: (workspaceId: number, params: QueryParams) =>
    scopedGet<FinanceSummary>(workspaceId, "/api/v1/reports/summary", params),

  createAccount: (workspaceId: number, body: unknown) => scopedPost(workspaceId, "/api/v1/accounts", body),
  createCategory: (workspaceId: number, body: unknown) => scopedPost(workspaceId, "/api/v1/categories", body),

  async listContacts(workspaceId: number, kind: "customers" | "suppliers") {
    const result = await scopedGet<Record<string, Contact[]>>(workspaceId, `/api/v1/${kind}`);
    return result[kind] ?? [];
  },
  createContact: (workspaceId: number, kind: "customers" | "suppliers", body: unknown) =>
    scopedPost(workspaceId, `/api/v1/${kind}`, body),

  createSale: (workspaceId: number, body: unknown, key: string) => scopedPost(workspaceId, "/api/v1/sales", body, key),
  createPurchase: (workspaceId: number, body: unknown, key: string) =>
    scopedPost(workspaceId, "/api/v1/purchases", body, key),
  createPayment: (workspaceId: number, body: unknown, key: string) =>
    scopedPost(workspaceId, "/api/v1/payments", body, key),

  createInvoice: (workspaceId: number, body: unknown, key: string) =>
    scopedPost(workspaceId, "/api/v1/invoices", body, key),
  finalizeInvoice: (workspaceId: number, id: number, key: string) =>
    scopedPost(workspaceId, `/api/v1/invoices/${id}/finalize`, {}, key),
  voidInvoice: (workspaceId: number, id: number, reason: string, key: string) =>
    scopedPost(workspaceId, `/api/v1/invoices/${id}/void`, { reason }, key),
  payInvoiceFromWallet: (workspaceId: number, id: number, amount: string, currency: string, key: string) =>
    scopedPost(workspaceId, `/api/v1/invoices/${id}/wallet-payment`, { amount, currency }, key),

  getWallet: (workspaceId: number, customerId: number, currency: string) =>
    scopedGet<CustomerWallet>(workspaceId, `/api/v1/customers/${customerId}/wallet`, { currency }),
  async listWalletLedger(workspaceId: number, customerId: number, before?: number) {
    const result = await scopedGet<{ ledger: WalletTransaction[] }>(
      workspaceId,
      `/api/v1/customers/${customerId}/wallet/ledger`,
      { limit: RECORD_PAGE_SIZE, before_id: before },
    );
    return result.ledger ?? [];
  },
  depositToWallet: (workspaceId: number, customerId: number, body: unknown, key: string) =>
    scopedPost(workspaceId, `/api/v1/customers/${customerId}/wallet/deposits`, body, key),

  listBudgets: (workspaceId: number) => scopedGet<Budget[]>(workspaceId, "/api/v1/budgets", { limit: 50 }),
  budgetStatus: (workspaceId: number, id: number) =>
    scopedGet<BudgetStatus>(workspaceId, `/api/v1/budgets/${id}/status`),
  createBudget: (workspaceId: number, body: unknown, key: string) =>
    scopedPost(workspaceId, "/api/v1/budgets", body, key),
  deleteBudget: (workspaceId: number, id: number) =>
    apiClient.delete(`/api/v1/budgets/${id}`, { headers: workspaceHeaders(workspaceId) }),

  taxReport: (workspaceId: number, params: QueryParams) =>
    scopedGet<TaxReadinessReport>(workspaceId, "/api/v1/reports/tax-readiness", params),
  taxSettings: (workspaceId: number) => scopedGet<TaxSettings>(workspaceId, "/api/v1/tax-settings"),
  updateTaxSettings: (workspaceId: number, body: unknown) =>
    apiClient.put(`/api/v1/tax-settings`, body, { headers: workspaceHeaders(workspaceId) }),
};

/** Query keys are always namespaced by workspace so one space can never render another's rows. */
export const moneyKeys = {
  all: ["money"] as const,
  workspace: (workspaceId: number) => ["money", workspaceId] as const,
  accounts: (workspaceId: number) => ["money", workspaceId, "accounts"] as const,
  categories: (workspaceId: number, direction: string) =>
    ["money", workspaceId, "categories", direction] as const,
  transactions: (workspaceId: number) => ["money", workspaceId, "transactions"] as const,
};
