// Money stays a string in the browser. The Go API is the only place that does
// arithmetic; this file only moves decimal strings and formats minor units.

import { apiClient, workspaceHeaders } from "./api.ts";
import { buildQueryString } from "./utils.ts";
import type {
  BankLine,
  BankReconDetail,
  BankReconciliation,
  BankReconciliationMatch,
  Budget,
  BudgetStatus,
  Contact,
  CatalogueItem,
  InventoryBalance,
  InventoryOutlet,
  OnboardingChecklist,
  ProductOption,
  ProductVariant,
  StockReservation,
  StockTransfer,
  StockCount,
  StockAdjustment,
  Purchase,
  PurchaseRequest,
  PurchaseOrder,
  PurchaseOrderVersion,
  ReceiptOptionLine,
  GoodsReceipt, SupplierBill, SupplierAdvance, SupplierReturn, SupplierReturnLineOption, SupplierCredit, SupplierRefund, ProcurementApprovalPolicy, ProcurementAttachment, ProcurementReport, SupplierBillMatch,
  Estimate,
  EstimateDetail,
  DebitNote,
  DebitNoteDetail,
  DocumentFileView,
  DocumentVersion,
  ExternalMessage,
  ExternalPartyLink,
  ExternalPaymentEvidence,
  Invoice,
  InvoiceDetail,
  PaymentDetail,
  PublicEstimateView,
  PublicInvoiceView,
  PublicReceiptView,
  PublicStatementView,
  PurchaseOrderShareView,
  Storefront,
  StorefrontDesign,
  StorefrontCollection,
  MerchantStorefrontProduct,
  StorefrontProductCard,
  StorefrontDomain,
  StorefrontAnalytics,
  StorefrontOverview,
  PublicStorefrontProjection,
  PublicStorefrontProduct,
  ValidatedCart,
  GuestCheckoutConfirmation,
  PublicOrderStatus,
  MerchantOrder,
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
  WorkspaceInvitationRow,
  WorkspaceMemberRow,
  WorkspaceNotification,
  WorkspaceProfileSettings,
  WorkspaceRoleRow,
  EvidenceAsset,
  EvidenceAccess,
  EvidenceUploadAuthorization,
} from "@/types/finance";
import type { Product } from "@/types/products";

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

export type RecordResource =
  | "transactions"
  | "sales"
  | "purchases"
  | "payments"
  | "invoices"
  | "estimates"
  | "purchase-requests"
  | "purchase-orders"
  | "goods-receipts"
  | "supplier-bills";

/** One cursor page of a financial list; the server caps page size and date window. */
export async function listRecords<T>(
  workspaceId: number,
  resource: RecordResource,
  params: QueryParams = {},
): Promise<T[]> {
  const result = await scopedGet<Record<string, T[]>>(workspaceId, `/api/v1/${resource}`, {
    limit: RECORD_PAGE_SIZE,
    ...params,
  });
  return (
    result[resource] ??
    result.items ??
    (result as Record<string, T[]>).requests ??
    (result as Record<string, T[]>).orders ??
    (result as Record<string, T[]>).receipts ??
    (result as Record<string, T[]>).bills ??
    []
  );
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
      currency: string;
      wallet: CustomerWallet | null;
      credit: CustomerCredit | null;
      invoices: Invoice[];
      sales: Array<{ id: number; customer_name: string; total_amount_minor: number; paid_amount_minor: number; currency: string; currency_exponent: number; status: string; sale_date: string; reference?: string | null }>;
    }>(workspaceId, `/api/v1/customers/${id}`),
  getSupplierDetail: (workspaceId: number, id: number) =>
    scopedGet<{
      supplier: Contact;
      purchases: Array<{ id: number; supplier_name: string; total_amount_minor: number; paid_amount_minor: number; currency: string; currency_exponent: number; status: string; purchase_date: string; reference?: string | null }>;
    }>(workspaceId, `/api/v1/suppliers/${id}`),
  getCustomerStatement: (workspaceId: number, id: number, params: QueryParams = {}) =>
    scopedGet<{
      statement: {
        customer: Contact;
        opening_balance_minor?: number;
        opening_balance_entry?: { description: string; amount_minor: number | string; date: string } | null;
        invoices: Invoice[];
        sales: Array<{ id: number; total_amount_minor: number; paid_amount_minor: number; currency: string; currency_exponent: number; status: string; sale_date: string; reference?: string | null }>;
        wallet_txs: WalletTransaction[];
        from_date?: string;
        as_of_date: string;
      };
    }>(workspaceId, `/api/v1/customers/${id}/statement`, params).then((r) => r.statement),
  createContact: (workspaceId: number, kind: "customers" | "suppliers", body: unknown) =>
    scopedPost(workspaceId, `/api/v1/${kind}`, body),
  updateContact: (workspaceId: number, kind: "customers" | "suppliers", id: number, body: unknown) =>
    scopedPatch<{ customer?: Contact; supplier?: Contact }>(workspaceId, `/api/v1/${kind}/${id}`, body),
  mergeContacts: (workspaceId: number, sourceId: number, targetId: number) =>
    scopedPost<{ counterparty: Contact }>(workspaceId, "/api/v1/counterparties/merge", { source_id: sourceId, target_id: targetId }),
  checkDuplicateContacts: (workspaceId: number, params: { name?: string; email?: string; phone?: string }) =>
    scopedGet<{ matches: Contact[] }>(workspaceId, "/api/v1/counterparties/check-duplicates", params).then((r) => r.matches ?? []),

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
  getPurchaseRequest: (workspaceId: number, id: number) =>
    scopedGet<{ request: PurchaseRequest }>(workspaceId, `/api/v1/purchase-requests/${id}`).then((r) => r.request),
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
  createDirectPurchaseOrder: (workspaceId: number, body: unknown, key: string) =>
    scopedPost<{ order: PurchaseOrder }>(workspaceId, "/api/v1/purchase-orders", body, key),
  updatePurchaseOrderDraft: (workspaceId: number, id: number, body: unknown) =>
    scopedPatch<{ order: PurchaseOrder }>(workspaceId, `/api/v1/purchase-orders/${id}`, body),
  duplicatePurchaseOrder: (workspaceId: number, id: number, key: string) =>
    scopedPost<{ order: PurchaseOrder }>(workspaceId, `/api/v1/purchase-orders/${id}/duplicate`, {}, key),
  revisePurchaseOrder: (workspaceId: number, id: number, body: unknown, key: string) =>
    scopedPost<{ order: PurchaseOrder }>(workspaceId, `/api/v1/purchase-orders/${id}/revise`, body, key),
  async listPurchaseOrderVersions(workspaceId: number, id: number) {
    const res = await scopedGet<{ versions: PurchaseOrderVersion[] }>(workspaceId, `/api/v1/purchase-orders/${id}/versions`);
    return res.versions ?? [];
  },
  issuePurchaseOrder: (
    workspaceId: number,
    id: number,
    body: { share?: boolean; force_new_link?: boolean } = {},
    key: string,
  ) =>
    scopedPost<{
      order: PurchaseOrder;
      stopped_at?: string;
      message?: string;
      share?: { token: string; url: string; expires_at: string };
    }>(workspaceId, `/api/v1/purchase-orders/${id}/commands/issue`, body, key),
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
  createGoodsReceipt: (workspaceId: number, body: unknown, key: string) =>
    scopedPost<{ receipt: GoodsReceipt; bill?: SupplierBill; payment?: PaymentDetail }>(workspaceId, "/api/v1/goods-receipts", body, key),
  async listGoodsReceipts(workspaceId: number, params: QueryParams = {}) {
    const r = await scopedGet<{ receipts?: GoodsReceipt[]; items?: GoodsReceipt[]; next_before_id?: number }>(
      workspaceId,
      "/api/v1/goods-receipts",
      { limit: 50, ...params },
    );
    return r.receipts ?? r.items ?? [];
  },
  getGoodsReceipt: (workspaceId: number, id: number) => scopedGet<{ receipt: GoodsReceipt }>(workspaceId, `/api/v1/goods-receipts/${id}`).then((result) => result.receipt),
  payGoodsReceipt: (
    workspaceId: number,
    id: number,
    body: {
      account_id?: number;
      amount?: string;
      payment_date: string;
      reference?: string;
      legs?: Array<{ money_account_id: number; amount: string }>;
      payment_legs?: Array<{ money_account_id: number; amount: string }>;
    },
    key: string,
  ) =>
    scopedPost<{ receipt: GoodsReceipt; bill: SupplierBill; payment: PaymentDetail }>(workspaceId, `/api/v1/goods-receipts/${id}/payments`, body, key),
  async listSupplierBills(workspaceId: number, params: QueryParams = {}) {
    const r = await scopedGet<{ bills?: SupplierBill[]; items?: SupplierBill[]; next_before_id?: number }>(
      workspaceId,
      "/api/v1/supplier-bills",
      { limit: 50, ...params },
    );
    return r.bills ?? r.items ?? [];
  },
  getSupplierBill: (workspaceId: number, id: number) => scopedGet<{ bill: SupplierBill }>(workspaceId, `/api/v1/supplier-bills/${id}`).then((r) => r.bill),
  createSupplierBill: (workspaceId: number, body: unknown, key: string) =>
    scopedPost<{ bill: SupplierBill; payment?: PaymentDetail }>(workspaceId, "/api/v1/supplier-bills", body, key),
  approveSupplierBill:(workspaceId:number,id:number,expectedVersion:number,key:string, acceptVariance = false)=>scopedPost<{bill:SupplierBill}>(workspaceId,`/api/v1/supplier-bills/${id}/commands/approve`,{expected_version:expectedVersion, accept_variance: acceptVariance},key),
  transitionSupplierBill: (workspaceId: number, id: number, command: "reject" | "dispute" | "reverse", expectedVersion: number, reason: string, key: string) =>
    scopedPost<{ bill: SupplierBill }>(workspaceId, `/api/v1/supplier-bills/${id}/commands/${command}`, { expected_version: expectedVersion, reason }, key),
  applyCreditToSupplierBill: (workspaceId: number, billId: number, body: { supplier_credit_id: number; amount: string; expected_bill_version: number }, key: string) =>
    scopedPost<{ bill: SupplierBill }>(workspaceId, `/api/v1/supplier-bills/${billId}/commands/apply-credit`, body, key),
  supplierBillMatch: (workspaceId: number, id: number) => scopedGet<{ match: SupplierBillMatch }>(workspaceId, `/api/v1/supplier-bills/${id}/match`).then((r) => r.match),
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
  async listSupplierCredits(workspaceId: number) {
    const result = await scopedGet<{ credits: SupplierCredit[] }>(workspaceId, "/api/v1/supplier-credits");
    return result.credits ?? [];
  },
  createSupplierCredit: (workspaceId: number, body: unknown, key: string) => scopedPost<{ credit: SupplierCredit }>(workspaceId, "/api/v1/supplier-credits", body, key),
  async listSupplierRefunds(workspaceId: number) {
    const result = await scopedGet<{ refunds: SupplierRefund[] }>(workspaceId, "/api/v1/supplier-refunds");
    return result.refunds ?? [];
  },
  createSupplierRefund: (workspaceId: number, body: unknown, key: string) => scopedPost<{ credit: SupplierCredit }>(workspaceId, "/api/v1/supplier-refunds", body, key),
  getProcurementApprovalPolicy: (workspaceId: number) =>
    scopedGet<{ policy: ProcurementApprovalPolicy }>(workspaceId, "/api/v1/procurement/approval-policy").then((r) => r.policy),
  updateProcurementApprovalPolicy: (workspaceId: number, body: unknown) =>
    scopedPut<{ policy: ProcurementApprovalPolicy }>(workspaceId, "/api/v1/procurement/approval-policy", body),
  async listProcurementAttachments(workspaceId: number, params: QueryParams) {
    const res = await scopedGet<{ attachments: ProcurementAttachment[] }>(workspaceId, "/api/v1/procurement/attachments", params);
    return res.attachments ?? [];
  },
  addProcurementAttachment: (workspaceId: number, body: unknown) =>
    scopedPost<{ attachment: ProcurementAttachment }>(workspaceId, "/api/v1/procurement/attachments", body),
  procurementReport: (workspaceId: number, asOf?: string) => scopedGet<ProcurementReport>(workspaceId, "/api/v1/reports/procurement", asOf ? { as_of: asOf } : {}),

  createSale: (workspaceId: number, body: unknown, key: string) => scopedPost(workspaceId, "/api/v1/sales", body, key),
  createPurchase: (workspaceId: number, body: unknown, key: string) =>
    scopedPost<{ purchase: Purchase; items?: Array<{ id: number; description: string; quantity: string; unit_price_minor: number; line_total_minor: number }>; payments?: PaymentDetail[] }>(workspaceId, "/api/v1/purchases", body, key),
  getPurchase: (workspaceId: number, id: number) =>
    scopedGet<{ purchase: Purchase; items?: Array<{ id: number; description: string; quantity: string; unit_price_minor: number; line_total_minor: number }>; payments?: PaymentDetail[]; files?: DocumentFileView[] }>(workspaceId, `/api/v1/purchases/${id}`),
  createPayment: (workspaceId: number, body: unknown, key: string) =>
    scopedPost<PaymentDetail>(workspaceId, "/api/v1/payments", body, key),
  getPayment: (workspaceId: number, id: number) =>
    scopedGet<PaymentDetail>(workspaceId, `/api/v1/payments/${id}`),

  createInvoice: (workspaceId: number, body: unknown, key: string) =>
    scopedPost(workspaceId, "/api/v1/invoices", body, key),
  getInvoice: (workspaceId: number, id: number) =>
    scopedGet<InvoiceDetail>(workspaceId, `/api/v1/invoices/${id}`),
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
  createEstimateShare: (workspaceId: number, estimateId: number, expiryDays?: number, allowRespond = true) =>
    scopedPost<{ share_url: string; token: string; expires_at: string }>(workspaceId, `/api/v1/estimates/${estimateId}/shares`, {
      expiry_days: expiryDays,
      allow_respond: allowRespond,
    }),
  getPublicEstimate: (token: string) =>
    apiClient.get<{ estimate_view: PublicEstimateView }>(`/api/v1/public/estimates/${token}`).then((r) => r.estimate_view),
  respondPublicEstimate: (token: string, body: { action: "accepted" | "declined"; responder_name: string; comment?: string }) =>
    apiClient.post<typeof body, { estimate: Estimate }>(`/api/v1/public/estimates/${token}/respond`, body),
  createCustomerStatementShare: (workspaceId: number, customerId: number, body: { from_date?: string; to_date?: string; expiry_days?: number }) =>
    scopedPost<{ share_url: string; token: string; expires_at: string }>(workspaceId, `/api/v1/customers/${customerId}/statement-shares`, body),
  getPublicStatement: (token: string) =>
    apiClient.get<{ statement_view: PublicStatementView }>(`/api/v1/public/statements/${token}`).then((r) => r.statement_view),
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
    body: {
      money_account_id: number;
      statement_date: string;
      statement_balance_minor: number;
      reconciliation_type?: "bank" | "cash";
      denominations?: Record<string, number>;
      notes?: string;
    },
  ) => scopedPost<{ reconciliation: BankReconciliation }>(workspaceId, "/api/v1/reconciliations", body),
  getReconciliation: (workspaceId: number, id: number) =>
    scopedGet<BankReconDetail>(workspaceId, `/api/v1/reconciliations/${id}`),
  matchReconciliationTransaction: (workspaceId: number, reconId: number, transactionId: number) =>
    scopedPost<{ reconciliation: BankReconciliation; match: BankReconciliationMatch }>(
      workspaceId,
      `/api/v1/reconciliations/${reconId}/commands/match`,
      { transaction_id: transactionId },
    ),
  unmatchReconciliationTransaction: (workspaceId: number, reconId: number, transactionId: number) =>
    scopedPost<{ unmatched: boolean; reconciliation: BankReconciliation }>(
      workspaceId,
      `/api/v1/reconciliations/${reconId}/commands/unmatch`,
      { transaction_id: transactionId },
    ),
  completeReconciliation: (workspaceId: number, reconId: number) =>
    scopedPost<{ reconciliation: BankReconciliation }>(workspaceId, `/api/v1/reconciliations/${reconId}/commands/complete`, {}),
  importBankLines: (
    workspaceId: number,
    body: {
      money_account_id: number;
      file_name: string;
      lines: Array<{ transaction_date: string; description: string; reference?: string; direction: "money_in" | "money_out"; amount_minor: number }>;
    },
  ) => scopedPost<{ batch: unknown; lines: BankLine[] }>(workspaceId, "/api/v1/reconciliations/import-lines", body),
  async listBankLines(workspaceId: number, accountId: number) {
    const res = await scopedGet<{ lines: BankLine[] }>(workspaceId, "/api/v1/reconciliations/bank-lines", { account_id: accountId });
    return res.lines ?? [];
  },
  matchBankLine: (workspaceId: number, lineId: number, body: { transaction_id?: number; status: "matched" | "ignored" | "unmatched" }) =>
    scopedPost<{ line: BankLine }>(workspaceId, `/api/v1/reconciliations/bank-lines/${lineId}/match`, body),

  getWorkspaceSettings: (workspaceId: number) =>
    scopedGet<{ workspace: WorkspaceProfileSettings }>(workspaceId, "/api/v1/settings/workspace").then((r) => r.workspace),
  updateWorkspaceSettings: (workspaceId: number, body: Partial<WorkspaceProfileSettings> & { name: string; timezone: string }) =>
    scopedPatch<{ workspace: WorkspaceProfileSettings }>(workspaceId, "/api/v1/settings/workspace", body).then((r) => r.workspace),
  getWorkspaceTeam: (workspaceId: number) =>
    scopedGet<{ members: WorkspaceMemberRow[]; roles: WorkspaceRoleRow[]; invitations: WorkspaceInvitationRow[] }>(
      workspaceId,
      "/api/v1/settings/team",
    ),
  createWorkspaceInvitation: (workspaceId: number, body: { email: string; role_code: string; outlet_scope?: Record<string, unknown> }) =>
    apiClient.post<typeof body, { id: number; invite_url: string; token: string; role_code: string; role_name: string; expires_at: string }>(
      `/api/v1/workspaces/${workspaceId}/invitations`,
      body,
    ),
  revokeWorkspaceInvitation: (workspaceId: number, invitationId: number) =>
    apiClient.delete(`/api/v1/workspaces/${workspaceId}/invitations/${invitationId}`),
  updateRolePermissions: (workspaceId: number, roleId: number, permissions: string[]) =>
    scopedPatch<{ permissions: string[] }>(workspaceId, `/api/v1/settings/team/roles/${roleId}/permissions`, { permissions }),

  listNotifications: (workspaceId: number) =>
    scopedGet<{ notifications: WorkspaceNotification[]; unread_count: number }>(workspaceId, "/api/v1/notifications"),
  markNotificationRead: (workspaceId: number, id: number) =>
    scopedPost<{ notification: WorkspaceNotification }>(workspaceId, `/api/v1/notifications/${id}/read`, {}),
  markAllNotificationsRead: (workspaceId: number) =>
    scopedPost<{ marked_all: boolean }>(workspaceId, "/api/v1/notifications/read-all", {}),

  getOnboardingChecklist: (workspaceId: number) =>
    scopedGet<{ checklist: OnboardingChecklist }>(workspaceId, "/api/v1/onboarding/checklist").then((r) => r.checklist),
  updateMemberOutletScope: (workspaceId: number, memberId: number, outletIds: number[]) =>
    scopedPatch(workspaceId, `/api/v1/settings/team/members/${memberId}/outlet-scope`, { outlet_ids: outletIds }),

  convertProformaToInvoice: (workspaceId: number, proformaId: number, finalizeNow = false, key?: string) =>
    scopedPost<InvoiceDetail>(workspaceId, `/api/v1/proformas/${proformaId}/convert`, { finalize_now: finalizeNow }, key),
  async listDebitNotes(workspaceId: number, params: QueryParams = {}) {
    const res = await scopedGet<{ debit_notes: DebitNote[] }>(workspaceId, "/api/v1/debit-notes", params);
    return res.debit_notes ?? [];
  },
  createDebitNote: (workspaceId: number, body: unknown, key: string) =>
    scopedPost<DebitNoteDetail>(workspaceId, "/api/v1/debit-notes", body, key),
  voidDebitNote: (workspaceId: number, id: number, reason: string) =>
    scopedPost<{ debit_note: DebitNote }>(workspaceId, `/api/v1/debit-notes/${id}/void`, { reason }),
  listDocumentVersions: (workspaceId: number, docType: string, id: number) =>
    scopedGet<{ versions: DocumentVersion[] }>(workspaceId, `/api/v1/documents/${docType}/${id}/versions`).then((r) => r.versions ?? []),

  listDocumentEvidences: (workspaceId: number, docType: string, id: number) =>
    scopedGet<{ evidences: ExternalPaymentEvidence[] }>(workspaceId, `/api/v1/documents/${docType}/${id}/payment-evidences`).then((r) => r.evidences ?? []),
  reviewPaymentEvidence: (workspaceId: number, evidenceId: number, status: "approved" | "rejected", note?: string) =>
    scopedPost<{ evidence: ExternalPaymentEvidence }>(workspaceId, `/api/v1/payment-evidences/${evidenceId}/review`, { status, note }),
  listTeamDocumentMessages: (workspaceId: number, docType: string, id: number) =>
    scopedGet<{ messages: ExternalMessage[]; unread_count?: number }>(workspaceId, `/api/v1/documents/${docType}/${id}/messages`).then((r) => r.messages ?? []),
  postTeamDocumentMessage: (workspaceId: number, docType: string, id: number, message: string, senderName?: string) =>
    scopedPost<{ message: ExternalMessage }>(workspaceId, `/api/v1/documents/${docType}/${id}/messages`, { message, sender_name: senderName }).then(
      (r) => r.message,
    ),
  markDocumentMessagesRead: (workspaceId: number, docType: string, id: number, lastReadMessageId: number) =>
    scopedPost<{ success: boolean }>(workspaceId, `/api/v1/documents/${docType}/${id}/messages/read`, { last_read_message_id: lastReadMessageId }),
  attachDocumentFile: (workspaceId: number, docType: string, id: number, evidenceId: number, key?: string) =>
    scopedPost<{ file: DocumentFileView }>(workspaceId, `/api/v1/documents/${docType}/${id}/files`, { evidence_id: evidenceId, idempotency_key: key }).then((r) => r.file),
  removeDocumentFile: (workspaceId: number, docType: string, id: number, fileId: number) =>
    apiClient.delete(`/api/v1/documents/${docType}/${id}/files/${fileId}`, { headers: workspaceHeaders(workspaceId) }),
  getInventoryOverview: (workspaceId: number) =>
    scopedGet<{ products: Product[]; outlets: InventoryOutlet[]; balances: InventoryBalance[] }>(workspaceId, "/api/v1/inventory/overview"),

  claimExternalPartyLink: (documentType: string, token: string) =>
    apiClient
      .post<{ document_type: string; token: string }, { link: ExternalPartyLink }>("/api/v1/external-links/claim", {
        document_type: documentType,
        token,
      })
      .then((r) => r.link),
  listMyExternalPartyLinks: () =>
    apiClient.get<{ links: ExternalPartyLink[] }>("/api/v1/external-links").then((r) => r.links ?? []),

  submitPublicPaymentEvidence: (
    token: string,
    body: { payer_name: string; payer_email?: string; amount: string; payment_date: string; payment_method: string; reference?: string; notes?: string },
  ) => apiClient.post<typeof body, { evidence: ExternalPaymentEvidence }>(`/api/v1/public/invoices/${token}/payment-evidence`, body),
  listPublicMessages: (docType: string, token: string) =>
    apiClient.get<{ messages: ExternalMessage[] }>(`/api/v1/public/${docType}/${token}/messages`).then((r) => r.messages ?? []),
  postPublicMessage: (docType: string, token: string, body: { sender_name: string; sender_email?: string; message: string }) =>
    apiClient.post<typeof body, { message: ExternalMessage }>(`/api/v1/public/${docType}/${token}/messages`, body).then((r) => r.message),
  getPublicPurchaseOrderShare: (token: string) =>
    apiClient.get<{ share: PurchaseOrderShareView }>(`/api/v1/purchase-orders/share/${token}`).then((r) => r.share),
  respondPublicPurchaseOrderShare: (
    token: string,
    response: "acknowledged" | "declined" | "change_requested",
    note?: string,
    lines?: { id: number; quantity?: string; unit_cost: string }[],
  ) =>
    apiClient
      .post<
        { response: string; note?: string; lines?: { id: number; quantity?: string; unit_cost: string }[] },
        { share: PurchaseOrderShareView }
      >(`/api/v1/purchase-orders/share/${token}/respond`, {
        response,
        note,
        lines,
      })
      .then((r) => r.share),

  // Blueprint 09: Merchant Storefront, Orders & Domains
  getMerchantStorefront: (workspaceId: number) =>
    scopedGet<{ storefront: Storefront | null }>(workspaceId, "/api/v1/storefront").then((r) => r.storefront),
  getStorefrontSettings: (workspaceId: number) =>
    scopedGet<{ storefront: Storefront | null }>(workspaceId, "/api/v1/storefront/settings").then((r) => r.storefront),
  getStorefrontOverview: (workspaceId: number, period: "7d" | "30d" | "90d") =>
    scopedGet<{ overview: StorefrontOverview | null }>(workspaceId, "/api/v1/storefront/overview", { period }).then((r) => r.overview),
  createStorefront: (workspaceId: number, body: { name: string; slug: string; theme_key?: string; default_outlet_id?: number; currency?: string }) =>
    scopedPost<{ storefront: Storefront }>(workspaceId, "/api/v1/storefront", body).then((r) => r.storefront),
  updateStorefrontSettings: (workspaceId: number, body: unknown) =>
    scopedPatch<{ storefront: Storefront }>(workspaceId, "/api/v1/storefront/settings", body).then((r) => r.storefront),
  getStorefrontDesign: (workspaceId: number) =>
    scopedGet<{ design: StorefrontDesign }>(workspaceId, "/api/v1/storefront/design").then((r) => r.design),
  saveStorefrontDesignDraft: (workspaceId: number, body: unknown) =>
    scopedPut<{ design: StorefrontDesign }>(workspaceId, "/api/v1/storefront/design/draft", body).then((r) => r.design),
  publishStorefrontDesign: (workspaceId: number, body: { expected_version: number; idempotency_key: string }) =>
    scopedPost<{ design: StorefrontDesign }>(workspaceId, "/api/v1/storefront/design/publish", body).then((r) => r.design),
  discardStorefrontDesign: (workspaceId: number, body: { expected_version: number; idempotency_key: string }) =>
    scopedPost<{ design: StorefrontDesign }>(workspaceId, "/api/v1/storefront/design/discard", body).then((r) => r.design),
  getStorefrontDesignPreview: (workspaceId: number) =>
    scopedGet<{ design: StorefrontDesign; storefront: PublicStorefrontProjection }>(workspaceId, "/api/v1/storefront/design/preview-data"),
  listStorefrontProductCards: (workspaceId: number, params: { filter?: string; collection_id?: number; before_id?: number; limit?: number } = {}) =>
    scopedGet<{ products: StorefrontProductCard[]; collections: StorefrontCollection[]; next_before_id: number }>(workspaceId, "/api/v1/storefront/products", params),
  changeStorefrontProduct: (workspaceId: number, id: number, body: unknown) =>
    scopedPatch(workspaceId, `/api/v1/storefront/products/${id}`, body),
  bulkChangeStorefrontProducts: (workspaceId: number, body: unknown) =>
    scopedPost(workspaceId, "/api/v1/storefront/products/bulk", body),
  publishStorefront: (workspaceId: number) =>
    scopedPost<{ storefront: Storefront }>(workspaceId, "/api/v1/storefront/commands/publish", {}).then((r) => r.storefront),
  unpublishStorefront: (workspaceId: number) =>
    scopedPost<{ storefront: Storefront }>(workspaceId, "/api/v1/storefront/commands/unpublish", {}).then((r) => r.storefront),
  setStorefrontEntitlement: (workspaceId: number, entitlement_status: "active" | "grace" | "expired", grace_days = 7) =>
    scopedPost<{ storefront: Storefront }>(workspaceId, "/api/v1/storefront/commands/entitlement", { entitlement_status, grace_days }).then((r) => r.storefront),
  listStorefrontCollections: (workspaceId: number) =>
    scopedGet<{ collections: StorefrontCollection[] }>(workspaceId, "/api/v1/storefront/collections").then((r) => r.collections ?? []),
  createStorefrontCollection: (workspaceId: number, body: { name: string; slug?: string; description?: string; image_url?: string; position?: number }) =>
    scopedPost<{ collection: StorefrontCollection }>(workspaceId, "/api/v1/storefront/collections", body).then((r) => r.collection),
  listMerchantStorefrontProducts: (workspaceId: number) =>
    scopedGet<{ products: MerchantStorefrontProduct[] }>(workspaceId, "/api/v1/storefront/catalogue").then((r) => r.products ?? []),
  upsertStorefrontProduct: (workspaceId: number, variantId: number, body: unknown) =>
    scopedPut<{ product: MerchantStorefrontProduct }>(workspaceId, `/api/v1/storefront/catalogue/${variantId}`, body).then((r) => r.product),
  listStorefrontDomains: (workspaceId: number) =>
    scopedGet<{ domains: StorefrontDomain[] }>(workspaceId, "/api/v1/storefront/domains").then((r) => r.domains ?? []),
  addCustomDomain: (workspaceId: number, hostname: string) =>
    scopedPost<{ domain: StorefrontDomain }>(workspaceId, "/api/v1/storefront/domains", { hostname }).then((r) => r.domain),
  recheckCustomDomain: (workspaceId: number, domainId: number) =>
    scopedPost<{ domain: StorefrontDomain }>(workspaceId, `/api/v1/storefront/domains/${domainId}/commands/recheck`, {}).then((r) => r.domain),
  disconnectCustomDomain: (workspaceId: number, domainId: number) =>
    scopedPost<{ domain: StorefrontDomain }>(workspaceId, `/api/v1/storefront/domains/${domainId}/commands/disconnect`, {}).then((r) => r.domain),
  getStorefrontAnalytics: (workspaceId: number, days = 30) =>
    scopedGet<{ analytics: StorefrontAnalytics }>(workspaceId, "/api/v1/storefront/analytics", { days }).then((r) => r.analytics),

  listMerchantOrders: (workspaceId: number, params: { status?: string; outlet_id?: number } = {}) =>
    scopedGet<{ orders: MerchantOrder[] }>(workspaceId, "/api/v1/orders", params).then((r) => r.orders ?? []),
  getMerchantOrder: (workspaceId: number, id: number) =>
    scopedGet<{ order: MerchantOrder }>(workspaceId, `/api/v1/orders/${id}`).then((r) => r.order),
  requestOrderChange: (workspaceId: number, id: number, body: unknown) =>
    scopedPost<{ order: MerchantOrder }>(workspaceId, `/api/v1/orders/${id}/commands/request-change`, body).then((r) => r.order),
  confirmStorefrontOrder: (workspaceId: number, id: number, body: unknown, key?: string) =>
    scopedPost<{ order: MerchantOrder }>(workspaceId, `/api/v1/orders/${id}/commands/confirm`, body, key).then((r) => r.order),
  packStorefrontOrder: (workspaceId: number, id: number, body: { expected_version: number }) =>
    scopedPost<{ order: MerchantOrder }>(workspaceId, `/api/v1/orders/${id}/commands/pack`, body).then((r) => r.order),
  fulfilStorefrontOrder: (workspaceId: number, id: number, body: unknown) =>
    scopedPost<{ order: MerchantOrder }>(workspaceId, `/api/v1/orders/${id}/commands/fulfil`, body).then((r) => r.order),
  cancelStorefrontOrder: (workspaceId: number, id: number, reason: string) =>
    scopedPost<{ order: MerchantOrder }>(workspaceId, `/api/v1/orders/${id}/commands/cancel`, { reason }).then((r) => r.order),
  declineStorefrontOrder: (workspaceId: number, id: number, reason: string) =>
    scopedPost<{ order: MerchantOrder }>(workspaceId, `/api/v1/orders/${id}/commands/decline`, { reason }).then((r) => r.order),
  linkOrderCustomer: (workspaceId: number, id: number, counterpartyId?: number) =>
    scopedPost<{ order: MerchantOrder }>(workspaceId, `/api/v1/orders/${id}/commands/link-customer`, { counterparty_id: counterpartyId ?? 0 }).then((r) => r.order),
  convertOrderToInvoice: (workspaceId: number, id: number, proforma = false) =>
    scopedPost<{ order: MerchantOrder }>(workspaceId, `/api/v1/orders/${id}/commands/create-invoice`, { proforma }).then((r) => r.order),
  postMerchantOrderMessage: (workspaceId: number, id: number, message: string, customerVisible = true) =>
    scopedPost<{ order: MerchantOrder }>(workspaceId, `/api/v1/orders/${id}/commands/messages`, { message, customer_visible: customerVisible }).then((r) => r.order),
  returnStorefrontOrder: (workspaceId: number, id: number, body: { reason: string; lines?: { order_line_id: number; quantity: string }[] }) =>
    scopedPost<{ order: MerchantOrder }>(workspaceId, `/api/v1/orders/${id}/commands/return`, body).then((r) => r.order),
  exportMerchantOrdersCsv: async (workspaceId: number) => {
    const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";
    const res = await fetch(`${base}/api/v1/orders/export`, {
      credentials: "include",
      headers: workspaceHeaders(workspaceId),
    });
    if (!res.ok) throw new Error("Failed to export orders");
    return res.blob();
  },

  // Blueprint 09: Public Guest Storefront & Status Portal
  getPublicStorefront: (slug: string, params: { q?: string; collection?: string } = {}) =>
    apiClient.get<{ storefront: PublicStorefrontProjection }>(`/api/v1/public/storefronts/${encodeURIComponent(slug)}${buildQueryString(params)}`).then((r) => r.storefront),
  getPublicStorefrontProduct: (slug: string, productId: number) =>
    apiClient.get<{ product: PublicStorefrontProduct; variants: PublicStorefrontProduct[]; storefront: PublicStorefrontProjection }>(`/api/v1/public/storefronts/${encodeURIComponent(slug)}/products/${productId}`),
  getPublicCart: (slug: string, token: string, deliveryMethod?: string, deliveryAreaId?: number) =>
    apiClient.get<{ cart: ValidatedCart }>(`/api/v1/public/storefronts/${encodeURIComponent(slug)}/carts/${encodeURIComponent(token)}${buildQueryString({ delivery_method: deliveryMethod, delivery_area_id: deliveryAreaId })}`).then((r) => r.cart),
  validatePublicCart: (slug: string, body: { lines: { storefront_product_id: number; quantity: string; expected_price_minor?: string }[]; delivery_method?: string; delivery_area_id?: number }) =>
    apiClient.post<typeof body, { cart: ValidatedCart }>(`/api/v1/public/storefronts/${encodeURIComponent(slug)}/carts/validate`, body).then((r) => r.cart),
  upsertPublicCart: (slug: string, body: { cart_token?: string; lines: { storefront_product_id: number; quantity: string; expected_price_minor?: string }[]; delivery_method?: string; delivery_area_id?: number }) =>
    apiClient.post<typeof body, { cart: ValidatedCart }>(`/api/v1/public/storefronts/${encodeURIComponent(slug)}/carts`, body).then((r) => r.cart),
  trackPublicCheckoutStarted: (slug: string) =>
    apiClient.post<undefined, void>(`/api/v1/public/storefronts/${encodeURIComponent(slug)}/analytics/checkout-started`, undefined),
  submitGuestCheckout: (slug: string, body: unknown, idempotencyKey: string) =>
    apiClient.post<unknown, { order: GuestCheckoutConfirmation }>(`/api/v1/public/storefronts/${encodeURIComponent(slug)}/checkout`, body, { headers: { "Idempotency-Key": idempotencyKey } }).then((r) => r.order),
  getPublicOrderStatus: (token: string) =>
    apiClient.get<{ order: PublicOrderStatus }>(`/api/v1/public/orders/${encodeURIComponent(token)}`).then((r) => r.order),
  postPublicOrderMessage: (token: string, message: string) =>
    apiClient.post<{ message: string }, { order: PublicOrderStatus }>(`/api/v1/public/orders/${encodeURIComponent(token)}/messages`, { message }).then((r) => r.order),
  acknowledgePublicOrderChanges: (token: string, expectedVersion: number) =>
    apiClient.post<{ expected_version: number }, { order: PublicOrderStatus }>(`/api/v1/public/orders/${encodeURIComponent(token)}/acknowledge`, { expected_version: expectedVersion }).then((r) => r.order),
  cancelPublicOrder: (token: string, reason?: string) =>
    apiClient.post<{ reason?: string }, { order: PublicOrderStatus }>(`/api/v1/public/orders/${encodeURIComponent(token)}/cancel`, { reason }).then((r) => r.order),
  requestPublicOrderReturn: (token: string, reason?: string) =>
    apiClient.post<{ reason?: string }, { order: PublicOrderStatus }>(`/api/v1/public/orders/${encodeURIComponent(token)}/return-request`, { reason }).then((r) => r.order),
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
