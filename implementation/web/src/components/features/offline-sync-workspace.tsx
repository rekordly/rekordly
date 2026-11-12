"use client";

import {
  ArrowsClockwise,
  CheckCircle,
  CloudArrowUp,
  CloudSlash,
  DownloadSimple,
  Trash,
  WarningCircle,
  type Icon,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { AppButton } from "@/components/ui/app-button";
import { DashboardCard } from "@/components/ui/dashboard-card";
import { EmptyState, Page, PageHeader, SectionHeader, StatusPill } from "@/components/ui/page";
import { uploadPrivateEvidence } from "@/lib/evidence";
import { moneyApi } from "@/lib/money";
import {
  buildPartitionKey,
  clearReFetchableCache,
  listPartitionCommands,
  listPartitionDrafts,
  putQueuedCommand,
  type LocalDraftRecord,
  type QueuedCommandRecord,
} from "@/lib/offline-db";
import {
  clearSyncedOfflineMoneyDrafts,
  listOfflineMoneyDrafts,
  syncOfflineMoneyDrafts,
  type OfflineDraftState,
  type OfflineMoneyDraft,
} from "@/lib/offline-drafts";
import {
  buildRedactedSyncDiagnostic,
  buildUnpostedIntentExport,
  getManifestOrCached,
  getOrCreateInstallationId,
  runSingleLeaderSync,
} from "@/lib/sync-engine";
import { useAuthStore } from "@/stores/auth-store";
import { useActiveWorkspace } from "@/stores/workspace-store";

const OFFLINE_DRAFT_QUERY = (userId: number) => ["offline-money-drafts", userId] as const;
const SYNC_COMMANDS_QUERY = (userId: number, workspaceId: number) => ["offline-sync-commands", userId, workspaceId] as const;

const STATUS: Record<OfflineDraftState, { label: string; tone: "success" | "warning" | "danger" | "accent" | "neutral" }> = {
  queued: { label: "Queued", tone: "warning" },
  syncing: { label: "Syncing", tone: "accent" },
  needs_review: { label: "Needs review", tone: "danger" },
  failed_permanent: { label: "Could not sync", tone: "danger" },
  synced: { label: "Saved to Rekordly", tone: "success" },
};

const COMMAND_STATUS: Record<
  QueuedCommandRecord["state"],
  { label: string; tone: "success" | "warning" | "danger" | "accent" | "neutral" }
> = {
  local_draft: { label: "Local draft", tone: "neutral" },
  queued: { label: "Queued", tone: "warning" },
  syncing: { label: "Syncing", tone: "accent" },
  confirmed: { label: "Synced", tone: "success" },
  needs_review: { label: "Needs review", tone: "danger" },
  failed_permanent: { label: "Failed", tone: "danger" },
  dependency_blocked: { label: "Waiting for dependency", tone: "warning" },
  unsupported_version: { label: "Needs migration", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "neutral" },
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
        {queuedEvidence ? (
          <p className="mt-1 text-[12px] text-muted">
            {queuedEvidence} receipt{queuedEvidence === 1 ? "" : "s"} waiting to upload
            {registeredEvidence ? ` · ${registeredEvidence} already verified` : ""}
          </p>
        ) : null}
        {item.last_safe_error ? <p className="mt-1 text-[12px] text-muted">{item.last_safe_error}</p> : null}
      </div>
      <StatusPill tone={status.tone} dot={item.state !== "synced"}>
        {status.label}
      </StatusPill>
    </li>
  );
}

function CommandRow({
  cmd,
  onExport,
  onCancel,
}: {
  cmd: QueuedCommandRecord;
  onExport: (cmd: QueuedCommandRecord) => void;
  onCancel: (cmd: QueuedCommandRecord) => void;
}) {
  const status = COMMAND_STATUS[cmd.state];
  return (
    <li className="flex flex-col gap-3 border-b border-default py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-[14px] font-medium text-foreground">{cmd.command_type}</p>
          <span className="text-[11px] font-mono text-muted">{cmd.client_command_id}</span>
        </div>
        <p className="mt-0.5 text-[12px] text-muted">
          Created {new Date(cmd.created_at_local).toLocaleString()} · attempts: {cmd.attempt_count}
        </p>
        {cmd.conflict_code ? (
          <p className="mt-1 text-[12px] font-medium text-danger">
            {cmd.conflict_code}: {cmd.last_safe_error || "Review required before resubmitting."}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill tone={status.tone} dot={cmd.state !== "confirmed"}>
          {status.label}
        </StatusPill>
        <AppButton size="sm" variant="ghost" label="Export intent" onPress={() => onExport(cmd)} />
        {cmd.state === "queued" || cmd.state === "needs_review" || cmd.state === "dependency_blocked" ? (
          <AppButton size="sm" variant="ghost" label="Cancel" onPress={() => onCancel(cmd)} />
        ) : null}
      </div>
    </li>
  );
}

export function OfflineSyncWorkspace() {
  const user = useAuthStore((state) => state.user);
  const workspace = useActiveWorkspace();
  const queryClient = useQueryClient();
  const userId = user?.id;
  const workspaceId = workspace.active?.id;
  const [isOnline, setIsOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine);
  const [notice, setNotice] = useState<string | null>(null);

  const query = useQuery({
    queryKey: userId ? OFFLINE_DRAFT_QUERY(userId) : ["offline-money-drafts", "none"],
    queryFn: () => listOfflineMoneyDrafts(userId!),
    enabled: userId !== undefined,
  });

  const commandsQuery = useQuery({
    queryKey: userId && workspaceId ? SYNC_COMMANDS_QUERY(userId, workspaceId) : ["offline-sync-commands", "none"],
    queryFn: () => listPartitionCommands(buildPartitionKey(userId!, workspaceId!)),
    enabled: userId !== undefined && workspaceId !== undefined,
  });

  const draftsQuery = useQuery({
    queryKey: userId && workspaceId ? ["offline-local-drafts", userId, workspaceId] : ["offline-local-drafts", "none"],
    queryFn: () => listPartitionDrafts(buildPartitionKey(userId!, workspaceId!)),
    enabled: userId !== undefined && workspaceId !== undefined,
  });

  const manifestQuery = useQuery({
    queryKey: userId && workspaceId ? ["offline-capabilities", userId, workspaceId] : ["offline-capabilities", "none"],
    queryFn: () => getManifestOrCached(userId!, workspaceId!),
    enabled: userId !== undefined && workspaceId !== undefined,
  });

  const items = query.data ?? [];
  const commands = commandsQuery.data ?? [];
  const localDrafts: LocalDraftRecord[] = draftsQuery.data ?? [];

  const sync = useMutation({
    mutationFn: async () => {
      if (!userId) return [];
      const draftResults = await syncOfflineMoneyDrafts({
        userId,
        isOnline,
        upload: (wsId, payload) => moneyApi.createMoneyRecordDraft(wsId, payload),
        uploadEvidence: (wsId, draftId, evidence) => uploadPrivateEvidence({ workspaceId: wsId, draftId, evidence }),
      });
      if (workspaceId && isOnline) {
        const nextCmds = await runSingleLeaderSync(userId, workspaceId);
        queryClient.setQueryData(SYNC_COMMANDS_QUERY(userId, workspaceId), nextCmds);
      }
      return draftResults;
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

  const clearCacheMutation = useMutation({
    mutationFn: async () => {
      if (!userId || !workspaceId) return;
      await clearReFetchableCache(buildPartitionKey(userId, workspaceId));
    },
    onSuccess: () => {
      setNotice("Cleared re-fetchable cached projections. Unsynced drafts and queued commands were preserved.");
    },
  });

  useEffect(() => {
    if (!userId) return;
    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: OFFLINE_DRAFT_QUERY(userId) });
      if (workspaceId) {
        void queryClient.invalidateQueries({ queryKey: SYNC_COMMANDS_QUERY(userId, workspaceId) });
      }
    };
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
  }, [queryClient, sync, userId, workspaceId]);

  if (!userId) return null;

  const active = countActive(items) + commands.filter((c) => c.state === "queued" || c.state === "syncing" || c.state === "dependency_blocked").length;
  const review =
    items.filter((item) => item.state === "needs_review" || item.state === "failed_permanent").length +
    commands.filter((c) => c.state === "needs_review" || c.state === "failed_permanent" || c.state === "unsupported_version").length;
  const synced = items.filter((item) => item.state === "synced").length + commands.filter((c) => c.state === "confirmed").length;

  const handleExportIntent = (cmd: QueuedCommandRecord) => {
    const text = buildUnpostedIntentExport(cmd);
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rekordly-unposted-intent-${cmd.client_command_id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportDiagnostics = () => {
    if (!workspaceId) return;
    const text = buildRedactedSyncDiagnostic({
      userId,
      workspaceId,
      installationId: getOrCreateInstallationId(),
      commands,
      lastSuccessfulSyncAt: commands.find((c) => c.state === "confirmed")?.confirmed_at_local ?? null,
      connectivityState: isOnline ? "online_healthy" : "offline_confirmed",
    });
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rekordly-sync-diagnostics-ws-${workspaceId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCancelCommand = async (cmd: QueuedCommandRecord) => {
    await putQueuedCommand({ ...cmd, state: "cancelled" });
    if (workspaceId) {
      void queryClient.invalidateQueries({ queryKey: SYNC_COMMANDS_QUERY(userId, workspaceId) });
    }
  };

  return (
    <Page>
      <PageHeader
        title="Offline drafts & sync"
        description="Local drafts and queued commands stay unposted until Rekordly validates and confirms them on the server."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {workspaceId ? (
              <>
                <AppButton
                  variant="secondary"
                  label="Export diagnostics"
                  startContent={<DownloadSimple />}
                  onPress={handleExportDiagnostics}
                />
                <AppButton
                  variant="ghost"
                  label="Clear cached read data"
                  startContent={<Trash />}
                  isLoading={clearCacheMutation.isPending}
                  onPress={() => clearCacheMutation.mutate()}
                />
              </>
            ) : null}
            <AppButton
              label="Sync now"
              startContent={<ArrowsClockwise />}
              isLoading={sync.isPending}
              isDisabled={!isOnline || active === 0}
              onPress={() => sync.mutate()}
            />
          </div>
        }
      />

      {!isOnline ? (
        <Alert
          status="warning"
          title="You are offline"
          description="You can keep drafting. Nothing in this queue changes posted balances, stock, or ledgers until confirmed by Rekordly."
        />
      ) : null}
      {notice ? <Alert status="info" title="Cache updated" description={notice} /> : null}
      {sync.error ? (
        <Alert
          status="error"
          title="Sync did not finish"
          description={sync.error instanceof Error ? sync.error.message : "Try again when the connection is stable."}
        />
      ) : null}

      {manifestQuery.data ? (
        <DashboardCard>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[13px] font-semibold text-foreground">
                Offline policy mode: <span className="font-mono">{manifestQuery.data.offline_mode}</span>
              </p>
              <p className="text-[12px] text-muted">
                Manifest {manifestQuery.data.manifest_version} · {manifestQuery.data.entitlement_revision} · Max{" "}
                {manifestQuery.data.limits.max_active_queue_items} active items
              </p>
            </div>
            <StatusPill tone="neutral">{manifestQuery.data.launch_gate_capped ? "Safe draft mode" : "Full queue enabled"}</StatusPill>
          </div>
        </DashboardCard>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <SyncMetric label="Awaiting sync" value={active} icon={CloudArrowUp} tone="warning" />
        <SyncMetric label="Needs review" value={review} icon={WarningCircle} tone={review ? "danger" : "neutral"} />
        <SyncMetric label="Confirmed by server" value={synced} icon={CheckCircle} tone="success" />
      </div>

      {commands.length > 0 ? (
        <DashboardCard>
          <SectionHeader
            title="Queued commands & conflict recovery"
            description="Pending commands never affect posted balances. Conflicted items can be exported or cancelled."
          />
          <ul className="mt-4">
            {commands.map((cmd) => (
              <CommandRow key={cmd.client_command_id} cmd={cmd} onExport={handleExportIntent} onCancel={handleCancelCommand} />
            ))}
          </ul>
        </DashboardCard>
      ) : null}

      <DashboardCard>
        <SectionHeader
          title="Your local drafts"
          description={`A draft is saved only after its server copy and every staged receipt have uploaded. Local workspace drafts: ${localDrafts.length}.`}
          actions={
            synced > 0 ? (
              <AppButton variant="ghost" label="Clear saved copies" isLoading={clearSynced.isPending} onPress={() => clearSynced.mutate()} />
            ) : undefined
          }
        />
        {query.isPending ? <div className="mt-5 h-28 animate-pulse rounded-2xl bg-default" /> : null}
        {!query.isPending && items.length === 0 && commands.length === 0 ? (
          <EmptyState
            icon={CloudSlash}
            title="No offline drafts"
            description="Any record you save while offline will appear here for a safe online review."
          />
        ) : null}
        {items.length > 0 ? (
          <ul className="mt-4">
            {items.map((item) => (
              <DraftRow key={item.client_command_id} item={item} />
            ))}
          </ul>
        ) : null}
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
  return (
    <DashboardCard>
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-muted">{label}</span>
        <span className={`grid size-9 place-items-center rounded-2xl ${toneClass}`}>
          <Icon size={18} weight="duotone" aria-hidden="true" />
        </span>
      </div>
      <p className="mt-5 tabular text-[28px] font-bold tracking-[-0.03em] text-foreground">{value}</p>
    </DashboardCard>
  );
}
