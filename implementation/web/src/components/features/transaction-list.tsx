"use client";

import { ArrowDownLeft, ArrowsLeftRight, ArrowUpRight, Plus, Receipt, Trash } from "@phosphor-icons/react";
import { useState } from "react";

import { AppButton } from "@/components/ui/app-button";
import { AppRowActions } from "@/components/ui/app-row-actions";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DataView } from "@/components/ui/data-view";
import { EmptyState, Page, PageHeader } from "@/components/ui/page";
import { RecordCard } from "@/components/ui/record-card";
import { formatDate } from "@/lib/format";
import { moneyApi } from "@/lib/money";
import { useUIStore } from "@/stores/ui-store";
import type { MoneyTransaction } from "@/types/finance";

import { money, StatusBadge, useFinanceAction, useRecords, WorkspaceGate, type WorkspaceInfo } from "./finance/shared";
import { PageStats } from "./finance/page-stats";

const DIRECTION_STYLE = {
  money_in: { icon: ArrowDownLeft, box: "bg-primary-soft text-primary", sign: "+" },
  money_out: { icon: ArrowUpRight, box: "bg-danger-soft text-danger", sign: "−" },
  transfer: { icon: ArrowsLeftRight, box: "bg-secondary-soft text-secondary-soft-foreground", sign: "" },
} as const;

function TransactionsContent({ workspaceId, currency }: WorkspaceInfo) {
  const [voiding, setVoiding] = useState<MoneyTransaction | null>(null);
  const openMoneyRecord = useUIStore((state) => state.openMoneyRecord);
  const transactions = useRecords<MoneyTransaction>("transactions", workspaceId);

  const voidTransaction = useFinanceAction(
    workspaceId,
    (transaction: MoneyTransaction, idempotencyKey: string) =>
      moneyApi.voidTransaction({ workspaceId, idempotencyKey, id: transaction.id, reason: "Corrected from transaction history" }),
    { success: "Record voided", onDone: () => setVoiding(null) },
  );

  const amount = (row: MoneyTransaction) => `${DIRECTION_STYLE[row.direction].sign}${money(row.amount_minor, row)}`;
  const actions = (row: MoneyTransaction) => (
    <AppRowActions
      ariaLabel="Record actions"
      items={[
        {
          key: "void",
          label: "Void record",
          icon: <Trash size={16} aria-hidden="true" />,
          danger: true,
          disabled: row.status !== "posted",
          onClick: () => setVoiding(row),
        },
      ]}
    />
  );

  return (
    <Page>
      <PageHeader
        title="Records"
        description="Money that came in, went out, or moved between your accounts."
        actions={<AppButton startContent={<Plus weight="bold" />} label="Add record" onPress={() => openMoneyRecord("money_out")} />}
      />
      <PageStats kind="records" workspaceId={workspaceId} currency={currency} />

      <DataView<MoneyTransaction>
        title="Records"
        rows={transactions.rows}
        rowKey={(row) => row.id}
        isLoading={transactions.isPending}
        isError={transactions.isError}
        server={transactions.controls}
        searchPlaceholder="Search description or name"
        empty={
          <EmptyState
            icon={Receipt}
            title="No transactions yet"
            description="Record your first income, expense, or transfer to start the history."
            action={<AppButton startContent={<Plus weight="bold" />} label="Add record" onPress={() => openMoneyRecord("money_out")} />}
          />
        }
        columns={[
          {
            key: "purpose",
            label: "Description",
            render: (row) => {
              const Icon = DIRECTION_STYLE[row.direction].icon;
              return (
                <span className="flex items-center gap-3">
                  <span className={`grid size-8 shrink-0 place-items-center rounded-xl ${DIRECTION_STYLE[row.direction].box}`}>
                    <Icon size={16} aria-hidden="true" />
                  </span>
                  <span className="font-medium text-foreground">{row.purpose || "Record"}</span>
                </span>
              );
            },
          },
          { key: "party", label: "Customer or supplier", render: (row) => row.counterparty_name || "—" },
          { key: "date", label: "Date", render: (row) => formatDate(row.effective_date) },
          { key: "status", label: "Status", render: (row) => <StatusBadge status={row.status} /> },
          { key: "amount", label: "Amount", align: "right", render: (row) => <span className="tabular font-semibold">{amount(row)}</span> },
          { key: "actions", label: "", align: "right", render: actions },
        ]}
        renderCard={(row) => {
          const Icon = DIRECTION_STYLE[row.direction].icon;
          return (
            <RecordCard
              icon={<Icon size={18} aria-hidden="true" />}
              iconClassName={DIRECTION_STYLE[row.direction].box}
              reference={row.reference || `#${row.id}`}
              title={row.purpose || "Record"}
              amount={amount(row)}
              status={<StatusBadge status={row.status} />}
              meta={[
                { label: "With", value: row.counterparty_name || "—" },
                { label: "Date", value: formatDate(row.effective_date) },
              ]}
              actions={actions(row)}
            />
          );
        }}
      />

      <ConfirmDialog
        isOpen={voiding !== null}
        onOpenChange={(open) => !open && setVoiding(null)}
        title="Void this record?"
        description="It stays in your history marked as voided, and a reversing entry is posted. This cannot be undone."
        confirmLabel="Void record"
        isLoading={voidTransaction.isPending}
        onConfirm={() => voiding && voidTransaction.mutate(voiding)}
      />
    </Page>
  );
}

export function TransactionList() {
  return (
    <WorkspaceGate>
      {(workspace) => (
        <TransactionsContent key={workspace.workspaceId} {...workspace} />
      )}
    </WorkspaceGate>
  );
}
