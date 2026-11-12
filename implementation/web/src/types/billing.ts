export type CommercialMode = "controlled_beta" | "pricing_intent" | "paid_pilot" | "public_paid" | "billing_paused";

export interface CommercialModeStatus {
  mode: CommercialMode;
  checkout_enabled: boolean;
  plan_intent_enabled: boolean;
  beta_cohort: string;
  past_due_days: number;
  grace_days: number;
  allowed_actions: string[];
}

export interface PlanVersion {
  id: number;
  plan_code: string;
  version: number;
  display_name: string;
  subject_type: "personal" | "business";
  billing_interval: "monthly" | "yearly" | "once";
  currency: string;
  price_minor: string;
  tax_behavior: string;
  is_available: boolean;
  is_addon: boolean;
  addon_type: string;
}

export interface ResolvedEntitlement {
  feature_key: string;
  grant_type: string;
  bool_value: boolean;
  int_value: number;
  text_value: string;
  period_model: string;
  source: string;
}

export interface BillingSubject {
  id: number;
  subject_type: "personal" | "business";
  workspace_id: number;
  owner_user_id: number;
  billing_name: string;
  billing_email: string;
  status: string;
}

export interface Subscription {
  id: number;
  billing_subject_id: number;
  plan_version_id: number;
  state: "pending" | "trialing" | "active" | "past_due" | "grace" | "cancel_at_period_end" | "expired" | "suspended" | "refunded" | "chargeback_review";
  billing_interval: string;
  paid_through_at: string | null;
  grace_ends_at: string | null;
  cancel_at_period_end: boolean;
  entitlement_revision: number;
  state_reason: string;
}

export interface SubjectEntitlementSnapshot {
  subject: BillingSubject;
  subscription: Subscription;
  plan: PlanVersion;
  commercial_mode: CommercialMode;
  entitlement_revision: number;
  features: Record<string, ResolvedEntitlement>;
}

export interface UsageMeter {
  feature_key: string;
  consumed: number;
  reserved: number;
  manual_adjustment: number;
  limit: number;
  percent_used: number;
  warning_level: "ok" | "warn_70" | "warn_90" | "reached_100";
  period_start: string;
  period_end: string;
}

export interface DowngradeImpactPreview {
  subject_id: number;
  current_plan_code: string;
  target_plan_code: string;
  target_plan_version: number;
  requires_selection: boolean;
  excess_items: Array<{
    resource_type: string;
    current_count: number;
    target_limit: number;
    excess_count: number;
    preservation: string;
  }>;
  restricted_features: string[];
  preserved_guarantee: string;
}

export interface CheckoutIntent {
  id: number;
  billing_subject_id: number;
  plan_version_id: number;
  reference: string;
  amount_minor: string;
  currency: string;
  status: "pending" | "verified" | "failed" | "expired" | "mismatch_review";
  authorization_url: string;
  created_at: string;
}

export interface BillingTransaction {
  id: number;
  tx_type: string;
  amount_minor: string;
  tax_minor: string;
  currency: string;
  status: string;
  provider_ref: string;
  created_at: string;
}

export interface BillingDocument {
  id: number;
  document_number: string;
  document_type: string;
  currency: string;
  total_minor: string;
  service_period: string;
  status: string;
  created_at: string;
}
