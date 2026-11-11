"use client";

import { Bell, Check, CheckCircle } from "@phosphor-icons/react";
import { toast } from "@heroui/react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { AppButton } from "@/components/ui/app-button";
import { EmptyState, Page, PageHeader, StatusPill } from "@/components/ui/page";
import { WorkspaceGate, type WorkspaceInfo } from "@/components/features/finance/shared";
import { financeApi } from "@/lib/money";

function NotificationsContent({ workspaceId }: WorkspaceInfo) {
  const query = useQuery({
    queryKey: ["notifications", workspaceId],
    queryFn: () => financeApi.listNotifications(workspaceId),
  });

  const handleMarkRead = async (id: number) => {
    try {
      await financeApi.markNotificationRead(workspaceId, id);
      query.refetch();
    } catch (err: unknown) {
      toast.danger(err instanceof Error ? err.message : "Unable to update notification");
    }
  };

  const handleMarkAll = async () => {
    try {
      await financeApi.markAllNotificationsRead(workspaceId);
      toast.success("All notifications marked as read");
      query.refetch();
    } catch (err: unknown) {
      toast.danger(err instanceof Error ? err.message : "Unable to mark all read");
    }
  };

  const items = query.data?.notifications ?? [];
  const unreadCount = query.data?.unread_count ?? 0;

  return (
    <Page>
      <PageHeader
        title="Notifications"
        description={
          unreadCount > 0
            ? `You have ${unreadCount} unread update${unreadCount === 1 ? "" : "s"} in this workspace.`
            : "Account, invoice, quotation, and team updates appear here."
        }
        actions={
          unreadCount > 0 ? (
            <AppButton variant="secondary" startContent={<CheckCircle size={16} />} label="Mark all read" onPress={handleMarkAll} />
          ) : undefined
        }
      />

      {query.isPending ? (
        <div className="flex h-48 items-center justify-center">
          <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="All caught up"
          description="You will see alerts here when customers respond to quotations, team members join, or records need review."
        />
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div
              key={item.id}
              className={`rounded-3xl border p-5 transition-colors flex flex-wrap items-start justify-between gap-4 ${
                item.is_read ? "border-border/50 bg-surface" : "border-primary/40 bg-primary-soft/20"
              }`}
            >
              <div className="space-y-1.5 min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <StatusPill tone={item.is_read ? "neutral" : "success"}>{item.category}</StatusPill>
                  <span className="text-[11px] font-mono text-muted">{new Date(item.created_at).toLocaleString()}</span>
                </div>
                <h3 className="text-sm font-bold text-foreground">{item.title}</h3>
                <p className="text-xs text-muted">{item.body}</p>
                {item.action_url && (
                  <Link href={item.action_url} className="inline-block text-xs font-semibold text-primary hover:underline pt-1">
                    Open related page →
                  </Link>
                )}
              </div>
              {!item.is_read && (
                <AppButton
                  size="sm"
                  variant="ghost"
                  startContent={<Check size={14} />}
                  label="Mark read"
                  onPress={() => handleMarkRead(item.id)}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </Page>
  );
}

export default function NotificationsPage() {
  return (
    <WorkspaceGate>{(workspace) => <NotificationsContent key={workspace.workspaceId} {...workspace} />}</WorkspaceGate>
  );
}
