import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { billingKeys } from "../src/lib/billing.ts";
import { PERMISSIONS } from "../src/lib/permissions-catalog.ts";

const webRoot = process.cwd();

describe("Blueprint 13 Plans, Billing, Entitlements & Downgrades Frontend", () => {
  it("1. All Blueprint 13 App Router routes exist", () => {
    const routes = [
      "src/app/(protected)/plans/page.tsx",
      "src/app/(protected)/billing/page.tsx",
      "src/app/(protected)/billing/checkout/page.tsx",
      "src/app/(protected)/billing/transactions/page.tsx",
      "src/app/(protected)/billing/documents/page.tsx",
      "src/app/(protected)/billing/downgrade/page.tsx",
      "src/app/(protected)/settings/entitlements/page.tsx",
    ];
    for (const rel of routes) {
      const full = join(webRoot, rel);
      assert.equal(existsSync(full), true, `Expected route ${rel} to exist`);
    }
  });

  it("2. All 9 Blueprint 13 RBAC permissions are distinct and defined", () => {
    const required = [
      PERMISSIONS.BILLING_VIEW,
      PERMISSIONS.BILLING_MANAGE_PLAN,
      PERMISSIONS.BILLING_CANCEL_RESUME,
      PERMISSIONS.BILLING_PURCHASE_ADDON,
      PERMISSIONS.BILLING_VIEW_DOCUMENTS,
      PERMISSIONS.BILLING_REQUEST_REFUND,
      PERMISSIONS.BILLING_MANAGE_SUBJECTS,
      PERMISSIONS.BILLING_OVERRIDE,
      PERMISSIONS.BILLING_RECONCILE,
    ];
    for (const perm of required) {
      assert.ok(typeof perm === "string" && perm.length > 0);
    }
    assert.equal(new Set(required).size, 9);
  });

  it("3. Navigation exposes Plan & Billing and Compare Plans", () => {
    const navSrc = readFileSync(join(webRoot, "src/components/layout/navigation.ts"), "utf8");
    for (const href of ["/billing", "/plans"]) {
      assert.ok(navSrc.includes(href), `navigation.ts should include ${href}`);
    }
  });

  it("4. Billing components enforce preserved-data guarantees, loading, error, empty, and permission states", () => {
    const files = [
      "src/components/features/billing/billing-overview-page.tsx",
      "src/components/features/billing/plans-compare-page.tsx",
      "src/components/features/billing/billing-records-page.tsx",
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
    const overviewSrc = readFileSync(join(webRoot, files[0]), "utf8");
    assert.ok(overviewSrc.includes("Controlled Beta"), "Billing overview must disclose controlled_beta mode");
    assert.ok(overviewSrc.includes("never deletes owned financial records"), "Must explain preservation guarantee");
  });

  it("5. Billing query keys are subject-scoped", () => {
    assert.deepEqual(billingKeys.commercialMode(), ["bp13", "commercial-mode"]);
    assert.deepEqual(billingKeys.subscription(7), ["bp13", "subscription", 7]);
    assert.deepEqual(billingKeys.usage(7), ["bp13", "usage", 7]);
  });
});
