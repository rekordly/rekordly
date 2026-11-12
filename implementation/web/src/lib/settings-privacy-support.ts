import { apiClient, workspaceHeaders } from "./api.ts";

export function sanitizeCsvCell(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return raw;
  const first = trimmed[0];
  if (first === "=" || first === "+" || first === "-" || first === "@" || first === "\t" || first === "\r") {
    return `'${raw}`;
  }
  return raw;
}

export interface UserProfile {
  user_id: number;
  display_name: string;
  locale: string;
  timezone: string;
  date_format: string;
  time_format: string;
  theme: "light" | "dark" | "system";
  density: "comfortable" | "compact";
  reduced_motion: boolean;
  high_contrast: boolean;
  default_landing_page: string;
  currency_display_mode: string;
  occupation_label: string;
  version: number;
  updated_at: string;
}

export interface ContactMethod {
  id: number;
  method_type: "email" | "phone";
  masked_value: string;
  verified_at?: string | null;
  is_primary: boolean;
  is_login: boolean;
  is_recovery: boolean;
  notify_eligible: boolean;
  added_at: string;
}

export interface SecurityEvent {
  id: number;
  event_type: string;
  actor_type: string;
  device_summary: string;
  safe_context_json: Record<string, unknown>;
  created_at: string;
}

export interface ScopedWorkspaceSettings {
  workspace_id: number;
  workspace_kind: "personal" | "business";
  workspace_name: string;
  base_currency: string;
  actor_role: string;
  version: number;
  accounting_locked: boolean;
  personal_settings?: Record<string, unknown>;
  business_settings?: Record<string, unknown>;
  last_significant_change_at?: string | null;
}

export interface PrivacyDashboard {
  data_categories: Array<{ category: string; purpose: string }>;
  processors: Array<{ name: string; role: string }>;
  consents: Array<{ id: number; consent_key: string; granted: boolean; updated_at: string }>;
  policies: Array<{ id: number; policy_type: string; policy_version: string; accepted_at: string }>;
  retention_rules: Array<{
    data_class: string;
    policy_version: string;
    purpose: string;
    lawful_basis: string;
    active_retention_days: number;
    post_grace_action: string;
    backup_window_days: number;
  }>;
  privacy_contact: string;
  support_hours: string;
}

export interface OwnershipExport {
  id: number;
  scope: string;
  format: string;
  status: string;
  as_of_at: string;
  reconciliation_status: string;
  checksum_sha256: string;
  expires_at: string;
  created_at: string;
}

export interface DeletionPreview {
  eligible: boolean;
  blockers: string[];
  scope: string;
  grace_days: number;
  proposed_deadline_utc: string;
  owned_businesses_count: number;
  will_be_removed: string[];
  will_be_retained_for_lawful_use: string[];
  revoked_immediately: string[];
}

export interface DeletionCase {
  id: number;
  scope: string;
  workspace_id?: number | null;
  status: string;
  reason: string;
  grace_deadline_at: string;
  subscription_reconciled: boolean;
  cancelled_at?: string | null;
  created_at: string;
}

export interface SupportCase {
  id: number;
  workspace_id?: number | null;
  category: string;
  severity: "SEV-0" | "SEV-1" | "SEV-2" | "SEV-3";
  status: string;
  summary: string;
  affected_module: string;
  reference_id: string;
  diagnostic_consent: boolean;
  preferred_channel: string;
  created_at: string;
}

export interface SupportAccessGrant {
  id: number;
  support_case_id: number;
  workspace_id: number;
  actor_label: string;
  scope: string;
  reason: string;
  expires_at: string;
  revoked_at?: string | null;
  created_at: string;
}

export const bp16Keys = {
  profile: () => ["bp16", "profile"] as const,
  contacts: () => ["bp16", "contacts"] as const,
  securityEvents: () => ["bp16", "security-events"] as const,
  privacy: () => ["bp16", "privacy"] as const,
  exports: () => ["bp16", "exports"] as const,
  supportCases: () => ["bp16", "support-cases"] as const,
  scopedSettings: (workspaceId: number, kind: string, section = "") =>
    ["bp16", "scoped-settings", workspaceId, kind, section] as const,
};

export const bp16Api = {
  getProfile: () => apiClient.get<UserProfile>("/api/v1/me/profile"),
  updateProfile: (body: Partial<UserProfile> & { expected_version: number }) =>
    apiClient.patch<typeof body, UserProfile>("/api/v1/me/profile", body),
  grantRecentAuth: (purpose: string, strength = "otp") =>
    apiClient.post<{ purpose: string; strength: string }, { id: number; expires_at: string }>("/api/v1/me/recent-auth", {
      purpose,
      strength,
    }),

  listContacts: () => apiClient.get<ContactMethod[]>("/api/v1/me/contact-methods"),
  addContact: (body: { method_type: "email" | "phone"; value: string; is_login: boolean; is_recovery: boolean }) =>
    apiClient.post<typeof body, { contact_method: ContactMethod; challenge_id: number; debug_otp?: string }>(
      "/api/v1/me/contact-methods",
      body,
    ),
  verifyContact: (contactId: number, code: string) =>
    apiClient.post<{ code: string }, ContactMethod>(`/api/v1/me/contact-methods/${contactId}/commands/verify`, { code }),
  makePrimaryContact: (contactId: number) =>
    apiClient.post<Record<string, never>, ContactMethod>(`/api/v1/me/contact-methods/${contactId}/commands/make-primary`, {}),
  removeContact: (contactId: number) => apiClient.delete<ContactMethod>(`/api/v1/me/contact-methods/${contactId}`),

  revokeSession: (sessionId: number) =>
    apiClient.post<Record<string, never>, { revoked: boolean }>(`/api/v1/me/sessions/${sessionId}/commands/revoke`, {}),
  revokeOtherSessions: (currentSessionId: number) =>
    apiClient.post<{ current_session_id: number }, { revoked_count: number }>(
      "/api/v1/me/sessions/commands/revoke-others",
      { current_session_id: currentSessionId },
    ),
  listSecurityEvents: () => apiClient.get<SecurityEvent[]>("/api/v1/me/security-events"),

  getPersonalSettings: (workspaceId: number) =>
    apiClient.get<ScopedWorkspaceSettings>(`/api/v1/personal-spaces/${workspaceId}/settings`, {
      headers: workspaceHeaders(workspaceId),
    }),
  updatePersonalSettings: (workspaceId: number, expectedVersion: number, changes: Record<string, unknown>) =>
    apiClient.patch<{ expected_version: number; changes: Record<string, unknown> }, ScopedWorkspaceSettings>(
      `/api/v1/personal-spaces/${workspaceId}/settings`,
      { expected_version: expectedVersion, changes },
      { headers: workspaceHeaders(workspaceId) },
    ),

  getBusinessSettings: (workspaceId: number, section = "profile") =>
    apiClient.get<ScopedWorkspaceSettings>(`/api/v1/businesses/${workspaceId}/settings/${section}`, {
      headers: workspaceHeaders(workspaceId),
    }),
  updateBusinessSettings: (workspaceId: number, section: string, expectedVersion: number, changes: Record<string, unknown>) =>
    apiClient.patch<{ expected_version: number; changes: Record<string, unknown> }, ScopedWorkspaceSettings>(
      `/api/v1/businesses/${workspaceId}/settings/${section}`,
      { expected_version: expectedVersion, changes },
      { headers: workspaceHeaders(workspaceId) },
    ),

  getPrivacyDashboard: () => apiClient.get<PrivacyDashboard>("/api/v1/me/privacy"),
  updateConsent: (consentKey: string, granted: boolean) =>
    apiClient.put<{ consent_key: string; granted: boolean }, unknown>("/api/v1/me/consents", {
      consent_key: consentKey,
      granted,
    }),

  listExports: () => apiClient.get<OwnershipExport[]>("/api/v1/me/exports"),
  createExport: (scope: "account" | "personal_workspace" | "business_workspace" | "privacy_dsr", workspaceId?: number) =>
    apiClient.post<{ scope: string; workspace_id?: number }, OwnershipExport>("/api/v1/me/exports", {
      scope,
      workspace_id: workspaceId,
    }),

  previewDeletion: (scope: "account" | "personal_workspace" | "business_workspace", workspaceId?: number) =>
    apiClient.post<{ scope: string; workspace_id?: number }, DeletionPreview>("/api/v1/deletion-cases/preview", {
      scope,
      workspace_id: workspaceId,
    }),
  requestDeletion: (body: { scope: string; workspace_id?: number; reason: string; confirm_text: string }) =>
    apiClient.post<typeof body, DeletionCase>("/api/v1/deletion-cases", body),
  cancelDeletion: (caseId: number) =>
    apiClient.post<Record<string, never>, DeletionCase>(`/api/v1/deletion-cases/${caseId}/commands/cancel`, {}),

  listSupportCases: () => apiClient.get<SupportCase[]>("/api/v1/support-cases"),
  createSupportCase: (body: {
    workspace_id?: number;
    category: string;
    severity: string;
    summary: string;
    affected_module: string;
    reference_id: string;
    diagnostic_consent: boolean;
    preferred_channel: string;
  }) => apiClient.post<typeof body, SupportCase>("/api/v1/support-cases", body),
  createSupportAccessGrant: (body: {
    support_case_id: number;
    workspace_id: number;
    actor_label: string;
    scope: string;
    reason: string;
    ttl_minutes: number;
  }) => apiClient.post<typeof body, SupportAccessGrant>("/api/v1/support-access-grants", body),
  revokeSupportAccessGrant: (grantId: number) =>
    apiClient.post<Record<string, never>, SupportAccessGrant>(`/api/v1/support-access-grants/${grantId}/commands/revoke`, {}),
};
