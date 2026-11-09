"use client";

import { ArrowDownLeft, ArrowsLeftRight, ArrowUpRight, Plus, Receipt, Trash } from "@phosphor-icons/react";
import { useState } from "react";

import { AppButton } from "@/components/ui/app-button";
import { AppRowActions } from "@/components/ui/app-row-actions";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DataView } from "@/components/ui/data-view";
import { FormDrawer } from "@/components/ui/form-drawer";
import { EmptyState, Page, PageHeader } from "@/components/ui/page";
import { RecordCard } from "@/components/ui/record-card";
import { formatDate } from "@/lib/format";
import { moneyApi } from "@/lib/money";
import type { MoneyTransaction } from "@/types/finance";

import { money, StatusBadge, useFinanceAction, useRecords, WorkspaceGate, type WorkspaceInfo } from "./finance/shared";
import { MoneyCaptureForm, type CaptureDirection } from "./money-capture-form";

const DIRECTION_STYLE = {
  money_in: { icon: ArrowDownLeft, box: "bg-primary-soft text-primary", sign: "+" },
  money_out: { icon: ArrowUpRight, box: "bg-danger-soft text-danger", sign: "−" },
  transfer: { icon: ArrowsLeftRight, box: "bg-secondary-soft text-secondary-soft-foreground", sign: "" },
} as const;

function TransactionsContent({
  workspaceId,
  initialDirection,
  startOpen,
}: WorkspaceInfo & { initialDirection?: CaptureDirection; startOpen: boolean }) {
  const [isOpen, setIsOpen] = useState(startOpen);
  const [voiding, setVoiding] = useState<MoneyTransaction | null>(null);
  const transactions = useRecords<MoneyTransaction>("transactions", workspaceId);

  const voidTransaction = useFinanceAction(
    workspaceId,
    (transaction: MoneyTransaction, idempotencyKey: string) =>
      moneyApi.voidTransaction({ workspaceId, idempotencyKey, id: transaction.id, reason: "Corrected from transaction history" }),
    { success: "Transaction voided", onDone: () => setVoiding(null) },
  );

  const amount = (row: MoneyTransaction) => `${DIRECTION_STYLE[row.direction].sign}${money(row.amount_minor, row)}`;
  const actions = (row: MoneyTransaction) => (
    <AppRowActions
      ariaLabel="Transaction actions"
      items={[
        {
          key: "void",
          label: "Void transaction",
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
        title="Transactions"
        description="Confirmed income, expenses, transfers, and drafts for the active workspace."
        actions={<AppButton startContent={<Plus weight="bold" />} label="Record transaction" onPress={() => setIsOpen(true)} />}
      />

      <DataView<MoneyTransaction>
        title="Recent activity"
        rows={transactions.rows}
        rowKey={(row) => row.id}
        isLoading={transactions.isPending}
        isError={transactions.isError}
        hasMore={transactions.hasNextPage}
        isLoadingMore={transactions.isFetchingNextPage}
        onLoadMore={() => void transactions.fetchNextPage()}
        empty={
          <EmptyState
            icon={Receipt}
            title="No transactions yet"
            description="Record your first income, expense, or transfer to start the history."
            action={<AppButton startContent={<Plus weight="bold" />} label="Record transaction" onPress={() => setIsOpen(true)} />}
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
                  <span className="font-medium text-foreground">{row.purpose || "Transaction"}</span>
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
              title={row.purpose || "Transaction"}
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

      <FormDrawer isOpen={isOpen} onOpenChange={setIsOpen} title="Record money" description="Save a confirmed income, expense, or transfer.">
        <MoneyCaptureForm bare initialDirection={initialDirection} onCreated={() => setIsOpen(false)} />
      </FormDrawer>

      <ConfirmDialog
        isOpen={voiding !== null}
        onOpenChange={(open) => !open && setVoiding(null)}
        title="Void this transaction?"
        description="It stays in your history marked as voided, and a reversing entry is posted. This cannot be undone."
        confirmLabel="Void transaction"
        isLoading={voidTransaction.isPending}
        onConfirm={() => voiding && voidTransaction.mutate(voiding)}
      />
    </Page>
  );
}

export function TransactionList({
  initialDirection,
  startOpen = false,
}: {
  initialDirection?: CaptureDirection;
  startOpen?: boolean;
}) {
  return (
    <WorkspaceGate>
      {(workspace) => (
        <TransactionsContent key={workspace.workspaceId} {...workspace} initialDirection={initialDirection} startOpen={startOpen} />
      )}
    </WorkspaceGate>
  );
}
