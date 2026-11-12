import { openDB, type DBSchema, type IDBPDatabase } from "idb";

export const OFFLINE_LOCAL_SCHEMA_VERSION = 1;
export const OFFLINE_DB_NAME = "rekordly-offline-v2";

export type OfflineCommandState =
  | "local_draft"
  | "queued"
  | "syncing"
  | "confirmed"
  | "needs_review"
  | "failed_permanent"
  | "dependency_blocked"
  | "unsupported_version"
  | "cancelled";

export type OfflineMode = "none" | "read_only" | "draft_only" | "queued_commands";

export interface OfflineQueueLimits {
  max_active_queue_items: number;
  max_aggregate_payload_bytes: number;
  max_attachment_staging_bytes: number;
  max_item_age_hours: number;
  max_dependency_depth: number;
  max_attempts: number;
  max_offline_duration_hours: number;
}

export interface OfflineCommandPolicy {
  mode: string;
  schema_versions: number[];
  max_age_hours: number;
  required_permission?: string;
}

export interface OfflineCapabilityManifest {
  manifest_version: string;
  offline_mode: OfflineMode;
  plan_offline_mode: OfflineMode;
  launch_gate_capped: boolean;
  entitlement_revision: string;
  permission_revision: string;
  expires_at: string;
  server_time: string;
  limits: OfflineQueueLimits;
  commands: Record<string, OfflineCommandPolicy>;
}

export interface LocalDraftRecord {
  partition_key: string;
  local_draft_id: string;
  user_id: number;
  workspace_id: number;
  schema_version: number;
  revision: number;
  command_type: string;
  title: string;
  payload: Record<string, unknown>;
  created_at_local: string;
  updated_at_local: string;
}

export interface QueuedCommandRecord {
  partition_key: string;
  client_command_id: string;
  idempotency_key: string;
  supersedes_client_command_id?: string;
  command_type: string;
  schema_version: number;
  user_id: number;
  workspace_id: number;
  created_at_local: string;
  confirmed_at_local: string;
  base_versions: Record<string, string>;
  permission_revision: string;
  entitlement_revision: string;
  dependencies: string[];
  payload_hash: string;
  payload_bytes: number;
  payload: Record<string, unknown>;
  state: OfflineCommandState;
  attempt_count: number;
  next_attempt_at: string | null;
  last_safe_error: string | null;
  conflict_code?: string;
  conflict_fields?: string[];
  allowed_resolutions?: string[];
  current_snapshot?: unknown;
  server_resource_type?: string;
  server_resource_id?: string;
}

export interface CachedProjectionRecord {
  key: string; // `${partition_key}:${resource_type}`
  partition_key: string;
  cache_schema_version: number;
  user_id: number;
  workspace_id: number;
  resource_type: string;
  resource_version: string;
  server_as_of: string;
  cached_at: string;
  entitlement_revision: string;
  permission_revision: string;
  payload: unknown;
}

export interface IdMappingRecord {
  key: string; // `${partition_key}:${local_id}`
  partition_key: string;
  local_id: string;
  server_resource_type: string;
  server_resource_id: string;
  mapped_at: string;
}

export interface StagedFileRecord {
  id: string;
  partition_key: string;
  client_command_id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  state: "local_only" | "uploading" | "registered" | "failed";
  blob: Blob;
  server_file_id?: string;
  created_at_local: string;
}

export interface ManifestCacheRecord {
  partition_key: string;
  manifest: OfflineCapabilityManifest;
  cached_at: string;
}

export interface SyncLeaderLeaseRecord {
  installation_id: string;
  tab_id: string;
  expires_at: number;
  updated_at: number;
}

interface OfflineV2DB extends DBSchema {
  local_drafts: {
    key: string;
    value: LocalDraftRecord;
    indexes: { "by-partition": string };
  };
  queued_commands: {
    key: string;
    value: QueuedCommandRecord;
    indexes: { "by-partition": string; "by-state": OfflineCommandState };
  };
  id_mappings: {
    key: string;
    value: IdMappingRecord;
    indexes: { "by-partition": string };
  };
  cached_projections: {
    key: string;
    value: CachedProjectionRecord;
    indexes: { "by-partition": string };
  };
  staged_files: {
    key: string;
    value: StagedFileRecord;
    indexes: { "by-partition": string; "by-command": string };
  };
  offline_capability_manifest: {
    key: string;
    value: ManifestCacheRecord;
  };
  leader_leases: {
    key: string;
    value: SyncLeaderLeaseRecord;
  };
}

export function buildPartitionKey(
  userId: number,
  workspaceId: number,
  env = process.env.NODE_ENV ?? "production",
  schemaVersion = OFFLINE_LOCAL_SCHEMA_VERSION,
): string {
  return `${env}:u_${userId}:ws_${workspaceId}:v${schemaVersion}`;
}

export function isPartitionOwnedByUser(partitionKey: string, userId: number): boolean {
  return partitionKey.includes(`:u_${userId}:`);
}

let dbPromise: Promise<IDBPDatabase<OfflineV2DB>> | null = null;

export function getOfflineDB(): Promise<IDBPDatabase<OfflineV2DB>> {
  if (!dbPromise) {
    dbPromise = openDB<OfflineV2DB>(OFFLINE_DB_NAME, OFFLINE_LOCAL_SCHEMA_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("local_drafts")) {
          const drafts = db.createObjectStore("local_drafts", { keyPath: "local_draft_id" });
          drafts.createIndex("by-partition", "partition_key");
        }
        if (!db.objectStoreNames.contains("queued_commands")) {
          const cmds = db.createObjectStore("queued_commands", { keyPath: "client_command_id" });
          cmds.createIndex("by-partition", "partition_key");
          cmds.createIndex("by-state", "state");
        }
        if (!db.objectStoreNames.contains("id_mappings")) {
          const maps = db.createObjectStore("id_mappings", { keyPath: "key" });
          maps.createIndex("by-partition", "partition_key");
        }
        if (!db.objectStoreNames.contains("cached_projections")) {
          const proj = db.createObjectStore("cached_projections", { keyPath: "key" });
          proj.createIndex("by-partition", "partition_key");
        }
        if (!db.objectStoreNames.contains("staged_files")) {
          const files = db.createObjectStore("staged_files", { keyPath: "id" });
          files.createIndex("by-partition", "partition_key");
          files.createIndex("by-command", "client_command_id");
        }
        if (!db.objectStoreNames.contains("offline_capability_manifest")) {
          db.createObjectStore("offline_capability_manifest", { keyPath: "partition_key" });
        }
        if (!db.objectStoreNames.contains("leader_leases")) {
          db.createObjectStore("leader_leases", { keyPath: "installation_id" });
        }
      },
    });
  }
  return dbPromise;
}

export async function listPartitionCommands(partitionKey: string): Promise<QueuedCommandRecord[]> {
  const db = await getOfflineDB();
  return db.getAllFromIndex("queued_commands", "by-partition", partitionKey);
}

export async function listPartitionDrafts(partitionKey: string): Promise<LocalDraftRecord[]> {
  const db = await getOfflineDB();
  return db.getAllFromIndex("local_drafts", "by-partition", partitionKey);
}

export async function putQueuedCommand(record: QueuedCommandRecord): Promise<void> {
  const db = await getOfflineDB();
  const tx = db.transaction("queued_commands", "readwrite");
  await tx.store.put(record);
  await tx.done;
}

export async function saveLocalDraft(draft: LocalDraftRecord): Promise<void> {
  const db = await getOfflineDB();
  await db.put("local_drafts", draft);
}

export async function deleteLocalDraft(localDraftId: string): Promise<void> {
  const db = await getOfflineDB();
  await db.delete("local_drafts", localDraftId);
}

export async function putCachedManifest(partitionKey: string, manifest: OfflineCapabilityManifest): Promise<void> {
  const db = await getOfflineDB();
  await db.put("offline_capability_manifest", {
    partition_key: partitionKey,
    manifest,
    cached_at: new Date().toISOString(),
  });
}

export async function getCachedManifest(partitionKey: string): Promise<ManifestCacheRecord | undefined> {
  const db = await getOfflineDB();
  return db.get("offline_capability_manifest", partitionKey);
}

export async function clearReFetchableCache(partitionKey: string): Promise<void> {
  const db = await getOfflineDB();
  const tx = db.transaction(["cached_projections", "offline_capability_manifest"], "readwrite");
  const projKeys = await tx.objectStore("cached_projections").index("by-partition").getAllKeys(partitionKey);
  for (const key of projKeys) {
    await tx.objectStore("cached_projections").delete(key);
  }
  await tx.objectStore("offline_capability_manifest").delete(partitionKey);
  await tx.done;
}

/**
 * Purges all offline partitions belonging to a user on logout or identity switch,
 * ensuring the next user on a shared device cannot see prior cached projections,
 * drafts, or staged files.
 */
export async function purgeUserOfflinePartitions(userId: number): Promise<void> {
  const db = await getOfflineDB();
  const stores = ["local_drafts", "queued_commands", "id_mappings", "cached_projections", "staged_files"] as const;
  const tx = db.transaction([...stores, "offline_capability_manifest"], "readwrite");

  for (const storeName of stores) {
    const all = await tx.objectStore(storeName).getAll();
    for (const row of all) {
      if (isPartitionOwnedByUser(row.partition_key, userId)) {
        const key =
          storeName === "local_drafts"
            ? (row as LocalDraftRecord).local_draft_id
            : storeName === "queued_commands"
              ? (row as QueuedCommandRecord).client_command_id
              : storeName === "staged_files"
                ? (row as StagedFileRecord).id
                : (row as CachedProjectionRecord | IdMappingRecord).key;
        await tx.objectStore(storeName).delete(key);
      }
    }
  }
  const manifests = await tx.objectStore("offline_capability_manifest").getAll();
  for (const m of manifests) {
    if (isPartitionOwnedByUser(m.partition_key, userId)) {
      await tx.objectStore("offline_capability_manifest").delete(m.partition_key);
    }
  }
  await tx.done;
}
