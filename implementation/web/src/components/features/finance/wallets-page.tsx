"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Wallet } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { AppButton } from "@/components/ui/app-button";
import { AppSelect } from "@/components/ui/app-select";
import { DashboardCard } from "@/components/ui/dashboard-card";
import { DataView } from "@/components/ui/data-view";
import { FormDrawer } from "@/components/ui/form-drawer";
import { EmptyState, Page, PageHeader } from "@/components/ui/page";
import { RecordCard } from "@/components/ui/record-card";
import { StatCard } from "@/components/ui/stat-card";
import { capitalise, formatDate } from "@/lib/format";
import { financeApi, formatMinorAmount, moneyKeys } from "@/lib/money";
import { walletDepositSchema, type WalletDepositValues } from "@/lib/schemas/finance.schemas";
import type { WalletTransaction } from "@/types/finance";

import { MoneyField, NotesField, SelectField, TextInputField } from "./fields";
import { useAccountOptions, useContacts, useFinanceAction, WorkspaceGate, type WorkspaceInfo } from "./shared";

function WalletsContent({ workspaceId, currency }: WorkspaceInfo) {
  const customers = useContacts(workspaceId, "customers");
  const accounts = useAccountOptions(workspaceId);
  const [selected, setSelected] = useState<string>("");
  const [isOpen, setIsOpen] = useState(false);
  const customerId = Number(selected) || null;

  const wallet = useQuery({
    queryKey: [...moneyKeys.workspace(workspaceId), "wallet", customerId],
    queryFn: () => financeApi.getWallet(workspaceId, customerId as number, currency),
    enabled: customerId !== null,
  });
  const ledger = useQuery({
    queryKey: [...moneyKeys.workspace(workspaceId), "wallet-ledger", customerId],
    queryFn: () => financeApi.listWalletLedger(workspaceId, customerId as number),
    enabled: customerId !== null,
  });

  const form = useForm<WalletDepositValues>({
    resolver: zodResolver(walletDepositSchema),
    defaultValues: { amount: "", account_id: "", reference: "", notes: "" },
  });
  const close = () => {
    setIsOpen(false);
    form.reset();
  };
  const deposit = useFinanceAction(
    workspaceId,
    (values: WalletDepositValues, key: string) =>
      financeApi.depositToWallet(
        workspaceId,
        customerId as number,
        {
          amount: values.amount,
          currency,
          money_account_id: Number(values.account_id),
          reference: values.reference || undefined,
          notes: values.notes || undefined,
        },
        key,
      ),
    { success: "Deposit recorded", onDone: close },
  );

  const exponent = wallet.data?.currency_exponent ?? 2;
  const show = (value: WalletTransaction["amount_minor"]) => formatMinorAmount(value, currency, exponent);

  return (
    <Page>
      <PageHeader
        title="Customer wallets"
        description="Money customers have paid in advance, held for them until it is used."
        actions={<AppButton startContent={<Plus weight="bold" />} label="Record deposit" isDisabled={customerId === null} onPress={() => setIsOpen(true)} />}
      />

      <DashboardCard>
        <AppSelect
          label="Customer"
          placeholder={customers.isPending ? "Loading customers…" : "Choose a customer"}
          options={(customers.data ?? []).map((customer) => ({ key: String(customer.id), label: customer.name }))}
          selectedKey={selected || undefined}
          onSelectionChange={setSelected}
          className="max-w-md"
        />
      </DashboardCard>

      {customerId === null ? (
        <DashboardCard className="p-0">
          <EmptyState icon={Wallet} title="Choose a customer" description="Their wallet balance and history will show here." />
        </DashboardCard>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <StatCard
              tag="Available balance"
              gradient
              compact
              isLoading={wallet.isPending}
              title={wallet.data ? formatMinorAmount(wallet.data.balance_minor, wallet.data.currency, wallet.data.currency_exponent) : ""}
              description="Owed to this customer, not your income"
              icon={<Wallet size={22} />}
            />
          </div>
          <DataView<WalletTransaction>
            title="Wallet history"
            rows={ledger.data ?? []}
            rowKey={(row) => row.id}
            isLoading={ledger.isPending}
            isError={ledger.isError}
            empty={<EmptyState icon={Wallet} title="No wallet activity yet" description="Record a deposit when this customer pays in advance." />}
            columns={[
              { key: "type", label: "Type", render: (row) => <span className="font-medium text-foreground">{capitalise(row.transaction_type.replace(/_/g, " "))}</span> },
              { key: "date", label: "Date", render: (row) => formatDate(row.created_at) },
              { key: "reference", label: "Reference", render: (row) => row.reference || "—" },
              { key: "amount", label: "Amount", align: "right", render: (row) => <span className="tabular font-semibold">{show(row.amount_minor)}</span> },
              { key: "balance", label: "Balance after", align: "right", render: (row) => <span className="tabular">{show(row.balance_after_minor)}</span> },
            ]}
            renderCard={(row) => (
              <RecordCard
                icon={<Wallet size={18} aria-hidden="true" />}
                iconClassName="bg-primary-soft text-primary"
                reference={row.reference || formatDate(row.created_at)}
                title={capitalise(row.transaction_type.replace(/_/g, " "))}
                amount={show(row.amount_minor)}
                meta={[{ label: "Balance after", value: show(row.balance_after_minor) }]}
              />
            )}
          />
        </>
      )}

      <FormDrawer
        isOpen={isOpen}
        onOpenChange={(open) => !open && close()}
        title="Record deposit"
        description="This is held for the customer. It is not counted as income."
        submitLabel="Confirm deposit"
        isSubmitting={deposit.isPending}
        onSubmit={form.handleSubmit((values) => deposit.mutate(values))}
      >
        <MoneyField control={form.control} name="amount" label="Amount" currency={currency} isRequired />
        <SelectField control={form.control} name="account_id" label="Received into" placeholder="Choose account" options={accounts.options} isRequired />
        <TextInputField control={form.control} name="reference" label="Reference" placeholder="Optional" />
        <NotesField control={form.control} name="notes" label="Notes" />
      </FormDrawer>
    </Page>
  );
}

export function WalletsPage() {
  return (
    <WorkspaceGate businessOnly>{(workspace) => <WalletsContent key={workspace.workspaceId} {...workspace} />}</WorkspaceGate>
  );
}
