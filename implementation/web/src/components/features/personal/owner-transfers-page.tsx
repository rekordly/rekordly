"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowsLeftRight, Plus } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { Alert } from "@/components/ui/alert";
import { AppButton } from "@/components/ui/app-button";
import { DataView } from "@/components/ui/data-view";
import { FormDrawer } from "@/components/ui/form-drawer";
import { EmptyState, Page, PageHeader, StatusPill } from "@/components/ui/page";
import { RecordCard } from "@/components/ui/record-card";
import { formatDate } from "@/lib/format";
import { formatMinorAmount, moneyApi } from "@/lib/money";
import { personalApi, personalKeys } from "@/lib/personal-finance";
import { ownerTransferSchema, type OwnerTransferValues } from "@/lib/schemas/personal-finance.schemas";
import { useActiveWorkspace } from "@/stores/workspace-store";

import { MoneyField, NotesField, SelectField, TextInputField } from "../finance/fields";
import { useFinanceAction } from "../finance/shared";

const PURPOSES = [
  { key: "owner_capital_contribution", label: "Owner capital contribution (Personal -> Business)" },
  { key: "owner_loan", label: "Owner loan to Business" },
  { key: "owner_loan_repayment", label: "Owner loan repayment (Business -> Personal)" },
  { key: "owner_drawing_distribution", label: "Owner drawing / distribution (Business -> Personal)" },
  { key: "business_expense_reimbursement", label: "Reimbursement of Business expense paid personally" },
  { key: "personal_expense_paid_for_business", label: "Personal expense paid for Business" },
];

export function OwnerTransfersPage() {
  const { workspaces, canViewAll, workspaceId } = useActiveWorkspace();
  const ownedWorkspaces = workspaces.filter((w) => w.is_owner);
  const anchorWsId = workspaceId ?? ownedWorkspaces[0]?.id ?? 0;

  const [isOpen, setIsOpen] = useState(false);
  const transfers = useQuery({
    queryKey: personalKeys.ownerTransfers(),
    queryFn: () => personalApi.listOwnerTransfers(anchorWsId),
    enabled: anchorWsId > 0 && canViewAll,
  });

  const today = new Date().toISOString().split("T")[0];
  const defaultFrom = ownedWorkspaces.find((w) => w.kind === "personal")?.id ?? ownedWorkspaces[0]?.id ?? 0;
  const defaultTo = ownedWorkspaces.find((w) => w.kind === "business")?.id ?? ownedWorkspaces[1]?.id ?? 0;

  const form = useForm<OwnerTransferValues>({
    resolver: zodResolver(ownerTransferSchema),
    defaultValues: {
      from_workspace_id: defaultFrom ? String(defaultFrom) : "",
      to_workspace_id: defaultTo ? String(defaultTo) : "",
      from_money_account_id: "",
      to_money_account_id: "",
      purpose: "owner_capital_contribution",
      amount: "",
      effective_date: today,
      notes: "",
      reference: "",
    },
  });

  const fromWsId = Number(form.watch("from_workspace_id") || 0);
  const toWsId = Number(form.watch("to_workspace_id") || 0);

  const fromAccounts = useQuery({
    queryKey: ["owner-transfer-acc", fromWsId],
    queryFn: () => moneyApi.listAccounts({ workspaceId: fromWsId }),
    enabled: fromWsId > 0,
  });
  const toAccounts = useQuery({
    queryKey: ["owner-transfer-acc", toWsId],
    queryFn: () => moneyApi.listAccounts({ workspaceId: toWsId }),
    enabled: toWsId > 0,
  });

  const submitTransfer = useFinanceAction(
    anchorWsId,
    (v: OwnerTransferValues, key: string) => {
      const fromWs = ownedWorkspaces.find((w) => w.id === Number(v.from_workspace_id));
      return personalApi.transferBetweenSpaces(
        anchorWsId,
        {
          from_workspace_id: Number(v.from_workspace_id),
          to_workspace_id: Number(v.to_workspace_id),
          from_money_account_id: Number(v.from_money_account_id),
          to_money_account_id: Number(v.to_money_account_id),
          purpose: v.purpose,
          amount: v.amount,
          currency: fromWs?.base_currency ?? "NGN",
          effective_date: v.effective_date,
          notes: v.notes || undefined,
          reference: v.reference || undefined,
        },
        key,
      );
    },
    {
      success: "Owner transfer posted atomically across both spaces",
      onDone: () => {
        setIsOpen(false);
        form.reset();
        transfers.refetch();
      },
    },
  );

  if (!canViewAll) {
    return (
      <Page>
        <PageHeader title="Owner Transfers" description="Move funds between your Personal and owned Business spaces." />
        <Alert
          status="info"
          description="Owner transfers require owning both a Personal workspace and at least one Business workspace."
        />
      </Page>
    );
  }

  const wsOptions = ownedWorkspaces.map((w) => ({ key: String(w.id), label: `${w.name} (${w.kind})` }));
  const fromAccOptions = (fromAccounts.data ?? []).filter((a) => a.is_active).map((a) => ({ key: String(a.id), label: `${a.name} (${a.currency})` }));
  const toAccOptions = (toAccounts.data ?? []).filter((a) => a.is_active).map((a) => ({ key: String(a.id), label: `${a.name} (${a.currency})` }));

  return (
    <Page>
      <PageHeader
        title="Owner Transfers"
        description="Explicit transfers between your Personal and owned Business books. Posts balanced journals in both workspaces atomically."
        actions={<AppButton startContent={<Plus weight="bold" />} label="New owner transfer" onPress={() => setIsOpen(true)} />}
      />

      <DataView
        title="Owner transfers"
        rows={transfers.data ?? []}
        rowKey={(r) => r.id}
        isLoading={transfers.isPending}
        isError={transfers.isError}
        columns={[
          {
            key: "purpose",
            label: "Economic purpose",
            render: (r) => (
              <div>
                <p className="font-medium capitalize">{r.purpose.replace(/_/g, " ")}</p>
                <p className="text-xs text-muted">{formatDate(r.effective_date)}</p>
              </div>
            ),
          },
          {
            key: "amount",
            label: "Amount",
            align: "right",
            render: (r) => <span className="tabular font-semibold">{formatMinorAmount(r.amount_minor, r.currency, r.currency_exponent)}</span>,
          },
          { key: "status", label: "Status", render: (r) => <StatusPill tone="success">{r.status}</StatusPill> },
        ]}
        renderCard={(r) => (
          <RecordCard
            icon={<ArrowsLeftRight size={18} weight="duotone" aria-hidden="true" />}
            reference={formatDate(r.effective_date)}
            title={r.purpose.replace(/_/g, " ")}
            amount={formatMinorAmount(r.amount_minor, r.currency, r.currency_exponent)}
            status={<StatusPill tone="success">{r.status}</StatusPill>}
          />
        )}
        empty={
          <EmptyState
            icon={ArrowsLeftRight}
            title="No owner transfers yet"
            description="Record capital contributions, owner loans, drawings, or expense reimbursements without mixing books."
            action={<AppButton startContent={<Plus weight="bold" />} label="New owner transfer" onPress={() => setIsOpen(true)} />}
          />
        }
      />

      <FormDrawer
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        title="Transfer between Personal and Business"
        description="You must choose the economic purpose. Never classified as sales revenue or ordinary lifestyle expense."
        submitLabel="Confirm atomic transfer"
        isSubmitting={submitTransfer.isPending}
        onSubmit={form.handleSubmit((v) => submitTransfer.mutate(v))}
      >
        <SelectField control={form.control} name="purpose" label="Economic purpose" options={PURPOSES} />
        <div className="grid grid-cols-2 gap-3">
          <SelectField control={form.control} name="from_workspace_id" label="From space" options={wsOptions} />
          <SelectField control={form.control} name="to_workspace_id" label="To space" options={wsOptions} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <SelectField control={form.control} name="from_money_account_id" label="From account" options={fromAccOptions} />
          <SelectField control={form.control} name="to_money_account_id" label="To account" options={toAccOptions} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <MoneyField control={form.control} name="amount" label="Amount" currency="NGN" exponent={2} />
          <TextInputField control={form.control} name="effective_date" label="Effective date" type="date" />
        </div>
        <TextInputField control={form.control} name="reference" label="Reference (optional)" />
        <NotesField control={form.control} name="notes" label="Notes" />
      </FormDrawer>
    </Page>
  );
}
