import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { PRECISE_STATE_LABELS, validateAnalyticsPayload } from "../src/lib/catalogue.ts";

test("Blueprint 18: Go-exported catalogue contract fixture is valid and complete", () => {
  const contractPath = path.resolve(process.cwd(), "..", "shared", "catalogue-contract.json");
  const raw = JSON.parse(readFileSync(contractPath, "utf8")) as {
    schema_version: number;
    commands: Array<{ type: string; version: number; emits_event: string }>;
    events: Array<{ type: string; version: number }>;
    jobs: Array<{ type: string; version: number }>;
    review_item_types: string[];
    error_codes: string[];
    state_machines: Record<string, Record<string, string[]>>;
  };

  assert.equal(raw.schema_version, 1);
  assert.ok(raw.commands.length >= 40);
  assert.ok(raw.events.length >= 40);
  assert.ok(raw.jobs.length >= 5);
  assert.ok(raw.review_item_types.length >= 23);
  assert.ok(raw.error_codes.includes("INVALID_STATE_TRANSITION"));
  assert.deepEqual(raw.state_machines["sales.invoice"]?.voided, []);

  const eventTypes = new Set(raw.events.map((e) => e.type));
  for (const cmd of raw.commands) {
    assert.ok(eventTypes.has(cmd.emits_event), `missing emitted event ${cmd.emits_event}`);
  }
});

test("Blueprint 18: precise state labels and analytics property guardrails", () => {
  assert.equal(PRECISE_STATE_LABELS.queued_offline, "Pending sync");
  assert.equal(PRECISE_STATE_LABELS.email_accepted, "Accepted by email provider");
  assert.equal(PRECISE_STATE_LABELS.whatsapp_handoff, "Opened WhatsApp/share options");

  assert.doesNotThrow(() => validateAnalyticsPayload({ workspace_kind: "business", action: "record_confirmed" }));
  for (const bad of ["amount", "narration", "email", "otp", "token"]) {
    assert.throws(() => validateAnalyticsPayload({ [bad]: "secret" }), /FORBIDDEN_ANALYTICS_PROPERTY/);
  }
});
