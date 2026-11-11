"use client";

import { use, useEffect, useState } from "react";
import { FileText, Printer } from "@phosphor-icons/react";
import { AppButton } from "@/components/ui/app-button";
import { Alert } from "@/components/ui/alert";
import { financeApi, formatMinorAmount } from "@/lib/money";
import type { PublicStatementView } from "@/types/finance";

export default function PublicStatementPage({ params }: { params: Promise<{ token: string }> }) {
  const resolved = use(params);
  const token = resolved.token;

  const [view, setView] = useState<PublicStatementView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    financeApi
      .getPublicStatement(token)
      .then((res) => {
        if (active) {
          setView(res);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (active) {
          setError(err instanceof Error ? err.message : "Statement link has expired or does not exist.");
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [token]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="size-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!view) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="max-w-md w-full rounded-3xl border border-border bg-surface p-8 space-y-4">
          <h1 className="font-heading text-lg font-bold text-foreground">Statement Unavailable</h1>
          <Alert status="error" description={error || "Link expired or invalid."} />
        </div>
      </div>
    );
  }

  const { workspace_name, customer, invoices, wallet_txs, from_date, to_date } = view;
  const totalInvoiced = (invoices || []).reduce((acc, inv) => acc + Number(inv.total_amount_minor || 0), 0);
  const totalPaid = (invoices || []).reduce((acc, inv) => acc + Number(inv.paid_amount_minor || 0), 0);
  const totalDue = totalInvoiced - totalPaid;

  return (
    <div className="min-h-screen bg-background py-8 px-4 print:bg-white print:p-0">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center justify-between print:hidden">
          <div className="flex items-center gap-2 text-xs text-muted">
            <FileText size={16} className="text-primary" />
            <span>Statement of Account from {workspace_name}</span>
          </div>
          <AppButton size="sm" variant="secondary" startContent={<Printer size={16} />} label="Print / Save PDF" onPress={() => window.print()} />
        </div>

        <div className="rounded-3xl border border-border bg-surface p-8 shadow-sm space-y-6 print:border-0 print:shadow-none">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border/50 pb-6">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-primary">Customer Statement</span>
              <h1 className="mt-1 font-heading text-2xl font-bold text-foreground">{customer.name}</h1>
              <p className="text-xs text-muted mt-1">
                {customer.email || ""} {customer.phone ? `• ${customer.phone}` : ""}
              </p>
            </div>
            <div className="text-right text-xs text-muted space-y-1">
              <div className="font-semibold text-foreground">{workspace_name}</div>
              {from_date || to_date ? (
                <div>
                  Period: {from_date || "Start"} → {to_date || "Present"}
                </div>
              ) : (
                <div>Full Activity Summary</div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 rounded-2xl border border-border/50 bg-surface-secondary/30 p-4 text-xs">
            <div>
              <span className="text-muted block">Total Billed</span>
              <span className="font-mono text-sm font-bold text-foreground">{formatMinorAmount(totalInvoiced, "NGN", 2)}</span>
            </div>
            <div>
              <span className="text-muted block">Total Paid</span>
              <span className="font-mono text-sm font-bold text-emerald-600">{formatMinorAmount(totalPaid, "NGN", 2)}</span>
            </div>
            <div>
              <span className="text-muted block">Outstanding Balance</span>
              <span className="font-mono text-sm font-bold text-rose-500">{formatMinorAmount(totalDue, "NGN", 2)}</span>
            </div>
          </div>

          <div className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">Invoices ({invoices?.length ?? 0})</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-border/50 text-muted uppercase text-[10px]">
                  <tr>
                    <th className="py-2">Date</th>
                    <th className="py-2">Invoice #</th>
                    <th className="py-2">Status</th>
                    <th className="py-2 text-right">Amount</th>
                    <th className="py-2 text-right">Paid</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20 font-mono text-[11px]">
                  {(invoices || []).map((inv) => (
                    <tr key={inv.id}>
                      <td className="py-2.5 text-muted">{inv.issue_date}</td>
                      <td className="py-2.5 font-sans font-semibold text-foreground">{inv.invoice_number}</td>
                      <td className="py-2.5 font-sans uppercase text-[10px] text-muted">{inv.status}</td>
                      <td className="py-2.5 text-right font-bold text-foreground">
                        {formatMinorAmount(inv.total_amount_minor, inv.currency, inv.currency_exponent || 2)}
                      </td>
                      <td className="py-2.5 text-right text-emerald-600">
                        {formatMinorAmount(inv.paid_amount_minor, inv.currency, inv.currency_exponent || 2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {wallet_txs && wallet_txs.length > 0 && (
            <div className="space-y-3 pt-4 border-t border-border/40">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">Wallet Movements ({wallet_txs.length})</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-border/50 text-muted uppercase text-[10px]">
                    <tr>
                      <th className="py-2">Date</th>
                      <th className="py-2">Type</th>
                      <th className="py-2">Reference</th>
                      <th className="py-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/20 font-mono text-[11px]">
                    {wallet_txs.map((wtx) => (
                      <tr key={wtx.id}>
                        <td className="py-2.5 text-muted">{wtx.created_at?.slice(0, 10)}</td>
                        <td className="py-2.5 font-sans text-foreground">{wtx.transaction_type}</td>
                        <td className="py-2.5 text-muted">{wtx.reference || wtx.notes || "—"}</td>
                        <td className="py-2.5 text-right font-bold text-foreground">{formatMinorAmount(wtx.amount_minor, "NGN", 2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
