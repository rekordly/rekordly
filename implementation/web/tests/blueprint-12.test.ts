import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { aiImportsKeys } from "../src/lib/ai-imports.ts";
import { PERMISSIONS } from "../src/lib/permissions-catalog.ts";

const webRoot = process.cwd();

describe("Blueprint 12 AI Assistant, Imports & Automation Frontend", () => {
  it("1. All Blueprint 12 App Router routes exist", () => {
    const routes = [
      "src/app/(protected)/capture/page.tsx",
      "src/app/(protected)/transactions/import/page.tsx",
      "src/app/(protected)/automation/page.tsx",
    ];
    for (const rel of routes) {
      const full = join(webRoot, rel);
      assert.equal(existsSync(full), true, `Expected route ${rel} to exist`);
    }
  });

  it("2. All 9 Blueprint 12 RBAC permissions are distinct and defined", () => {
    const required = [
      PERMISSIONS.AI_USE,
      PERMISSIONS.AI_VIEW_USAGE,
      PERMISSIONS.IMPORTS_CREATE,
      PERMISSIONS.IMPORTS_REVIEW,
      PERMISSIONS.IMPORTS_CONFIRM,
      PERMISSIONS.IMPORTS_UNDO,
      PERMISSIONS.AUTOMATION_MANAGE,
      PERMISSIONS.JOBS_VIEW_FAILURES,
      PERMISSIONS.JOBS_RETRY,
    ];
    for (const perm of required) {
      assert.ok(typeof perm === "string" && perm.length > 0);
    }
    assert.equal(new Set(required).size, 9);
  });

  it("3. Navigation exposes Type what happened, CSV Imports, and Automation & Jobs", () => {
    const navSrc = readFileSync(join(webRoot, "src/components/layout/navigation.ts"), "utf8");
    for (const href of ["/capture", "/transactions/import", "/automation"]) {
      assert.ok(navSrc.includes(href), `navigation.ts should include ${href}`);
    }
  });

  it("4. Blueprint 12 components handle loading, error, empty, permission, and text uncertainty states", () => {
    const files = [
      "src/components/features/ai/ai-capture-workspace.tsx",
      "src/components/features/imports/csv-import-workspace.tsx",
      "src/components/features/automation/automation-jobs-page.tsx",
    ];
    for (const rel of files) {
      const src = readFileSync(join(webRoot, rel), "utf8");
      assert.ok(src.includes("isError"), `${rel} must handle error state`);
      assert.ok(src.includes("EmptyState"), `${rel} must handle empty state`);
      assert.ok(src.includes("DataView"), `${rel} must use DataView`);
      assert.ok(src.includes("renderCard"), `${rel} must provide DataView renderCard`);
      assert.ok(src.includes("isLoading"), `${rel} must handle loading state`);
      assert.ok(src.includes("hasWorkspacePermission"), `${rel} must check workspace permissions`);
    }
    const aiSrc = readFileSync(join(webRoot, files[0]), "utf8");
    assert.ok(aiSrc.includes("Switch to manual entry"), "AI capture must offer manual entry fallback");
    assert.ok(aiSrc.includes("AI-assisted"), "AI drafts must display AI-assisted label");
  });

  it("5. AI & Import query keys are workspace-scoped", () => {
    assert.deepEqual(aiImportsKeys.aiUsage(9), ["bp12", 9, "ai-usage"]);
    assert.deepEqual(aiImportsKeys.imports(9), ["bp12", 9, "imports"]);
    assert.deepEqual(aiImportsKeys.failedJobs(9), ["bp12", 9, "failed-jobs"]);
    assert.deepEqual(aiImportsKeys.automations(9), ["bp12", 9, "automations"]);
  });
});
