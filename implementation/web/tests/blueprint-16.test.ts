import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { PERMISSIONS } from "../src/lib/permissions-catalog.ts";
import { bp16Keys, sanitizeCsvCell } from "../src/lib/settings-privacy-support.ts";

test("Blueprint 16: App Router routes for settings, privacy, and support exist", () => {
  const root = process.cwd();
  for (const rel of [
    "src/app/(protected)/settings/page.tsx",
    "src/app/(protected)/settings/entitlements/page.tsx",
    "src/app/(protected)/privacy/page.tsx",
    "src/app/(protected)/support/page.tsx",
  ]) {
    assert.equal(existsSync(path.join(root, rel)), true, `missing route ${rel}`);
  }
});

test("Blueprint 16: distinct RBAC permissions are defined", () => {
  const required = [
    PERMISSIONS.ACCOUNT_PROFILE_MANAGE,
    PERMISSIONS.ACCOUNT_SECURITY_MANAGE,
    PERMISSIONS.SESSIONS_MANAGE,
    PERMISSIONS.MEMBERS_MANAGE,
    PERMISSIONS.OWNERSHIP_TRANSFER,
    PERMISSIONS.EXPORTS_COMPLETE,
    PERMISSIONS.PRIVACY_REQUESTS_MANAGE,
    PERMISSIONS.DELETION_REQUEST,
    PERMISSIONS.SUPPORT_INTAKE,
    PERMISSIONS.SUPPORT_ACCESS_GRANT,
    PERMISSIONS.ADMIN_RECOVERY,
    PERMISSIONS.AUDIT_VIEW,
  ];
  assert.equal(new Set(required).size, required.length);
});

test("Blueprint 16: CSV formula injection is neutralized", () => {
  assert.equal(sanitizeCsvCell("=SUM(A1:A2)"), "'=SUM(A1:A2)");
  assert.equal(sanitizeCsvCell("+123"), "'+123");
  assert.equal(sanitizeCsvCell("-123"), "'-123");
  assert.equal(sanitizeCsvCell("@cmd"), "'@cmd");
  assert.equal(sanitizeCsvCell("Ada Lovelace"), "Ada Lovelace");
});

test("Blueprint 16: scoped settings query keys isolate workspace ID and kind", () => {
  assert.notDeepEqual(bp16Keys.scopedSettings(1, "personal"), bp16Keys.scopedSettings(1, "business"));
  assert.notDeepEqual(bp16Keys.scopedSettings(1, "business", "tax"), bp16Keys.scopedSettings(2, "business", "tax"));
});
