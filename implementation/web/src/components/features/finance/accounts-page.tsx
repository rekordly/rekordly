"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowsClockwise, CheckCircle, Plus, Tag, Vault } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { AppButton } from "@/components/ui/app-button";
import { AppRowActions } from "@/components/ui/app-row-actions";
import { DataView } from "@/components/ui/data-view";
import { FormDrawer } from "@/components/ui/form-drawer";
import { EmptyState, Page, PageHeader, Segmented, StatusPill } from "@/components/ui/page";
import { RecordCard } from "@/components/ui/record-card";
import { capitalise } from "@/lib/format";
import { financeApi, moneyApi, moneyKeys } from "@/lib/money";
import { accountSchema, categorySchema, type AccountValues, type CategoryValues } from "@/lib/schemas/finance.schemas";
import type { BankReconciliation, MoneyAccount, MoneyCategory } from "@/types/finance";

import { MoneyField, SelectField, TextInputField } from "./fields";
import { money, useFinanceAction, WorkspaceGate, type WorkspaceInfo } from "./shared";

const TABS = [
  { key: "accounts", label: "Accounts" },
  { key: "categories", label: "Categories" },
  { key: "reconciliation", label: "Bank Reconciliation" },
] as const;

const ACCOUNT_TYPES = [
  { key: "cash", label: "Cash" },
  { key: "bank", label: "Bank" },
  { key: "mobile_wallet", label: "Mobile wallet" },
  { key: "clearing", label: "Clearing" },
  { key: "other", label: "Other" },
];

const CATEGORY_USES = [
  { key: "money_out", label: "Money out" },
  { key: "money_in", label: "Money in" },
  { key: "both", label: "Both" },
];

function typeLabel(type: string) {
  return capitalise(type.replace(/_/g, " "));
}

function AccountsContent({ workspaceId, currency, isBusiness }: WorkspaceInfo) {
  const [tab, setTab] = useState<"accounts" | "categories" | "reconciliation">("accounts");
  const [drawer, setDrawer] = useState<"account" | "category" | "recon" | null>(null);
  const accounts = useQuery({ queryKey: moneyKeys.accounts(workspaceId), queryFn: () => moneyApi.listAccounts({ workspaceId }) });
  const categories = useQuery({ queryKey: moneyKeys.categories(workspaceId, "all"), queryFn: () => moneyApi.listCategories({ workspaceId }) });
  const reconciliations = useQuery({
    queryKey: ["reconciliations", workspaceId],
    queryFn: () => financeApi.listReconciliations(workspaceId),
  });

  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [statementDate, setStatementDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [statementBalance, setStatementBalance] = useState<string>("");

  const accountForm = useForm<AccountValues>({
    resolver: zodResolver(accountSchema),
    defaultValues: { name: "", account_type: "bank", opening_balance: "" },
  });
  const categoryForm = useForm<CategoryValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: { name: "", direction: "money_out" },
  });

  const closeDrawer = () => {
    setDrawer(null);
    accountForm.reset();
    categoryForm.reset();
  };

  const createAccount = useFinanceAction(
    workspaceId,
    (values: AccountValues) =>
      financeApi.createAccount(workspaceId, { ...values, currency, opening_balance: values.opening_balance || undefined, is_active: true }),
    { success: "Account added", onDone: closeDrawer },
  );
  const createCategory = useFinanceAction(
    workspaceId,
    (values: CategoryValues) =>
      financeApi.createCategory(workspaceId, {
        ...values,
        scope: isBusiness ? "business" : "personal",
        account_class: values.direction === "money_in" ? "income" : "expense",
      }),
    { success: "Category added", onDone: closeDrawer },
  );
  const startReconciliationAction = useFinanceAction(
    workspaceId,
    async (_: void) => {
      if (!selectedAccountId) throw new Error("Select an account to reconcile");
      const minor = Math.round(parseFloat(statementBalance || "0") * 100);
      return financeApi.startReconciliation(workspaceId, {
        money_account_id: Number(selectedAccountId),
        statement_date: statementDate,
        statement_balance_minor: minor,
      });
    },
    {
      success: "Reconciliation period started",
      onDone: () => {
        closeDrawer();
        reconciliations.refetch();
      },
    },
  );

  const completeReconAction = useFinanceAction(
    workspaceId,
    (reconId: number) => financeApi.completeReconciliation(workspaceId, reconId),
    {
      success: "Reconciliation completed and balanced",
      onDone: () => reconciliations.refetch(),
    },
  );

  return (
    <Page>
      <PageHeader
        title="Accounts"
        description="Where your money lives, and how you group it."
        actions={
          tab === "accounts" ? (
            <AppButton startContent={<Plus weight="bold" />} label="Add account" onPress={() => setDrawer("account")} />
          ) : tab === "categories" ? (
            <AppButton startContent={<Plus weight="bold" />} label="Add category" onPress={() => setDrawer("category")} />
          ) : (
            <AppButton startContent={<Plus weight="bold" />} label="Start reconciliation" onPress={() => setDrawer("recon")} />
          )
        }
      />

      <Segmented aria-label="Accounts sections" options={TABS} value={tab} onChange={setTab} />

      {tab === "accounts" ? (
      <DataView<MoneyAccount>
        key="accounts"
        title="Money accounts"
        searchPlaceholder="Search accounts"
        getSearchText={(row) => `${row.name} ${row.account_type}`}
        rows={accounts.data ?? []}
        rowKey={(row) => row.id}
        isLoading={accounts.isPending}
        isError={accounts.isError}
        empty={
          <EmptyState
            icon={Vault}
            title="No accounts yet"
            description="Add the cash till, bank or wallet you take money through."
            action={<AppButton startContent={<Plus weight="bold" />} label="Add account" onPress={() => setDrawer("account")} />}
          />
        }
        columns={[
          { key: "name", label: "Name", render: (row) => <span className="font-medium text-foreground">{row.name}</span> },
          { key: "type", label: "Type", render: (row) => typeLabel(row.account_type) },
          { key: "state", label: "Status", render: (row) => <StatusPill tone={row.is_active ? "success" : "neutral"}>{row.is_active ? "Active" : "Inactive"}</StatusPill> },
          { key: "balance", label: "Balance", align: "right", render: (row) => <span className="tabular font-semibold">{money(row.current_balance_minor, row)}</span> },
        ]}
        renderCard={(row) => (
          <RecordCard
            icon={<Vault size={18} aria-hidden="true" />}
            iconClassName="bg-primary-soft text-primary"
            reference={typeLabel(row.account_type)}
            title={row.name}
            amount={money(row.current_balance_minor, row)}
            status={<StatusPill tone={row.is_active ? "success" : "neutral"}>{row.is_active ? "Active" : "Inactive"}</StatusPill>}
          />
        )}
      />

      ) : tab === "categories" ? (
      <DataView<MoneyCategory>
        key="categories"
        title="Categories"
        searchPlaceholder="Search categories"
        getSearchText={(row) => row.name}
        rows={categories.data ?? []}
        rowKey={(row) => row.id}
        isLoading={categories.isPending}
        isError={categories.isError}
        empty={<EmptyState icon={Tag} title="No categories yet" description="Add groups like Rent or Supplies to see where money goes." />}
        columns={[
          { key: "name", label: "Name", render: (row) => <span className="font-medium text-foreground">{row.name}</span> },
          { key: "use", label: "Used for", render: (row) => typeLabel(row.direction) },
          { key: "scope", label: "Space", render: (row) => capitalise(row.scope) },
        ]}
        renderCard={(row) => (
          <RecordCard icon={<Tag size={18} aria-hidden="true" />} reference={capitalise(row.scope)} title={row.name} amount={typeLabel(row.direction)} />
        )}
      />
      ) : (
      <DataView<BankReconciliation>
        key="reconciliations"
        title="Bank & Cash Reconciliations"
        searchPlaceholder="Search reconciliations"
        getSearchText={(row) => `${row.statement_date} ${row.status}`}
        rows={reconciliations.data ?? []}
        rowKey={(row) => row.id}
        isLoading={reconciliations.isPending}
        isError={reconciliations.isError}
        empty={
          <EmptyState
            icon={ArrowsClockwise}
            title="No reconciliations yet"
            description="Start a reconciliation period to match bank statements with your ledger balance."
            action={<AppButton startContent={<Plus weight="bold" />} label="Start reconciliation" onPress={() => setDrawer("recon")} />}
          />
        }
        columns={[
          { key: "date", label: "Statement Date", render: (row) => <span className="font-medium text-foreground">{row.statement_date}</span> },
          { key: "statement_balance", label: "Statement Balance", align: "right", render: (row) => <span className="font-mono">{money(row.statement_balance_minor, { currency, currency_exponent: 2 })}</span> },
          { key: "ledger_balance", label: "Ledger Balance", align: "right", render: (row) => <span className="font-mono">{money(row.ledger_balance_minor, { currency, currency_exponent: 2 })}</span> },
          { key: "difference", label: "Difference", align: "right", render: (row) => (
            <span className={`font-mono font-bold ${Number(row.difference_minor) === 0 ? "text-emerald-500" : "text-rose-500"}`}>
              {money(row.difference_minor, { currency, currency_exponent: 2 })}
            </span>
          )},
          { key: "status", label: "Status", render: (row) => <StatusPill tone={row.status === "reconciled" ? "success" : "neutral"}>{row.status}</StatusPill> },
        ]}
        renderCard={(row) => (
          <RecordCard
            icon={<ArrowsClockwise size={18} aria-hidden="true" />}
            reference={row.statement_date}
            title={`Statement Date: ${row.statement_date}`}
            amount={money(row.statement_balance_minor, { currency, currency_exponent: 2 })}
            status={<StatusPill tone={row.status === "reconciled" ? "success" : "neutral"}>{row.status}</StatusPill>}
          />
        )}
      />
      )}

      <FormDrawer
        isOpen={drawer === "account"}
        onOpenChange={(open) => !open && closeDrawer()}
        title="Add account"
        description="A cash till, bank account or wallet."
        submitLabel="Add account"
        isSubmitting={createAccount.isPending}
        onSubmit={accountForm.handleSubmit((values) => createAccount.mutate(values))}
      >
        <TextInputField control={accountForm.control} name="name" label="Account name" placeholder="GTBank current" isRequired />
        <SelectField control={accountForm.control} name="account_type" label="Type" options={ACCOUNT_TYPES} isRequired />
        <MoneyField control={accountForm.control} name="opening_balance" label="Opening balance" currency={currency} description="What is in this account today. You can leave it empty." />
      </FormDrawer>

      <FormDrawer
        isOpen={drawer === "category"}
        onOpenChange={(open) => !open && closeDrawer()}
        title="Add category"
        submitLabel="Add category"
        isSubmitting={createCategory.isPending}
        onSubmit={categoryForm.handleSubmit((values) => createCategory.mutate(values))}
      >
        <TextInputField control={categoryForm.control} name="name" label="Category name" placeholder="Supplies" isRequired />
        <SelectField control={categoryForm.control} name="direction" label="Used for" options={CATEGORY_USES} isRequired />
      </FormDrawer>

      <FormDrawer
        isOpen={drawer === "recon"}
        onOpenChange={(open) => !open && closeDrawer()}
        title="Start Bank Reconciliation"
        description="Verify statement balance against the system ledger."
        submitLabel="Start Reconciliation"
        isSubmitting={startReconciliationAction.isPending}
        onSubmit={(e) => {
          e.preventDefault();
          startReconciliationAction.mutate(undefined);
        }}
      >
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-foreground">Select Account</label>
            <select
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="w-full h-11 px-3 rounded-2xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="">Select an account...</option>
              {(accounts.data || []).map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} ({money(acc.current_balance_minor, acc)})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-foreground">Statement Ending Date</label>
            <input
              type="date"
              value={statementDate}
              onChange={(e) => setStatementDate(e.target.value)}
              className="w-full h-11 px-3 rounded-2xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-foreground">Statement Ending Balance</label>
            <input
              type="number"
              step="0.01"
              placeholder="0.00"
              value={statementBalance}
              onChange={(e) => setStatementBalance(e.target.value)}
              className="w-full h-11 px-3 rounded-2xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <p className="text-[11px] text-muted">The closing balance shown on your official bank statement.</p>
          </div>
        </div>
      </FormDrawer>
    </Page>
  );
}

export function AccountsPage() {
  return (
    <WorkspaceGate>{(workspace) => <AccountsContent key={workspace.workspaceId} {...workspace} />}</WorkspaceGate>
  );
}
