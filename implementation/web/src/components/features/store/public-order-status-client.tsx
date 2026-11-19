"use client";

import { CheckCircle, Copy, Clock, ShoppingBag, Warning, Receipt, Package, Truck, CreditCard, Phone, EnvelopeSimple, MapPin } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";

import { AppButton } from "@/components/ui/app-button";
import { DocumentChat } from "@/components/features/finance/document-chat";
import { OrderReasonModal } from "./order-reason-modal";
import { toast } from "@heroui/react";
import type { ExternalMessage } from "@/types/finance";
import { StatusPill } from "@/components/ui/page";
import { DocumentActions, DocumentShell, StatusTimeline, ItemsTable } from "@/components/features/finance/document-page";
import { CardFrame, CardHeader, KpiCard, SummaryRowsCard } from "@/components/ui/cards";
import { orderLabel, orderProgress } from "@/lib/store-order-display";
import { formatDate } from "@/lib/format";
import { financeApi, formatMinorAmount } from "@/lib/money";

function formatCountdown(targetIso?: string | null, nowMs = Date.now()): { text: string; expired: boolean } | null {
  if (!targetIso) return null;
  const target = new Date(targetIso).getTime();
  if (!Number.isFinite(target)) return null;
  const diffSec = Math.floor((target - nowMs) / 1000);
  if (diffSec <= 0) return { text: "00:00", expired: true };
  const hours = Math.floor(diffSec / 3600);
  const mins = Math.floor((diffSec % 3600) / 60);
  const secs = diffSec % 60;
  if (hours > 0) {
    return { text: `${hours}h ${String(mins).padStart(2, "0")}m`, expired: false };
  }
  return { text: `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`, expired: false };
}

export function PublicOrderStatusClient({ token }: { token: string }) {
  const qc = useQueryClient();
  const [action, setAction] = useState<"cancel" | "return" | null>(null);
  const [actionError, setActionError] = useState("");
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [copiedField, setCopiedField] = useState<string>("");

  const orderQuery = useQuery({
    queryKey: ["public-order-status", token],
    queryFn: () => financeApi.getPublicOrderStatus(token),
    refetchInterval: (q) => {
      const ord = q.state.data;
      if (ord && ord.payment_status === "unpaid" && (ord.latest_payment_attempt?.method === "virtual_account" || ord.latest_payment_attempt?.method === "card")) {
        return 5_000;
      }
      return 30_000;
    },
  });

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["public-order-status", token] });

  const verifyMutation = useMutation({
    mutationFn: () => financeApi.verifyPublicOrderPayment(token),
    onSuccess: (updated) => {
      setActionError("");
      if (updated.payment_status === "paid" || updated.payment_status === "paid_needs_attention") {
        toast.success("Payment received!");
      } else {
        toast.info("Transfer not yet confirmed. We'll keep checking automatically.");
      }
      void invalidate();
    },
    onError: (err: Error) => setActionError(err.message),
  });

  const copyValue = async (label: string, val: string) => {
    try {
      await navigator.clipboard.writeText(val);
      setCopiedField(label);
      toast.success(`${label} copied`);
      setTimeout(() => setCopiedField(""), 2000);
    } catch {
      toast.danger(`Could not copy ${label.toLowerCase()}`);
    }
  };

  const ackMutation = useMutation({
    mutationFn: (expectedVersion: number) => financeApi.acknowledgePublicOrderChanges(token, expectedVersion),
    onSuccess: () => {
      setActionError("");
      void invalidate();
    },
    onError: (err: Error) => setActionError(err.message),
  });

  const cancelMutation = useMutation({
    mutationFn: (reason: string) => financeApi.cancelPublicOrder(token, reason),
    onSuccess: () => {
      toast.success("Order request cancelled");
      setActionError("");
      void invalidate();
    },
    onError: (err: Error) => setActionError(err.message),
  });

  const returnMutation = useMutation({
    mutationFn: (reason: string) => financeApi.requestPublicOrderReturn(token, reason),
    onSuccess: () => {
      toast.success("Return request sent");
      setActionError("");
      void invalidate();
    },
    onError: (err: Error) => setActionError(err.message),
  });

  if (orderQuery.isPending) {
    return <main className="min-h-screen flex items-center justify-center p-8 text-sm text-muted">Loading order status…</main>;
  }

  if (orderQuery.isError || !orderQuery.data) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-8 text-center space-y-2">
        <ShoppingBag size={32} className="text-muted" />
        <h1 className="text-lg font-bold">Order status link invalid or unavailable</h1>
      </main>
    );
  }

  const order = orderQuery.data;
  const canCancelBeforeConfirm = ["request_received", "needs_review", "quote_changes_requested"].includes(order.commercial_status);
  const holdCountdown = order.payment_status === "unpaid" ? formatCountdown(order.hold_expires_at, nowMs) : null;
  const va = order.latest_payment_attempt?.method === "virtual_account" ? order.latest_payment_attempt : null;

  const loadMessages = async (): Promise<ExternalMessage[]> => {
    const fresh = await financeApi.getPublicOrderStatus(token);
    return fresh.events.map((event, index) => ({ id: index + 1, document_type: 'storefront_order', document_id: 0, sender_type: event.actor_type === 'customer' ? 'guest' : 'team', sender_name: event.actor_type === 'customer' ? 'You' : order.storefront_name, message: event.message || orderLabel(event.event_type), created_at: event.created_at }));
  };
  const money = (minor: string) => formatMinorAmount(minor, order.currency, order.currency_exponent);
  const feeMinorNum = Number(order.processing_fee_minor ?? 0);
  const summaryRows = [
    { icon: Package, label: 'Subtotal', value: money(order.subtotal_minor) },
    { icon: Truck, label: 'Delivery', value: order.delivery_fee_minor === '0' ? 'Free' : money(order.delivery_fee_minor) },
    ...(feeMinorNum > 0 ? [{ icon: CreditCard, label: 'Processing fee', value: money(String(feeMinorNum)) }] : []),
    { icon: CreditCard, label: 'Payment', value: orderLabel(order.payment_status) },
  ];

  return <main className="min-h-screen bg-background px-4 py-8 sm:px-8"><div className="mx-auto max-w-7xl">
    <DocumentShell stickyColumns actions={<DocumentActions primary={<DocumentChat docType="storefront_order" docId={token} partyName={order.storefront_name} isGuest label="Messages" fetchMessages={loadMessages} sendMessage={async (message) => { await financeApi.postPublicOrderMessage(token, message); await invalidate(); }} />} more={[
      canCancelBeforeConfirm && { key: "cancel", label: "Cancel order request", danger: true, onClick: () => setAction("cancel") },
      ["fulfilled", "partially_fulfilled"].includes(order.fulfilment_status) && { key: "return", label: "Request a return", onClick: () => setAction("return") },
    ]} />} back={{ href: '/s/' + order.storefront_slug + '/shop', label: order.storefront_name }} title={order.order_reference} subtitle={'Placed ' + formatDate(order.created_at)} status={<StatusPill tone={['confirmed', 'completed'].includes(order.commercial_status) ? 'success' : order.commercial_status === 'cancelled' ? 'danger' : 'neutral'}>{orderLabel(order.commercial_status)}</StatusPill>}
      kpis={<><KpiCard tone="accent" icon={Receipt} label="Order total" value={money(order.total_minor)} hint="Including delivery" /><KpiCard icon={Package} label="Items" value={String(order.lines.length)} hint="Products in your order" /><KpiCard icon={Truck} label="Delivery" value={orderLabel(order.fulfilment_status)} hint={orderLabel(order.delivery_method)} /><KpiCard icon={CreditCard} label="Payment" value={orderLabel(order.payment_status)} hint={order.payment_arrangement ? orderLabel(order.payment_arrangement) : 'Contact the store'} /></>}
      banner={<>
        {holdCountdown ? (
          <div className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4 ${holdCountdown.expired ? 'border-danger/30 bg-danger/10 text-danger' : 'border-warning/40 bg-warning/10'}`}>
            <div className="flex items-center gap-2.5 text-sm font-medium">
              <Clock size={20} className="shrink-0" />
              <span>{holdCountdown.expired ? "Your stock hold time has expired. Refresh or place a new order." : `We're holding your items for ${holdCountdown.text}`}</span>
            </div>
          </div>
        ) : null}
        {order.payment_status === "paid" ? (
          <div className="flex items-center gap-2.5 rounded-2xl border border-success/30 bg-success/10 p-4 text-sm font-medium text-success">
            <CheckCircle size={20} weight="fill" className="shrink-0" />
            <span>Payment received. Your order is confirmed.</span>
          </div>
        ) : null}
        {order.payment_status === "paid_needs_attention" ? (
          <div className="flex items-center gap-2.5 rounded-2xl border border-warning bg-warning/10 p-4 text-sm font-medium">
            <Warning size={20} className="shrink-0" />
            <span>We received your payment after your hold expired. The merchant is checking stock and will contact you shortly.</span>
          </div>
        ) : null}
        {order.requires_customer_ack ? <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-warning bg-warning/10 p-5"><div className="min-w-0 flex-1"><h2 className="flex items-center gap-2 font-semibold"><Warning size={20} />Please review your updated order</h2><p className="mt-2 text-sm">{order.latest_change_summary || 'The store has updated your order details.'}</p></div><AppButton label="Accept updated details" isLoading={ackMutation.isPending} startContent={<CheckCircle />} onPress={() => ackMutation.mutate(order.version)} /></div> : null}
        {actionError ? <p role="alert" className="text-sm text-danger">{actionError}</p> : null}
      </>}
      aside={<>
        <SummaryRowsCard tone="ink" title="Your order" leading={<Receipt size={21} />} headline={{ label: 'Order total', value: money(order.total_minor) }} rows={summaryRows} />
        <StatusTimeline title="Order progress" steps={orderProgress(order)} />
        <SummaryRowsCard title={order.storefront_name} subtitle="Contact & delivery" rows={[{ icon: Phone, label: 'Phone', value: order.merchant_phone ? <a href={'tel:' + order.merchant_phone}>{order.merchant_phone}</a> : 'Not provided' }, { icon: EnvelopeSimple, label: 'Email', value: <span className="block max-w-48 break-all text-right">{order.merchant_email || 'Not provided'}</span> }, { icon: Truck, label: 'Method', value: orderLabel(order.delivery_method) }, { icon: MapPin, label: 'Address', value: <span className="block max-w-48 whitespace-normal text-right">{order.pickup_point ? `${order.pickup_point.name}${order.pickup_point.address ? ' · ' + order.pickup_point.address : ''}` : (order.delivery_address || 'Arrange with the store')}</span> }]} />
        {order.linked_invoice_share_token ? <Link href={'/public/invoices/' + order.linked_invoice_share_token} className="block rounded-full border border-border bg-surface px-5 py-3 text-center text-sm font-medium">View invoice</Link> : null}

      </>}>
      {order.payment_status === "unpaid" && va && va.virtual_account_number ? (
        <CardFrame>
          <CardHeader title="Pay by bank transfer" icon={CreditCard} />
          <p className="mt-1 text-xs text-muted">Checking automatically every 5 seconds</p>
          <div className="mt-4 space-y-4">
            <div className="rounded-xl border border-border bg-surface-raised p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs text-muted">Bank name</p>
                  <p className="font-semibold">{va.bank_name || "Transfer bank"}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted">Exact amount</p>
                  <div className="flex items-center gap-1.5">
                    <p className="font-bold tabular-nums">{money(order.total_minor)}</p>
                    <AppButton size="sm" variant="ghost" isIconOnly aria-label="Copy amount" startContent={<Copy size={14} />} onPress={() => void copyValue("Amount", String(Number(order.total_minor) / 10 ** order.currency_exponent))} />
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-lg bg-surface p-3 border border-border">
                <div className="min-w-0">
                  <p className="text-xs text-muted">Account number</p>
                  <p className="text-2xl font-bold tracking-wider tabular-nums">{va.virtual_account_number}</p>
                </div>
                <AppButton size="sm" variant="secondary" startContent={<Copy size={14} />} label={copiedField === "Account number" ? "Copied" : "Copy"} onPress={() => void copyValue("Account number", va.virtual_account_number!)} />
              </div>
              <p className="text-xs text-muted">Transfer the exact amount above from your banking app. Your order confirms automatically once the transfer arrives.</p>
            </div>
            <AppButton variant="primary" className="w-full sm:w-auto" label="I've sent the money" isLoading={verifyMutation.isPending} onPress={() => verifyMutation.mutate()} />
          </div>
        </CardFrame>
      ) : null}

      {order.payment_status === "unpaid" && order.payment_arrangement === "manual_transfer" ? (
        <CardFrame>
          <CardHeader title="Manual bank transfer" icon={CreditCard} />
          <p className="mt-1 text-xs text-muted">Transfer to the store&apos;s bank account and share reference in messages</p>
          {order.manual_bank_details ? (
            <div className="mt-4 rounded-xl border border-border bg-surface-raised p-4 space-y-2 text-sm">
              <div className="flex justify-between gap-2"><span className="text-muted">Bank</span><strong className="text-right">{order.manual_bank_details.bank_name}</strong></div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted">Account number</span>
                <div className="flex items-center gap-1.5"><strong className="font-mono text-base">{order.manual_bank_details.account_number}</strong><AppButton size="sm" variant="ghost" isIconOnly aria-label="Copy account number" startContent={<Copy size={14} />} onPress={() => void copyValue("Account number", order.manual_bank_details!.account_number)} /></div>
              </div>
              <div className="flex justify-between gap-2"><span className="text-muted">Account name</span><strong className="text-right">{order.manual_bank_details.account_name}</strong></div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted">Contact {order.storefront_name} via messages for bank account transfer instructions.</p>
          )}
        </CardFrame>
      ) : null}

      {order.delivery_method === "pickup" && order.pickup_code ? (
        <CardFrame>
          <CardHeader title="Your pickup code" icon={Package} />
          <p className="mt-1 text-xs text-muted">{order.pickup_point ? order.pickup_point.name : "Show this code when collecting your order"}</p>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-surface-raised p-4">
            <div>
              <p className="text-xs text-muted uppercase tracking-wider">6-character pickup code</p>
              <p className="mt-1 font-mono text-3xl font-bold tracking-[0.25em]">{order.pickup_code}</p>
              {order.pickup_point?.address ? <p className="mt-2 text-xs text-muted">{order.pickup_point.address}</p> : null}
              {order.pickup_point?.pickup_note ? <p className="mt-1 text-xs text-muted">{order.pickup_point.pickup_note}</p> : null}
            </div>
            <AppButton size="sm" variant="secondary" startContent={<Copy size={14} />} label={copiedField === "Pickup code" ? "Copied" : "Copy code"} onPress={() => void copyValue("Pickup code", order.pickup_code!)} />
          </div>
        </CardFrame>
      ) : null}

      {order.courier_name || order.courier_tracking_number ? (
        <CardFrame>
          <CardHeader title="Courier delivery" icon={Truck} />
          <p className="mt-1 text-xs text-muted">{order.courier_name || "Assigned courier"}</p>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface-raised p-4 text-sm">
            <div>
              {order.courier_status ? <p className="text-xs text-muted">Status: <strong className="capitalize text-foreground">{order.courier_status.replaceAll("_", " ")}</strong></p> : null}
              {order.courier_tracking_number ? <p className="mt-1 font-mono font-semibold">{order.courier_tracking_number}</p> : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {order.courier_tracking_number ? <AppButton size="sm" variant="secondary" startContent={<Copy size={14} />} label="Copy tracking" onPress={() => void copyValue("Tracking number", order.courier_tracking_number!)} /> : null}
              {order.courier_tracking_url ? <a href={order.courier_tracking_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-white">Live track</a> : null}
            </div>
          </div>
        </CardFrame>
      ) : null}

      <CardFrame><CardHeader title="Your items" icon={Package} /><div className="mt-4"><ItemsTable rows={order.lines.map((line, index) => ({ ...line, row_id: index }))} rowKey={(line) => line.row_id} columns={[{ key: 'item', label: 'Item', render: (line) => <div><p className="font-medium">{line.title}</p>{line.variant_name ? <p className="mt-1 text-xs text-muted">{line.variant_name}</p> : null}</div> }, { key: 'quantity', label: 'Requested', align: 'right', render: (line) => Number(line.requested_quantity) }, { key: 'confirmed', label: 'Confirmed', align: 'right', render: (line) => Number(line.confirmed_quantity) }, { key: 'delivered', label: 'Delivered', align: 'right', render: (line) => Number(line.fulfilled_quantity) }, { key: 'total', label: 'Total', align: 'right', render: (line) => money(line.line_total_minor) }]} card={(line) => ({ title: line.title, sub: 'Requested ' + Number(line.requested_quantity) + ' · Delivered ' + Number(line.fulfilled_quantity), amount: money(line.line_total_minor) })} total={{ label: 'Order total', amount: money(order.total_minor) }} /></div></CardFrame>
      {order.decline_or_cancel_reason ? <CardFrame><CardHeader title="Order update" icon={Receipt} /><p className="mt-3 text-sm text-muted">{order.decline_or_cancel_reason}</p></CardFrame> : null}
    </DocumentShell>
    {action ? <OrderReasonModal key={action} title={action === "cancel" ? "Cancel order request" : "Request a return"} confirmLabel={action === "cancel" ? "Cancel request" : "Send return request"} danger={action === "cancel"} required={action === "return"} onClose={() => setAction(null)} onSubmit={async (reason) => { if (action === "cancel") await cancelMutation.mutateAsync(reason); else await returnMutation.mutateAsync(reason); }} /> : null}
  </div></main>;
}
