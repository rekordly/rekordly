import { apiClient, workspaceHeaders } from "./api.ts";
import {
  buildPartitionKey,
  getCachedManifest,
  getOfflineDB,
  listPartitionCommands,
  putCachedManifest,
  putQueuedCommand,
  type OfflineCapabilityManifest,
  type OfflineQueueLimits,
  type QueuedCommandRecord,
} from "./offline-db.ts";

export interface SyncCommandResult {
  client_command_id: string;
  idempotency_key: string;
  command_type: string;
  status:
    | "confirmed"
    | "processing"
    | "needs_review"
    | "failed_permanent"
    | "retry_later"
    | "dependency_blocked"
    | "unsupported_version";
  replayed: boolean;
  conflict_code?: string;
  safe_message?: string;
  conflict_fields?: string[];
  allowed_resolutions?: string[];
  current_snapshot?: unknown;
  server_resource_type?: string;
  server_resource_id?: string;
  server_resource_version?: string;
  local_id_mappings?: Record<string, string>;
  result?: unknown;
  server_time: string;
}

export interface SyncBatchResponse {
  sync_session_id?: string;
  server_time: string;
  results: SyncCommandResult[];
}

export interface SyncSessionResponse {
  sync_session_id: string;
  status: string;
  expires_at: string;
  server_time: string;
  entitlement_revision: string;
  permission_revision: string;
  manifest: OfflineCapabilityManifest;
}

const BACKOFF_SCHEDULE_MS = [5_000, 15_000, 60_000, 300_000, 900_000] as const;

export function computeBackoffMs(attemptCount: number, retryAfterSeconds?: number): number {
  if (retryAfterSeconds && retryAfterSeconds > 0) {
    return Math.min(retryAfterSeconds * 1000, 900_000);
  }
  const idx = Math.min(Math.max(attemptCount, 0), BACKOFF_SCHEDULE_MS.length - 1);
  return BACKOFF_SCHEDULE_MS[idx];
}

export function sortCommandsTopologically(commands: readonly QueuedCommandRecord[]): QueuedCommandRecord[] {
  const byId = new Map<string, QueuedCommandRecord>();
  for (const cmd of commands) {
    byId.set(cmd.client_command_id, cmd);
  }
  const state = new Map<string, 0 | 1 | 2>();
  const ordered: QueuedCommandRecord[] = [];

  function visit(id: string) {
    const s = state.get(id) ?? 0;
    if (s === 2) return;
    if (s === 1) {
      throw new Error("DEPENDENCY_CYCLE");
    }
    const item = byId.get(id);
    if (!item) return;
    state.set(id, 1);
    for (const dep of item.dependencies) {
      if (byId.has(dep)) {
        visit(dep);
      }
    }
    state.set(id, 2);
    ordered.push(item);
  }

  for (const cmd of commands) {
    visit(cmd.client_command_id);
  }
  return ordered;
}

export function checkQueueCapacity(
  existing: readonly QueuedCommandRecord[],
  newPayloadBytes: number,
  limits: Pick<OfflineQueueLimits, "max_active_queue_items" | "max_aggregate_payload_bytes">,
): { allowed: true } | { allowed: false; code: "OFFLINE_QUEUE_LIMIT_REACHED"; reason: string } {
  const active = existing.filter((c) => c.state !== "confirmed" && c.state !== "cancelled");
  if (active.length >= limits.max_active_queue_items) {
    return {
      allowed: false,
      code: "OFFLINE_QUEUE_LIMIT_REACHED",
      reason: `Queue limit reached (${limits.max_active_queue_items} active items). Save as a local draft or sync online first.`,
    };
  }
  const totalBytes = active.reduce((sum, c) => sum + c.payload_bytes, 0) + newPayloadBytes;
  if (totalBytes > limits.max_aggregate_payload_bytes) {
    return {
      allowed: false,
      code: "OFFLINE_QUEUE_LIMIT_REACHED",
      reason: "Offline queue byte capacity reached. Save as a local draft or sync existing items online.",
    };
  }
  return { allowed: true };
}

export function buildUnpostedIntentExport(cmd: QueuedCommandRecord): string {
  const payloadCopy = { ...cmd.payload };
  delete payloadCopy.token;
  delete payloadCopy.session_token;
  delete payloadCopy.otp;

  return JSON.stringify(
    {
      notice: "Unposted local intent — not yet confirmed by Rekordly.",
      client_command_id: cmd.client_command_id,
      command_type: cmd.command_type,
      schema_version: cmd.schema_version,
      state: cmd.state,
      created_at_local: cmd.created_at_local,
      payload: payloadCopy,
    },
    null,
    2,
  );
}

export function buildRedactedSyncDiagnostic(params: {
  userId: number;
  workspaceId: number;
  installationId: string;
  commands: readonly QueuedCommandRecord[];
  lastSuccessfulSyncAt: string | null;
  connectivityState: string;
}): string {
  const counts: Record<string, number> = {};
  for (const c of params.commands) {
    counts[c.state] = (counts[c.state] ?? 0) + 1;
  }
  return JSON.stringify(
    {
      app_schema_version: 1,
      installation_id: params.installationId,
      user_id: params.userId,
      workspace_id: params.workspaceId,
      connectivity_state: params.connectivityState,
      last_successful_sync_at: params.lastSuccessfulSyncAt,
      queue_counts: counts,
      commands: params.commands.map((c) => ({
        client_command_id: c.client_command_id,
        command_type: c.command_type,
        schema_version: c.schema_version,
        state: c.state,
        attempt_count: c.attempt_count,
        conflict_code: c.conflict_code ?? null,
        created_at_local: c.created_at_local,
      })),
    },
    null,
    2,
  );
}

export function getOrCreateInstallationId(): string {
  if (typeof window === "undefined") return "server-render";
  const key = "rekordly.installation_id";
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const created = `inst_${crypto.randomUUID()}`;
  window.localStorage.setItem(key, created);
  return created;
}

async function acquireLeaderLease(installationId: string, tabId: string, ttlMs = 15_000): Promise<boolean> {
  const db = await getOfflineDB();
  const now = Date.now();
  const tx = db.transaction("leader_leases", "readwrite");
  const current = await tx.store.get(installationId);
  if (current && current.tab_id !== tabId && current.expires_at > now) {
    await tx.done;
    return false;
  }
  await tx.store.put({
    installation_id: installationId,
    tab_id: tabId,
    expires_at: now + ttlMs,
    updated_at: now,
  });
  await tx.done;
  return true;
}

export const syncApi = {
  getCapabilities(workspaceId: number) {
    return apiClient.get<OfflineCapabilityManifest>("/api/v1/offline/capabilities", {
      headers: workspaceHeaders(workspaceId),
    });
  },
  createSession(workspaceId: number, installationId: string) {
    return apiClient.post<
      {
        installation_id: string;
        client_app_version: string;
        client_schema_version: number;
        client_timezone: string;
      },
      SyncSessionResponse
    >(
      "/api/v1/sync/sessions",
      {
        installation_id: installationId,
        client_app_version: "2.0.0",
        client_schema_version: 1,
        client_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      },
      { headers: workspaceHeaders(workspaceId) },
    );
  },
  submitBatch(workspaceId: number, installationId: string, syncSessionId: string, commands: QueuedCommandRecord[]) {
    return apiClient.post<unknown, SyncBatchResponse>(
      "/api/v1/sync/commands:batch",
      {
        installation_id: installationId,
        sync_session_id: syncSessionId,
        commands: commands.map((c) => ({
          client_command_id: c.client_command_id,
          idempotency_key: c.idempotency_key,
          supersedes_client_command_id: c.supersedes_client_command_id,
          command_type: c.command_type,
          schema_version: c.schema_version,
          payload_hash: c.payload_hash,
          base_versions: c.base_versions,
          dependencies: c.dependencies,
          created_at_local: c.created_at_local,
          payload: c.payload,
        })),
      },
      { headers: workspaceHeaders(workspaceId) },
    );
  },
};

export async function runSingleLeaderSync(userId: number, workspaceId: number): Promise<QueuedCommandRecord[]> {
  const partitionKey = buildPartitionKey(userId, workspaceId);
  const installationId = getOrCreateInstallationId();
  const tabId = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now());

  const hasLease = await acquireLeaderLease(installationId, tabId);
  if (!hasLease) {
    return listPartitionCommands(partitionKey);
  }

  const manifest = await syncApi.getCapabilities(workspaceId);
  await putCachedManifest(partitionKey, manifest);

  const all = await listPartitionCommands(partitionKey);
  const ready = sortCommandsTopologically(
    all.filter((c) => c.state === "queued" && (!c.next_attempt_at || Date.parse(c.next_attempt_at) <= Date.now())),
  );

  if (ready.length === 0) {
    return all;
  }

  const session = await syncApi.createSession(workspaceId, installationId);
  const batchRes = await syncApi.submitBatch(workspaceId, installationId, session.sync_session_id, ready.slice(0, 25));

  const byId = new Map(ready.map((c) => [c.client_command_id, c]));
  for (const r of batchRes.results) {
    const cmd = byId.get(r.client_command_id);
    if (!cmd) continue;
    const nextAttempt =
      r.status === "retry_later" ? new Date(Date.now() + computeBackoffMs(cmd.attempt_count)).toISOString() : null;
    const nextState =
      r.status === "retry_later"
        ? ("queued" as const)
        : r.status === "processing"
          ? ("syncing" as const)
          : r.status;
    await putQueuedCommand({
      ...cmd,
      state: nextState,
      attempt_count: cmd.attempt_count + 1,
      next_attempt_at: nextAttempt,
      last_safe_error: r.safe_message ?? null,
      conflict_code: r.conflict_code,
      conflict_fields: r.conflict_fields,
      allowed_resolutions: r.allowed_resolutions,
      current_snapshot: r.current_snapshot,
      server_resource_type: r.server_resource_type,
      server_resource_id: r.server_resource_id,
      confirmed_at_local: r.status === "confirmed" ? new Date().toISOString() : cmd.confirmed_at_local,
    });
  }

  return listPartitionCommands(partitionKey);
}

export async function getManifestOrCached(userId: number, workspaceId: number): Promise<OfflineCapabilityManifest | null> {
  const partitionKey = buildPartitionKey(userId, workspaceId);
  try {
    const manifest = await syncApi.getCapabilities(workspaceId);
    await putCachedManifest(partitionKey, manifest);
    return manifest;
  } catch {
    const cached = await getCachedManifest(partitionKey);
    return cached?.manifest ?? null;
  }
}
