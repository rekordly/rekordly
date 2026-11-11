"use client";

import { ArrowsClockwise, CheckCircle, CloudArrowUp, CloudSlash, type Icon, WarningCircle } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { AppButton } from "@/components/ui/app-button";
import { DashboardCard } from "@/components/ui/dashboard-card";
import { EmptyState, Page, PageHeader, SectionHeader, StatusPill } from "@/components/ui/page";
import { uploadPrivateEvidence } from "@/lib/evidence";
import {
  clearSyncedOfflineMoneyDrafts,
  listOfflineMoneyDrafts,
  syncOfflineMoneyDrafts,
  type OfflineDraftState,
  type OfflineMoneyDraft,
} from "@/lib/offline-drafts";
import { moneyApi } from "@/lib/money";
import { useAuthStore } from "@/stores/auth-store";

const OFFLINE_DRAFT_QUERY = (userId: number) => ["offline-money-drafts", userId] as const;

const STATUS: Record<OfflineDraftState, { label: string; tone: "success" | "warning" | "danger" | "accent" | "neutral" }> = {
  queued: { label: "Queued", tone: "warning" },
  syncing: { label: "Syncing", tone: "accent" },
  needs_review: { label: "Needs review", tone: "danger" },
  failed_permanent: { label: "Could not sync", tone: "danger" },
  synced: { label: "Saved to Rekordly", tone: "success" },
};

function countActive(items: readonly OfflineMoneyDraft[]) {
  return items.filter((item) => item.state !== "synced").length;
}

function DraftRow({ item }: { item: OfflineMoneyDraft }) {
  const status = STATUS[item.state];
  const label = item.payload.description || item.payload.counterparty_name || "Offline money draft";
  const queuedEvidence = item.staged_evidence?.filter((evidence) => evidence.state !== "registered").length ?? 0;
  const registeredEvidence = item.staged_evidence?.filter((evidence) => evidence.state === "registered").length ?? 0;
  return (
    <li className="flex flex-col gap-3 border-b border-default py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="truncate text-[14px] font-medium text-foreground">{label}</p>
        <p className="mt-0.5 text-[12px] text-muted">
          {item.payload.direction.replace("_", " ")} · saved {new Date(item.created_at_local).toLocaleString()}
        </p>
        {queuedEvidence ? <p className="mt-1 text-[12px] text-muted">{queuedEvidence} receipt{queuedEvidence === 1 ? "" : "s"} waiting to upload{registeredEvidence ? ` · ${registeredEvidence} already verified` : ""}</p> : null}
        {item.last_safe_error ? <p className="mt-1 text-[12px] text-muted">{item.last_safe_error}</p> : null}
      </div>
      <StatusPill tone={status.tone} dot={item.state !== "synced"}>{status.label}</StatusPill>
    </li>
  );
}

export function OfflineSyncWorkspace() {
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();
  const userId = user?.id;
  const [isOnline, setIsOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine);
  const query = useQuery({
    queryKey: userId ? OFFLINE_DRAFT_QUERY(userId) : ["offline-money-drafts", "none"],
    queryFn: () => listOfflineMoneyDrafts(userId!),
    enabled: userId !== undefined,
  });
  const items = query.data ?? [];
  const sync = useMutation({
    mutationFn: () => {
      if (!userId) return Promise.resolve([]);
      return syncOfflineMoneyDrafts({
        userId,
        isOnline,
        upload: (workspaceId, payload) => moneyApi.createMoneyRecordDraft(workspaceId, payload),
        uploadEvidence: (workspaceId, draftId, evidence) => uploadPrivateEvidence({ workspaceId, draftId, evidence }),
      });
    },
    onSuccess: (next) => {
      if (userId) queryClient.setQueryData(OFFLINE_DRAFT_QUERY(userId), next);
    },
  });
  const clearSynced = useMutation({
    mutationFn: async () => {
      if (!userId) return;
      await clearSyncedOfflineMoneyDrafts(userId);
      return listOfflineMoneyDrafts(userId);
    },
    onSuccess: (next) => {
      if (userId && next) queryClient.setQueryData(OFFLINE_DRAFT_QUERY(userId), next);
    },
  });

  useEffect(() => {
    if (!userId) return;
    const refresh = () => void queryClient.invalidateQueries({ queryKey: OFFLINE_DRAFT_QUERY(userId) });
    const syncWhenOnline = () => {
      setIsOnline(true);
      refresh();
      void sync.mutateAsync();
    };
    const setOffline = () => setIsOnline(false);
    window.addEventListener("online", syncWhenOnline);
    window.addEventListener("offline", setOffline);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("online", syncWhenOnline);
      window.removeEventListener("offline", setOffline);
      window.removeEventListener("storage", refresh);
    };
  }, [queryClient, sync, userId]);

  if (!userId) return null;

  const active = countActive(items);
  const review = items.filter((item) => item.state === "needs_review" || item.state === "failed_permanent").length;
  const synced = items.filter((item) => item.state === "synced").length;

  return (
    <Page>
      <PageHeader
        title="Offline drafts & sync"
        description="Local drafts and staged receipts stay unposted until Rekordly validates them online."
        actions={<AppButton label="Sync now" startContent={<ArrowsClockwise />} isLoading={sync.isPending} isDisabled={!isOnline || active === 0} onPress={() => sync.mutate()} />}
      />
      {!isOnline ? <Alert status="warning" title="You are offline" description="You can keep drafting. Nothing in this list changes balances until it is checked by Rekordly." /> : null}
      {sync.error ? <Alert status="error" title="Sync did not finish" description={sync.error instanceof Error ? sync.error.message : "Try again when the connection is stable."} /> : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <SyncMetric label="Awaiting sync" value={active} icon={CloudArrowUp} tone="warning" />
        <SyncMetric label="Needs attention" value={review} icon={WarningCircle} tone={review ? "danger" : "neutral"} />
        <SyncMetric label="Saved safely" value={synced} icon={CheckCircle} tone="success" />
      </div>

      <DashboardCard>
        <SectionHeader
          title="Your local drafts"
          description="A draft is saved only after its server copy and every staged receipt have uploaded. You can then clear the local copy."
          actions={synced > 0 ? <AppButton variant="ghost" label="Clear saved copies" isLoading={clearSynced.isPending} onPress={() => clearSynced.mutate()} /> : undefined}
        />
        {query.isPending ? <div className="mt-5 h-28 animate-pulse rounded-2xl bg-default" /> : null}
        {!query.isPending && items.length === 0 ? <EmptyState icon={CloudSlash} title="No offline drafts" description="Any record you save while offline will appear here for a safe online review." /> : null}
        {items.length > 0 ? <ul className="mt-4">{items.map((item) => <DraftRow key={item.client_command_id} item={item} />)}</ul> : null}
      </DashboardCard>
    </Page>
  );
}

function SyncMetric({ label, value, icon: Icon, tone }: { label: string; value: number; icon: Icon; tone: "success" | "warning" | "danger" | "neutral" }) {
  const toneClass = {
    success: "bg-success-soft text-success",
    warning: "bg-warning-soft text-warning",
    danger: "bg-danger-soft text-danger",
    neutral: "bg-default text-muted",
  }[tone];
  return <DashboardCard><div className="flex items-center justify-between"><span className="text-[13px] font-medium text-muted">{label}</span><span className={`grid size-9 place-items-center rounded-2xl ${toneClass}`}><Icon size={18} weight="duotone" aria-hidden="true" /></span></div><p className="mt-5 tabular text-[28px] font-bold tracking-[-0.03em] text-foreground">{value}</p></DashboardCard>;
}
