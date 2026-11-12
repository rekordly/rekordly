import { apiClient, workspaceHeaders } from "./api.ts";
import { buildQueryString } from "./utils.ts";
import type {
  BillingDocument,
  BillingSubject,
  BillingTransaction,
  CheckoutIntent,
  CommercialModeStatus,
  DowngradeImpactPreview,
  PlanVersion,
  SubjectEntitlementSnapshot,
  Subscription,
  UsageMeter,
} from "../types/billing.ts";

export const billingKeys = {
  commercialMode: () => ["bp13", "commercial-mode"] as const,
  plans: (subjectType = "") => ["bp13", "plans", subjectType] as const,
  workspaceSubject: (workspaceId: number) => ["bp13", "workspace-subject", workspaceId] as const,
  subscription: (subjectId: number) => ["bp13", "subscription", subjectId] as const,
  usage: (subjectId: number) => ["bp13", "usage", subjectId] as const,
  transactions: (subjectId: number) => ["bp13", "transactions", subjectId] as const,
  documents: (subjectId: number) => ["bp13", "documents", subjectId] as const,
};

export const billingApi = {
  getCommercialMode: () => apiClient.get<CommercialModeStatus>("/api/v1/commercial-mode"),

  listPlans: (params?: { subject_type?: string; is_addon?: boolean }) =>
    apiClient.get<PlanVersion[]>(
      `/api/v1/plans${buildQueryString({
        subject_type: params?.subject_type,
        is_addon: params?.is_addon !== undefined ? String(params.is_addon) : undefined,
      })}`,
    ),

  getWorkspaceBillingSubject: (workspaceId: number) =>
    apiClient.get<{ subject: BillingSubject; subscription: Subscription }>(
      `/api/v1/workspaces/${workspaceId}/billing-subject`,
      { headers: workspaceHeaders(workspaceId) },
    ),

  getSubscription: (subjectId: number) =>
    apiClient.get<SubjectEntitlementSnapshot>(`/api/v1/billing-subjects/${subjectId}/subscription`),

  getUsage: (subjectId: number) =>
    apiClient.get<UsageMeter[]>(`/api/v1/billing-subjects/${subjectId}/usage`),

  getDowngradeImpact: (subjectId: number, targetPlanVersionId: number) =>
    apiClient.get<DowngradeImpactPreview>(
      `/api/v1/billing-subjects/${subjectId}/downgrade-impact${buildQueryString({ target_plan_version: targetPlanVersionId })}`,
    ),

  createCheckoutIntent: (subjectId: number, planVersionId: number, idempotencyKey: string) =>
    apiClient.post<{ plan_version_id: number }, CheckoutIntent>(
      `/api/v1/billing-subjects/${subjectId}/checkout-intents`,
      { plan_version_id: planVersionId },
      { headers: { "Idempotency-Key": idempotencyKey } },
    ),

  verifyCheckoutIntent: (intentId: number) =>
    apiClient.get<CheckoutIntent>(`/api/v1/checkout-intents/${intentId}`),

  changePlan: (subjectId: number, payload: { target_plan_version_id: number; accept_downgrade: boolean }, idempotencyKey: string) =>
    apiClient.post<typeof payload, Subscription>(
      `/api/v1/billing-subjects/${subjectId}/commands/change-plan`,
      payload,
      { headers: { "Idempotency-Key": idempotencyKey } },
    ),

  cancelSubscription: (subjectId: number, reason: string) =>
    apiClient.post<{ reason: string }, Subscription>(
      `/api/v1/billing-subjects/${subjectId}/commands/cancel-subscription`,
      { reason },
    ),

  resumeSubscription: (subjectId: number) =>
    apiClient.post<object, Subscription>(`/api/v1/billing-subjects/${subjectId}/commands/resume-subscription`, {}),

  purchaseAddon: (subjectId: number, addonPlanVersionId: number, quantity: number, idempotencyKey: string) =>
    apiClient.post<{ addon_plan_version_id: number; quantity: number }, unknown>(
      `/api/v1/billing-subjects/${subjectId}/commands/purchase-addon`,
      { addon_plan_version_id: addonPlanVersionId, quantity },
      { headers: { "Idempotency-Key": idempotencyKey } },
    ),

  listTransactions: (subjectId: number) =>
    apiClient.get<BillingTransaction[]>(`/api/v1/billing-subjects/${subjectId}/transactions`),

  listDocuments: (subjectId: number) =>
    apiClient.get<BillingDocument[]>(`/api/v1/billing-subjects/${subjectId}/billing-documents`),
};
