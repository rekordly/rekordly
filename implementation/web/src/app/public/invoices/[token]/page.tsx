"use client";

import { ChatCircleDots, CheckCircle, Clock, Copy, Envelope, Handshake, PaperPlaneTilt, Printer, Receipt, WhatsappLogo } from "@phosphor-icons/react";
import { use, useEffect, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { AppButton } from "@/components/ui/app-button";
import { formatDate } from "@/lib/format";
import { financeApi, formatMinorAmount } from "@/lib/money";
import type { ExternalMessage, PublicInvoiceView } from "@/types/finance";

interface PageProps {
  params: Promise<{ token: string }>;
}

export default function PublicInvoicePage({ params }: PageProps) {
  const resolvedParams = use(params);
  const token = resolvedParams.token;

  const [data, setData] = useState<PublicInvoiceView | null>(null);
  const [messages, setMessages] = useState<ExternalMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Payment evidence submission state
  const [showEvidenceForm, setShowEvidenceForm] = useState(false);
  const [evPayerName, setEvPayerName] = useState("");
  const [evAmount, setEvAmount] = useState("");
  const [evDate, setEvDate] = useState(new Date().toISOString().slice(0, 10));
  const [evMethod, setEvMethod] = useState("bank_transfer");
  const [evRef, setEvRef] = useState("");
  const [evNotes, setEvNotes] = useState("");
  const [evSubmitting, setEvSubmitting] = useState(false);
  const [evDone, setEvDone] = useState(false);

  // Messages state
  const [msgName, setMsgName] = useState("");
  const [msgText, setMsgText] = useState("");
  const [msgSubmitting, setMsgSubmitting] = useState(false);
  const [claimBanner, setClaimBanner] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      financeApi.getPublicInvoice(token),
      financeApi.listPublicMessages("invoice", token).catch(() => []),
    ])
      .then(([res, msgs]) => {
        if (active) {
          setData(res);
          setMessages(msgs);
          setEvPayerName(res.invoice.customer_name || "");
          setMsgName(res.invoice.customer_name || "");
          setLoading(false);
        }
      })
      .catch((err) => {
        if (active) {
          setError(err.message || "Invoice link not found or expired");
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [token]);

  const handleSubmitEvidence = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!evPayerName.trim() || !evAmount.trim()) return;
    setEvSubmitting(true);
    try {
      await financeApi.submitPublicPaymentEvidence(token, {
        payer_name: evPayerName.trim(),
        amount: evAmount.trim(),
        payment_date: evDate,
        payment_method: evMethod,
        reference: evRef.trim() || undefined,
        notes: evNotes.trim() || undefined,
      });
      setEvDone(true);
      setShowEvidenceForm(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to submit payment evidence");
    } finally {
      setEvSubmitting(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!msgName.trim() || !msgText.trim()) return;
    setMsgSubmitting(true);
    try {
      const m = await financeApi.postPublicMessage("invoice", token, {
        sender_name: msgName.trim(),
        message: msgText.trim(),
      });
      setMessages((prev) => [...prev, m]);
      setMsgText("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setMsgSubmitting(false);
    }
  };

  const handleClaim = async () => {
    try {
      await financeApi.claimExternalPartyLink("invoice", token);
      setClaimBanner("Customer account linked to your Rekordly profile.");
    } catch {
      setClaimBanner("Sign in to your Rekordly account to claim and save this vendor relationship.");
    }
  };

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
          <p className="text-sm font-medium">Loading invoice...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-md w-full">
          <Alert status="error" description={error || "This invoice link is invalid or has expired."} />
        </div>
      </div>
    );
  }

  const { invoice, items, tax_lines, workspace_name } = data;
  const isPaid = invoice.status === "paid";
  const balanceDueMinor = BigInt(invoice.total_amount_minor) - BigInt(invoice.paid_amount_minor);

  // WhatsApp share link
  const currentUrl = typeof window !== "undefined" ? window.location.href : "";
  const waText = encodeURIComponent(
    `Hello ${invoice.customer_name}, here is your invoice ${invoice.invoice_number} from ${workspace_name} for ${formatMinorAmount(
      invoice.total_amount_minor,
      invoice.currency,
      invoice.currency_exponent,
    )}: ${currentUrl}`,
  );
  const waUrl = `https://wa.me/?text=${waText}`;

  // Email fallback share link
  const mailSubject = encodeURIComponent(`Invoice ${invoice.invoice_number} from ${workspace_name}`);
  const mailBody = encodeURIComponent(
    `Hello ${invoice.customer_name},\n\nPlease find your invoice ${invoice.invoice_number} for ${formatMinorAmount(
      invoice.total_amount_minor,
      invoice.currency,
      invoice.currency_exponent,
    )}.\n\nView and print your invoice online here:\n${currentUrl}\n\nThank you for your business!\n${workspace_name}`,
  );
  const mailUrl = `mailto:?subject=${mailSubject}&body=${mailBody}`;

  return (
    <div className="min-h-screen bg-surface-secondary/40 py-8 px-4 sm:px-6 print:bg-white print:p-0">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Action Toolbar (Hidden in Print) */}
        <div className="flex items-center justify-between bg-surface-primary rounded-2xl border border-border p-4 shadow-sm print:hidden">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-muted">Share via:</span>
            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366]/20 font-semibold text-xs transition-colors"
            >
              <WhatsappLogo size={16} weight="fill" />
              WhatsApp
            </a>
            <a
              href={mailUrl}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface-secondary text-foreground hover:bg-surface-secondary/80 font-medium text-xs transition-colors"
            >
              <Envelope size={16} weight="bold" />
              Email
            </a>
          </div>

          <div className="flex items-center gap-2">
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
              label="Print Invoice"
              onPress={handlePrint}
            />
          </div>
        </div>

        {/* Printable Invoice Container */}
        <div className="bg-surface-primary rounded-3xl border border-border p-8 sm:p-12 shadow-sm space-y-8 print:border-none print:shadow-none print:p-0">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6 border-b border-border/50 pb-8">
            <div className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-primary">Invoice From</span>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">{workspace_name}</h1>
              <p className="text-xs text-muted">Issued with Rekordly</p>
            </div>

            <div className="sm:text-right space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted block">Invoice Number</span>
              <p className="text-xl font-bold text-foreground font-mono">{invoice.invoice_number}</p>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-primary-soft text-primary">
                {isPaid ? <CheckCircle size={14} weight="bold" /> : <Clock size={14} />}
                <span className="uppercase">{invoice.status}</span>
              </div>
            </div>
          </div>

          {/* Details Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-xs">
            <div>
              <span className="font-semibold text-muted uppercase tracking-wider block mb-1">Billed To</span>
              <p className="font-semibold text-foreground text-sm">{invoice.customer_name}</p>
            </div>
            <div>
              <span className="font-semibold text-muted uppercase tracking-wider block mb-1">Issue Date</span>
              <p className="text-foreground">{formatDate(invoice.issue_date)}</p>
            </div>
            <div>
              <span className="font-semibold text-muted uppercase tracking-wider block mb-1">Due Date</span>
              <p className="font-semibold text-foreground">{formatDate(invoice.due_date)}</p>
            </div>
          </div>

          {/* Line Items Table */}
          <div className="border border-border/60 rounded-2xl overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-secondary/70 border-b border-border/60">
                <tr>
                  <th className="py-3 px-4 font-semibold text-muted uppercase tracking-wider">Item Description</th>
                  <th className="py-3 px-4 font-semibold text-muted uppercase tracking-wider text-center">Qty</th>
                  <th className="py-3 px-4 font-semibold text-muted uppercase tracking-wider text-right">Unit Price</th>
                  <th className="py-3 px-4 font-semibold text-muted uppercase tracking-wider text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {items.map((item) => (
                  <tr key={item.id} className="text-foreground">
                    <td className="py-3.5 px-4 font-medium">
                      {item.description}
                      {Number(item.discount_minor ?? 0) > 0 && (
                        <span className="ml-2 text-[11px] text-emerald-600">
                          (Line disc: -{formatMinorAmount(item.discount_minor ?? 0, invoice.currency, invoice.currency_exponent)})
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-center tabular">{item.quantity}</td>
                    <td className="py-3.5 px-4 text-right tabular">
                      {formatMinorAmount(item.unit_price_minor, invoice.currency, invoice.currency_exponent)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-semibold tabular">
                      {formatMinorAmount(item.amount_minor, invoice.currency, invoice.currency_exponent)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals Summary Breakdown */}
          <div className="flex justify-end">
            <div className="w-full sm:w-72 space-y-2 text-xs">
              <div className="flex justify-between text-muted">
                <span>Subtotal</span>
                <span className="tabular font-medium text-foreground">
                  {formatMinorAmount(invoice.subtotal_minor, invoice.currency, invoice.currency_exponent)}
                </span>
              </div>
              {BigInt(invoice.discount_minor ?? 0) > 0 && (
                <div className="flex justify-between text-emerald-600">
                  <span>Discount</span>
                  <span className="tabular font-medium">
                    -{formatMinorAmount(invoice.discount_minor ?? 0, invoice.currency, invoice.currency_exponent)}
                  </span>
                </div>
              )}
              {tax_lines && tax_lines.length > 0 ? (
                tax_lines.map((tl, idx) => (
                  <div key={idx} className="flex justify-between text-muted">
                    <span>
                      {tl.name} ({(tl.rate_bps / 100).toFixed(2).replace(/\.00$/, "")}%{tl.is_compound ? ", compound" : ""})
                    </span>
                    <span className="tabular font-medium text-foreground">
                      {formatMinorAmount(tl.amount_minor, invoice.currency, invoice.currency_exponent)}
                    </span>
                  </div>
                ))
              ) : (
                BigInt(invoice.tax_amount_minor) > 0 && (
                  <div className="flex justify-between text-muted">
                    <span>Tax / VAT</span>
                    <span className="tabular font-medium text-foreground">
                      {formatMinorAmount(invoice.tax_amount_minor, invoice.currency, invoice.currency_exponent)}
                    </span>
                  </div>
                )
              )}
              {BigInt(invoice.delivery_fee_minor ?? 0) > 0 && (
                <div className="flex justify-between text-muted">
                  <span>Delivery Fee</span>
                  <span className="tabular font-medium text-foreground">
                    {formatMinorAmount(invoice.delivery_fee_minor ?? 0, invoice.currency, invoice.currency_exponent)}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-sm font-bold text-foreground border-t border-border pt-2">
                <span>Total Amount</span>
                <span className="tabular text-primary font-bold">
                  {formatMinorAmount(invoice.total_amount_minor, invoice.currency, invoice.currency_exponent)}
                </span>
              </div>
              <div className="flex justify-between text-muted pt-1">
                <span>Paid to Date</span>
                <span className="tabular font-medium text-foreground">
                  {formatMinorAmount(invoice.paid_amount_minor, invoice.currency, invoice.currency_exponent)}
                </span>
              </div>
              <div className="flex justify-between text-sm font-bold text-foreground border-t border-border/60 pt-2 bg-surface-secondary/40 p-2 rounded-xl">
                <span>Balance Due</span>
                <span className="tabular font-bold text-danger">
                  {formatMinorAmount(balanceDueMinor.toString(), invoice.currency, invoice.currency_exponent)}
                </span>
              </div>
            </div>
          </div>

          {/* Terms & Notes */}
          {(invoice.terms || invoice.notes) && (
            <div className="border-t border-border/50 pt-6 space-y-4 text-xs">
              {invoice.terms && (
                <div>
                  <span className="font-semibold text-foreground uppercase tracking-wider block mb-1">Payment Terms</span>
                  <p className="text-muted leading-relaxed">{invoice.terms}</p>
                </div>
              )}
              {invoice.notes && (
                <div>
                  <span className="font-semibold text-foreground uppercase tracking-wider block mb-1">Notes</span>
                  <p className="text-muted leading-relaxed">{invoice.notes}</p>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 print:hidden">
            {!isPaid && invoice.document_kind !== "proforma" && (
              <AppButton
                size="sm"
                variant="secondary"
                startContent={<Receipt size={15} />}
                label="Submit Proof of Payment"
                onPress={() => setShowEvidenceForm((v) => !v)}
              />
            )}
            <AppButton size="sm" variant="ghost" startContent={<Handshake size={15} />} label="Claim / Link to Account" onPress={handleClaim} />
          </div>

          {claimBanner && <Alert status="info" description={claimBanner} />}

          {evDone && (
            <Alert status="success" description="Proof of payment submitted! The merchant has been notified to review and reconcile." />
          )}

          {showEvidenceForm && (
            <form onSubmit={handleSubmitEvidence} className="rounded-2xl border border-primary/25 bg-primary-soft/15 p-5 space-y-3 print:hidden">
              <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">Submit Payment Evidence</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  type="text"
                  required
                  placeholder="Payer name"
                  value={evPayerName}
                  onChange={(e) => setEvPayerName(e.target.value)}
                  className="h-10 rounded-xl border border-border bg-background px-3 text-xs text-foreground"
                />
                <input
                  type="text"
                  required
                  placeholder={`Amount (${invoice.currency}) e.g. 25000.00`}
                  value={evAmount}
                  onChange={(e) => setEvAmount(e.target.value)}
                  className="h-10 rounded-xl border border-border bg-background px-3 text-xs font-mono text-foreground"
                />
                <input
                  type="date"
                  required
                  value={evDate}
                  onChange={(e) => setEvDate(e.target.value)}
                  className="h-10 rounded-xl border border-border bg-background px-3 text-xs text-foreground"
                />
                <select
                  value={evMethod}
                  onChange={(e) => setEvMethod(e.target.value)}
                  className="h-10 rounded-xl border border-border bg-background px-3 text-xs text-foreground"
                >
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="pos_card">POS / Card</option>
                  <option value="cash">Cash Deposit</option>
                  <option value="cheque">Cheque</option>
                </select>
                <input
                  type="text"
                  placeholder="Bank reference / Session ID"
                  value={evRef}
                  onChange={(e) => setEvRef(e.target.value)}
                  className="h-10 rounded-xl border border-border bg-background px-3 text-xs text-foreground sm:col-span-2"
                />
              </div>
              <div className="flex justify-end gap-2">
                <AppButton size="sm" variant="ghost" label="Cancel" onPress={() => setShowEvidenceForm(false)} />
                <AppButton type="submit" size="sm" label="Submit Proof" isLoading={evSubmitting} />
              </div>
            </form>
          )}

          {/* Guest Messages / Disputes */}
          <div className="border-t border-border/50 pt-5 space-y-3 print:hidden">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted flex items-center gap-2">
              <ChatCircleDots size={16} className="text-primary" /> Questions & Messages ({messages.length})
            </h3>
            {messages.length > 0 && (
              <div className="space-y-2">
                {messages.map((m) => (
                  <div key={m.id} className="rounded-2xl bg-surface-secondary/40 px-3.5 py-2.5 text-xs">
                    <div className="flex justify-between text-[11px] text-muted mb-1">
                      <span className="font-semibold text-foreground">{m.sender_name} ({m.sender_type})</span>
                      <span>{new Date(m.created_at).toLocaleString()}</span>
                    </div>
                    <p className="text-foreground">{m.message}</p>
                  </div>
                ))}
              </div>
            )}
            <form onSubmit={handleSendMessage} className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                required
                placeholder="Your name"
                value={msgName}
                onChange={(e) => setMsgName(e.target.value)}
                className="sm:w-44 h-10 rounded-xl border border-border bg-background px-3 text-xs text-foreground"
              />
              <input
                type="text"
                required
                placeholder="Ask a question or report an adjustment..."
                value={msgText}
                onChange={(e) => setMsgText(e.target.value)}
                className="flex-1 h-10 rounded-xl border border-border bg-background px-3 text-xs text-foreground"
              />
              <AppButton type="submit" size="sm" startContent={<PaperPlaneTilt size={14} />} label="Send" isLoading={msgSubmitting} />
            </form>
          </div>

          {/* Footer */}
          <div className="border-t border-border/40 pt-6 text-center text-xs text-muted">
            <p>Thank you for choosing {workspace_name}.</p>
            <p className="mt-1 text-[11px]">Powered by Rekordly V2</p>
          </div>
        </div>
      </div>
    </div>
  );
}
