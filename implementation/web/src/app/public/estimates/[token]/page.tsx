"use client";

import { use, useEffect, useState } from "react";
import { ChatCircleDots, CheckCircle, Envelope, FileText, Handshake, PaperPlaneTilt, Printer, WhatsappLogo, XCircle } from "@phosphor-icons/react";
import { AppButton } from "@/components/ui/app-button";
import { Alert } from "@/components/ui/alert";
import { financeApi, formatMinorAmount } from "@/lib/money";
import type { ExternalMessage, PublicEstimateView } from "@/types/finance";

export default function PublicEstimatePage({ params }: { params: Promise<{ token: string }> }) {
  const resolved = use(params);
  const token = resolved.token;

  const [view, setView] = useState<PublicEstimateView | null>(null);
  const [messages, setMessages] = useState<ExternalMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [responderName, setResponderName] = useState("");
  const [comment, setComment] = useState("");
  const [responding, setResponding] = useState(false);
  const [responded, setResponded] = useState<string | null>(null);
  const [msgText, setMsgText] = useState("");
  const [msgSending, setMsgSending] = useState(false);
  const [claimBanner, setClaimBanner] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      financeApi.getPublicEstimate(token),
      financeApi.listPublicMessages("estimate", token).catch(() => []),
    ])
      .then(([res, msgs]) => {
        if (active) {
          setView(res);
          setMessages(msgs);
          setResponderName(res.estimate.customer_name || "");
          if (res.response_status) setResponded(res.response_status);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (active) {
          setError(err instanceof Error ? err.message : "This quotation link has expired or does not exist.");
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [token]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!msgText.trim()) return;
    setMsgSending(true);
    try {
      const m = await financeApi.postPublicMessage("estimate", token, {
        sender_name: responderName.trim() || "Client",
        message: msgText.trim(),
      });
      setMessages((prev) => [...prev, m]);
      setMsgText("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setMsgSending(false);
    }
  };

  const handleClaim = async () => {
    try {
      await financeApi.claimExternalPartyLink("estimate", token);
      setClaimBanner("Quotation linked to your Rekordly account.");
    } catch {
      setClaimBanner("Sign in to your Rekordly account to save this vendor relationship.");
    }
  };

  const handleRespond = async (action: "accepted" | "declined") => {
    if (!responderName.trim()) {
      setError("Please enter your name before submitting a response.");
      return;
    }
    setResponding(true);
    setError(null);
    try {
      const res = await financeApi.respondPublicEstimate(token, {
        action,
        responder_name: responderName.trim(),
        comment: comment.trim() || undefined,
      });
      setResponded(res.estimate.status);
      if (view) {
        setView({ ...view, estimate: res.estimate, response_status: res.estimate.status });
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to record response.");
    } finally {
      setResponding(false);
    }
  };

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
          <h1 className="font-heading text-lg font-bold text-foreground">Quotation Unavailable</h1>
          <Alert status="error" description={error || "Link expired or invalid."} />
        </div>
      </div>
    );
  }

  const { workspace_name, estimate, items, allow_respond } = view;
  const exp = estimate.currency_exponent ?? 2;

  return (
    <div className="min-h-screen bg-background py-8 px-4 print:bg-white print:p-0">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
          <div className="flex items-center gap-2 text-xs text-muted">
            <FileText size={16} className="text-primary" />
            <span>Quotation from {workspace_name}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href={`https://wa.me/?text=${encodeURIComponent(
                `Quotation ${estimate.estimate_number} from ${workspace_name}: ${typeof window !== "undefined" ? window.location.href : ""}`,
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#25D366]/10 px-3 text-xs font-semibold text-[#25D366] hover:bg-[#25D366]/20"
            >
              <WhatsappLogo size={16} weight="fill" /> WhatsApp
            </a>
            <a
              href={`mailto:?subject=${encodeURIComponent(`Quotation ${estimate.estimate_number}`)}&body=${encodeURIComponent(
                typeof window !== "undefined" ? window.location.href : "",
              )}`}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-surface px-3 text-xs font-semibold text-foreground"
            >
              <Envelope size={16} /> Email
            </a>
            <AppButton size="sm" variant="secondary" startContent={<Printer size={16} />} label="Print / PDF" onPress={() => window.print()} />
          </div>
        </div>

        <div className="rounded-3xl border border-border bg-surface p-8 shadow-sm space-y-6 print:border-0 print:shadow-none">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border/50 pb-6">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-primary">Commercial Quotation</span>
              <h1 className="mt-1 font-heading text-2xl font-bold text-foreground">{workspace_name}</h1>
              <p className="text-xs text-muted mt-1">Prepared for {estimate.customer_name}</p>
            </div>
            <div className="text-right space-y-1 text-xs">
              <div className="font-mono text-sm font-bold text-foreground">{estimate.estimate_number}</div>
              <div className="text-muted">Issued: {estimate.issue_date}</div>
              <div className="text-muted">Valid until: {estimate.expiry_date}</div>
              <span className="inline-block rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-semibold uppercase text-primary">
                {estimate.status}
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border/50 text-muted uppercase text-[10px]">
                <tr>
                  <th className="py-2.5">Description</th>
                  <th className="py-2.5 text-right">Qty</th>
                  <th className="py-2.5 text-right">Unit Price</th>
                  <th className="py-2.5 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {items.map((item) => (
                  <tr key={item.id}>
                    <td className="py-3 font-medium text-foreground">{item.description}</td>
                    <td className="py-3 text-right font-mono">{item.quantity}</td>
                    <td className="py-3 text-right font-mono">{formatMinorAmount(item.unit_price_minor, estimate.currency, exp)}</td>
                    <td className="py-3 text-right font-mono font-semibold text-foreground">
                      {formatMinorAmount(item.amount_minor, estimate.currency, exp)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="border-t border-border/50 pt-4 flex justify-end">
            <div className="w-full max-w-xs space-y-1.5 text-xs">
              <div className="flex justify-between text-muted">
                <span>Subtotal</span>
                <span className="font-mono">{formatMinorAmount(estimate.subtotal_minor, estimate.currency, exp)}</span>
              </div>
              {Number(estimate.discount_minor ?? 0) > 0 && (
                <div className="flex justify-between text-emerald-600">
                  <span>Discount</span>
                  <span className="font-mono">-{formatMinorAmount(estimate.discount_minor ?? 0, estimate.currency, exp)}</span>
                </div>
              )}
              {Number(estimate.tax_amount_minor) > 0 && (
                <div className="flex justify-between text-muted">
                  <span>Tax</span>
                  <span className="font-mono">{formatMinorAmount(estimate.tax_amount_minor, estimate.currency, exp)}</span>
                </div>
              )}
              {Number(estimate.delivery_fee_minor ?? 0) > 0 && (
                <div className="flex justify-between text-muted">
                  <span>Delivery Fee</span>
                  <span className="font-mono">{formatMinorAmount(estimate.delivery_fee_minor ?? 0, estimate.currency, exp)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-border/40 pt-2 text-base font-bold text-foreground">
                <span>Total</span>
                <span className="font-mono text-primary">{formatMinorAmount(estimate.total_amount_minor, estimate.currency, exp)}</span>
              </div>
            </div>
          </div>

          {estimate.terms && (
            <div className="rounded-2xl bg-surface-secondary/50 p-4 text-xs text-muted">
              <span className="font-semibold text-foreground block mb-1">Terms & Notes</span>
              <p>{estimate.terms}</p>
              {estimate.notes && <p className="mt-1">{estimate.notes}</p>}
            </div>
          )}

          {error && <Alert status="error" description={error} />}

          {responded ? (
            <Alert
              status={responded === "accepted" ? "success" : "warning"}
              description={`Response recorded: Quotation ${responded}. Thank you!`}
            />
          ) : (
            allow_respond &&
            estimate.status !== "converted" && (
              <div className="rounded-2xl border border-border/60 bg-surface-secondary/30 p-5 space-y-4 print:hidden">
                <h3 className="font-heading text-sm font-bold text-foreground">Respond to Quotation</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="text-xs font-semibold text-foreground block mb-1">Your Name</label>
                    <input
                      type="text"
                      value={responderName}
                      onChange={(e) => setResponderName(e.target.value)}
                      className="w-full h-10 rounded-xl border border-border bg-background px-3 text-xs text-foreground"
                      placeholder="Your full name"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-foreground block mb-1">Comment (Optional)</label>
                    <input
                      type="text"
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      className="w-full h-10 rounded-xl border border-border bg-background px-3 text-xs text-foreground"
                      placeholder="Any feedback or PO reference"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap gap-3">
                  <AppButton
                    startContent={<CheckCircle size={16} weight="bold" />}
                    label="Accept Quotation"
                    isLoading={responding}
                    onPress={() => handleRespond("accepted")}
                  />
                  <AppButton
                    variant="secondary"
                    startContent={<XCircle size={16} weight="bold" />}
                    label="Decline"
                    isLoading={responding}
                    onPress={() => handleRespond("declined")}
                  />
                </div>
              </div>
            )
          )}
          {claimBanner && <Alert status="info" description={claimBanner} />}

          <div className="border-t border-border/50 pt-5 space-y-3 print:hidden">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted flex items-center gap-2">
                <ChatCircleDots size={16} className="text-primary" /> Questions & Feedback ({messages.length})
              </h3>
              <AppButton size="sm" variant="ghost" startContent={<Handshake size={14} />} label="Claim Link" onPress={handleClaim} />
            </div>
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
            <form onSubmit={handleSendMessage} className="flex gap-2">
              <input
                type="text"
                required
                placeholder="Ask a question about this quote..."
                value={msgText}
                onChange={(e) => setMsgText(e.target.value)}
                className="flex-1 h-10 rounded-xl border border-border bg-background px-3 text-xs text-foreground"
              />
              <AppButton type="submit" size="sm" startContent={<PaperPlaneTilt size={14} />} label="Send" isLoading={msgSending} />
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
