import assert from "node:assert/strict";
import { test } from "node:test";

import { buildPartitionKey, isPartitionOwnedByUser, type QueuedCommandRecord } from "../src/lib/offline-db.ts";
import {
  buildRedactedSyncDiagnostic,
  buildUnpostedIntentExport,
  checkQueueCapacity,
  computeBackoffMs,
  sortCommandsTopologically,
} from "../src/lib/sync-engine.ts";

function makeCmd(overrides: Partial<QueuedCommandRecord> = {}): QueuedCommandRecord {
  return {
    partition_key: "production:u_10:ws_20:v1",
    client_command_id: "cmd-1",
    idempotency_key: "off_1",
    command_type: "money_draft.create",
    schema_version: 1,
    user_id: 10,
    workspace_id: 20,
    created_at_local: "2026-11-12T10:00:00Z",
    confirmed_at_local: "",
    base_versions: {},
    permission_revision: "perm_abc",
    entitlement_revision: "ent_rev_1",
    dependencies: [],
    payload_hash: "sha256:abc",
    payload_bytes: 256,
    payload: { amount: "5000.00", currency: "NGN", description: "Fuel" },
    state: "queued",
    attempt_count: 0,
    next_attempt_at: null,
    last_safe_error: null,
    ...overrides,
  };
}

test("Blueprint 15: partition keys strictly isolate user and workspace", () => {
  const k1 = buildPartitionKey(10, 20, "production", 1);
  const k2 = buildPartitionKey(11, 20, "production", 1);
  assert.notEqual(k1, k2);
  assert.equal(isPartitionOwnedByUser(k1, 10), true);
  assert.equal(isPartitionOwnedByUser(k1, 11), false);
});

test("Blueprint 15: topological sort orders dependencies and rejects cycles", () => {
  const parent = makeCmd({ client_command_id: "parent", dependencies: [] });
  const child = makeCmd({ client_command_id: "child", dependencies: ["parent"] });

  const sorted = sortCommandsTopologically([child, parent]);
  assert.deepEqual(
    sorted.map((c) => c.client_command_id),
    ["parent", "child"],
  );

  const cycleA = makeCmd({ client_command_id: "a", dependencies: ["b"] });
  const cycleB = makeCmd({ client_command_id: "b", dependencies: ["a"] });
  assert.throws(() => sortCommandsTopologically([cycleA, cycleB]), /DEPENDENCY_CYCLE/);
});

test("Blueprint 15: queue capacity blocks new confirmations without evicting", () => {
  const existing = [makeCmd({ client_command_id: "c1", payload_bytes: 500 })];
  const overItems = checkQueueCapacity(existing, 100, {
    max_active_queue_items: 1,
    max_aggregate_payload_bytes: 10_000,
  });
  assert.equal(overItems.allowed, false);
  if (!overItems.allowed) {
    assert.equal(overItems.code, "OFFLINE_QUEUE_LIMIT_REACHED");
  }

  const overBytes = checkQueueCapacity(existing, 600, {
    max_active_queue_items: 10,
    max_aggregate_payload_bytes: 1000,
  });
  assert.equal(overBytes.allowed, false);
});

test("Blueprint 15: unposted intent export & redacted diagnostics exclude secrets", () => {
  const cmd = makeCmd({
    payload: { amount: "5000.00", token: "secret-tok", otp: "123456", description: "Fuel" },
    conflict_code: "PERIOD_LOCKED",
  });
  const exported = buildUnpostedIntentExport(cmd);
  assert.match(exported, /Unposted local intent — not yet confirmed by Rekordly\./);
  assert.equal(exported.includes("secret-tok"), false);
  assert.equal(exported.includes("123456"), false);

  const diag = buildRedactedSyncDiagnostic({
    userId: 10,
    workspaceId: 20,
    installationId: "inst_1",
    commands: [cmd],
    lastSuccessfulSyncAt: null,
    connectivityState: "offline_confirmed",
  });
  assert.equal(diag.includes("5000.00"), false);
  assert.equal(diag.includes("Fuel"), false);
  assert.match(diag, /PERIOD_LOCKED/);
});

test("Blueprint 15: exponential backoff respects Retry-After and cap", () => {
  assert.equal(computeBackoffMs(0), 5_000);
  assert.equal(computeBackoffMs(1), 15_000);
  assert.equal(computeBackoffMs(10), 900_000);
  assert.equal(computeBackoffMs(0, 42), 42_000);
});
