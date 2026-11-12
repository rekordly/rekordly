export interface UserNotification {
  id: number;
  workspace_id: number | null;
  user_id: number;
  category: string;
  template_key: string;
  severity: string;
  resource_type: string;
  resource_id: number;
  action_url: string | null;
  title: string;
  body: string;
  is_read: boolean;
  read_at: string | null;
  archived_at: string | null;
  created_at: string;
}

export interface NotificationPreference {
  id: number;
  user_id: number;
  workspace_id: number | null;
  category: string;
  channel: "in_app" | "email";
  enabled: boolean;
}

export interface DocumentArtifact {
  id: number;
  workspace_id: number;
  document_type: string;
  document_id: number;
  version: number;
  snapshot_hash: string;
  pdf_hash: string;
  byte_size: number;
  page_count: number;
  status: "queued" | "rendering" | "ready" | "failed" | "superseded";
  created_at: string;
}

export interface ShareGrant {
  id: number;
  workspace_id: number;
  resource_type: string;
  resource_id: number;
  version: number;
  purpose: string;
  expires_at: string;
  revoked_at: string | null;
  access_count: number;
  download_count: number;
  created_at: string;
}

export interface ShareGrantCreated {
  grant: ShareGrant;
  share_url: string;
  raw_token: string;
}

export interface WhatsAppHandoffResult {
  grant: ShareGrant;
  share_url: string;
  message_text: string;
  whatsapp_link: string;
  status: string;
  disclosure: string;
}

export interface DeliveryRecord {
  id: number;
  document_type: string;
  document_id: number;
  channel: "email" | "whatsapp_handoff" | "copy_link";
  recipient_masked: string;
  status: "draft" | "queued" | "processing" | "accepted" | "delivered" | "opened" | "bounced" | "complained" | "retry_scheduled" | "failed" | "handoff_opened";
  provider_message_id: string;
  attempts: number;
  is_resend: boolean;
  last_error_class: string;
  last_error_message: string;
  created_at: string;
}

export interface WorkspaceFile {
  id: number;
  workspace_id: number;
  file_class: "public_media" | "private_evidence" | "generated_artifact" | "temporary_upload" | "export_archive" | "quarantined";
  original_filename: string;
  mime_type: string;
  byte_size: number;
  provider_delivery_type: "upload" | "authenticated";
  scan_status: "pending" | "clean" | "quarantined";
  deletion_status: "active" | "scheduled" | "deleted" | "delete_failed";
  created_at: string;
}

export interface GuestPortalDocument {
  document_type: string;
  document_number: string;
  document_date: string;
  status: string;
  version: number;
  sender_name: string;
  recipient_name: string;
  currency: string;
  total_display: string;
  payment_state: string;
  can_download: boolean;
  expires_at: string;
  artifact_ready: boolean;
}
