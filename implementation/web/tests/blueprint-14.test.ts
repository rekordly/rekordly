import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { docsSharingKeys } from "../src/lib/docs-sharing.ts";
import { PERMISSIONS } from "../src/lib/permissions-catalog.ts";

const webRoot = process.cwd();

describe("Blueprint 14 Notifications, Documents, Files & Sharing Frontend", () => {
  it("1. All Blueprint 14 App Router routes exist", () => {
    const routes = [
      "src/app/(protected)/notifications/page.tsx",
      "src/app/(protected)/documents/page.tsx",
      "src/app/share/[token]/page.tsx",
    ];
    for (const rel of routes) {
      const full = join(webRoot, rel);
      assert.equal(existsSync(full), true, `Expected route ${rel} to exist`);
    }
  });

  it("2. All 13 Blueprint 14 RBAC permissions are distinct and defined", () => {
    const required = [
      PERMISSIONS.NOTIFICATIONS_VIEW,
      PERMISSIONS.NOTIFICATIONS_MANAGE_PREFERENCES,
      PERMISSIONS.DOCUMENTS_RENDER,
      PERMISSIONS.DOCUMENTS_VIEW_ARTIFACTS,
      PERMISSIONS.SHARES_CREATE,
      PERMISSIONS.SHARES_REVOKE,
      PERMISSIONS.DOCUMENTS_SEND,
      PERMISSIONS.DELIVERIES_VIEW,
      PERMISSIONS.DELIVERIES_RETRY,
      PERMISSIONS.FILES_MANAGE,
      PERMISSIONS.FILES_LINK,
      PERMISSIONS.FILES_DELETE,
      PERMISSIONS.EVIDENCE_VIEW_PRIVATE,
    ];
    for (const perm of required) {
      assert.ok(typeof perm === "string" && perm.length > 0);
    }
    assert.equal(new Set(required).size, 13);
  });

  it("3. Navigation exposes Documents & Files", () => {
    const navSrc = readFileSync(join(webRoot, "src/components/layout/navigation.ts"), "utf8");
    assert.ok(navSrc.includes("/documents"), "navigation.ts should include /documents");
  });

  it("4. Guest portal page sets robots noindex and neutral unavailable message", () => {
    const routeSrc = readFileSync(join(webRoot, "src/app/share/[token]/page.tsx"), "utf8");
    assert.ok(routeSrc.includes("index: false"), "Guest share route must set noindex");
    const portalSrc = readFileSync(join(webRoot, "src/components/features/documents/guest-portal-page.tsx"), "utf8");
    assert.ok(portalSrc.includes("invalid, expired, or revoked"), "Guest portal must show neutral error");
  });

  it("5. Blueprint 14 components handle loading, error, empty, and permission states", () => {
    const files = [
      "src/components/features/notifications/notification-inbox.tsx",
      "src/components/features/documents/documents-sharing-workspace.tsx",
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
  });

  it("6. Query keys are scoped cleanly", () => {
    assert.deepEqual(docsSharingKeys.unreadCount(), ["bp14", "notifications-unread"]);
    assert.deepEqual(docsSharingKeys.files(5), ["bp14", 5, "files"]);
  });
});
