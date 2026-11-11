import { openDB, type DBSchema } from "idb";

import { validateEvidenceFile, type EvidenceUploadFile } from "@/lib/evidence";
import { ApiClientError } from "@/lib/errors";
import { createIdempotencyKey } from "@/lib/utils";

export const OFFLINE_DRAFT_LIMIT = 100;

export type OfflineDraftState = "queued" | "syncing" | "needs_review" | "failed_permanent" | "synced";

/**
 * This is intentionally the API draft body, not a client-side financial
 * record. Amounts remain decimal strings and a local item never affects a
 * balance. The server owns conversion, preview and any eventual posting.
 */
export interface OfflineMoneyDraftPayload {
  entry_method: "offline";
  direction: "money_in" | "money_out" | "transfer";
  scope_type: "personal" | "business" | "transfer";
  purpose: string;
  amount: string;
  currency: string;
  effective_date: string;
  money_account_id: number;
  destination_account_id?: number;
  category_id?: number;
  counterparty_name?: string;
  description?: string;
  reference?: string;
  payload: { source: "capture"; offline: true };
  client_command_id: string;
}

export interface OfflineMoneyDraft {
  client_command_id: string;
  idempotency_key: string;
  user_id: number;
  workspace_id: number;
  schema_version: 1;
  created_at_local: string;
  updated_at_local: string;
  state: OfflineDraftState;
  attempt_count: number;
  last_safe_error?: string;
  server_draft_id?: string;
  staged_evidence: OfflineStagedEvidenceMetadata[];
  payload: OfflineMoneyDraftPayload;
}

/** Metadata is readable for the UI; the binary stays in a separate IDB store. */
export interface OfflineStagedEvidenceMetadata {
  id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  state: "queued" | "registered";
}

interface OfflineStagedEvidence extends OfflineStagedEvidenceMetadata {
  client_command_id: string;
  blob: Blob;
  server_evidence_id?: string;
}

interface OfflineDraftDB extends DBSchema {
  money_drafts: {
    key: string;
    value: OfflineMoneyDraft;
    indexes: {
      "by-user": number;
      "by-user-workspace": [number, number];
      "by-state": OfflineDraftState;
    };
  };
  evidence_files: {
    key: string;
    value: OfflineStagedEvidence;
    indexes: { "by-command": string };
  };
}

const DATABASE_NAME = "rekordly-offline-drafts";
const DATABASE_VERSION = 2;
const STORE = "money_drafts";
const EVIDENCE_STORE = "evidence_files";

function database() {
  return openDB<OfflineDraftDB>(DATABASE_NAME, DATABASE_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        const store = db.createObjectStore(STORE, { keyPath: "client_command_id" });
        store.createIndex("by-user", "user_id");
        store.createIndex("by-user-workspace", ["user_id", "workspace_id"]);
        store.createIndex("by-state", "state");
      }
      if (oldVersion < 2) {
        const evidence = db.createObjectStore(EVIDENCE_STORE, { keyPath: "id" });
        evidence.createIndex("by-command", "client_command_id");
      }
    },
  });
}

function now(): string {
  return new Date().toISOString();
}

function active(item: OfflineMoneyDraft): boolean {
  return item.state !== "synced";
}

/** Queue one fully local draft. The transaction succeeds before the UI says it is queued. */
export async function queueOfflineMoneyDraft(input: {
  userId: number;
  workspaceId: number;
  clientCommandId: string;
  idempotencyKey: string;
  payload: OfflineMoneyDraftPayload;
  evidenceFiles?: EvidenceUploadFile[];
}): Promise<OfflineMoneyDraft> {
  const db = await database();
  const tx = db.transaction([STORE, EVIDENCE_STORE], "readwrite");
  const store = tx.objectStore(STORE);
  const existing = await store.get(input.clientCommandId);
  if (existing) {
    await tx.done;
    return existing;
  }

  const ownItems = await store.index("by-user").getAll(input.userId);
  if (ownItems.filter(active).length >= OFFLINE_DRAFT_LIMIT) {
    tx.abort();
    throw new OfflineDraftQueueLimitError();
  }

  const createdAt = now();
  const stagedEvidence = (input.evidenceFiles ?? []).map((file) => {
    const reason = validateEvidenceFile(file);
    if (reason) throw new OfflineEvidenceError(reason);
    return {
      id: createIdempotencyKey("offline-evidence"),
      file_name: file.fileName,
      mime_type: file.mimeType,
      size_bytes: file.sizeBytes,
      state: "queued" as const,
      blob: file.file,
    };
  });
  const item: OfflineMoneyDraft = {
    client_command_id: input.clientCommandId,
    idempotency_key: input.idempotencyKey,
    user_id: input.userId,
    workspace_id: input.workspaceId,
    schema_version: 1,
    created_at_local: createdAt,
    updated_at_local: createdAt,
    state: "queued",
    attempt_count: 0,
    staged_evidence: stagedEvidence.map((evidence) => ({
      id: evidence.id,
      file_name: evidence.file_name,
      mime_type: evidence.mime_type,
      size_bytes: evidence.size_bytes,
      state: evidence.state,
    })),
    payload: input.payload,
  };
  await store.add(item);
  const evidenceStore = tx.objectStore(EVIDENCE_STORE);
  await Promise.all(stagedEvidence.map((evidence) => evidenceStore.add({ ...evidence, client_command_id: input.clientCommandId })));
  await tx.done;
  return item;
}

export async function listOfflineMoneyDrafts(userId: number): Promise<OfflineMoneyDraft[]> {
  const db = await database();
  const items = await db.getAllFromIndex(STORE, "by-user", userId);
  return items
    .map((item) => ({ ...item, staged_evidence: item.staged_evidence ?? [] }))
    .sort((left, right) => right.updated_at_local.localeCompare(left.updated_at_local));
}

export async function clearSyncedOfflineMoneyDrafts(userId: number): Promise<void> {
  const db = await database();
  const tx = db.transaction([STORE, EVIDENCE_STORE], "readwrite");
  const store = tx.objectStore(STORE);
  const items = await store.index("by-user").getAll(userId);
  const evidenceStore = tx.objectStore(EVIDENCE_STORE);
  await Promise.all(items.filter((item) => item.state === "synced").flatMap((item) => [
    store.delete(item.client_command_id),
    ...(item.staged_evidence ?? []).map((evidence) => evidenceStore.delete(evidence.id)),
  ]));
  await tx.done;
}

async function updateOfflineMoneyDraft(
  clientCommandId: string,
  patch: Partial<Pick<OfflineMoneyDraft, "state" | "attempt_count" | "last_safe_error" | "server_draft_id" | "staged_evidence">>,
): Promise<OfflineMoneyDraft | null> {
  const db = await database();
  const tx = db.transaction(STORE, "readwrite");
  const store = tx.objectStore(STORE);
  const current = await store.get(clientCommandId);
  if (!current) {
    await tx.done;
    return null;
  }
  const next = { ...current, ...patch, updated_at_local: now() };
  await store.put(next);
  await tx.done;
  return next;
}

function classifySyncFailure(error: unknown): Pick<OfflineMoneyDraft, "state" | "last_safe_error"> {
  if (error instanceof ApiClientError) {
    // Server decisions such as permission, plan, account and category changes
    // need human review. Preserve the original local intent for editing/export.
    if (error.status === 401) return { state: "needs_review", last_safe_error: "Sign in again before syncing this draft." };
    if (error.status === 403 || error.status === 409 || error.status === 422) return { state: "needs_review", last_safe_error: error.message };
    if (error.status !== null && error.status >= 400 && error.status < 500) return { state: "failed_permanent", last_safe_error: error.message };
  }
  return { state: "queued", last_safe_error: "Could not reach Rekordly. This draft will retry when you sync again." };
}

/**
 * Uploads only local drafts. It deliberately does not call confirmation: a
 * queued item remains a server draft until the user sees the current preview
 * and explicitly confirms it online.
 */
export async function syncOfflineMoneyDrafts(input: {
  userId: number;
  isOnline: boolean;
  upload: (workspaceId: number, payload: OfflineMoneyDraftPayload) => Promise<{ draft: { id: string } }>;
  uploadEvidence: (workspaceId: number, draftId: string, evidence: EvidenceUploadFile) => Promise<{ id: string }>;
}): Promise<OfflineMoneyDraft[]> {
  if (!input.isOnline) return listOfflineMoneyDrafts(input.userId);
  const candidates = (await listOfflineMoneyDrafts(input.userId)).filter((item) => item.state === "queued" || item.state === "syncing");

  for (const candidate of candidates) {
    await updateOfflineMoneyDraft(candidate.client_command_id, {
      state: "syncing",
      attempt_count: candidate.attempt_count + 1,
      last_safe_error: undefined,
    });
    try {
      let draftId = candidate.server_draft_id;
      if (!draftId) {
        const result = await input.upload(candidate.workspace_id, candidate.payload);
        draftId = result.draft.id;
        await updateOfflineMoneyDraft(candidate.client_command_id, { state: "syncing", server_draft_id: draftId });
      }
      const stagedEvidence = await listStagedEvidence(candidate.client_command_id);
      for (const evidence of stagedEvidence) {
        if (evidence.state === "registered") continue;
        const registered = await input.uploadEvidence(candidate.workspace_id, draftId, {
          file: evidence.blob,
          fileName: evidence.file_name,
          mimeType: evidence.mime_type,
          sizeBytes: evidence.size_bytes,
        });
        await markStagedEvidenceRegistered(candidate.client_command_id, evidence.id, registered.id);
      }
      await deleteStagedEvidence(candidate.client_command_id);
      await updateOfflineMoneyDraft(candidate.client_command_id, { state: "synced", server_draft_id: draftId, staged_evidence: [] });
    } catch (error) {
      await updateOfflineMoneyDraft(candidate.client_command_id, classifySyncFailure(error));
    }
  }
  return listOfflineMoneyDrafts(input.userId);
}

async function listStagedEvidence(clientCommandId: string): Promise<OfflineStagedEvidence[]> {
  const db = await database();
  return db.getAllFromIndex(EVIDENCE_STORE, "by-command", clientCommandId);
}

async function deleteStagedEvidence(clientCommandId: string): Promise<void> {
  const db = await database();
  const tx = db.transaction(EVIDENCE_STORE, "readwrite");
  const store = tx.objectStore(EVIDENCE_STORE);
  const evidence = await store.index("by-command").getAll(clientCommandId);
  await Promise.all(evidence.map((item) => store.delete(item.id)));
  await tx.done;
}

/** Persist a successful registration before the next upload, preventing retry duplicates. */
async function markStagedEvidenceRegistered(clientCommandId: string, evidenceID: string, serverEvidenceID: string): Promise<void> {
  const db = await database();
  const tx = db.transaction([STORE, EVIDENCE_STORE], "readwrite");
  const evidenceStore = tx.objectStore(EVIDENCE_STORE);
  const draftStore = tx.objectStore(STORE);
  const evidence = await evidenceStore.get(evidenceID);
  if (evidence && evidence.client_command_id === clientCommandId) {
    await evidenceStore.put({ ...evidence, state: "registered", server_evidence_id: serverEvidenceID });
    const draft = await draftStore.get(clientCommandId);
    if (draft) {
      await draftStore.put({
        ...draft,
        staged_evidence: (draft.staged_evidence ?? []).map((item) => item.id === evidenceID ? { ...item, state: "registered" } : item),
        updated_at_local: now(),
      });
    }
  }
  await tx.done;
}

export class OfflineDraftQueueLimitError extends Error {
  public constructor() {
    super(`You have reached the ${OFFLINE_DRAFT_LIMIT}-draft offline limit. Sync or resolve an existing draft before adding another.`);
    this.name = "OfflineDraftQueueLimitError";
  }
}

export class OfflineEvidenceError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "OfflineEvidenceError";
  }
}
