"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  FileText,
  HandCoins,
  Phone,
  Envelope,
  User,
  Wallet,
  Receipt,
  Printer,
  Calendar,
} from "@phosphor-icons/react";
import { AppButton } from "@/components/ui/app-button";
import { Page, PageHeader } from "@/components/ui/page";
import { Alert } from "@/components/ui/alert";
import { financeApi, formatMinorAmount } from "@/lib/money";
import type { Contact, CustomerWallet, Invoice, WalletTransaction } from "@/types/finance";
import { WorkspaceGate, type WorkspaceInfo } from "@/components/features/finance/shared";

interface CustomerDetailData {
  customer: Contact;
  wallet: CustomerWallet | null;
  invoices: Invoice[];
  sales: Array<{ id: number; total_amount_minor: number; paid_amount_minor: number; status: string; sale_date: { Time: string }; reference?: { String: string } }>;
}

function CustomerDetailContent({
  workspaceId,
  customerId,
}: WorkspaceInfo & { customerId: number }) {
  const router = useRouter();
  const [data, setData] = useState<CustomerDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewStatement, setViewStatement] = useState(false);
  const [statementData, setStatementData] = useState<{
    customer: Contact;
    invoices: Invoice[];
    wallet_txs: WalletTransaction[];
    as_of_date: string;
  } | null>(null);

  useEffect(() => {
    let active = true;
    financeApi
      .getCustomerDetail(workspaceId, customerId)
      .then((res) => {
        if (active) {
          setData(res);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (active) {
          setError(err instanceof Error ? err.message : "Failed to load customer details");
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [workspaceId, customerId]);

  const loadStatement = async () => {
    try {
      const stmt = await financeApi.getCustomerStatement(workspaceId, customerId);
      setStatementData(stmt);
      setViewStatement(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to generate statement");
    }
  };

  if (loading) {
    return (
      <Page>
        <div className="flex h-64 items-center justify-center">
          <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </Page>
    );
  }

  if (error || !data) {
    return (
      <Page>
        <PageHeader
          title="Customer Not Found"
          actions={
            <AppButton
              variant="ghost"
              startContent={<ArrowLeft />}
              label="Back to Customers"
              onPress={() => router.push("/customers")}
            />
          }
        />
        <Alert status="error" description={error || "Customer record could not be loaded."} />
      </Page>
    );
  }

  const { customer, wallet, invoices, sales } = data;

  const totalInvoicedMinor = (invoices || []).reduce((sum, inv) => sum + Number(inv.total_amount_minor || 0), 0);
  const totalPaidMinor = (invoices || []).reduce((sum, inv) => sum + Number(inv.paid_amount_minor || 0), 0);
  const totalOutstandingMinor = totalInvoicedMinor - totalPaidMinor;

  return (
    <Page>
      <PageHeader
        title={customer.name}
        description={`Customer record${customer.created_at ? ` • Added ${new Date(customer.created_at).toLocaleDateString()}` : ""}`}
        actions={
          <div className="flex items-center gap-2">
            <AppButton
              variant="ghost"
              startContent={<ArrowLeft />}
              label="All Customers"
              onPress={() => router.push("/customers")}
            />
            <AppButton
              variant="secondary"
              startContent={<Printer size={16} />}
              label="Statement of Account"
              onPress={loadStatement}
            />
          </div>
        }
      />

      {viewStatement && statementData && (
        <div className="mb-6 rounded-3xl border border-border bg-surface p-6 shadow-sm space-y-4 print:p-0">
          <div className="flex items-center justify-between border-b border-border/40 pb-4">
            <div>
              <h2 className="text-base font-bold text-foreground">Statement of Account</h2>
              <p className="text-xs text-muted">
                Transactions, Invoices & Deposits for {statementData.customer.name}
              </p>
            </div>
            <div className="flex gap-2 print:hidden">
              <AppButton
                size="sm"
                variant="ghost"
                label="Close Statement"
                onPress={() => setViewStatement(false)}
              />
              <AppButton
                size="sm"
                startContent={<Printer size={14} />}
                label="Print Statement"
                onPress={() => window.print()}
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-secondary text-muted uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Document / Reference</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Invoiced</th>
                  <th className="px-3 py-2 text-right">Paid</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20 font-mono text-[11px]">
                {(statementData.invoices || []).map((inv) => (
                  <tr key={inv.id}>
                    <td className="px-3 py-2 text-muted">{inv.issue_date}</td>
                    <td className="px-3 py-2 font-sans font-medium text-foreground">{inv.invoice_number}</td>
                    <td className="px-3 py-2 uppercase text-[10px] text-muted">{inv.status}</td>
                    <td className="px-3 py-2 text-right font-bold text-foreground">
                      {formatMinorAmount(inv.total_amount_minor, inv.currency, inv.currency_exponent || 2)}
                    </td>
                    <td className="px-3 py-2 text-right text-emerald-500">
                      {formatMinorAmount(inv.paid_amount_minor, inv.currency, inv.currency_exponent || 2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-3xl border border-border/60 bg-surface p-5 space-y-1">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted uppercase tracking-wider">
            <Wallet size={16} className="text-primary" />
            Wallet Balance
          </div>
          <div className="text-2xl font-bold font-mono text-foreground">
            {wallet
              ? formatMinorAmount(wallet.balance_minor, wallet.currency, wallet.currency_exponent || 2)
              : "NGN 0.00"}
          </div>
          <p className="text-[11px] text-muted">Customer store credit & deposits</p>
        </div>

        <div className="rounded-3xl border border-border/60 bg-surface p-5 space-y-1">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted uppercase tracking-wider">
            <FileText size={16} className="text-secondary" />
            Total Invoiced
          </div>
          <div className="text-2xl font-bold font-mono text-foreground">
            {formatMinorAmount(totalInvoicedMinor, "NGN", 2)}
          </div>
          <p className="text-[11px] text-muted">{invoices.length} invoices issued</p>
        </div>

        <div className="rounded-3xl border border-border/60 bg-surface p-5 space-y-1">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted uppercase tracking-wider">
            <Receipt size={16} className="text-rose-500" />
            Outstanding Due
          </div>
          <div className="text-2xl font-bold font-mono text-rose-500">
            {formatMinorAmount(totalOutstandingMinor, "NGN", 2)}
          </div>
          <p className="text-[11px] text-muted">Uncollected receivables</p>
        </div>
      </div>

      {/* Contact Details & Recent Invoices */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Contact Info Card */}
        <div className="rounded-3xl border border-border/60 bg-surface p-6 space-y-4 h-fit">
          <h3 className="font-heading text-sm font-bold text-foreground">Contact Information</h3>
          <div className="space-y-3 text-xs">
            <div className="flex items-center gap-3 text-muted">
              <Phone size={16} className="text-foreground shrink-0" />
              <span className="text-foreground">{customer.phone || "No phone number recorded"}</span>
            </div>
            <div className="flex items-center gap-3 text-muted">
              <Envelope size={16} className="text-foreground shrink-0" />
              <span className="text-foreground">{customer.email || "No email address recorded"}</span>
            </div>
            {customer.notes && (
              <div className="pt-3 border-t border-border/40 text-muted">
                <span className="font-semibold text-foreground block mb-1">Notes</span>
                {customer.notes}
              </div>
            )}
          </div>
        </div>

        {/* Recent Invoices Table */}
        <div className="rounded-3xl border border-border/60 bg-surface p-6 space-y-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h3 className="font-heading text-sm font-bold text-foreground">Invoices & Receivables</h3>
            <span className="text-xs text-muted font-mono">{invoices.length} total</span>
          </div>

          {invoices.length === 0 ? (
            <p className="text-xs text-muted py-8 text-center">No invoices issued to this customer yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-border/40">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-secondary text-muted uppercase text-[10px] tracking-wider border-b border-border/40">
                  <tr>
                    <th className="px-4 py-3">Invoice #</th>
                    <th className="px-4 py-3">Issue Date</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3 text-right">Paid</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20 font-mono text-[11px]">
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-surface-secondary/40">
                      <td className="px-4 py-2.5 font-sans font-semibold text-foreground">{inv.invoice_number}</td>
                      <td className="px-4 py-2.5 text-muted">{inv.issue_date}</td>
                      <td className="px-4 py-2.5 font-sans">
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                            inv.status === "paid"
                              ? "bg-emerald-500/10 text-emerald-500"
                              : inv.status === "partially_paid"
                              ? "bg-amber-500/10 text-amber-500"
                              : "bg-surface-secondary text-muted"
                          }`}
                        >
                          {inv.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-bold text-foreground">
                        {formatMinorAmount(inv.total_amount_minor, inv.currency, inv.currency_exponent || 2)}
                      </td>
                      <td className="px-4 py-2.5 text-right text-emerald-500">
                        {formatMinorAmount(inv.paid_amount_minor, inv.currency, inv.currency_exponent || 2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Page>
  );
}

export default function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const customerId = Number(resolvedParams.id);

  return (
    <WorkspaceGate businessOnly>
      {(workspace) => (
        <CustomerDetailContent
          key={workspace.workspaceId}
          {...workspace}
          customerId={customerId}
        />
      )}
    </WorkspaceGate>
  );
}
