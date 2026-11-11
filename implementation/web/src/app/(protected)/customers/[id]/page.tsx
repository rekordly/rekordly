"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@heroui/react";
import {
  ArrowLeft,
  Copy,
  CreditCard,
  Envelope,
  FileText,
  PencilSimple,
  Phone,
  Printer,
  Receipt,
  ShareNetwork,
  Wallet,
  WhatsappLogo,
} from "@phosphor-icons/react";
import { AppButton } from "@/components/ui/app-button";
import { FormDrawer } from "@/components/ui/form-drawer";
import { Page, PageHeader } from "@/components/ui/page";
import { Alert } from "@/components/ui/alert";
import { financeApi, formatMinorAmount } from "@/lib/money";
import type { Contact, CustomerCredit, CustomerWallet, Invoice, WalletTransaction } from "@/types/finance";
import { WorkspaceGate, type WorkspaceInfo } from "@/components/features/finance/shared";

interface CustomerDetailData {
  customer: Contact;
  currency: string;
  wallet: CustomerWallet | null;
  credit: CustomerCredit | null;
  invoices: Invoice[];
  sales: Array<{
    id: number;
    customer_name: string;
    total_amount_minor: number;
    paid_amount_minor: number;
    currency: string;
    currency_exponent: number;
    status: string;
    sale_date: string;
    reference?: string | null;
  }>;
}

function CustomerDetailContent({ workspaceId, currency: wsCurrency, customerId }: WorkspaceInfo & { customerId: number }) {
  const router = useRouter();
  const [data, setData] = useState<CustomerDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [viewStatement, setViewStatement] = useState(false);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [statementData, setStatementData] = useState<{
    customer: Contact;
    opening_balance_minor?: number;
    opening_balance_entry?: { description: string; amount_minor: number | string; date: string } | null;
    invoices: Invoice[];
    sales: Array<{ id: number; total_amount_minor: number; paid_amount_minor: number; currency: string; currency_exponent: number; status: string; sale_date: string; reference?: string | null }>;
    wallet_txs: WalletTransaction[];
    as_of_date: string;
  } | null>(null);

  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copiedShare, setCopiedShare] = useState(false);

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editOpeningBalance, setEditOpeningBalance] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const fetchDetail = () => {
    setLoading(true);
    financeApi
      .getCustomerDetail(workspaceId, customerId)
      .then((res) => {
        setData(res);
        setEditName(res.customer.name);
        setEditPhone(res.customer.phone || "");
        setEditEmail(res.customer.email || "");
        const rawOpen = Number(res.customer.opening_balance_minor || 0);
        setEditOpeningBalance(rawOpen > 0 ? (rawOpen / 100).toFixed(2) : "");
        setEditNotes(res.customer.notes || "");
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load customer details");
        setLoading(false);
      });
  };

  useEffect(() => {
    let active = true;
    financeApi
      .getCustomerDetail(workspaceId, customerId)
      .then((res) => {
        if (!active) return;
        setData(res);
        setEditName(res.customer.name);
        setEditPhone(res.customer.phone || "");
        setEditEmail(res.customer.email || "");
        const rawOpen = Number(res.customer.opening_balance_minor || 0);
        setEditOpeningBalance(rawOpen > 0 ? (rawOpen / 100).toFixed(2) : "");
        setEditNotes(res.customer.notes || "");
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load customer details");
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [workspaceId, customerId]);

  const loadStatement = async () => {
    try {
      const params: Record<string, string> = {};
      if (fromDate) params.from_date = fromDate;
      if (toDate) params.to_date = toDate;
      const stmt = await financeApi.getCustomerStatement(workspaceId, customerId, params);
      setStatementData(stmt);
      setViewStatement(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to generate statement");
    }
  };

  const handleShareStatement = async () => {
    try {
      const res = await financeApi.createCustomerStatementShare(workspaceId, customerId, {
        from_date: fromDate || undefined,
        to_date: toDate || undefined,
        expiry_days: 14,
      });
      setShareUrl(res.share_url);
    } catch (err: unknown) {
      toast.danger(err instanceof Error ? err.message : "Failed to create statement share link");
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName.trim()) return;
    setIsSaving(true);
    try {
      await financeApi.updateContact(workspaceId, "customers", customerId, {
        name: editName.trim(),
        phone: editPhone.trim(),
        email: editEmail.trim(),
        opening_balance: editOpeningBalance.trim() || undefined,
        notes: editNotes.trim(),
        party_type: data?.customer.party_type || "customer",
      });
      toast.success("Customer updated");
      setIsEditOpen(false);
      fetchDetail();
    } catch (err: unknown) {
      toast.danger(err instanceof Error ? err.message : "Failed to update customer");
    } finally {
      setIsSaving(false);
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
            <AppButton variant="ghost" startContent={<ArrowLeft />} label="Back to Customers" onPress={() => router.push("/customers")} />
          }
        />
        <Alert status="error" description={error || "Customer record could not be loaded."} />
      </Page>
    );
  }

  const { customer, wallet, credit, invoices, sales } = data;
  const activeCurrency = data.currency || wsCurrency || "NGN";

  const totalInvoicedMinor = (invoices || []).reduce((sum, inv) => sum + Number(inv.total_amount_minor || 0), 0);
  const totalPaidMinor = (invoices || []).reduce((sum, inv) => sum + Number(inv.paid_amount_minor || 0), 0);
  const openingBalanceMinor = Number(customer.opening_balance_minor || 0);
  const totalOutstandingMinor = totalInvoicedMinor - totalPaidMinor + openingBalanceMinor;

  return (
    <Page>
      <PageHeader
        title={customer.name}
        description={`Customer record${customer.created_at ? ` • Added ${new Date(customer.created_at).toLocaleDateString()}` : ""}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <AppButton variant="ghost" startContent={<ArrowLeft />} label="All Customers" onPress={() => router.push("/customers")} />
            <AppButton variant="secondary" startContent={<PencilSimple size={16} />} label="Edit" onPress={() => setIsEditOpen(true)} />
            <AppButton variant="secondary" startContent={<ShareNetwork size={16} />} label="Share Statement" onPress={handleShareStatement} />
            <AppButton variant="primary" startContent={<Printer size={16} />} label="Statement of Account" onPress={loadStatement} />
          </div>
        }
      />

      {viewStatement && statementData && (
        <div className="mb-6 rounded-3xl border border-border bg-surface p-6 shadow-sm space-y-4 print:p-0 print:border-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/40 pb-4">
            <div>
              <h2 className="text-base font-bold text-foreground">Statement of Account</h2>
              <p className="text-xs text-muted">
                Invoices, Direct Sales & Wallet Activity for {statementData.customer.name}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 print:hidden">
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="h-8 rounded-lg border border-border bg-background px-2 text-xs"
              />
              <span className="text-xs text-muted">→</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="h-8 rounded-lg border border-border bg-background px-2 text-xs"
              />
              <AppButton size="sm" variant="secondary" label="Filter" onPress={loadStatement} />
              <AppButton size="sm" variant="ghost" label="Close" onPress={() => setViewStatement(false)} />
              <AppButton size="sm" startContent={<Printer size={14} />} label="Print" onPress={() => window.print()} />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-secondary text-muted uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Document / Entry</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2 text-right">Paid</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20 font-mono text-[11px]">
                {Number(statementData.opening_balance_minor ?? statementData.customer.opening_balance_minor ?? 0) !== 0 && (
                  <tr className="bg-surface-secondary/20">
                    <td className="px-3 py-2 text-muted">{statementData.opening_balance_entry?.date || "Brought Forward"}</td>
                    <td className="px-3 py-2 font-sans font-semibold text-foreground">
                      {statementData.opening_balance_entry?.description || "Opening Balance"}
                    </td>
                    <td className="px-3 py-2 uppercase text-[10px] text-amber-500">OPENING</td>
                    <td className="px-3 py-2 text-right font-bold text-foreground">
                      {formatMinorAmount(
                        statementData.opening_balance_minor ?? statementData.customer.opening_balance_minor ?? 0,
                        activeCurrency,
                        2,
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-muted">—</td>
                  </tr>
                )}
                {(statementData.invoices || []).map((inv) => (
                  <tr key={`inv-${inv.id}`}>
                    <td className="px-3 py-2 text-muted">{inv.issue_date}</td>
                    <td className="px-3 py-2 font-sans font-medium text-foreground">{inv.invoice_number}</td>
                    <td className="px-3 py-2 uppercase text-[10px] text-muted">{inv.status}</td>
                    <td className="px-3 py-2 text-right font-bold text-foreground">
                      {formatMinorAmount(inv.total_amount_minor, inv.currency || activeCurrency, inv.currency_exponent || 2)}
                    </td>
                    <td className="px-3 py-2 text-right text-emerald-500">
                      {formatMinorAmount(inv.paid_amount_minor, inv.currency || activeCurrency, inv.currency_exponent || 2)}
                    </td>
                  </tr>
                ))}
                {(statementData.sales || []).map((sale) => (
                  <tr key={`sale-${sale.id}`}>
                    <td className="px-3 py-2 text-muted">{sale.sale_date}</td>
                    <td className="px-3 py-2 font-sans font-medium text-foreground">Sale #{sale.id} {sale.reference ? `(${sale.reference})` : ""}</td>
                    <td className="px-3 py-2 uppercase text-[10px] text-muted">{sale.status}</td>
                    <td className="px-3 py-2 text-right font-bold text-foreground">
                      {formatMinorAmount(sale.total_amount_minor, sale.currency || activeCurrency, sale.currency_exponent || 2)}
                    </td>
                    <td className="px-3 py-2 text-right text-emerald-500">
                      {formatMinorAmount(sale.paid_amount_minor, sale.currency || activeCurrency, sale.currency_exponent || 2)}
                    </td>
                  </tr>
                ))}
                {(statementData.wallet_txs || []).map((wtx) => (
                  <tr key={`wtx-${wtx.id}`}>
                    <td className="px-3 py-2 text-muted">{wtx.created_at?.slice(0, 10)}</td>
                    <td className="px-3 py-2 font-sans text-foreground">Wallet: {wtx.transaction_type}</td>
                    <td className="px-3 py-2 text-[10px] text-muted">{wtx.reference || "—"}</td>
                    <td className="px-3 py-2 text-right font-bold text-foreground">
                      {formatMinorAmount(wtx.amount_minor, activeCurrency, 2)}
                    </td>
                    <td className="px-3 py-2 text-right text-muted">
                      Bal: {formatMinorAmount(wtx.balance_after_minor, activeCurrency, 2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-3xl border border-border/60 bg-surface p-5 space-y-1">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted uppercase tracking-wider">
            <Wallet size={16} className="text-primary" />
            Wallet Balance
          </div>
          <div className="text-2xl font-bold font-mono text-foreground">
            {wallet ? formatMinorAmount(wallet.balance_minor, wallet.currency || activeCurrency, wallet.currency_exponent || 2) : formatMinorAmount(0, activeCurrency, 2)}
          </div>
          <p className="text-[11px] text-muted">Prepaid customer wallet</p>
        </div>

        <div className="rounded-3xl border border-border/60 bg-surface p-5 space-y-1">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted uppercase tracking-wider">
            <CreditCard size={16} className="text-primary" />
            Store Credit
          </div>
          <div className="text-2xl font-bold font-mono text-foreground">
            {credit ? formatMinorAmount(credit.balance_minor, credit.currency || activeCurrency, 2) : formatMinorAmount(0, activeCurrency, 2)}
          </div>
          <p className="text-[11px] text-muted">Credit notes from returns</p>
        </div>

        <div className="rounded-3xl border border-border/60 bg-surface p-5 space-y-1">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted uppercase tracking-wider">
            <FileText size={16} className="text-secondary" />
            Total Invoiced
          </div>
          <div className="text-2xl font-bold font-mono text-foreground">
            {formatMinorAmount(totalInvoicedMinor, activeCurrency, 2)}
          </div>
          <p className="text-[11px] text-muted">{invoices?.length ?? 0} invoices issued</p>
        </div>

        <div className="rounded-3xl border border-border/60 bg-surface p-5 space-y-1">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted uppercase tracking-wider">
            <Receipt size={16} className="text-rose-500" />
            Outstanding Due
          </div>
          <div className="text-2xl font-bold font-mono text-rose-500">
            {formatMinorAmount(totalOutstandingMinor, activeCurrency, 2)}
          </div>
          <p className="text-[11px] text-muted">Uncollected receivables</p>
        </div>
      </div>

      {/* Contact Details, Invoices & Sales */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
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

        <div className="space-y-6 lg:col-span-2">
          <div className="rounded-3xl border border-border/60 bg-surface p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-heading text-sm font-bold text-foreground">Invoices & Receivables</h3>
              <span className="text-xs text-muted font-mono">{invoices?.length ?? 0} total</span>
            </div>

            {!invoices || invoices.length === 0 ? (
              <p className="text-xs text-muted py-6 text-center">No invoices issued to this customer yet.</p>
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
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-surface-secondary text-foreground">
                            {inv.status}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right font-bold text-foreground">
                          {formatMinorAmount(inv.total_amount_minor, inv.currency || activeCurrency, inv.currency_exponent || 2)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-emerald-500">
                          {formatMinorAmount(inv.paid_amount_minor, inv.currency || activeCurrency, inv.currency_exponent || 2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {sales && sales.length > 0 && (
            <div className="rounded-3xl border border-border/60 bg-surface p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-heading text-sm font-bold text-foreground">Direct Sales History</h3>
                <span className="text-xs text-muted font-mono">{sales.length} total</span>
              </div>
              <div className="overflow-x-auto rounded-2xl border border-border/40">
                <table className="w-full text-left text-xs">
                  <thead className="bg-surface-secondary text-muted uppercase text-[10px] tracking-wider border-b border-border/40">
                    <tr>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Reference</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/20 font-mono text-[11px]">
                    {sales.map((s) => (
                      <tr key={s.id} className="hover:bg-surface-secondary/40">
                        <td className="px-4 py-2.5 text-muted">{s.sale_date}</td>
                        <td className="px-4 py-2.5 font-sans text-foreground">{s.reference || `Sale #${s.id}`}</td>
                        <td className="px-4 py-2.5 font-sans uppercase text-[10px] text-muted">{s.status}</td>
                        <td className="px-4 py-2.5 text-right font-bold text-foreground">
                          {formatMinorAmount(s.total_amount_minor, s.currency || activeCurrency, s.currency_exponent || 2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* EDIT CUSTOMER DRAWER */}
      <FormDrawer
        isOpen={isEditOpen}
        onOpenChange={(open) => !open && setIsEditOpen(false)}
        title="Edit Customer Details"
        submitLabel="Save changes"
        isSubmitting={isSaving}
        onSubmit={handleSaveEdit}
      >
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-foreground">Name</label>
            <input
              type="text"
              required
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-full h-11 px-3 rounded-2xl border border-border bg-background text-sm text-foreground"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-foreground">Phone</label>
            <input
              type="tel"
              value={editPhone}
              onChange={(e) => setEditPhone(e.target.value)}
              className="w-full h-11 px-3 rounded-2xl border border-border bg-background text-sm text-foreground"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-foreground">Email</label>
            <input
              type="email"
              value={editEmail}
              onChange={(e) => setEditEmail(e.target.value)}
              className="w-full h-11 px-3 rounded-2xl border border-border bg-background text-sm text-foreground"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-foreground">Opening Balance ({activeCurrency})</label>
            <input
              type="text"
              placeholder="0.00"
              value={editOpeningBalance}
              onChange={(e) => setEditOpeningBalance(e.target.value)}
              className="w-full h-11 px-3 rounded-2xl border border-border bg-background text-sm font-mono text-foreground"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-foreground">Notes</label>
            <textarea
              rows={3}
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              className="w-full p-3 rounded-2xl border border-border bg-background text-sm text-foreground"
            />
          </div>
        </div>
      </FormDrawer>

      {/* SHARE STATEMENT DRAWER */}
      <FormDrawer
        isOpen={shareUrl !== null}
        onOpenChange={(open) => !open && setShareUrl(null)}
        title="Share Customer Statement"
        description={`Send an expiring account statement link to ${customer.name}`}
      >
        {shareUrl && (
          <div className="space-y-5">
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={typeof window !== "undefined" ? `${window.location.origin}${shareUrl}` : shareUrl}
                className="flex-1 h-10 rounded-xl bg-surface-secondary border border-border px-3 text-xs font-mono text-foreground"
              />
              <AppButton
                size="sm"
                startContent={<Copy size={15} />}
                label={copiedShare ? "Copied!" : "Copy"}
                onPress={() => {
                  navigator.clipboard.writeText(`${window.location.origin}${shareUrl}`);
                  setCopiedShare(true);
                  setTimeout(() => setCopiedShare(false), 2000);
                }}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <a
                href={`https://wa.me/?text=${encodeURIComponent(
                  `Hello ${customer.name}, here is your account statement: ${typeof window !== "undefined" ? window.location.origin : ""}${shareUrl}`,
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 h-11 rounded-2xl bg-[#25D366]/10 text-[#25D366] font-bold text-xs border border-[#25D366]/20"
              >
                <WhatsappLogo size={18} weight="fill" /> Send via WhatsApp
              </a>
              <a
                href={`mailto:${customer.email || ""}?subject=${encodeURIComponent("Statement of Account")}&body=${encodeURIComponent(
                  `Hello ${customer.name},\n\nView your statement of account here:\n${typeof window !== "undefined" ? window.location.origin : ""}${shareUrl}`,
                )}`}
                className="flex items-center justify-center gap-2 h-11 rounded-2xl bg-surface-secondary text-foreground font-semibold text-xs border border-border"
              >
                <Envelope size={18} weight="bold" /> Send via Email
              </a>
            </div>
          </div>
        )}
      </FormDrawer>
    </Page>
  );
}

export default function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const customerId = Number(resolvedParams.id);

  return (
    <WorkspaceGate businessOnly>
      {(workspace) => <CustomerDetailContent key={workspace.workspaceId} {...workspace} customerId={customerId} />}
    </WorkspaceGate>
  );
}
