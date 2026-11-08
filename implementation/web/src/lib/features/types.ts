/**
 * Rekordly V2 Feature Registry Types
 *
 * Defines the contract for all MVP financial feature surfaces:
 * route metadata, space eligibility, primary actions, empty states,
 * and plan limits.
 *
 * Architectural constraints:
 * - Single source of truth for navigation, search, and Universal Add.
 * - Enforces distinct Personal, Business, and All presentation.
 * - Does not invent backend contracts or permission schemas.
 * - No floating-point arithmetic for money.
 */

export type FinanceSpace = "personal" | "business" | "all";

export type FeatureCategory =
  | "capture"
  | "core-finance"
  | "commercial"
  | "liabilities"
  | "planning"
  | "compliance"
  | "platform";

export type FeatureStatus = "foundation" | "active" | "planned";

export type PlanTier = "free" | "starter" | "business" | "pro";

export type FeatureId =
  | "ai-capture"
  | "income-expenses"
  | "sales"
  | "purchases"
  | "invoices"
  | "payments"
  | "loans"
  | "customer-deposits"
  | "split-payments"
  | "budgets"
  | "reports-tax"
  | "offline-sync"
  | "plan-limits";

export interface SpaceAvailability {
  personal: boolean;
  business: boolean;
  allSummary: boolean;
  defaultScope: "personal" | "business";
  explanation?: string;
}

export interface FeatureAction {
  label: string;
  shortLabel?: string;
  iconName: string;
  kind: "primary" | "secondary" | "action";
  requiresSpace?: "personal" | "business";
}

export interface FeatureEmptyStateMeta {
  title: string;
  description: string;
  actionLabel: string;
  tip?: string;
}

export interface FeaturePlanGateMeta {
  tier: PlanTier;
  limitLabel: string;
  limitUnit: string;
  enforcementNote: string;
}

export interface FeatureDefinition {
  id: FeatureId;
  name: string;
  shortName: string;
  headline: string;
  description: string;
  category: FeatureCategory;
  route: string;
  aliases?: readonly string[];
  iconName: string;
  status: FeatureStatus;
  availability: SpaceAvailability;
  primaryAction: FeatureAction;
  emptyState: Record<FinanceSpace, FeatureEmptyStateMeta>;
  planGate?: FeaturePlanGateMeta;
  tags: readonly string[];
  supportsOfflineDrafts: boolean;
  requiresConfirmation: boolean;
}

export interface SpaceContextInfo {
  space: FinanceSpace;
  label: string;
  workspaceName: string;
  baseCurrency: string;
  isOwner: boolean;
  badgeText: string;
  badgeVariant: "default" | "success" | "warning" | "neutral";
}
