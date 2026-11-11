"use client";

import { ChatCircleDots, CheckCircle, ClipboardText, Handshake, PaperPlaneTilt, Printer, XCircle } from "@phosphor-icons/react";
import { use, useEffect, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { AppButton } from "@/components/ui/app-button";
import { financeApi, formatMinorAmount } from "@/lib/money";
import type { ExternalMessage, PurchaseOrderShareView } from "@/types/finance";

interface PageProps {
  params: Promise<{ token: string }>;
}

export default function PublicPurchaseOrderPage({ params }: PageProps) {
  const { token } = use(params);
  const [share, setShare] = useState<PurchaseOrderShareView | null>(null);
  const [messages, setMessages] = useState<ExternalMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [senderName, setSenderName] = useState("");
  const [msgText, setMsgText] = useState("");
  const [sendingMsg, setSendingMsg] = useState(false);
  const [claimStatus, setClaimStatus] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      financeApi.getPublicPurchaseOrderShare(token),
      financeApi.listPublicMessages("purchase_order", token).catch(() => []),
    ])
      .then(([s, msgs]) => {
        if (!active) return;
        setShare(s);
        setMessages(msgs);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "This purchase order link is invalid or expired.");
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token]);

  const handleRespond = async (action: "acknowledged" | "declined" | "change_requested") => {
    setSubmitting(true);
    try {
      const updated = await financeApi.respondPublicPurchaseOrderShare(token, action, note.trim() || undefined);
      setShare(updated);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to submit response");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!senderName.trim() || !msgText.trim()) return;
    setSendingMsg(true);
    try {
      const created = await financeApi.postPublicMessage("purchase_order", token, {
        sender_name: senderName.trim(),
        message: msgText.trim(),
      });
      setMessages((prev) => [...prev, created]);
      setMsgText("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setSendingMsg(false);
    }
  };

  const handleClaim = async () => {
    try {
      const link = await financeApi.claimExternalPartyLink("purchase_order", token);
      setClaimStatus(`Linked to ${link.counterparty_id ? "supplier account" : "portal"} cleanly.`);
    } catch {
      setClaimStatus("Sign in to your Rekordly account to link this buyer relationship.");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="size-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (error || !share) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-3xl border border-border bg-surface p-8 space-y-4">
          <h1 className="font-heading text-lg font-bold text-foreground">Purchase Order Unavailable</h1>
          <Alert status="error" description={error || "Link expired or invalid."} />
        </div>
      </div>
    );
  }

  const po = share.order;
  const exp = po.currency_exponent ?? 2;

  return (
    <div className="min-h-screen bg-background py-8 px-4 print:bg-white print:p-0">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
          <div className="flex items-center gap-2 text-xs text-muted">
            <ClipboardText size={16} className="text-primary" />
            <span>Supplier Purchase Order Portal</span>
          </div>
          <div className="flex items-center gap-2">
            <AppButton size="sm" variant="ghost" startContent={<Handshake size={16} />} label="Claim Supplier Link" onPress={handleClaim} />
            <AppButton size="sm" variant="secondary" startContent={<Printer size={16} />} label="Print / PDF" onPress={() => window.print()} />
          </div>
        </div>

        {claimStatus && <Alert status="info" description={claimStatus} />}

        <div className="rounded-3xl border border-border bg-surface p-8 shadow-sm space-y-6 print:border-0 print:shadow-none">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border/50 pb-6">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-primary">Purchase Order</span>
              <h1 className="mt-1 font-heading text-2xl font-bold text-foreground">{po.order_number || `PO #${po.id}`}</h1>
              <p className="text-xs text-muted mt-1">Portal status: {share.status.replace("_", " ")} • Order status: {po.status.replace("_", " ")}</p>
            </div>
            <div className="text-right">
              <div className="text-xs text-muted">Order Total</div>
              <div className="font-mono text-2xl font-bold text-foreground">{formatMinorAmount(po.total_minor, po.currency || "NGN", exp)}</div>
            </div>
          </div>

          {po.lines && po.lines.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-border/50 text-muted uppercase text-[10px]">
                  <tr>
                    <th className="py-2">Description</th>
                    <th className="py-2 text-right">Qty</th>
                    <th className="py-2 text-right">Unit Price</th>
                    <th className="py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                  {po.lines.map((line) => (
                    <tr key={line.id}>
                      <td className="py-2.5 font-medium text-foreground">{line.description}</td>
                      <td className="py-2.5 text-right font-mono text-muted">{line.quantity} {line.unit_name}</td>
                      <td className="py-2.5 text-right font-mono">{formatMinorAmount(line.expected_unit_cost_minor, po.currency || "NGN", exp)}</td>
                      <td className="py-2.5 text-right font-mono font-bold text-foreground">{formatMinorAmount(line.line_total_minor, po.currency || "NGN", exp)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {share.status === "active" ? (
            <div className="rounded-2xl border border-primary/20 bg-primary-soft/15 p-5 space-y-4 print:hidden">
              <h2 className="text-sm font-bold text-foreground">Supplier Acknowledgement</h2>
              <textarea
                rows={2}
                placeholder="Optional delivery timeline or requested changes note..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full p-3 rounded-xl border border-border bg-background text-xs text-foreground"
              />
              <div className="flex flex-wrap gap-2">
                <AppButton size="sm" startContent={<CheckCircle size={16} />} label="Acknowledge Order" isLoading={submitting} onPress={() => handleRespond("acknowledged")} />
                <AppButton size="sm" variant="secondary" label="Request Changes" isLoading={submitting} onPress={() => handleRespond("change_requested")} />
                <AppButton size="sm" variant="ghost" startContent={<XCircle size={16} />} label="Decline" isLoading={submitting} onPress={() => handleRespond("declined")} />
              </div>
            </div>
          ) : (
            <Alert status="success" description={`Supplier response recorded: ${share.status.replace("_", " ")}`} />
          )}

          {/* Guest Messages */}
          <div className="border-t border-border/50 pt-5 space-y-4 print:hidden">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted flex items-center gap-2">
              <ChatCircleDots size={16} className="text-primary" /> Order Messages ({messages.length})
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
                value={senderName}
                onChange={(e) => setSenderName(e.target.value)}
                className="sm:w-44 h-10 rounded-xl border border-border bg-background px-3 text-xs text-foreground"
              />
              <input
                type="text"
                required
                placeholder="Write a message or delivery note..."
                value={msgText}
                onChange={(e) => setMsgText(e.target.value)}
                className="flex-1 h-10 rounded-xl border border-border bg-background px-3 text-xs text-foreground"
              />
              <AppButton type="submit" size="sm" startContent={<PaperPlaneTilt size={14} />} label="Send" isLoading={sendingMsg} />
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
