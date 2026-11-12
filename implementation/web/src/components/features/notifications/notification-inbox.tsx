"use client";

import { toast } from "@heroui/react";
import { Archive, Bell, CheckCircle, EnvelopeOpen, GearSix } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { AppButton } from "@/components/ui/app-button";
import { DataView } from "@/components/ui/data-view";
import { FormDrawer } from "@/components/ui/form-drawer";
import { EmptyState, Page, PageHeader, Segmented, StatusPill } from "@/components/ui/page";
import { RecordCard } from "@/components/ui/record-card";
import { docsSharingApi, docsSharingKeys } from "@/lib/docs-sharing";
import { formatDate } from "@/lib/format";
import { PERMISSIONS } from "@/lib/permissions-catalog";
import { hasWorkspacePermission, useActiveWorkspace } from "@/stores/workspace-store";
import type { UserNotification } from "@/types/docs-sharing";

const CATEGORIES = [
  { key: "", label: "All" },
  { key: "review_required", label: "Review required" },
  { key: "financial_document", label: "Documents" },
  { key: "delivery", label: "Delivery" },
  { key: "billing", label: "Billing" },
  { key: "security", label: "Security" },
] as const;

export function NotificationInboxPage() {
  const scope = useActiveWorkspace();
  const queryClient = useQueryClient();
  const canView = hasWorkspacePermission(scope, PERMISSIONS.NOTIFICATIONS_VIEW);
  const canPrefs = hasWorkspacePermission(scope, PERMISSIONS.NOTIFICATIONS_MANAGE_PREFERENCES);

  const [category, setCategory] = useState("");
  const [prefsOpen, setPrefsOpen] = useState(false);

  const listQ = useQuery({
    queryKey: docsSharingKeys.notifications(category),
    queryFn: () => docsSharingApi.listNotifications({ category: category || undefined }),
    enabled: canView,
  });

  const unreadQ = useQuery({
    queryKey: docsSharingKeys.unreadCount(),
    queryFn: () => docsSharingApi.unreadCount(),
    enabled: canView,
  });

  const prefsQ = useQuery({
    queryKey: docsSharingKeys.prefs(),
    queryFn: () => docsSharingApi.listPreferences(),
    enabled: prefsOpen && canPrefs,
  });

  const markRead = useMutation({
    mutationFn: (id: number) => docsSharingApi.markRead(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: docsSharingKeys.notifications(category) });
      void queryClient.invalidateQueries({ queryKey: docsSharingKeys.unreadCount() });
    },
  });

  const markUnread = useMutation({
    mutationFn: (id: number) => docsSharingApi.markUnread(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: docsSharingKeys.notifications(category) });
      void queryClient.invalidateQueries({ queryKey: docsSharingKeys.unreadCount() });
    },
  });

  const archiveMut = useMutation({
    mutationFn: (id: number) => docsSharingApi.archiveNotification(id),
    onSuccess: () => {
      toast.success("Notification archived");
      void queryClient.invalidateQueries({ queryKey: docsSharingKeys.notifications(category) });
    },
  });

  const bulkRead = useMutation({
    mutationFn: () => docsSharingApi.markAllRead(),
    onSuccess: () => {
      toast.success("All notifications marked read");
      void queryClient.invalidateQueries({ queryKey: docsSharingKeys.notifications(category) });
      void queryClient.invalidateQueries({ queryKey: docsSharingKeys.unreadCount() });
    },
  });

  const togglePref = useMutation({
    mutationFn: (p: { category: string; channel: string; enabled: boolean }) => docsSharingApi.updatePreference(p),
    onSuccess: () => {
      toast.success("Preference updated");
      void queryClient.invalidateQueries({ queryKey: docsSharingKeys.prefs() });
    },
    onError: (err) => toast.danger(err instanceof Error ? err.message : "Cannot update preference"),
  });

  if (!canView) {
    return (
      <Page>
        <PageHeader title="Notifications" description="Durable in-app updates and review alerts." />
        <Alert status="error" title="Permission required" description="You lack notifications.view permission." />
      </Page>
    );
  }

  const unread = unreadQ.data?.unread_count ?? 0;

  return (
    <Page>
      <PageHeader
        title="Notifications"
        description={`${unread} unread notification(s). Dismissing a notification does not resolve underlying review items.`}
        actions={
          <div className="flex flex-wrap gap-2">
            {unread > 0 ? (
              <AppButton variant="secondary" startContent={<CheckCircle size={16} />} label="Mark all read" onPress={() => bulkRead.mutate()} />
            ) : null}
            {canPrefs ? (
              <AppButton variant="tertiary" startContent={<GearSix size={16} />} label="Preferences" onPress={() => setPrefsOpen(true)} />
            ) : null}
          </div>
        }
      />

      <Segmented aria-label="Notification category" options={CATEGORIES} value={category} onChange={setCategory} />

      <DataView<UserNotification>
        title="Inbox"
        rows={listQ.data ?? []}
        rowKey={(n) => n.id}
        isLoading={listQ.isPending}
        isError={listQ.isError}
        columns={[
          {
            key: "title",
            label: "Notification",
            render: (n) => (
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className={n.is_read ? "font-normal" : "font-semibold"}>{n.title}</span>
                  <StatusPill tone={n.is_read ? "neutral" : "success"}>{n.category.replaceAll("_", " ")}</StatusPill>
                </div>
                <p className="text-xs text-default-500">{n.body}</p>
                {n.action_url ? (
                  <Link href={n.action_url} className="text-xs text-primary underline">
                    Open item
                  </Link>
                ) : null}
              </div>
            ),
          },
          { key: "date", label: "Received", render: (n) => formatDate(n.created_at) },
          {
            key: "actions",
            label: "",
            align: "right",
            render: (n) => (
              <div className="flex justify-end gap-1.5">
                {n.is_read ? (
                  <AppButton size="sm" variant="ghost" startContent={<EnvelopeOpen size={14} />} label="Unread" onPress={() => markUnread.mutate(n.id)} />
                ) : (
                  <AppButton size="sm" variant="ghost" label="Mark read" onPress={() => markRead.mutate(n.id)} />
                )}
                <AppButton size="sm" variant="ghost" startContent={<Archive size={14} />} label="Archive" onPress={() => archiveMut.mutate(n.id)} />
              </div>
            ),
          },
        ]}
        renderCard={(n) => (
          <RecordCard
            icon={<Bell size={18} weight="duotone" />}
            reference={formatDate(n.created_at)}
            title={n.title}
            amount={n.category}
            status={<StatusPill tone={n.is_read ? "neutral" : "success"}>{n.is_read ? "Read" : "Unread"}</StatusPill>}
          />
        )}
        empty={<EmptyState icon={Bell} title="All caught up" description="No notifications in this category." />}
      />

      <FormDrawer
        isOpen={prefsOpen}
        onOpenChange={setPrefsOpen}
        title="Notification preferences"
        submitLabel="Done"
        onSubmit={(e) => {
          e.preventDefault();
          setPrefsOpen(false);
        }}
      >
        <Alert status="info" description="Security and legal/billing safety notices cannot be disabled." />
        <div className="space-y-2 mt-3">
          {["financial_document", "delivery", "operations", "insight"].map((cat) => {
            const pref = (prefsQ.data ?? []).find((p) => p.category === cat && p.channel === "in_app");
            const enabled = pref ? pref.enabled : true;
            return (
              <div key={cat} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                <span className="capitalize">{cat.replaceAll("_", " ")} (in-app)</span>
                <AppButton
                  size="sm"
                  variant={enabled ? "secondary" : "ghost"}
                  label={enabled ? "Enabled" : "Disabled"}
                  onPress={() => togglePref.mutate({ category: cat, channel: "in_app", enabled: !enabled })}
                />
              </div>
            );
          })}
        </div>
      </FormDrawer>
    </Page>
  );
}
