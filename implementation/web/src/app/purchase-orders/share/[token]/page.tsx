"use client";

import {
  ChatCircleDots,
  CheckCircle,
  Handshake,
  PaperPlaneTilt,
  PencilSimple,
  Printer,
  XCircle,
} from "@phosphor-icons/react";
import { toast } from "@heroui/react";
import { useRouter } from "next/navigation";
import { use, useEffect, useMemo, useState } from "react";

import { StatusBadge } from "@/components/features/finance/shared";
import { toMinor } from "@/components/pickers";
import { Alert } from "@/components/ui/alert";
import { AppButton } from "@/components/ui/app-button";
import { AppInput } from "@/components/ui/app-input";
import { AppModal } from "@/components/ui/app-modal";
import { AppTextarea } from "@/components/ui/app-textarea";
import { MoneyInput } from "@/components/ui/money-input";
import { Page, PageHeader } from "@/components/ui/page";
import { SideSheet } from "@/components/ui/side-sheet";
import { formatDate } from "@/lib/format";
import { financeApi, formatMinorAmount } from "@/lib/money";
import type { ExternalMessage, PurchaseOrderShareView } from "@/types/finance";

interface PageProps {
  params: Promise<{ token: string }>;
}

interface EditableLine {
  id: number;
  description: string;
  unitName: string;
  originalQty: string;
  originalUnitCostMinor: string;
  quantity: string;
  unitCostMajor: string;
}

function minorToMajorString(minor: string | number, exponent = 2): string {
  const val = BigInt(minor || 0);
  if (val <= BigInt(0)) return "0.00";
  const factor = BigInt(10 ** exponent);
  const whole = val / factor;
  const frac = (val % factor).toString().padStart(exponent, "0");
  return exponent > 0 ? `${whole}.${frac}` : `${whole}`;
}

function lineMinorTotal(qtyStr: string, unitMajor: string): bigint {
  const qty = Number(qtyStr);
  if (!Number.isFinite(qty) || qty <= 0) return BigInt(0);
  const unitMinor = toMinor(unitMajor);
  const scaledQty = BigInt(Math.round(qty * 10000));
  return (unitMinor * scaledQty + BigInt(5000)) / BigInt(10000);
}

function DetailCard({
  title,
  action,
  children,
  className = "",
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-border bg-surface p-5 ${className}`}>
      <div className="flex items-center justify-between gap-3 pb-3">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-separator py-2.5 text-[13px] last:border-b-0">
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium text-right">{children}</dd>
    </div>
  );
}

export default function PublicPurchaseOrderPage({ params }: PageProps) {
  const { token } = use(params);
  const router = useRouter();

  const [share, setShare] = useState<PurchaseOrderShareView | null>(null);
  const [messages, setMessages] = useState<ExternalMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editableLines, setEditableLines] = useState<EditableLine[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [responseBanner, setResponseBanner] = useState<string | null>(null);

  // Line editing drawer state
  const [editingLineIdx, setEditingLineIdx] = useState<number | null>(null);
  const [draftQty, setDraftQty] = useState("");
  const [draftUnitPrice, setDraftUnitPrice] = useState("");

  // Action modal (for note/reason before submit)
  const [actionModal, setActionModal] = useState<{
    isOpen: boolean;
    action: "acknowledged" | "declined" | "change_requested";
  }>({ isOpen: false, action: "acknowledged" });
  const [modalNote, setModalNote] = useState("");

  // Chat drawer state
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [senderName, setSenderName] = useState("");
  const [msgText, setMsgText] = useState("");
  const [sendingMsg, setSendingMsg] = useState(false);

  // Claim link state
  const [claiming, setClaiming] = useState(false);
  const [claimBanner, setClaimBanner] = useState<{ status: "success" | "info"; text: string } | null>(null);

  const syncLinesFromShare = (s: PurchaseOrderShareView) => {
    const exp = s.order.currency_exponent ?? 2;
    setEditableLines(
      (s.order.lines ?? []).map((l) => ({
        id: l.id,
        description: l.description,
        unitName: l.unit_name,
        originalQty: String(Number(l.quantity)),
        originalUnitCostMinor: l.expected_unit_cost_minor,
        quantity: String(Number(l.quantity)),
        unitCostMajor: minorToMajorString(l.expected_unit_cost_minor, exp),
      })),
    );
    if (s.supplier_name && !senderName) {
      setSenderName(s.supplier_name);
    }
  };

  useEffect(() => {
    let active = true;
    Promise.all([
      financeApi.getPublicPurchaseOrderShare(token),
      financeApi.listPublicMessages("purchase_order", token).catch(() => []),
    ])
      .then(([s, msgs]) => {
        if (!active) return;
        setShare(s);
        syncLinesFromShare(s);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const po = share?.order;
  const exp = po?.currency_exponent ?? 2;
  const cur = po?.currency || "NGN";
  const showMoney = (minor: string | number | bigint) => formatMinorAmount(String(minor), cur, exp);

  const quotedTotalMinor = useMemo(
    () => editableLines.reduce((sum, l) => sum + lineMinorTotal(l.quantity, l.unitCostMajor), BigInt(0)),
    [editableLines],
  );

  const hasPriceChanges = useMemo(
    () =>
      editableLines.some(
        (l) =>
          toMinor(l.unitCostMajor).toString() !== l.originalUnitCostMinor ||
          Number(l.quantity) !== Number(l.originalQty),
      ),
    [editableLines],
  );

  const openEditLine = (idx: number) => {
    const line = editableLines[idx];
    if (!line) return;
    setDraftQty(line.quantity);
    setDraftUnitPrice(line.unitCostMajor);
    setEditingLineIdx(idx);
  };

  const handleSaveLine = () => {
    if (editingLineIdx === null) return;
    const numQty = Number(draftQty);
    if (!Number.isFinite(numQty) || numQty <= 0) {
      toast.danger("Please enter a valid quantity greater than zero.");
      return;
    }
    setEditableLines((prev) =>
      prev.map((item, i) =>
        i === editingLineIdx
          ? { ...item, quantity: draftQty.trim(), unitCostMajor: draftUnitPrice }
          : item,
      ),
    );
    setEditingLineIdx(null);
    toast.success("Item updated");
  };

  const handleResetChanges = () => {
    if (!share) return;
    syncLinesFromShare(share);
    toast.info("Changes reset to original order");
  };

  const openActionModal = (action: "acknowledged" | "declined" | "change_requested") => {
    setActionModal({ isOpen: true, action });
    setModalNote("");
  };

  const handleRespond = async (
    action: "acknowledged" | "declined" | "change_requested",
    customNote?: string,
  ) => {
    const finalNote = (customNote ?? "").trim();
    if (action === "change_requested" && !hasPriceChanges && !finalNote) {
      toast.danger("Update an item price or quantity, or enter a note explaining the requested change.");
      return;
    }
    if (action === "declined" && !finalNote) {
      toast.danger("Please provide a reason for declining this order.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const linePayload = editableLines.map((l) => ({
        id: l.id,
        quantity: l.quantity,
        unit_cost: l.unitCostMajor,
      }));
      const updated = await financeApi.respondPublicPurchaseOrderShare(
        token,
        action,
        finalNote || undefined,
        linePayload,
      );
      setShare(updated);
      syncLinesFromShare(updated);
      const refreshedMsgs = await financeApi.listPublicMessages("purchase_order", token).catch(() => messages);
      setMessages(refreshedMsgs);
      setActionModal((prev) => ({ ...prev, isOpen: false }));

      const msg =
        action === "acknowledged"
          ? hasPriceChanges
            ? "Prices updated and purchase order acknowledged. The buyer has been notified."
            : "Purchase order acknowledged. The buyer has been notified."
          : action === "change_requested"
            ? "Updated prices and change request sent to the buyer."
            : "Purchase order declined. The buyer has been notified.";
      setResponseBanner(msg);
      toast.success(msg);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to submit response";
      setError(msg);
      toast.danger(msg);
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
      toast.success("Message sent to buyer");
    } catch (err: unknown) {
      toast.danger(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setSendingMsg(false);
    }
  };

  const handleClaim = async () => {
    setClaiming(true);
    try {
      await financeApi.claimExternalPartyLink("purchase_order", token);
      const msg = `Connected to ${share?.workspace_name || "merchant"} in your Rekordly account.`;
      setClaimBanner({ status: "success", text: msg });
      toast.success(msg);
    } catch {
      toast.info("Please sign in to your Rekordly account to link this merchant to your workspace.");
      router.push(`/login?return_to=${encodeURIComponent(`/purchase-orders/share/${token}`)}`);
    } finally {
      setClaiming(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="size-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (error || !share || !po) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-2xl border border-border bg-surface p-6 space-y-4">
          <h1 className="text-[16px] font-bold text-foreground">Purchase order unavailable</h1>
          <Alert status="error" description={error || "Link expired or invalid."} />
        </div>
      </div>
    );
  }

  const canEditPrices =
    share.status !== "declined" && !["cancelled", "closed", "fully_received"].includes(po.status);

  return (
    <div className="min-h-screen bg-background py-6 px-4 print:bg-white print:p-0">
      <Page className="mx-auto max-w-5xl">
        <PageHeader
          title={po.order_number || `PO #${po.id}`}
          description={`Purchase order from ${share.workspace_name || "Merchant"}`}
          actions={
            <div className="flex items-center gap-2 print:hidden">
              <AppButton
                size="sm"
                variant="secondary"
                startContent={<ChatCircleDots size={16} />}
                label={messages.length > 0 ? `Messages (${messages.length})` : "Messages"}
                onPress={() => setIsChatOpen(true)}
              />
              <AppButton
                size="sm"
                variant="secondary"
                startContent={<Handshake size={16} />}
                label="Claim merchant link"
                isLoading={claiming}
                onPress={handleClaim}
              />
              <AppButton
                size="sm"
                variant="secondary"
                startContent={<Printer size={16} />}
                label="Print / PDF"
                onPress={() => window.print()}
              />
            </div>
          }
        />

        {claimBanner ? <Alert status={claimBanner.status} description={claimBanner.text} /> : null}
        {responseBanner ? <Alert status="success" description={responseBanner} /> : null}

        <div className="grid items-start gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
          {/* Left Column: Details Summary (True height & Sticky at top) */}
          <div className="lg:sticky lg:top-6 self-start space-y-5">
            <DetailCard title="Details">
              <dl>
                <MetaRow label="Order status">
                  <StatusBadge status={po.status} />
                </MetaRow>
                <MetaRow label="Supplier response">
                  <StatusBadge status={share.status === "active" ? "pending" : share.status} />
                </MetaRow>
                <MetaRow label="Order total">
                  <span className="text-[16px] font-bold tabular">{showMoney(po.total_minor)}</span>
                </MetaRow>
                {hasPriceChanges ? (
                  <MetaRow label="Updated quote">
                    <span className="text-[15px] font-bold text-primary tabular">{showMoney(quotedTotalMinor)}</span>
                  </MetaRow>
                ) : null}
                <MetaRow label="Buyer">{share.workspace_name || "Merchant"}</MetaRow>
                <MetaRow label="Supplier">{share.supplier_name || "Supplier"}</MetaRow>
                <MetaRow label="Expected delivery">{po.expected_date ? formatDate(po.expected_date) : "Flexible"}</MetaRow>
                <MetaRow label="Terms">{po.payment_terms || "Standard"}</MetaRow>
                <MetaRow label="Link valid until">{formatDate(share.expires_at)}</MetaRow>
                {po.notes ? <MetaRow label="Notes">{po.notes}</MetaRow> : null}
              </dl>
            </DetailCard>
          </div>

          {/* Right Column: Clean Items List and Dynamic Actions (True height) */}
          <div className="self-start">
            <DetailCard
              title="Items & pricing"
              action={
                hasPriceChanges ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
                    Changes pending submission
                  </span>
                ) : undefined
              }
            >
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[13px]">
                  <thead className="border-b border-separator text-[11px] font-medium text-muted uppercase">
                    <tr>
                      <th className="py-2.5 pr-3">Item</th>
                      <th className="py-2.5 px-3">Qty</th>
                      <th className="py-2.5 px-3">Unit price</th>
                      <th className="py-2.5 pl-3 text-right">Line total</th>
                      {canEditPrices ? <th className="py-2.5 pl-3 text-right print:hidden">Action</th> : null}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-separator">
                    {editableLines.map((line, idx) => {
                      const rowTotal = lineMinorTotal(line.quantity, line.unitCostMajor);
                      const qtyChanged = Number(line.quantity) !== Number(line.originalQty);
                      const priceChanged =
                        toMinor(line.unitCostMajor).toString() !== line.originalUnitCostMinor;
                      const changed = qtyChanged || priceChanged;

                      return (
                        <tr key={line.id} className="group">
                          <td className="py-3 pr-3 font-medium text-foreground">
                            <div>{line.description}</div>
                            {changed ? (
                              <span className="inline-block mt-0.5 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                                Updated
                              </span>
                            ) : null}
                          </td>
                          <td className="py-3 px-3 tabular">
                            <span className="font-semibold text-foreground">{line.quantity}</span>{" "}
                            <span className="text-muted">{line.unitName}</span>
                            {qtyChanged ? (
                              <div className="text-[11px] text-muted line-through">Req: {line.originalQty}</div>
                            ) : null}
                          </td>
                          <td className="py-3 px-3 tabular">
                            <span className="font-semibold text-foreground">
                              {showMoney(toMinor(line.unitCostMajor))}
                            </span>
                            {priceChanged ? (
                              <div className="text-[11px] text-muted line-through">
                                Req: {showMoney(line.originalUnitCostMinor)}
                              </div>
                            ) : null}
                          </td>
                          <td className="py-3 pl-3 text-right font-bold tabular text-foreground">
                            {showMoney(rowTotal)}
                          </td>
                          {canEditPrices ? (
                            <td className="py-3 pl-3 text-right print:hidden">
                              <AppButton
                                size="sm"
                                variant="ghost"
                                startContent={<PencilSimple size={14} />}
                                label="Edit"
                                onPress={() => openEditLine(idx)}
                              />
                            </td>
                          ) : null}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Dynamic Action Buttons */}
              {canEditPrices ? (
                <div className="flex flex-wrap items-center justify-between gap-3 pt-5 border-t border-separator mt-4 print:hidden">
                  <div className="text-[12px] text-muted">
                    {hasPriceChanges ? (
                      <span className="text-primary font-medium">Prices or quantities adjusted. Send changes to buyer for review.</span>
                    ) : share.status === "acknowledged" ? (
                      <span className="text-muted">You can click Edit on any line item to propose changes to the buyer.</span>
                    ) : share.status === "change_requested" ? (
                      <span className="text-muted">Awaiting response from buyer for requested changes.</span>
                    ) : (
                      <span>Click Edit on any line item to adjust available quantity or supplier unit price.</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {hasPriceChanges ? (
                      <>
                        <AppButton
                          startContent={<PaperPlaneTilt size={16} />}
                          label="Send changes"
                          isLoading={submitting}
                          onPress={() => openActionModal("change_requested")}
                        />
                        <AppButton
                          variant="ghost"
                          label="Reset"
                          onPress={handleResetChanges}
                          isDisabled={submitting}
                        />
                        <AppButton
                          variant="ghost"
                          startContent={<XCircle size={16} />}
                          label="Decline"
                          isLoading={submitting}
                          onPress={() => openActionModal("declined")}
                        />
                      </>
                    ) : share.status === "acknowledged" ? (
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-3 py-1 text-[12px] font-semibold text-success">
                          <CheckCircle size={15} weight="duotone" /> Order acknowledged
                        </span>
                        <AppButton
                          variant="ghost"
                          startContent={<XCircle size={16} />}
                          label="Decline"
                          isLoading={submitting}
                          onPress={() => openActionModal("declined")}
                        />
                      </div>
                    ) : share.status === "change_requested" ? (
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-[12px] font-semibold text-primary">
                          <PaperPlaneTilt size={15} /> Change requested
                        </span>
                        <AppButton
                          variant="ghost"
                          startContent={<XCircle size={16} />}
                          label="Decline"
                          isLoading={submitting}
                          onPress={() => openActionModal("declined")}
                        />
                      </div>
                    ) : (
                      <>
                        <AppButton
                          startContent={<CheckCircle size={16} weight="duotone" />}
                          label="Acknowledge order"
                          isLoading={submitting}
                          onPress={() => openActionModal("acknowledged")}
                        />
                        <AppButton
                          variant="ghost"
                          startContent={<XCircle size={16} />}
                          label="Decline"
                          isLoading={submitting}
                          onPress={() => openActionModal("declined")}
                        />
                      </>
                    )}
                  </div>
                </div>
              ) : null}
            </DetailCard>
          </div>
        </div>

        {/* Item Edit Drawer / Bottomsheet */}
        {editingLineIdx !== null && editableLines[editingLineIdx] ? (
          <SideSheet
            isOpen={editingLineIdx !== null}
            onClose={() => setEditingLineIdx(null)}
            title="Edit item price & quantity"
            description={editableLines[editingLineIdx].description}
            footer={
              <div className="flex items-center justify-end gap-2">
                <AppButton variant="ghost" label="Cancel" onPress={() => setEditingLineIdx(null)} />
                <AppButton label="Save item" onPress={handleSaveLine} />
              </div>
            }
          >
            <div className="space-y-4">
              <div className="rounded-xl border border-separator bg-surface-secondary/40 p-3.5 text-[12px] text-muted space-y-1">
                <div className="font-medium text-foreground">Buyer's requested values:</div>
                <div>
                  Requested quantity:{" "}
                  <span className="font-semibold text-foreground">
                    {editableLines[editingLineIdx].originalQty} {editableLines[editingLineIdx].unitName}
                  </span>
                </div>
                <div>
                  Expected unit price:{" "}
                  <span className="font-semibold text-foreground">
                    {showMoney(editableLines[editingLineIdx].originalUnitCostMinor)}
                  </span>
                </div>
              </div>

              <AppInput
                label={`Available quantity (${editableLines[editingLineIdx].unitName})`}
                value={draftQty}
                onChange={(e) => setDraftQty(e.target.value)}
                type="number"
                min="0.0001"
                step="any"
                isRequired
              />

              <MoneyInput
                label="Supplier unit price"
                currency={cur}
                exponent={exp}
                value={draftUnitPrice}
                onValueChange={setDraftUnitPrice}
              />

              <div className="flex items-center justify-between rounded-xl bg-surface-secondary p-3 text-[13px]">
                <span className="text-muted">Calculated subtotal</span>
                <span className="font-bold tabular text-foreground">
                  {showMoney(lineMinorTotal(draftQty, draftUnitPrice))}
                </span>
              </div>
            </div>
          </SideSheet>
        ) : null}

        {/* Action Confirmation Modal (Asks for Note/Reason before submission) */}
        <AppModal
          isOpen={actionModal.isOpen}
          onOpenChange={(open) => !open && setActionModal((prev) => ({ ...prev, isOpen: false }))}
          title={
            actionModal.action === "acknowledged"
              ? "Acknowledge purchase order"
              : actionModal.action === "change_requested"
                ? "Send changes to buyer"
                : "Decline purchase order"
          }
          description={
            actionModal.action === "acknowledged"
              ? "Confirm that you accept this purchase order for fulfillment."
              : actionModal.action === "change_requested"
                ? "Send your updated unit prices or quantities to the buyer for review."
                : "Let the buyer know why this purchase order cannot be fulfilled."
          }
          footer={
            <div className="flex items-center justify-end gap-2">
              <AppButton
                variant="ghost"
                label="Cancel"
                onPress={() => setActionModal((prev) => ({ ...prev, isOpen: false }))}
                isDisabled={submitting}
              />
              <AppButton
                variant={actionModal.action === "declined" ? "ghost" : "primary"}
                className={actionModal.action === "declined" ? "text-danger hover:bg-danger/10" : undefined}
                label={
                  actionModal.action === "acknowledged"
                    ? "Confirm & acknowledge"
                    : actionModal.action === "change_requested"
                      ? "Send changes"
                      : "Decline order"
                }
                isLoading={submitting}
                onPress={() => handleRespond(actionModal.action, modalNote)}
              />
            </div>
          }
        >
          <div className="space-y-3">
            {actionModal.action === "change_requested" && (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-[12px] text-foreground">
                Updated quote total: <span className="font-bold text-primary tabular">{showMoney(quotedTotalMinor)}</span>
              </div>
            )}
            <AppTextarea
              label={
                actionModal.action === "declined"
                  ? "Reason for declining"
                  : actionModal.action === "change_requested"
                    ? "Reason / note for changes"
                    : "Note to buyer (optional)"
              }
              placeholder={
                actionModal.action === "declined"
                  ? "State why this order cannot be accepted..."
                  : actionModal.action === "change_requested"
                    ? "e.g. Current market prices or partial stock availability..."
                    : "e.g. Expected delivery schedule, contact info..."
              }
              value={modalNote}
              onChange={(e) => setModalNote(e.target.value)}
              rows={3}
              isRequired={actionModal.action === "declined"}
            />
          </div>
        </AppModal>

        {/* Chat Drawer / Bottomsheet */}
        <SideSheet
          isOpen={isChatOpen}
          onClose={() => setIsChatOpen(false)}
          title="Messages"
          description={`Conversation with ${share.workspace_name || "Buyer"}`}
        >
          <div className="flex flex-col h-full min-h-[440px] justify-between gap-4">
            <div className="flex-1 overflow-y-auto space-y-3 pr-1 max-h-[50vh]">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center text-muted">
                  <ChatCircleDots size={36} className="mb-2 opacity-50" />
                  <p className="text-[14px] font-medium text-foreground">No messages yet</p>
                  <p className="text-[12px] max-w-[240px] mt-1">Send delivery updates or questions to the buyer.</p>
                </div>
              ) : (
                messages.map((m) => {
                  const isMe = m.sender_name.toLowerCase() === senderName.trim().toLowerCase();
                  return (
                    <div
                      key={m.id}
                      className={`flex flex-col max-w-[85%] rounded-2xl p-3 text-[13px] ${
                        isMe
                          ? "ml-auto bg-primary text-white rounded-br-xs"
                          : "mr-auto bg-surface-secondary border border-separator text-foreground rounded-bl-xs"
                      }`}
                    >
                      <div
                        className={`flex items-center justify-between gap-2 text-[11px] mb-1 ${
                          isMe ? "text-white/80" : "text-muted"
                        }`}
                      >
                        <span className="font-semibold">{m.sender_name}</span>
                        <span>{formatDate(m.created_at)}</span>
                      </div>
                      <p className="whitespace-pre-wrap leading-relaxed">{m.message}</p>
                    </div>
                  );
                })
              )}
            </div>

            <form onSubmit={handleSendMessage} className="space-y-2.5 pt-3 border-t border-separator">
              <AppInput
                label="Your name"
                placeholder="Supplier / contact name"
                value={senderName}
                onChange={(e) => setSenderName(e.target.value)}
                isRequired
              />
              <AppTextarea
                label="Message"
                placeholder="Type a message to the buyer..."
                value={msgText}
                onChange={(e) => setMsgText(e.target.value)}
                rows={2}
                isRequired
              />
              <div className="flex justify-end pt-1">
                <AppButton
                  type="submit"
                  startContent={<PaperPlaneTilt size={15} />}
                  label="Send message"
                  isLoading={sendingMsg}
                />
              </div>
            </form>
          </div>
        </SideSheet>
      </Page>
    </div>
  );
}
