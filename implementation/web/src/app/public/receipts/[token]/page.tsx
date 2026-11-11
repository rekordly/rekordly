"use client";

import { CheckCircle, Clock, Copy, Printer, SealCheck } from "@phosphor-icons/react";
import { use, useEffect, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { AppButton } from "@/components/ui/app-button";
import { formatDate } from "@/lib/format";
import { financeApi, formatMinorAmount } from "@/lib/money";
import type { PublicReceiptView } from "@/types/finance";

interface PageProps {
  params: Promise<{ token: string }>;
}

export default function PublicReceiptPage({ params }: PageProps) {
  const resolvedParams = use(params);
  const token = resolvedParams.token;

  const [data, setData] = useState<PublicReceiptView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    financeApi
      .getPublicReceipt(token)
      .then((res) => {
        if (active) {
          setData(res);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (active) {
          setError(err.message || "Payment receipt not found");
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [token]);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="flex flex-col items-center gap-3 text-muted">
          <Clock size={28} className="animate-spin text-primary" />
          <p className="text-sm font-medium">Loading receipt...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-md w-full">
          <Alert status="error" description={error || "This receipt is invalid or does not exist."} />
        </div>
      </div>
    );
  }

  const { receipt, payment, invoice, workspace_name } = data;

  return (
    <div className="min-h-screen bg-surface-secondary/40 py-8 px-4 sm:px-6 print:bg-white print:p-0">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Action Toolbar */}
        <div className="flex items-center justify-end gap-2 bg-surface-primary rounded-2xl border border-border p-3 shadow-sm print:hidden">
          <AppButton
            variant="ghost"
            size="sm"
            startContent={<Copy size={15} />}
            label={copied ? "Copied!" : "Copy Link"}
            onPress={handleCopyLink}
          />
          <AppButton
            variant="primary"
            size="sm"
            startContent={<Printer size={15} />}
            label="Print Receipt"
            onPress={handlePrint}
          />
        </div>

        {/* Printable Receipt Card */}
        <div className="bg-surface-primary rounded-3xl border border-border p-8 sm:p-12 shadow-sm space-y-8 relative overflow-hidden print:border-none print:shadow-none print:p-0">
          {/* Official Stamp Watermark Badge */}
          <div className="absolute right-6 top-8 opacity-15 sm:opacity-25 pointer-events-none rotate-[-12deg] flex flex-col items-center border-4 border-primary rounded-2xl p-3 text-primary">
            <SealCheck size={36} weight="bold" />
            <span className="text-xs font-black tracking-widest uppercase">PAID IN FULL</span>
            <span className="text-[10px] font-bold">{formatDate(receipt.issued_at)}</span>
          </div>

          {/* Header */}
          <div className="space-y-1 border-b border-border/50 pb-6">
            <span className="text-xs font-semibold uppercase tracking-wider text-primary">Official Payment Receipt</span>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{workspace_name}</h1>
            <p className="text-xs text-muted font-mono">{receipt.receipt_number}</p>
          </div>

          {/* Amount Paid Spotlight */}
          <div className="rounded-2xl bg-primary-soft/40 border border-primary/20 p-6 text-center space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">Amount Received</span>
            <p className="text-3xl font-extrabold text-primary tabular tracking-tight">
              {formatMinorAmount(receipt.amount_minor, receipt.currency, payment.currency_exponent)}
            </p>
            <div className="inline-flex items-center gap-1 text-xs font-medium text-primary pt-1">
              <CheckCircle size={14} weight="bold" />
              <span>Payment confirmed</span>
            </div>
          </div>

          {/* Payment Details Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs border border-border/60 rounded-2xl p-5 bg-surface-secondary/30">
            <div>
              <span className="text-muted block mb-0.5">Received From</span>
              <span className="font-semibold text-foreground text-sm">{payment.counterparty_name || "Customer"}</span>
            </div>
            <div>
              <span className="text-muted block mb-0.5">Payment Date</span>
              <span className="font-medium text-foreground">{formatDate(payment.payment_date)}</span>
            </div>
            {payment.reference && (
              <div>
                <span className="text-muted block mb-0.5">Transaction Reference</span>
                <span className="font-mono text-foreground">{payment.reference}</span>
              </div>
            )}
            {invoice && (
              <div>
                <span className="text-muted block mb-0.5">Applied to Invoice</span>
                <span className="font-mono font-semibold text-primary">{invoice.invoice_number}</span>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-border/40 pt-6 text-center text-xs text-muted space-y-1">
            <p>This is an automated official digital receipt generated by Rekordly V2 on behalf of {workspace_name}.</p>
            <p className="text-[11px]">No signature required.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
