"use client";

import {
  ArrowDownLeft,
  ArrowUpRight,
  Copy,
  Envelope,
  Eye,
  HandCoins,
  ListChecks,
  Plus,
  Receipt,
  WhatsappLogo,
} from "@phosphor-icons/react";
import { toast } from "@heroui/react";
import { useState } from "react";

import { AppButton } from "@/components/ui/app-button";
import { AppRowActions } from "@/components/ui/app-row-actions";
import { DataView } from "@/components/ui/data-view";
import { FormDrawer } from "@/components/ui/form-drawer";
import { EmptyState, Page, PageHeader } from "@/components/ui/page";
import { RecordCard } from "@/components/ui/record-card";
import { formatDate } from "@/lib/format";
import { financeApi, formatMinorAmount } from "@/lib/money";
import type { Payment, PaymentDetail } from "@/types/finance";

import { PaymentDrawer } from "./payment-drawer";
import { InvoiceAllocationDrawer } from "./invoice-allocation-drawer";
import { money, StatusBadge, useAccountOptions, useRecords, WorkspaceGate, type WorkspaceInfo } from "./shared";

function PaymentsContent({ workspaceId, currency, startOpen }: WorkspaceInfo & { startOpen: boolean }) {
  const [isOpen, setIsOpen] = useState(startOpen);
  const [isAllocationOpen, setIsAllocationOpen] = useState(false);
  const payments = useRecords<Payment>("payments", workspaceId);
  const accounts = useAccountOptions(workspaceId);

  const [detailPayment, setDetailPayment] = useState<PaymentDetail | null>(null);
  const [receiptPayment, setReceiptPayment] = useState<Payment | null>(null);
  const [receiptShare, setReceiptShare] = useState<{ receipt_url: string; token: string } | null>(null);
  const [copiedReceipt, setCopiedReceipt] = useState(false);

  const accountName = (id: number) => accounts.options.find((a) => a.key === String(id))?.label ?? `Account #${id}`;
  const directionLabel = (row: Payment) => (row.direction === "incoming" ? "Received" : "Paid out");

  const handleInspectPayment = async (row: Payment) => {
    try {
      const detail = await financeApi.getPayment(workspaceId, row.id);
      setDetailPayment(detail);
    } catch (err: unknown) {
      toast.danger(err instanceof Error ? err.message : "Failed to load payment details");
    }
  };

  const handleIssueReceipt = async (row: Payment) => {
    try {
      const res = await financeApi.createPaymentReceipt(workspaceId, row.id);
      setReceiptShare(res);
      setReceiptPayment(row);
    } catch (err: unknown) {
      toast.danger(err instanceof Error ? err.message : "Failed to generate receipt");
    }
  };

  const handleCopyReceipt = () => {
    if (!receiptShare) return;
    navigator.clipboard.writeText(`${window.location.origin}${receiptShare.receipt_url}`);
    setCopiedReceipt(true);
    setTimeout(() => setCopiedReceipt(false), 2000);
  };

  const rowActions = (row: Payment) => (
    <AppRowActions
      ariaLabel="Payment actions"
      items={[
        {
          key: "inspect",
          label: "Inspect legs & details",
          icon: <Eye size={16} aria-hidden="true" />,
          onClick: () => handleInspectPayment(row),
        },
        {
          key: "receipt",
          label: "Official receipt / Share",
          icon: <Receipt size={16} aria-hidden="true" />,
          disabled: row.status === "voided",
          onClick: () => handleIssueReceipt(row),
        },
      ]}
    />
  );

  return (
    <Page>
      <PageHeader
        title="Payments"
        description="Money received from customers and paid to suppliers."
        actions={
          <div className="flex flex-wrap gap-2">
            <AppButton variant="secondary" startContent={<ListChecks weight="bold" />} label="Allocate receipt" onPress={() => setIsAllocationOpen(true)} />
            <AppButton startContent={<Plus weight="bold" />} label="Record payment" onPress={() => setIsOpen(true)} />
          </div>
        }
      />
      <DataView<Payment>
        title="Payments"
        rows={payments.rows}
        rowKey={(row) => row.id}
        isLoading={payments.isPending}
        isError={payments.isError}
        server={payments.controls}
        searchPlaceholder="Search name or reference"
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
          { key: "actions", label: "", align: "right", render: rowActions },
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
            actions={rowActions(row)}
          />
        )}
      />

      <PaymentDrawer workspaceId={workspaceId} currency={currency} isOpen={isOpen} onClose={() => setIsOpen(false)} />
      <InvoiceAllocationDrawer workspaceId={workspaceId} currency={currency} isOpen={isAllocationOpen} onClose={() => setIsAllocationOpen(false)} />

      {/* INSPECT PAYMENT LEGS DRAWER */}
      <FormDrawer
        isOpen={detailPayment !== null}
        onOpenChange={(open) => !open && setDetailPayment(null)}
        title="Payment Details"
        description={detailPayment ? `${detailPayment.payment.counterparty_name} • ${formatDate(detailPayment.payment.payment_date)}` : undefined}
      >
        {detailPayment && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-border/60 bg-surface-secondary/30 p-4 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted">Total Amount</span>
                <span className="font-mono font-bold text-foreground">
                  {money(detailPayment.payment.total_amount_minor, detailPayment.payment)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Direction</span>
                <span className="font-semibold text-foreground">{directionLabel(detailPayment.payment)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Status</span>
                <StatusBadge status={detailPayment.payment.status} />
              </div>
              {detailPayment.payment.reference && (
                <div className="flex justify-between">
                  <span className="text-muted">Reference</span>
                  <span className="font-mono text-foreground">{detailPayment.payment.reference}</span>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted">
                Settlement Account Legs ({detailPayment.payment_legs?.length || 0})
              </h4>
              {(detailPayment.payment_legs || []).map((leg) => (
                <div key={leg.id} className="flex items-center justify-between rounded-xl border border-border/50 p-3 text-xs">
                  <span className="font-medium text-foreground">{accountName(leg.money_account_id)}</span>
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

            {detailPayment.payment.status !== "voided" && (
              <AppButton
                variant="secondary"
                startContent={<Receipt size={16} />}
                label="Generate Official Receipt"
                onPress={() => {
                  const p = detailPayment.payment;
                  setDetailPayment(null);
                  handleIssueReceipt(p);
                }}
              />
            )}
          </div>
        )}
      </FormDrawer>

      {/* SHARE RECEIPT DRAWER */}
      <FormDrawer
        isOpen={receiptPayment !== null}
        onOpenChange={(open) => !open && setReceiptPayment(null)}
        title="Official Payment Receipt"
        description={receiptPayment ? `Share payment receipt with ${receiptPayment.counterparty_name}` : undefined}
      >
        {receiptShare && receiptPayment && (
          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-foreground uppercase tracking-wider block">Public Receipt Link</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={typeof window !== "undefined" ? `${window.location.origin}${receiptShare.receipt_url}` : receiptShare.receipt_url}
                  className="flex-1 h-10 rounded-xl bg-surface-secondary border border-border px-3 text-xs font-mono text-foreground focus:outline-none"
                />
                <AppButton
                  variant="primary"
                  size="sm"
                  startContent={<Copy size={15} />}
                  label={copiedReceipt ? "Copied!" : "Copy"}
                  onPress={handleCopyReceipt}
                />
              </div>
              <a
                href={receiptShare.receipt_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block text-xs font-semibold text-primary hover:underline pt-1"
              >
                Open Printable Receipt Preview →
              </a>
            </div>

            <div className="space-y-3 pt-2 border-t border-border/40">
              <span className="text-xs font-semibold text-foreground uppercase tracking-wider block">Direct Messaging</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(
                    `Hello ${receiptPayment.counterparty_name}, thank you for your payment of ${money(
                      receiptPayment.total_amount_minor,
                      receiptPayment,
                    )}. Official receipt: ${typeof window !== "undefined" ? window.location.origin : ""}${receiptShare.receipt_url}`,
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 h-11 rounded-2xl bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366]/20 font-bold text-xs transition-colors border border-[#25D366]/20"
                >
                  <WhatsappLogo size={18} weight="fill" />
                  Send via WhatsApp
                </a>
                <a
                  href={`mailto:?subject=${encodeURIComponent(`Official Payment Receipt`)}&body=${encodeURIComponent(
                    `Hello ${receiptPayment.counterparty_name},\n\nThank you for your payment of ${money(
                      receiptPayment.total_amount_minor,
                      receiptPayment,
                    )}.\n\nView and print your official receipt here:\n${typeof window !== "undefined" ? window.location.origin : ""}${receiptShare.receipt_url}\n\nThank you!`,
                  )}`}
                  className="flex items-center justify-center gap-2 h-11 rounded-2xl bg-surface-secondary text-foreground hover:bg-surface-secondary/80 font-semibold text-xs transition-colors border border-border"
                >
                  <Envelope size={18} weight="bold" />
                  Send via Email
                </a>
              </div>
            </div>
          </div>
        )}
      </FormDrawer>
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
