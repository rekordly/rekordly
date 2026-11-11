// Money stays a string in the browser. The Go API is the only place that does
// arithmetic; this file only moves decimal strings and formats minor units.

import { apiClient, workspaceHeaders } from "./api.ts";
import { buildQueryString } from "./utils.ts";
import type {
  BankReconciliation,
  BankReconciliationMatch,
  Budget,
  BudgetStatus,
  Contact,
  CatalogueItem,
  InventoryBalance,
  InventoryOutlet,
  ProductOption,
  ProductVariant,
  StockReservation,
  StockTransfer,
  StockCount,
  StockAdjustment,
  PurchaseRequest,
  PurchaseOrder,
  ReceiptOptionLine,
  GoodsReceipt, SupplierBill, SupplierAdvance, SupplierReturn, SupplierReturnLineOption, ProcurementReport, SupplierBillMatch,
  Estimate,
  EstimateDetail,
  Invoice,
  PublicInvoiceView,
  PublicReceiptView,
  SalesReturn,
  CustomerCredit,
  CustomerCreditTransaction,
  CustomerWallet,
  FinanceSummary,
  MixedMoneyConfirmation,
  MixedMoneyReimbursementResult,
  MoneyAccount,
  MoneyCategory,
  MoneyRecordConfirmation,
  MoneyRecordDraft,
  MoneyRecordDraftLink,
  MoneyRecordPreview,
  MoneyTransaction,
  TaxReadinessReport,
  TaxSettings,
  WalletTransaction,
  EvidenceAsset,
  EvidenceAccess,
  EvidenceUploadAuthorization,
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

  confirmMixedExpense({
    activeWorkspaceId,
    idempotencyKey,
    ...body
  }: {
    activeWorkspaceId: number;
    idempotencyKey: string;
    personal_workspace_id: number;
    business_workspace_id: number;
    paying_workspace_id: number;
    paying_money_account_id: number;
    amount: string;
    personal_amount: string;
    business_amount: string;
    currency: string;
    effective_date: string;
    personal_category_id: number;
    business_category_id: number;
    description?: string;
    reference?: string;
  }) {
    return apiClient.post<typeof body, MixedMoneyConfirmation>("/api/v1/owner/commands/confirm-mixed-record", body, {
      headers: { ...workspaceHeaders(activeWorkspaceId), "Idempotency-Key": idempotencyKey },
    });
  },

  reimburseMixedExpense({
    activeWorkspaceId,
    groupId,
    idempotencyKey,
    ...body
  }: {
    activeWorkspaceId: number;
    groupId: string;
    idempotencyKey: string;
    from_workspace_id: number;
    to_workspace_id: number;
    from_money_account_id: number;
    to_money_account_id: number;
    amount: string;
    effective_date: string;
    expected_version: number;
    reference?: string;
  }) {
    return apiClient.post<typeof body, MixedMoneyReimbursementResult>(
      `/api/v1/owner/mixed-money-groups/${groupId}/commands/reimburse`,
      body,
      { headers: { ...workspaceHeaders(activeWorkspaceId), "Idempotency-Key": idempotencyKey } },
    );
  },

  createMoneyRecordDraft: (workspaceId: number, body: unknown) =>
    scopedPost<{ draft: MoneyRecordDraft }>(workspaceId, "/api/v1/money-record-drafts", body),
  listMoneyRecordDrafts: (workspaceId: number, state?: MoneyRecordDraft["state"]) =>
    scopedGet<{ drafts: MoneyRecordDraft[] }>(workspaceId, "/api/v1/money-record-drafts", { state, limit: 50 }),
  getMoneyRecordDraft: (workspaceId: number, draftId: string) =>
    scopedGet<{ draft: MoneyRecordDraft; links: MoneyRecordDraftLink[]; evidence: EvidenceAsset[] }>(workspaceId, `/api/v1/money-record-drafts/${draftId}`),
  updateMoneyRecordDraft: (workspaceId: number, draftId: string, body: unknown) =>
    apiClient.put<unknown, { draft: MoneyRecordDraft }>(`/api/v1/money-record-drafts/${draftId}`, body, {
      headers: workspaceHeaders(workspaceId),
    }),
  async previewMoneyRecordDraft(workspaceId: number, draftId: string) {
    const result = await scopedPost<{ preview: MoneyRecordPreview }>(workspaceId, `/api/v1/money-record-drafts/${draftId}/preview`, {});
    // The API contract uses arrays. Normalizing at the transport boundary also
    // protects a deployed web client from older API containers that sent null.
    return {
      preview: {
        ...result.preview,
        accounting_effects: Array.isArray(result.preview.accounting_effects) ? result.preview.accounting_effects : [],
        warnings: Array.isArray(result.preview.warnings) ? result.preview.warnings : [],
      },
    };
  },
  confirmMoneyRecord: (workspaceId: number, draftId: string, expectedVersion: number, key: string) =>
    scopedPost<MoneyRecordConfirmation>(workspaceId, "/api/v1/commands/confirm-money-record", { draft_id: Number(draftId), expected_version: expectedVersion }, key),
  createMoneyRecordDraftLink: (workspaceId: number, draftId: string, body: unknown) =>
    scopedPost(workspaceId, `/api/v1/money-record-drafts/${draftId}/links`, body),
  authorizeEvidenceUpload: (workspaceId: number, draftId: string, body: { file_name: string; mime_type: string; size_bytes: string }) =>
    scopedPost<{ upload: EvidenceUploadAuthorization }>(workspaceId, `/api/v1/money-record-drafts/${draftId}/attachments/upload-authorizations`, body),
  registerEvidenceAsset: (workspaceId: number, draftId: string, body: { asset_id: string; file_name: string; size_bytes: string; mime_type: string; sha256_hash?: string }) =>
    scopedPost<{ evidence: EvidenceAsset }>(workspaceId, `/api/v1/money-record-drafts/${draftId}/evidence`, body),
  getEvidenceAccess: (workspaceId: number, evidenceId: string) =>
    scopedGet<{ access: EvidenceAccess }>(workspaceId, `/api/v1/evidence/${evidenceId}/access`),
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

function scopedPatch<T>(workspaceId: number, path: string, body: unknown): Promise<T> {
  return apiClient.patch<unknown, T>(path, body, { headers: workspaceHeaders(workspaceId) });
}

function scopedPut<T>(workspaceId: number, path: string, body: unknown): Promise<T> {
  return apiClient.put<unknown, T>(path, body, { headers: workspaceHeaders(workspaceId) });
}

export const RECORD_PAGE_SIZE = 25;

export type RecordResource = "transactions" | "sales" | "purchases" | "payments" | "invoices" | "estimates";

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
  getContact: (workspaceId: number, kind: "customers" | "suppliers", id: number) =>
    scopedGet<{ customer?: Contact; supplier?: Contact; wallet?: CustomerWallet; invoices?: Invoice[]; sales?: unknown[]; purchases?: unknown[] }>(
      workspaceId,
      `/api/v1/${kind}/${id}`,
    ).then((r) => r.customer || r.supplier || null),
  getCustomerDetail: (workspaceId: number, id: number) =>
    scopedGet<{
      customer: Contact;
      wallet: CustomerWallet | null;
      invoices: Invoice[];
      sales: Array<{ id: number; total_amount_minor: number; paid_amount_minor: number; status: string; sale_date: { Time: string }; reference?: { String: string } }>;
    }>(workspaceId, `/api/v1/customers/${id}`),
  getCustomerStatement: (workspaceId: number, id: number, params: QueryParams = {}) =>
    scopedGet<{
      statement: {
        customer: Contact;
        invoices: Invoice[];
        wallet_txs: WalletTransaction[];
        as_of_date: string;
      };
    }>(workspaceId, `/api/v1/customers/${id}/statement`, params).then((r) => r.statement),
  createContact: (workspaceId: number, kind: "customers" | "suppliers", body: unknown) =>
    scopedPost(workspaceId, `/api/v1/${kind}`, body),

  async listCatalogueItems(workspaceId: number, params: QueryParams = {}) {
    const result = await scopedGet<{ items: CatalogueItem[] }>(workspaceId, "/api/v1/catalogue/items", { limit: 50, ...params });
    return result.items ?? [];
  },
  createCatalogueItem: (workspaceId: number, body: unknown, key: string) =>
    scopedPost(workspaceId, "/api/v1/catalogue/items", body, key),
  async listInventoryBalances(workspaceId: number) {
    const result = await scopedGet<{ balances: InventoryBalance[] }>(workspaceId, "/api/v1/inventory/balances");
    return result.balances ?? [];
  },
  createOpeningStock: (workspaceId: number, body: unknown, key: string) =>
    scopedPost<{ balance: InventoryBalance }>(workspaceId, "/api/v1/inventory/opening-stock", body, key),
  createInventoryAdjustment: (workspaceId: number, body: unknown, key: string) => scopedPost(workspaceId, "/api/v1/inventory/adjustments", body, key),
  createInventoryTransfer: (workspaceId: number, body: unknown, key: string) => scopedPost(workspaceId, "/api/v1/inventory/transfers", body, key),
  createStockCount: (workspaceId: number, body: unknown, key: string) => scopedPost(workspaceId, "/api/v1/inventory/counts", body, key),

  async listOutlets(workspaceId: number, params: QueryParams = {}) {
    const result = await scopedGet<{ locations: InventoryOutlet[] }>(workspaceId, "/api/v1/inventory/locations", params);
    return result.locations ?? [];
  },
  createOutlet: (workspaceId: number, body: unknown) =>
    scopedPost<{ location: InventoryOutlet }>(workspaceId, "/api/v1/inventory/locations", body),
  updateOutlet: (workspaceId: number, id: number, body: unknown) =>
    scopedPatch<{ location: InventoryOutlet }>(workspaceId, `/api/v1/inventory/locations/${id}`, body),

  async listProductOptions(workspaceId: number, productId: number) {
    const result = await scopedGet<{ options: ProductOption[] }>(workspaceId, `/api/v1/catalogue/items/${productId}/options`);
    return result.options ?? [];
  },
  createProductOption: (workspaceId: number, productId: number, body: unknown) =>
    scopedPost<{ option: ProductOption }>(workspaceId, `/api/v1/catalogue/items/${productId}/options`, body),
  async listProductVariants(workspaceId: number, productId: number) {
    const result = await scopedGet<{ variants: ProductVariant[] }>(workspaceId, `/api/v1/catalogue/items/${productId}/variants`);
    return result.variants ?? [];
  },
  createProductVariant: (workspaceId: number, productId: number, body: unknown) =>
    scopedPost<{ variant: ProductVariant }>(workspaceId, `/api/v1/catalogue/items/${productId}/variants`, body),
  updateProductVariant: (workspaceId: number, productId: number, variantId: number, body: unknown) =>
    scopedPatch<{ variant: ProductVariant }>(workspaceId, `/api/v1/catalogue/items/${productId}/variants/${variantId}`, body),

  async listStockReservations(workspaceId: number, params: QueryParams = {}) {
    const result = await scopedGet<{ reservations: StockReservation[] }>(workspaceId, "/api/v1/inventory/reservations", params);
    return result.reservations ?? [];
  },
  createStockReservation: (workspaceId: number, body: unknown, key: string) =>
    scopedPost<{ reservation: StockReservation }>(workspaceId, "/api/v1/inventory/reservations", body, key),
  releaseStockReservation: (workspaceId: number, id: number) =>
    scopedPost<{ reservation: StockReservation }>(workspaceId, `/api/v1/inventory/reservations/${id}/release`, {}),
  issueSaleStock: (workspaceId: number, body: unknown, key: string) =>
    scopedPost<{ balance: InventoryBalance; cogs_minor: number; ledger_entry_id: number }>(workspaceId, "/api/v1/inventory/issue-sale", body, key),

  async listStockTransfers(workspaceId: number, params: QueryParams = {}) {
    const result = await scopedGet<{ transfers: StockTransfer[] }>(workspaceId, "/api/v1/inventory/transfers", params);
    return result.transfers ?? [];
  },
  getStockTransfer: (workspaceId: number, id: number) =>
    scopedGet<{ transfer: StockTransfer }>(workspaceId, `/api/v1/inventory/transfers/${id}`),
  createStockTransfer: (workspaceId: number, body: unknown, key: string) =>
    scopedPost<{ transfer: StockTransfer }>(workspaceId, "/api/v1/inventory/transfers", body, key),
  dispatchStockTransfer: (workspaceId: number, id: number, body: unknown) =>
    scopedPost<{ transfer: StockTransfer }>(workspaceId, `/api/v1/inventory/transfers/${id}/dispatch`, body),
  receiveStockTransfer: (workspaceId: number, id: number, body: unknown) =>
    scopedPost<{ transfer: StockTransfer }>(workspaceId, `/api/v1/inventory/transfers/${id}/receive`, body),

  async listStockCounts(workspaceId: number, params: QueryParams = {}) {
    const result = await scopedGet<{ counts: StockCount[] }>(workspaceId, "/api/v1/inventory/counts", params);
    return result.counts ?? [];
  },
  getStockCount: (workspaceId: number, id: number) =>
    scopedGet<{ count: StockCount }>(workspaceId, `/api/v1/inventory/counts/${id}`),
  startStockCount: (workspaceId: number, body: unknown, key: string) =>
    scopedPost<{ count: StockCount }>(workspaceId, "/api/v1/inventory/counts", body, key),
  recordStockCountLines: (workspaceId: number, id: number, body: unknown) =>
    scopedPut<{ count: StockCount }>(workspaceId, `/api/v1/inventory/counts/${id}/lines`, body),
  approveStockCount: (workspaceId: number, id: number, body: unknown) =>
    scopedPost<{ count: StockCount }>(workspaceId, `/api/v1/inventory/counts/${id}/approve`, body),

  async listStockAdjustments(workspaceId: number, params: QueryParams = {}) {
    const result = await scopedGet<{ adjustments: StockAdjustment[] }>(workspaceId, "/api/v1/inventory/adjustments", params);
    return result.adjustments ?? [];
  },
  getStockAdjustment: (workspaceId: number, id: number) =>
    scopedGet<{ adjustment: StockAdjustment }>(workspaceId, `/api/v1/inventory/adjustments/${id}`),
  createStockAdjustment: (workspaceId: number, body: unknown, key: string) =>
    scopedPost<{ adjustment: StockAdjustment }>(workspaceId, "/api/v1/inventory/adjustments", body, key),

  async listPurchaseRequests(workspaceId: number, params: QueryParams = {}) {
    const result = await scopedGet<{ requests: PurchaseRequest[] }>(workspaceId, "/api/v1/purchase-requests", { limit: 50, ...params });
    return result.requests ?? [];
  },
  createPurchaseRequest: (workspaceId: number, body: unknown, key: string) =>
    scopedPost<{ request: PurchaseRequest }>(workspaceId, "/api/v1/purchase-requests", body, key),
  submitPurchaseRequest: (workspaceId: number, id: number, expectedVersion: number, key: string) =>
    scopedPost<{ request: PurchaseRequest }>(workspaceId, `/api/v1/purchase-requests/${id}/commands/submit`, { expected_version: expectedVersion }, key),
  approvePurchaseRequest: (workspaceId: number, id: number, expectedVersion: number, key: string) =>
    scopedPost<{ request: PurchaseRequest }>(workspaceId, `/api/v1/purchase-requests/${id}/commands/approve`, { expected_version: expectedVersion }, key),
  rejectPurchaseRequest: (workspaceId: number, id: number, expectedVersion: number, reason: string, key: string) =>
    scopedPost<{ request: PurchaseRequest }>(workspaceId, `/api/v1/purchase-requests/${id}/commands/reject`, { expected_version: expectedVersion, reason }, key),
  requestPurchaseRequestChanges: (workspaceId: number, id: number, expectedVersion: number, reason: string, key: string) =>
    scopedPost<{ request: PurchaseRequest }>(workspaceId, `/api/v1/purchase-requests/${id}/commands/request-changes`, { expected_version: expectedVersion, reason }, key),
  cancelPurchaseRequest: (workspaceId: number, id: number, expectedVersion: number, reason: string, key: string) =>
    scopedPost<{ request: PurchaseRequest }>(workspaceId, `/api/v1/purchase-requests/${id}/commands/cancel`, { expected_version: expectedVersion, reason }, key),
  async listPurchaseOrders(workspaceId: number, params: QueryParams = {}) {
    const result = await scopedGet<{ orders: PurchaseOrder[] }>(workspaceId, "/api/v1/purchase-orders", { limit: 50, ...params });
    return result.orders ?? [];
  },
  getPurchaseOrder: (workspaceId: number, id: number) => scopedGet<{ order: PurchaseOrder }>(workspaceId, `/api/v1/purchase-orders/${id}`).then((result) => result.order),
  createPurchaseOrderShare: (workspaceId: number, id: number, body: { supplier_email?: string; expires_in_days?: number }, key: string) =>
    scopedPost<{ share: { token: string; expires_at: string; status: string }; order: PurchaseOrder }>(workspaceId, `/api/v1/purchase-orders/${id}/share`, body, key),
  createPurchaseOrder: (workspaceId: number, purchaseRequestId: number, key: string) =>
    scopedPost<{ order: PurchaseOrder }>(workspaceId, "/api/v1/purchase-orders", { purchase_request_id: purchaseRequestId }, key),
  advancePurchaseOrder: (
    workspaceId: number,
    id: number,
    expectedVersion: number,
    command: "submitted" | "approved" | "issued",
    key: string,
  ) =>
    scopedPost<{ order: PurchaseOrder }>(workspaceId, `/api/v1/purchase-orders/${id}/commands/${command}`, { expected_version: expectedVersion }, key),
  resolvePurchaseOrder: (workspaceId: number, id: number, expectedVersion: number, command: "cancel" | "cancel_remainder" | "close", reason: string, key: string) =>
    scopedPost<{ order: PurchaseOrder }>(workspaceId, `/api/v1/purchase-orders/${id}/commands/${command}`, { expected_version: expectedVersion, reason }, key),
  receiptOptions: async (workspaceId: number, purchaseOrderId: number) => {
    const result = await scopedGet<{ lines: ReceiptOptionLine[] }>(workspaceId, `/api/v1/purchase-orders/${purchaseOrderId}/receipt-options`);
    return result.lines ?? [];
  },
  createGoodsReceipt: (workspaceId: number, body: unknown, key: string) => scopedPost(workspaceId, "/api/v1/goods-receipts", body, key),
  async listGoodsReceipts(workspaceId:number){const r=await scopedGet<{receipts:GoodsReceipt[]}>(workspaceId,"/api/v1/goods-receipts");return r.receipts??[]},
  getGoodsReceipt: (workspaceId: number, id: number) => scopedGet<{ receipt: GoodsReceipt }>(workspaceId, `/api/v1/goods-receipts/${id}`).then((result) => result.receipt),
  async listSupplierBills(workspaceId:number){const r=await scopedGet<{bills:SupplierBill[]}>(workspaceId,"/api/v1/supplier-bills");return r.bills??[]},
  createSupplierBill:(workspaceId:number,body:unknown,key:string)=>scopedPost<{bill:SupplierBill}>(workspaceId,"/api/v1/supplier-bills",body,key),
  approveSupplierBill:(workspaceId:number,id:number,expectedVersion:number,key:string)=>scopedPost<{bill:SupplierBill}>(workspaceId,`/api/v1/supplier-bills/${id}/commands/approve`,{expected_version:expectedVersion},key),
  supplierBillMatch: (workspaceId: number, id: number) => scopedGet<SupplierBillMatch>(workspaceId, `/api/v1/supplier-bills/${id}/match`),
  async listSupplierAdvances(workspaceId: number) {
    const result = await scopedGet<{ advances: SupplierAdvance[] }>(workspaceId, "/api/v1/supplier-advances", { limit: 50 });
    return result.advances ?? [];
  },
  createSupplierAdvance: (workspaceId: number, body: unknown, key: string) =>
    scopedPost<{ advance: SupplierAdvance }>(workspaceId, "/api/v1/supplier-advances", body, key),
  applySupplierAdvance: (workspaceId: number, advanceId: number, body: unknown, key: string) =>
    scopedPost(workspaceId, `/api/v1/supplier-advances/${advanceId}/commands/apply`, body, key),
  async listSupplierReturns(workspaceId: number) {
    const result = await scopedGet<{ returns: SupplierReturn[] }>(workspaceId, "/api/v1/supplier-returns");
    return result.returns ?? [];
  },
  async listReturnOptions(workspaceId: number, receiptId: number) {
    const result = await scopedGet<{ lines: SupplierReturnLineOption[] }>(workspaceId, `/api/v1/goods-receipts/${receiptId}/return-options`);
    return result.lines ?? [];
  },
  createSupplierReturn: (workspaceId: number, body: unknown, key: string) => scopedPost<{ return: SupplierReturn }>(workspaceId, "/api/v1/supplier-returns", body, key),
  createSupplierCredit: (workspaceId: number, body: unknown, key: string) => scopedPost(workspaceId, "/api/v1/supplier-credits", body, key),
  createSupplierRefund: (workspaceId: number, body: unknown, key: string) => scopedPost(workspaceId, "/api/v1/supplier-refunds", body, key),
  procurementReport: (workspaceId: number, asOf?: string) => scopedGet<ProcurementReport>(workspaceId, "/api/v1/reports/procurement", asOf ? { as_of: asOf } : {}),

  createSale: (workspaceId: number, body: unknown, key: string) => scopedPost(workspaceId, "/api/v1/sales", body, key),
  createPurchase: (workspaceId: number, body: unknown, key: string) =>
    scopedPost(workspaceId, "/api/v1/purchases", body, key),
  createPayment: (workspaceId: number, body: unknown, key: string) =>
    scopedPost(workspaceId, "/api/v1/payments", body, key),

  createInvoice: (workspaceId: number, body: unknown, key: string) =>
    scopedPost(workspaceId, "/api/v1/invoices", body, key),
  getInvoice: (workspaceId: number, id: number) =>
    scopedGet<{ invoice: Invoice & { items: { description: string; quantity: string; unit_price_minor: number; currency_exponent: number }[] } }>(
      workspaceId,
      `/api/v1/invoices/${id}`,
    ).then((r) => r.invoice),
  finalizeInvoice: (workspaceId: number, id: number, key: string) =>
    scopedPost(workspaceId, `/api/v1/invoices/${id}/finalize`, {}, key),
  voidInvoice: (workspaceId: number, id: number, reason: string, key: string) =>
    scopedPost(workspaceId, `/api/v1/invoices/${id}/void`, { reason }, key),
  payInvoiceFromWallet: (workspaceId: number, id: number, amount: string, currency: string, key: string) =>
    scopedPost(workspaceId, `/api/v1/invoices/${id}/wallet-payment`, { amount, currency }, key),
  createInvoiceShare: (workspaceId: number, invoiceId: number, expiryDays?: number) =>
    scopedPost<{ share_url: string; token: string; expires_at: string }>(workspaceId, `/api/v1/invoices/${invoiceId}/shares`, { expiry_days: expiryDays }),
  getPublicInvoice: (token: string) =>
    apiClient.get<{ invoice_view: PublicInvoiceView }>(`/api/v1/public/invoices/${token}`).then((r) => r.invoice_view),
  createPaymentReceipt: (workspaceId: number, paymentId: number) =>
    scopedPost<{ receipt_url: string; token: string; receipt: unknown }>(workspaceId, `/api/v1/payments/${paymentId}/receipt`, {}),
  getPublicReceipt: (token: string) =>
    apiClient.get<{ receipt_view: PublicReceiptView }>(`/api/v1/public/receipts/${token}`).then((r) => r.receipt_view),

  async listEstimates(workspaceId: number, params: QueryParams = {}) {
    const result = await scopedGet<{ estimates: Estimate[] }>(workspaceId, "/api/v1/estimates", { limit: 50, ...params });
    return result.estimates ?? [];
  },
  getEstimate: (workspaceId: number, id: number) =>
    scopedGet<{ estimate: EstimateDetail }>(workspaceId, `/api/v1/estimates/${id}`).then((r) => r.estimate),
  createEstimate: (workspaceId: number, body: unknown, key: string) =>
    scopedPost<{ estimate: EstimateDetail }>(workspaceId, "/api/v1/estimates", body, key),
  updateEstimateStatus: (workspaceId: number, id: number, status: string) =>
    scopedPatch<{ estimate: EstimateDetail }>(workspaceId, `/api/v1/estimates/${id}/status`, { status }),
  convertEstimateToInvoice: (workspaceId: number, id: number, key: string) =>
    scopedPost<{ invoice: unknown; message: string }>(workspaceId, `/api/v1/estimates/${id}/convert-to-invoice`, {}, key),

  async listSalesReturns(workspaceId: number, params: QueryParams = {}) {
    const result = await scopedGet<{ sales_returns: SalesReturn[] }>(workspaceId, "/api/v1/sales-returns", { limit: 50, ...params });
    return result.sales_returns ?? [];
  },
  getSalesReturn: (workspaceId: number, id: number) =>
    scopedGet<{ sales_return: SalesReturn }>(workspaceId, `/api/v1/sales-returns/${id}`).then((r) => r.sales_return),
  createSalesReturn: (workspaceId: number, body: unknown, key: string) =>
    scopedPost<{ sales_return: SalesReturn }>(workspaceId, "/api/v1/sales-returns", body, key),
  getCustomerCredit: (workspaceId: number, customerId: number, currency = "NGN") =>
    scopedGet<{ customer_credit: { credit: CustomerCredit | null; transactions: CustomerCreditTransaction[] } }>(
      workspaceId,
      `/api/v1/customers/${customerId}/credit`,
      { currency },
    ).then((r) => r.customer_credit),
  applyCustomerCredit: (workspaceId: number, customerId: number, invoiceId: number, amountMinor: number) =>
    scopedPost<{ invoice: unknown; message: string }>(workspaceId, `/api/v1/customers/${customerId}/credit/apply`, {
      invoice_id: invoiceId,
      amount_minor: amountMinor,
    }),

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

  importCSVTransactions: (
    workspaceId: number,
    body: { default_account_id?: number; rows: Array<{ date: string; description: string; amount: string; direction: string; reference?: string; account_id?: number; category_id?: number }> },
  ) =>
    scopedPost<{ imported_count: number; drafts: unknown[] }>(workspaceId, "/api/v1/transactions/import-csv", body),

  async listReconciliations(workspaceId: number, accountId?: number) {
    const result = await scopedGet<{ reconciliations: BankReconciliation[] }>(
      workspaceId,
      "/api/v1/reconciliations",
      accountId ? { account_id: accountId } : {},
    );
    return result.reconciliations ?? [];
  },
  startReconciliation: (
    workspaceId: number,
    body: { money_account_id: number; statement_date: string; statement_balance_minor: number; notes?: string },
  ) => scopedPost<{ reconciliation: BankReconciliation }>(workspaceId, "/api/v1/reconciliations", body),
  getReconciliation: (workspaceId: number, id: number) =>
    scopedGet<{ reconciliation: BankReconciliation; matches: BankReconciliationMatch[] }>(
      workspaceId,
      `/api/v1/reconciliations/${id}`,
    ),
  matchReconciliationTransaction: (workspaceId: number, reconId: number, transactionId: number) =>
    scopedPost<{ match: BankReconciliationMatch }>(workspaceId, `/api/v1/reconciliations/${reconId}/commands/match`, {
      transaction_id: transactionId,
    }),
  unmatchReconciliationTransaction: (workspaceId: number, reconId: number, transactionId: number) =>
    scopedPost<{ unmatched: boolean }>(workspaceId, `/api/v1/reconciliations/${reconId}/commands/unmatch`, {
      transaction_id: transactionId,
    }),
  completeReconciliation: (workspaceId: number, reconId: number) =>
    scopedPost<{ reconciliation: BankReconciliation }>(workspaceId, `/api/v1/reconciliations/${reconId}/commands/complete`, {}),
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
