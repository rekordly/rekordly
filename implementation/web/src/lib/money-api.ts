import { apiClient } from "./api";
import type { MoneyAccount, MoneyCategory, MoneyTransaction } from "@/types/finance";

export type { MoneyAccount, MoneyCategory, MoneyTransaction } from "@/types/finance";

interface WorkspaceOptions { workspaceId: number }

function workspaceHeaders(workspaceId: number) {
  return { "X-Workspace-ID": String(workspaceId) };
}

function queryString(params: Record<string, string | number | undefined>) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => { if (value !== undefined && value !== "") query.set(key, String(value)); });
  const value = query.toString();
  return value ? `?${value}` : "";
}

export const moneyApi = {
  async listAccounts({ workspaceId }: WorkspaceOptions) {
    const result = await apiClient.get<{ accounts: MoneyAccount[] }>("/api/v1/accounts", { headers: workspaceHeaders(workspaceId) });
    return result.accounts;
  },
  async listCategories({ workspaceId, direction }: WorkspaceOptions & { direction?: string }) {
    const result = await apiClient.get<{ categories: MoneyCategory[] }>(`/api/v1/categories${queryString({ direction })}`, { headers: workspaceHeaders(workspaceId) });
    return result.categories;
  },
  async listTransactions({ workspaceId, direction, status }: WorkspaceOptions & { direction?: string; status?: string }) {
    const result = await apiClient.get<{ transactions: MoneyTransaction[] }>(`/api/v1/transactions${queryString({ direction, status, limit: 50 })}`, { headers: workspaceHeaders(workspaceId) });
    return result.transactions;
  },
  async createTransaction(input: {
    workspaceId: number;
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
  }) {
    const { workspaceId, ...body } = input;
    const result = await apiClient.post<typeof body, { transaction: MoneyTransaction }>("/api/v1/transactions", body, {
      headers: { ...workspaceHeaders(workspaceId), "Idempotency-Key": `web-${crypto.randomUUID()}` },
    });
    return result;
  },
  async voidTransaction(workspaceId: number, id: number, reason: string) {
    return apiClient.post<{ reason: string }, { transaction: MoneyTransaction }>(`/api/v1/transactions/${id}/void`, { reason }, { headers: workspaceHeaders(workspaceId) });
  },
};

