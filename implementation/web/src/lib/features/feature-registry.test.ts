import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getAllFeatures,
  getFeature,
  getFeatureByRoute,
  getFeaturesByCategory,
  getFeaturesForSpace,
  getUniversalAddFeatures,
  isFeatureAvailableInSpace,
  resolveSpaceContext,
} from "./feature-registry.ts";
import { ALL_FEATURE_IDS } from "./registry-data.ts";
import type { FeatureId, FinanceSpace } from "./types.ts";

describe("Rekordly V2 Feature Registry & Frontend Foundation Suite", () => {
  it("1. Registry contains all 11 required MVP feature surfaces", () => {
    const requiredSurfaces: FeatureId[] = [
      "ai-capture",
      "income-expenses",
      "sales",
      "purchases",
      "invoices",
      "payments",
      "loans",
      "customer-deposits",
      "split-payments",
      "budgets",
      "reports-tax",
      "offline-sync",
      "plan-limits",
    ];

    for (const surface of requiredSurfaces) {
      assert.ok(
        ALL_FEATURE_IDS.includes(surface),
        `Surface ${surface} must be in ALL_FEATURE_IDS`,
      );
      const feature = getFeature(surface);
      assert.equal(feature.id, surface);
      assert.ok(feature.name.length > 0, `Feature ${surface} must have a name`);
      assert.ok(
        feature.headline.length > 0,
        `Feature ${surface} must have a headline`,
      );
      assert.ok(feature.route.startsWith("/"), `Route must start with /`);
    }

    assert.equal(getAllFeatures().length, ALL_FEATURE_IDS.length);
  });

  it("2. Commercial business-only features are strictly separated from personal spaces", () => {
    const commercialOnly: FeatureId[] = [
      "sales",
      "purchases",
      "invoices",
      "customer-deposits",
    ];

    for (const featureId of commercialOnly) {
      const feature = getFeature(featureId);
      assert.equal(
        feature.availability.personal,
        false,
        `${featureId} must not be available as a personal posting destination`,
      );
      assert.equal(
        feature.availability.business,
        true,
        `${featureId} must be available in business space`,
      );
      assert.equal(
        isFeatureAvailableInSpace(featureId, "personal"),
        false,
      );
      assert.equal(
        isFeatureAvailableInSpace(featureId, "business"),
        true,
      );
    }
  });

  it("3. Dual-space features are available in both Personal and Business", () => {
    const dualSpace: FeatureId[] = [
      "ai-capture",
      "income-expenses",
      "payments",
      "loans",
      "split-payments",
      "budgets",
      "reports-tax",
      "offline-sync",
      "plan-limits",
    ];

    for (const featureId of dualSpace) {
      const feature = getFeature(featureId);
      assert.equal(
        feature.availability.personal,
        true,
        `${featureId} should be available in personal space`,
      );
      assert.equal(
        feature.availability.business,
        true,
        `${featureId} should be available in business space`,
      );
      assert.equal(
        isFeatureAvailableInSpace(featureId, "personal"),
        true,
      );
      assert.equal(
        isFeatureAvailableInSpace(featureId, "business"),
        true,
      );
    }
  });

  it("4. Route matching resolves correctly for all feature paths", () => {
    const routeMappings: Array<{ path: string; expectedId: FeatureId }> = [
      { path: "/capture", expectedId: "ai-capture" },
      { path: "/transactions", expectedId: "income-expenses" },
      { path: "/sales", expectedId: "sales" },
      { path: "/purchases", expectedId: "purchases" },
      { path: "/invoices", expectedId: "invoices" },
      { path: "/payments", expectedId: "payments" },
      { path: "/loans", expectedId: "loans" },
      { path: "/wallets", expectedId: "customer-deposits" },
      { path: "/split-payments", expectedId: "split-payments" },
      { path: "/budgets", expectedId: "budgets" },
      { path: "/reports/tax", expectedId: "reports-tax" },
      { path: "/reports", expectedId: "reports-tax" },
      { path: "/sync", expectedId: "offline-sync" },
      { path: "/billing", expectedId: "plan-limits" },
    ];

    for (const { path, expectedId } of routeMappings) {
      const resolved = getFeatureByRoute(path);
      assert.ok(resolved, `Path ${path} must resolve to a feature`);
      assert.equal(
        resolved.id,
        expectedId,
        `Path ${path} should resolve to ${expectedId}`,
      );
    }
  });

  it("5. Every feature has actionable empty states for all three spaces without fake balances", () => {
    const spaces: FinanceSpace[] = ["personal", "business", "all"];

    for (const feature of getAllFeatures()) {
      for (const space of spaces) {
        const emptyMeta = feature.emptyState[space];
        assert.ok(
          emptyMeta,
          `Feature ${feature.id} must define an empty state for ${space}`,
        );
        assert.ok(
          emptyMeta.title.length > 0,
          `Empty title for ${feature.id} in ${space} cannot be empty`,
        );
        assert.ok(
          emptyMeta.description.length > 0,
          `Empty description for ${feature.id} in ${space} cannot be empty`,
        );
        assert.ok(
          emptyMeta.actionLabel.length > 0,
          `Empty actionLabel for ${feature.id} in ${space} cannot be empty`,
        );

        // Verify no fake balances or invented currency totals are present in empty states
        const combined = `${emptyMeta.title} ${emptyMeta.description}`.toLowerCase();
        assert.ok(
          !combined.includes("balance: ₦") && !combined.includes("balance: $"),
          `Empty state for ${feature.id} must not claim invented balances`,
        );
      }
    }
  });

  it("6. Every feature provides a primary action with icon and label", () => {
    for (const feature of getAllFeatures()) {
      assert.ok(
        feature.primaryAction.label.length > 0,
        `Feature ${feature.id} must have an action label`,
      );
      assert.ok(
        feature.primaryAction.iconName.length > 0,
        `Feature ${feature.id} must have an action iconName`,
      );
    }
  });

  it("7. Plan limits and offline capabilities obey constitutional rules", () => {
    const captureFeature = getFeature("ai-capture");
    assert.equal(captureFeature.supportsOfflineDrafts, true);
    assert.equal(captureFeature.requiresConfirmation, true);
    assert.ok(
      captureFeature.planGate?.enforcementNote.includes("checks available plan credits"),
    );

    const offlineSync = getFeature("offline-sync");
    assert.ok(offlineSync.planGate?.limitUnit.includes("100 pending actions"));

    const billing = getFeature("plan-limits");
    assert.ok(
      billing.emptyState.business.description.includes(
        "Free limits stop new creations, never existing data",
      ),
    );
  });

  it("8. Space context derivation generates distinct Personal, Business, and All contexts", () => {
    const mockUser = {
      id: 1,
      display_name: "Chidi Okafor",
      locale: "en-NG",
      timezone: "Africa/Lagos",
      onboarding_status: "activated" as const,
      session: {
        id: 10,
        kind: "web",
        issued_at: "2026-11-08T10:00:00Z",
        expires_at: "2026-11-08T22:00:00Z",
      },
      workspaces: [
        {
          id: 5,
          kind: "business",
          name: "Acme Groceries Ltd",
          slug: "acme-groceries",
          base_currency: "NGN",
          timezone: "Africa/Lagos",
          is_owner: true,
          role_code: "owner",
          role_name: "Business Owner",
          outlet_scope: {},
        },
      ],
    };

    const personal = resolveSpaceContext(mockUser, "personal");
    assert.equal(personal.space, "personal");
    assert.equal(personal.label, "Personal Finance");
    assert.equal(personal.workspaceName, "Chidi Okafor's Personal");
    assert.equal(personal.badgeVariant, "default");

    const business = resolveSpaceContext(mockUser, "business");
    assert.equal(business.space, "business");
    assert.equal(business.label, "Business Space");
    assert.equal(business.workspaceName, "Acme Groceries Ltd");
    assert.equal(business.badgeVariant, "success");

    const all = resolveSpaceContext(mockUser, "all");
    assert.equal(all.space, "all");
    assert.equal(all.label, "Consolidated Owner View");
    assert.equal(all.badgeVariant, "neutral");
  });

  it("9. Space and category filters return valid subsets", () => {
    const personalFeatures = getFeaturesForSpace("personal");
    const businessFeatures = getFeaturesForSpace("business");
    assert.ok(businessFeatures.length > personalFeatures.length);

    const commercialFeatures = getFeaturesByCategory("commercial");
    assert.ok(commercialFeatures.some((f) => f.id === "sales"));
    assert.ok(commercialFeatures.some((f) => f.id === "invoices"));

    const universalAdd = getUniversalAddFeatures("business");
    assert.ok(universalAdd.every((f) => f.category !== "platform"));
  });
});
