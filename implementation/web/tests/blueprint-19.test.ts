import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { PRECISE_STATE_LABELS } from "../src/lib/catalogue.ts";

test("Blueprint 19: traceability map and golden fixtures are present and valid", () => {
  const sharedDir = path.resolve(process.cwd(), "..", "shared");
  const trace = JSON.parse(readFileSync(path.join(sharedDir, "bp19-traceability.json"), "utf8")) as {
    entries: Array<{ test_id: string; gate: string; status: string }>;
  };
  const golden = JSON.parse(readFileSync(path.join(sharedDir, "bp19-golden-fixtures.json"), "utf8")) as {
    money_golden_cases: unknown[];
    inventory_golden_cases: unknown[];
    personas: string[];
  };

  assert.ok(trace.entries.length >= 7);
  for (const e of trace.entries) {
    if (e.gate === "G0" || e.gate === "G1") {
      assert.equal(e.status, "passed", `Gate ${e.test_id} (${e.gate}) must be passed`);
    }
  }
  assert.ok(golden.money_golden_cases.length >= 2);
  assert.ok(golden.inventory_golden_cases.length >= 2);
  assert.equal(golden.personas.length, 13);
});

test("Blueprint 19: release-evidence directory and Go/No-Go record exist", () => {
  const repoRoot = path.resolve(process.cwd(), "..", "..");
  for (const rel of [
    "release-evidence/current/release-record.md",
    "release-evidence/current/environment-and-flags.md",
    "release-evidence/current/test-results/summary.md",
    "release-evidence/current/reconciliation/accounting-and-stock.md",
    "release-evidence/current/accessibility/a11y-and-ux.md",
    "release-evidence/current/performance/load-and-concurrency.md",
    "release-evidence/current/providers/provider-readiness.md",
    "release-evidence/current/backup-restore/rehearsal-evidence.md",
    "release-evidence/current/security/abuse-and-privacy.md",
    "release-evidence/current/accountant-review/synthetic-review.md",
    "release-evidence/current/known-issues.md",
    "release-evidence/current/go-no-go.md",
  ]) {
    assert.equal(existsSync(path.join(repoRoot, rel)), true, `missing evidence file ${rel}`);
  }
});

test("Blueprint 19: frontend security headers and precise UI labels are enforced", () => {
  const nextCfg = readFileSync(path.join(process.cwd(), "next.config.ts"), "utf8");
  assert.match(nextCfg, /X-Frame-Options/);
  assert.match(nextCfg, /Content-Security-Policy/);
  assert.match(nextCfg, /Referrer-Policy/);
  assert.equal(PRECISE_STATE_LABELS.queued_offline, "Pending sync");
});
