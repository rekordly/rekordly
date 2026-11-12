import { apiClient, workspaceHeaders } from "./api.ts";
import { buildQueryString } from "./utils.ts";
import type {
  DeliveryRecord,
  DocumentArtifact,
  GuestPortalDocument,
  NotificationPreference,
  ShareGrant,
  ShareGrantCreated,
  UserNotification,
  WhatsAppHandoffResult,
  WorkspaceFile,
} from "../types/docs-sharing.ts";

export const docsSharingKeys = {
  notifications: (category = "") => ["bp14", "notifications", category] as const,
  unreadCount: () => ["bp14", "notifications-unread"] as const,
  prefs: () => ["bp14", "notification-prefs"] as const,
  files: (workspaceId: number) => ["bp14", workspaceId, "files"] as const,
  shares: (workspaceId: number, docType: string, docId: number) => ["bp14", workspaceId, "shares", docType, docId] as const,
  deliveries: (workspaceId: number, docType: string, docId: number) => ["bp14", workspaceId, "deliveries", docType, docId] as const,
};

export const docsSharingApi = {
  // Notifications
  listNotifications: (params?: { category?: string; include_archived?: boolean; cursor?: number }) =>
    apiClient.get<UserNotification[]>(
      `/api/v1/me/notifications${buildQueryString({
        category: params?.category,
        include_archived: params?.include_archived ? "true" : undefined,
        cursor: params?.cursor,
      })}`,
    ),

  unreadCount: () => apiClient.get<{ unread_count: number }>("/api/v1/me/notifications/unread-count"),

  markRead: (id: number) => apiClient.post<object, UserNotification>(`/api/v1/me/notifications/${id}/commands/mark-read`, {}),
  markUnread: (id: number) => apiClient.post<object, UserNotification>(`/api/v1/me/notifications/${id}/commands/mark-unread`, {}),
  archiveNotification: (id: number) => apiClient.post<object, UserNotification>(`/api/v1/me/notifications/${id}/commands/archive`, {}),
  markAllRead: () => apiClient.post<object, unknown>("/api/v1/me/notifications/commands/mark-read-bulk", {}),

  listPreferences: () => apiClient.get<NotificationPreference[]>("/api/v1/me/notification-preferences"),
  updatePreference: (payload: { workspace_id?: number; category: string; channel: string; enabled: boolean }) =>
    apiClient.put<typeof payload, NotificationPreference>("/api/v1/me/notification-preferences", payload),

  // Artifacts & Sharing
  renderDocument: (workspaceId: number, docType: string, docId: number, idempKey: string) =>
    apiClient.post<object, { artifact: DocumentArtifact }>(
      `/api/v1/workspaces/${workspaceId}/documents/${docType}/${docId}/commands/render`,
      {},
      { headers: { ...workspaceHeaders(workspaceId), "Idempotency-Key": idempKey } },
    ),

  listShareGrants: (workspaceId: number, docType: string, docId: number) =>
    apiClient.get<ShareGrant[]>(`/api/v1/workspaces/${workspaceId}/documents/${docType}/${docId}/share-grants`, {
      headers: workspaceHeaders(workspaceId),
    }),

  createShareGrant: (workspaceId: number, docType: string, docId: number, expiresInHours = 168) =>
    apiClient.post<{ expires_in_hours: number }, ShareGrantCreated>(
      `/api/v1/workspaces/${workspaceId}/documents/${docType}/${docId}/share-grants`,
      { expires_in_hours: expiresInHours },
      { headers: workspaceHeaders(workspaceId) },
    ),

  revokeShareGrant: (workspaceId: number, grantId: number) =>
    apiClient.post<object, ShareGrant>(`/api/v1/share-grants/${grantId}/commands/revoke`, {}, {
      headers: workspaceHeaders(workspaceId),
    }),

  whatsappHandoff: (workspaceId: number, docType: string, docId: number) =>
    apiClient.post<object, WhatsAppHandoffResult>(
      `/api/v1/workspaces/${workspaceId}/documents/${docType}/${docId}/whatsapp-handoff`,
      {},
      { headers: workspaceHeaders(workspaceId) },
    ),

  // Email Deliveries
  listDeliveries: (workspaceId: number, docType: string, docId: number) =>
    apiClient.get<DeliveryRecord[]>(`/api/v1/workspaces/${workspaceId}/documents/${docType}/${docId}/deliveries`, {
      headers: workspaceHeaders(workspaceId),
    }),

  sendDocumentEmail: (workspaceId: number, docType: string, docId: number, recipientEmail: string, idempKey: string) =>
    apiClient.post<{ recipient_email: string }, DeliveryRecord>(
      `/api/v1/workspaces/${workspaceId}/documents/${docType}/${docId}/deliveries`,
      { recipient_email: recipientEmail },
      { headers: { ...workspaceHeaders(workspaceId), "Idempotency-Key": idempKey } },
    ),

  retryDelivery: (workspaceId: number, deliveryId: number) =>
    apiClient.post<object, DeliveryRecord>(`/api/v1/deliveries/${deliveryId}/commands/retry`, {}, {
      headers: workspaceHeaders(workspaceId),
    }),

  resendDelivery: (workspaceId: number, deliveryId: number, recipientEmail: string, idempKey: string) =>
    apiClient.post<{ recipient_email: string }, DeliveryRecord>(
      `/api/v1/deliveries/${deliveryId}/commands/resend`,
      { recipient_email: recipientEmail },
      { headers: { ...workspaceHeaders(workspaceId), "Idempotency-Key": idempKey } },
    ),

  // Files
  listFiles: (workspaceId: number) =>
    apiClient.get<WorkspaceFile[]>(`/api/v1/workspaces/${workspaceId}/files`, {
      headers: workspaceHeaders(workspaceId),
    }),

  createUploadIntent: (workspaceId: number, payload: { filename: string; mime_type: string; byte_size: number; file_class: string }) =>
    apiClient.post<typeof payload, { file: WorkspaceFile }>(`/api/v1/workspaces/${workspaceId}/files/upload-intents`, payload, {
      headers: workspaceHeaders(workspaceId),
    }),

  finalizeUpload: (workspaceId: number, fileId: number, sha256_hash = "") =>
    apiClient.post<{ sha256_hash: string }, WorkspaceFile>(`/api/v1/workspaces/${workspaceId}/files/${fileId}/commands/finalize-upload`, { sha256_hash }, {
      headers: workspaceHeaders(workspaceId),
    }),

  createFileDownload: (workspaceId: number, fileId: number) =>
    apiClient.post<object, { url: string; expires_at: string }>(`/api/v1/workspaces/${workspaceId}/files/${fileId}/commands/create-download`, {}, {
      headers: workspaceHeaders(workspaceId),
    }),

  requestFileDeletion: (workspaceId: number, fileId: number) =>
    apiClient.post<object, WorkspaceFile>(`/api/v1/workspaces/${workspaceId}/files/${fileId}/commands/request-deletion`, {}, {
      headers: workspaceHeaders(workspaceId),
    }),

  // Guest Portal (no auth)
  getGuestPortal: (token: string) => apiClient.get<GuestPortalDocument>(`/api/v1/s/${token}`),
};
