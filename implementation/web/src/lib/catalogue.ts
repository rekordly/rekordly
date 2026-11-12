export interface CommandEnvelope<TPayload = Record<string, unknown>> {
  command_type: string;
  command_version: number;
  idempotency_key: string;
  actor_user_id: number;
  workspace_id: number;
  expected_version?: string;
  client_command_id?: string;
  payload: TPayload;
}

export interface EventEnvelope<TPayload = Record<string, unknown>> {
  event_id: string;
  event_type: string;
  event_version: number;
  occurred_at: string;
  recorded_at: string;
  actor: { type: "user" | "guest" | "service" | "provider" | "admin" | "migration"; id: string };
  subject: { type: string; id: string };
  aggregate: { type: string; id: string; version: string };
  command_id?: string;
  correlation_id?: string;
  causation_id?: string;
  payload: TPayload;
  metadata: { schema: number };
}

/** Precise UI labels mandated by Blueprint 18 §105 — never ambiguous "saved/sent/synced". */
export const PRECISE_STATE_LABELS = {
  queued_offline: "Pending sync",
  email_accepted: "Accepted by email provider",
  whatsapp_handoff: "Opened WhatsApp/share options",
  guest_portal_opened: "Link opened",
  deletion_grace_restricted: "Recoverable until",
} as const;

const FORBIDDEN_ANALYTICS_KEYS = new Set([
  "amount",
  "amount_minor",
  "narration",
  "prompt",
  "party_name",
  "email",
  "phone",
  "account_number",
  "otp",
  "token",
  "password",
  "filename",
  "private_url",
  "document_content",
]);

export function validateAnalyticsPayload(props: Record<string, unknown>): void {
  for (const key of Object.keys(props)) {
    if (FORBIDDEN_ANALYTICS_KEYS.has(key.trim().toLowerCase())) {
      throw new Error(`FORBIDDEN_ANALYTICS_PROPERTY: ${key}`);
    }
  }
}
