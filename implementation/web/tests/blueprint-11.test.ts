import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { ledgerKeys } from "../src/lib/ledger.ts";
import { PERMISSIONS } from "../src/lib/permissions-catalog.ts";

const webRoot = process.cwd();

describe("Blueprint 11 Ledger, Reports, Tax & Period Close Frontend", () => {
  it("1. All Blueprint 11 App Router routes exist", () => {
    const routes = [
      "src/app/(protected)/ledger/page.tsx",
      "src/app/(protected)/reports/accounting/page.tsx",
      "src/app/(protected)/periods/page.tsx",
      "src/app/(protected)/reports/tax/page.tsx",
    ];
    for (const rel of routes) {
      const full = join(webRoot, rel);
      assert.equal(existsSync(full), true, `Expected route ${rel} to exist`);
    }
  });

  it("2. All 15 Blueprint 11 RBAC permissions are defined in PERMISSIONS catalog", () => {
    const required = [
      PERMISSIONS.LEDGER_VIEW,
      PERMISSIONS.LEDGER_VIEW_DETAIL,
      PERMISSIONS.CHART_MANAGE,
      PERMISSIONS.JOURNAL_CREATE_MANUAL,
      PERMISSIONS.JOURNAL_APPROVE_MANUAL,
      PERMISSIONS.JOURNAL_REVERSE,
      PERMISSIONS.REPORTS_VIEW_BASIC,
      PERMISSIONS.REPORTS_VIEW_ACCOUNTING,
      PERMISSIONS.REPORTS_VIEW_TAX,
      PERMISSIONS.REPORTS_EXPORT,
      PERMISSIONS.RECONCILIATION_VIEW,
      PERMISSIONS.RECONCILIATION_RUN,
      PERMISSIONS.PERIOD_CLOSE,
      PERMISSIONS.PERIOD_LOCK,
      PERMISSIONS.PERIOD_REOPEN,
    ];
    for (const perm of required) {
      assert.ok(typeof perm === "string" && perm.length > 0, `Permission must be non-empty: ${perm}`);
    }
    assert.equal(new Set(required).size, 15);
  });

  it("3. Navigation includes Ledger & Chart, Accounting reports, Periods & Close, and Tax readiness", () => {
    const navSrc = readFileSync(join(webRoot, "src/components/layout/navigation.ts"), "utf8");
    for (const href of ["/ledger", "/reports/accounting", "/periods", "/reports/tax"]) {
      assert.ok(navSrc.includes(href), `navigation.ts should include ${href}`);
    }
  });

  it("4. Blueprint 11 feature components handle loading, error, empty, and card states", () => {
    const files = [
      "src/components/features/ledger/ledger-workspace.tsx",
      "src/components/features/ledger/accounting-reports-page.tsx",
      "src/components/features/ledger/periods-reconciliation-page.tsx",
      "src/components/features/finance/tax-page.tsx",
    ];
    for (const rel of files) {
      const src = readFileSync(join(webRoot, rel), "utf8");
      assert.ok(src.includes("isError"), `${rel} must handle error state`);
      assert.ok(src.includes("EmptyState"), `${rel} must handle empty state`);
      assert.ok(src.includes("DataView"), `${rel} must use DataView`);
      assert.ok(src.includes("renderCard"), `${rel} must provide DataView renderCard`);
      assert.ok(src.includes("isLoading"), `${rel} must handle loading state`);
    }
  });

  it("5. Ledger query keys are workspace-scoped", () => {
    assert.deepEqual(ledgerKeys.chart(42), ["ledger", 42, "chart"]);
    assert.deepEqual(ledgerKeys.periods(42), ["ledger", 42, "periods"]);
    assert.deepEqual(ledgerKeys.taxCodes(42), ["ledger", 42, "tax-codes"]);
    assert.deepEqual(ledgerKeys.report(42, "trial_balance", "2026-01-01", "2026-01-31"), [
      "ledger",
      42,
      "report",
      "trial_balance",
      "2026-01-01",
      "2026-01-31",
    ]);
  });
});
