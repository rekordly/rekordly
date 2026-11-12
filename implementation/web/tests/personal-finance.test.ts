import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { budgetSchema } from "../src/lib/schemas/finance.schemas.ts";
import {
  assetAcquireSchema,
  assetCreateSchema,
  assetDisposeSchema,
  investmentCreateSchema,
  investmentEventSchema,
  loanCreateSchema,
  loanRepaymentSchema,
  manualValuationSchema,
  openingBalanceSchema,
  ownerTransferSchema,
} from "../src/lib/schemas/personal-finance.schemas.ts";
import { canViewAllSpaces, resolveWorkspaceScope } from "../src/stores/workspace-store.ts";
import type { AuthorizedWorkspace } from "../src/types/auth.ts";

const webRoot = process.cwd();

describe("Blueprint 10 Personal Finance Frontend", () => {
  it("1. All Blueprint 10 Personal & Owner routes exist without ?workspace= query slugs", () => {
    const routes = [
      "src/app/(protected)/dashboard/page.tsx",
      "src/app/(protected)/transactions/page.tsx",
      "src/app/(protected)/budgets/page.tsx",
      "src/app/(protected)/accounts/page.tsx",
      "src/app/(protected)/reports/page.tsx",
      "src/app/(protected)/loans/page.tsx",
      "src/app/(protected)/investments/page.tsx",
      "src/app/(protected)/assets/page.tsx",
      "src/app/(protected)/categories/page.tsx",
      "src/app/(protected)/owner-transfers/page.tsx",
    ];
    for (const rel of routes) {
      const full = join(webRoot, rel);
      assert.equal(existsSync(full), true, `Expected route ${rel} to exist`);
      const content = readFileSync(full, "utf8");
      assert.equal(content.includes("?workspace="), false, `Route ${rel} must not use ?workspace=`);
    }
  });

  it("2. Personal/Business/All access rules and workspace persistence", () => {
    const personal: AuthorizedWorkspace = {
      id: 1,
      kind: "personal",
      name: "My Personal",
      slug: "my-personal",
      base_currency: "NGN",
      timezone: "Africa/Lagos",
      role_code: "owner",
      role_name: "Owner",
      outlet_scope: {},
      is_owner: true,
      permissions: ["*"],
    };
    const invitedBiz: AuthorizedWorkspace = {
      id: 2,
      kind: "business",
      name: "Invited Shop",
      slug: "invited-shop",
      base_currency: "NGN",
      timezone: "Africa/Lagos",
      role_code: "staff",
      role_name: "Staff",
      outlet_scope: {},
      is_owner: false,
      permissions: ["money.view"],
    };
    const ownedBiz: AuthorizedWorkspace = {
      id: 3,
      kind: "business",
      name: "My Shop",
      slug: "my-shop",
      base_currency: "NGN",
      timezone: "Africa/Lagos",
      role_code: "owner",
      role_name: "Owner",
      outlet_scope: {},
      is_owner: true,
      permissions: ["*"],
    };

    // Invited business does NOT grant All summary
    assert.equal(canViewAllSpaces([personal, invitedBiz]), false);
    const blockedAll = resolveWorkspaceScope([personal, invitedBiz], "all");
    assert.notEqual(blockedAll.mode, "all");

    // Owned personal + owned business grants All summary and excludes invited workspace
    assert.equal(canViewAllSpaces([personal, invitedBiz, ownedBiz]), true);
    const allScope = resolveWorkspaceScope([personal, invitedBiz, ownedBiz], "all");
    assert.equal(allScope.mode, "all");
    assert.equal(allScope.inScope.some((w) => w.id === invitedBiz.id), false);
    assert.equal(allScope.inScope.length, 2);

    // Persisted Personal selection remains stable
    const personalScope = resolveWorkspaceScope([personal, ownedBiz], personal.id);
    assert.equal(personalScope.mode, "personal");
    assert.equal(personalScope.active?.id, personal.id);
  });

  it("3. Budget & opening balance form schemas validate string money inputs", () => {
    const validBudget = budgetSchema.safeParse({
      name: "Monthly Groceries",
      amount: "15000.00",
      period: "monthly",
      category_id: "",
      start_date: "2026-11-01",
      end_date: "2026-11-30",
      notes: "",
    });
    assert.equal(validBudget.success, true);

    const invalidBudget = budgetSchema.safeParse({
      name: "",
      amount: "-100",
      period: "monthly",
      category_id: "",
      start_date: "2026-11-01",
      end_date: "2026-11-30",
      notes: "",
    });
    assert.equal(invalidBudget.success, false);

    assert.equal(
      openingBalanceSchema.safeParse({ amount: "25000.50", as_of_date: "2026-11-01" }).success,
      true,
    );
    assert.equal(
      openingBalanceSchema.safeParse({ amount: "1e5", as_of_date: "2026-11-01" }).success,
      false,
    );
  });

  it("4. Loan create and repayment schemas validate required fields", () => {
    assert.equal(
      loanCreateSchema.safeParse({
        direction: "borrowed",
        counterparty_name: "Chidi",
        principal: "50000.00",
        start_date: "2026-11-01",
        is_opening_balance: false,
      }).success,
      true,
    );

    assert.equal(
      loanRepaymentSchema.safeParse({
        money_account_id: "1",
        effective_date: "2026-11-10",
        total_amount: "10500.00",
        principal: "10000.00",
        interest: "500.00",
        fee: "0",
      }).success,
      true,
    );
  });

  it("5. Investment, asset, manual valuation, and owner-transfer schemas enforce rules", () => {
    assert.equal(
      investmentCreateSchema.safeParse({ name: "T-Bills", investment_type: "fixed_income" }).success,
      true,
    );
    assert.equal(
      investmentEventSchema.safeParse({
        event_type: "purchase",
        effective_date: "2026-11-10",
        amount: "100000.00",
      }).success,
      true,
    );
    assert.equal(
      manualValuationSchema.safeParse({
        valuation_date: "2026-11-10",
        value: "112000.00",
        source: "user_manual",
      }).success,
      true,
    );

    assert.equal(
      assetCreateSchema.safeParse({ name: "Laptop", asset_type: "electronics_equipment" }).success,
      true,
    );
    assert.equal(
      assetAcquireSchema.safeParse({ acquisition_date: "2026-11-10", cost: "500000.00", is_opening_asset: false }).success,
      true,
    );
    assert.equal(
      assetDisposeSchema.safeParse({
        disposal_date: "2026-11-12",
        proceeds: "450000.00",
        disposal_costs: "0",
        money_account_id: "1",
      }).success,
      true,
    );

    // Owner transfer requires explicit purpose
    assert.equal(
      ownerTransferSchema.safeParse({
        from_workspace_id: "1",
        to_workspace_id: "3",
        from_money_account_id: "10",
        to_money_account_id: "20",
        purpose: "owner_capital_contribution",
        amount: "50000.00",
        effective_date: "2026-11-12",
      }).success,
      true,
    );
    assert.equal(
      ownerTransferSchema.safeParse({
        from_workspace_id: "1",
        to_workspace_id: "3",
        from_money_account_id: "10",
        to_money_account_id: "20",
        purpose: "",
        amount: "50000.00",
        effective_date: "2026-11-12",
      }).success,
      false,
    );
  });

  it("6. Personal pages include empty/loading/error DataView, mobile RecordCard, and accessibility labels", () => {
    const featureFiles = [
      "src/components/features/personal/loans-page.tsx",
      "src/components/features/personal/investments-page.tsx",
      "src/components/features/personal/assets-page.tsx",
      "src/components/features/personal/categories-page.tsx",
      "src/components/features/personal/owner-transfers-page.tsx",
      "src/components/features/personal/personal-activity.tsx",
    ];
    for (const rel of featureFiles) {
      const content = readFileSync(join(webRoot, rel), "utf8");
      assert.equal(content.includes("DataView"), true, `${rel} must use DataView`);
      assert.equal(content.includes("renderCard"), true, `${rel} must provide mobile renderCard`);
      assert.equal(content.includes("EmptyState"), true, `${rel} must provide EmptyState`);
      assert.equal(content.includes("isLoading"), true, `${rel} must provide loading state`);
      assert.equal(content.includes("isError"), true, `${rel} must provide error state`);
    }
    assert.equal(
      featureFiles.every((f) => existsSync(join(webRoot, f))),
      true,
    );

    const accountsPage = readFileSync(join(webRoot, "src/components/features/finance/accounts-page.tsx"), "utf8");
    assert.equal(accountsPage.includes("Opening balance"), true, "Accounts page must expose Opening balance action");
    assert.equal(accountsPage.includes("Archive"), true, "Accounts page must expose Archive action");
    assert.equal(accountsPage.includes("Reactivate"), true, "Accounts page must expose Reactivate action");

    const reportsPage = readFileSync(join(webRoot, "src/components/features/personal/personal-reports.tsx"), "utf8");
    for (const section of ["Period comparison", "Spending by category", "Account balances", "Budget vs actual", "Loans", "Investments", "Personal assets", "Export CSV"]) {
      assert.equal(reportsPage.includes(section), true, `Personal reports must include ${section}`);
    }
  });
});
