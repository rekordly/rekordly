"use client";

import { ArrowDownLeft, ArrowUpRight, HandCoins, Plus } from "@phosphor-icons/react";
import { useState } from "react";

import { AppButton } from "@/components/ui/app-button";
import { DataView } from "@/components/ui/data-view";
import { EmptyState, Page, PageHeader } from "@/components/ui/page";
import { RecordCard } from "@/components/ui/record-card";
import { formatDate } from "@/lib/format";
import type { Payment } from "@/types/finance";

import { PaymentDrawer } from "./payment-drawer";
import { money, StatusBadge, useRecords, WorkspaceGate, type WorkspaceInfo } from "./shared";

function PaymentsContent({ workspaceId, currency, startOpen }: WorkspaceInfo & { startOpen: boolean }) {
  const [isOpen, setIsOpen] = useState(startOpen);
  const payments = useRecords<Payment>("payments", workspaceId);

  const directionLabel = (row: Payment) => (row.direction === "incoming" ? "Received" : "Paid out");

  return (
    <Page>
      <PageHeader
        title="Payments"
        description="Money received from customers and paid to suppliers."
        actions={<AppButton startContent={<Plus weight="bold" />} label="Record payment" onPress={() => setIsOpen(true)} />}
      />
      <DataView<Payment>
        title="Recent payments"
        rows={payments.rows}
        rowKey={(row) => row.id}
        isLoading={payments.isPending}
        isError={payments.isError}
        hasMore={payments.hasNextPage}
        isLoadingMore={payments.isFetchingNextPage}
        onLoadMore={() => void payments.fetchNextPage()}
        empty={
          <EmptyState
            icon={HandCoins}
            title="No payments yet"
            description="Record money received or paid so your balances stay right."
            action={<AppButton startContent={<Plus weight="bold" />} label="Record payment" onPress={() => setIsOpen(true)} />}
          />
        }
        columns={[
          { key: "party", label: "With", render: (row) => <span className="font-medium text-foreground">{row.counterparty_name}</span> },
          { key: "direction", label: "Type", render: directionLabel },
          { key: "date", label: "Date", render: (row) => formatDate(row.payment_date) },
          { key: "status", label: "Status", render: (row) => <StatusBadge status={row.status} /> },
          { key: "amount", label: "Amount", align: "right", render: (row) => <span className="tabular font-semibold">{money(row.total_amount_minor, row)}</span> },
        ]}
        renderCard={(row) => (
          <RecordCard
            icon={row.direction === "incoming" ? <ArrowDownLeft size={18} aria-hidden="true" /> : <ArrowUpRight size={18} aria-hidden="true" />}
            iconClassName={row.direction === "incoming" ? "bg-primary-soft text-primary" : "bg-danger-soft text-danger"}
            reference={row.reference || directionLabel(row)}
            title={row.counterparty_name}
            amount={money(row.total_amount_minor, row)}
            status={<StatusBadge status={row.status} />}
            meta={[{ label: "Date", value: formatDate(row.payment_date) }]}
          />
        )}
      />
      <PaymentDrawer workspaceId={workspaceId} currency={currency} isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </Page>
  );
}

export function PaymentsPage({ startOpen = false }: { startOpen?: boolean }) {
  return (
    <WorkspaceGate businessOnly>
      {(workspace) => <PaymentsContent key={workspace.workspaceId} {...workspace} startOpen={startOpen} />}
    </WorkspaceGate>
  );
}
