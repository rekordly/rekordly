"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Tag, Vault } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { AppButton } from "@/components/ui/app-button";
import { DataView } from "@/components/ui/data-view";
import { FormDrawer } from "@/components/ui/form-drawer";
import { EmptyState, Page, PageHeader, Segmented, StatusPill } from "@/components/ui/page";
import { RecordCard } from "@/components/ui/record-card";
import { capitalise } from "@/lib/format";
import { financeApi, moneyApi, moneyKeys } from "@/lib/money";
import { accountSchema, categorySchema, type AccountValues, type CategoryValues } from "@/lib/schemas/finance.schemas";
import type { MoneyAccount, MoneyCategory } from "@/types/finance";

import { MoneyField, SelectField, TextInputField } from "./fields";
import { money, useFinanceAction, WorkspaceGate, type WorkspaceInfo } from "./shared";

const TABS = [
  { key: "accounts", label: "Accounts" },
  { key: "categories", label: "Categories" },
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
  const [tab, setTab] = useState<"accounts" | "categories">("accounts");
  const [drawer, setDrawer] = useState<"account" | "category" | null>(null);
  const accounts = useQuery({ queryKey: moneyKeys.accounts(workspaceId), queryFn: () => moneyApi.listAccounts({ workspaceId }) });
  const categories = useQuery({ queryKey: moneyKeys.categories(workspaceId, "all"), queryFn: () => moneyApi.listCategories({ workspaceId }) });

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

  return (
    <Page>
      <PageHeader
        title="Accounts"
        description="Where your money lives, and how you group it."
        actions={
          tab === "accounts" ? (
            <AppButton startContent={<Plus weight="bold" />} label="Add account" onPress={() => setDrawer("account")} />
          ) : (
            <AppButton startContent={<Plus weight="bold" />} label="Add category" onPress={() => setDrawer("category")} />
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

      ) : (
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
    </Page>
  );
}

export function AccountsPage() {
  return (
    <WorkspaceGate>{(workspace) => <AccountsContent key={workspace.workspaceId} {...workspace} />}</WorkspaceGate>
  );
}
