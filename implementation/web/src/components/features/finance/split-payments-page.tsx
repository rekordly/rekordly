"use client";

import { ArrowDownLeft, ArrowUpRight, Eye, Plus, Receipt, SplitHorizontal } from "@phosphor-icons/react";
import { toast } from "@heroui/react";
import { useState } from "react";

import { AppButton } from "@/components/ui/app-button";
import { AppRowActions } from "@/components/ui/app-row-actions";
import { DataView } from "@/components/ui/data-view";
import { FormDrawer } from "@/components/ui/form-drawer";
import { EmptyState, Page, PageHeader } from "@/components/ui/page";
import { RecordCard } from "@/components/ui/record-card";
import { StatCard } from "@/components/ui/stat-card";
import { formatDate } from "@/lib/format";
import { financeApi, formatMinorAmount } from "@/lib/money";
import type { Payment, PaymentDetail } from "@/types/finance";

import { PaymentDrawer } from "./payment-drawer";
import { money, StatusBadge, useAccountOptions, useRecords, WorkspaceGate, type WorkspaceInfo } from "./shared";

function SplitPaymentsContent({ workspaceId, currency }: WorkspaceInfo) {
  const [isSplitOpen, setIsSplitOpen] = useState(false);
  const [detailPayment, setDetailPayment] = useState<PaymentDetail | null>(null);
  const payments = useRecords<Payment>("payments", workspaceId);
  const accounts = useAccountOptions(workspaceId);

  const accountName = (id: number) => accounts.options.find((a) => a.key === String(id))?.label ?? `Account #${id}`;
  const directionLabel = (row: Payment) => (row.direction === "incoming" ? "Received" : "Paid out");

  const handleInspect = async (row: Payment) => {
    try {
      const res = await financeApi.getPayment(workspaceId, row.id);
      setDetailPayment(res);
    } catch (err: unknown) {
      toast.danger(err instanceof Error ? err.message : "Failed to load payment legs");
    }
  };

  const handleOpenReceipt = async (row: Payment) => {
    try {
      const res = await financeApi.createPaymentReceipt(workspaceId, row.id);
      window.open(res.receipt_url, "_blank", "noopener,noreferrer");
    } catch (err: unknown) {
      toast.danger(err instanceof Error ? err.message : "Failed to generate official receipt");
    }
  };

  return (
    <Page>
      <PageHeader
        title="Split Payments"
        description="Settle single transactions across multiple accounts (Cash, Bank Transfer, POS, or Mobile Wallet)."
        actions={
          <AppButton
            startContent={<Plus weight="bold" />}
            label="Record split payment"
            onPress={() => setIsSplitOpen(true)}
          />
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          tag="Multi-tender payments"
          compact
          isLoading={payments.isPending}
          title={String(payments.rows.length)}
          description="All posted settlements available for tender inspection"
          icon={<SplitHorizontal size={22} />}
        />
        <StatCard
          tag="Available settlement accounts"
          compact
          isLoading={accounts.isPending}
          title={String(accounts.options.length)}
          description="Cash, bank, and wallet tenders enabled"
          icon={<ArrowDownLeft size={22} />}
        />
        <StatCard
          tag="Official receipts"
          compact
          title="Instant share"
          description="Generate printable guest receipt links from any payment"
          icon={<Receipt size={22} />}
        />
      </div>

      <DataView<Payment>
        title="Settlement ledger"
        rows={payments.rows}
        rowKey={(row) => row.id}
        isLoading={payments.isPending}
        isError={payments.isError}
        server={payments.controls}
        searchPlaceholder="Search customer, supplier, or reference"
        empty={
          <EmptyState
            icon={SplitHorizontal}
            title="No settlements recorded yet"
            description="Split a payment between Cash, POS, and Bank Transfer in one atomic record."
            action={
              <AppButton
                startContent={<Plus weight="bold" />}
                label="Record split payment"
                onPress={() => setIsSplitOpen(true)}
              />
            }
          />
        }
        columns={[
          { key: "party", label: "Counterparty", render: (row) => <span className="font-medium text-foreground">{row.counterparty_name}</span> },
          { key: "direction", label: "Direction", render: directionLabel },
          { key: "date", label: "Date", render: (row) => formatDate(row.payment_date) },
          { key: "status", label: "Status", render: (row) => <StatusBadge status={row.status} /> },
          { key: "amount", label: "Total Amount", align: "right", render: (row) => <span className="tabular font-semibold">{money(row.total_amount_minor, row)}</span> },
          {
            key: "actions",
            label: "",
            align: "right",
            render: (row) => (
              <AppRowActions
                ariaLabel="Split payment actions"
                items={[
                  {
                    key: "inspect",
                    label: "Inspect payment legs",
                    icon: <Eye size={16} aria-hidden="true" />,
                    onClick: () => handleInspect(row),
                  },
                  {
                    key: "receipt",
                    label: "Open official receipt",
                    icon: <Receipt size={16} aria-hidden="true" />,
                    disabled: row.status === "voided",
                    onClick: () => handleOpenReceipt(row),
                  },
                ]}
              />
            ),
          },
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
            actions={
              <AppButton
                size="sm"
                variant="ghost"
                startContent={<Eye size={14} />}
                label="Legs"
                onPress={() => handleInspect(row)}
              />
            }
          />
        )}
      />

      <PaymentDrawer
        workspaceId={workspaceId}
        currency={currency}
        isOpen={isSplitOpen}
        onClose={() => {
          setIsSplitOpen(false);
          payments.refetch();
        }}
        defaultSplit
      />

      <FormDrawer
        isOpen={detailPayment !== null}
        onOpenChange={(open) => !open && setDetailPayment(null)}
        title="Multi-Tender Breakdown"
        description={detailPayment ? `${detailPayment.payment.counterparty_name} • ${formatDate(detailPayment.payment.payment_date)}` : undefined}
      >
        {detailPayment && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-border/60 bg-surface-secondary/30 p-4 flex justify-between items-center text-xs">
              <span className="text-muted">Total Settled</span>
              <span className="text-base font-bold font-mono text-foreground">
                {money(detailPayment.payment.total_amount_minor, detailPayment.payment)}
              </span>
            </div>
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted">
                Payment Legs ({detailPayment.payment_legs?.length || 0})
              </h4>
              {(detailPayment.payment_legs || []).map((leg, i) => (
                <div key={leg.id} className="flex items-center justify-between rounded-xl border border-border/50 p-3 text-xs">
                  <div>
                    <div className="font-semibold text-foreground">{accountName(leg.money_account_id)}</div>
                    <div className="text-[11px] text-muted">Tender #{i + 1}</div>
                  </div>
                  <span className="font-mono font-bold text-foreground">
                    {formatMinorAmount(
                      leg.amount_minor,
                      detailPayment.payment.currency,
                      detailPayment.payment.currency_exponent || 2,
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </FormDrawer>
    </Page>
  );
}

export function SplitPaymentsPage() {
  return (
    <WorkspaceGate businessOnly>
      {(workspace) => <SplitPaymentsContent key={workspace.workspaceId} {...workspace} />}
    </WorkspaceGate>
  );
}
