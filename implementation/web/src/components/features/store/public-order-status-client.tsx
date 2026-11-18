"use client";

import { CheckCircle, ShoppingBag, Warning, Receipt, Package, Truck, CreditCard, Phone, EnvelopeSimple, MapPin } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

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

export function PublicOrderStatusClient({ token }: { token: string }) {
  const qc = useQueryClient();
  const [action, setAction] = useState<"cancel" | "return" | null>(null);
  const [actionError, setActionError] = useState("");

  const orderQuery = useQuery({
    queryKey: ["public-order-status", token],
    queryFn: () => financeApi.getPublicOrderStatus(token),
    refetchInterval: 30_000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["public-order-status", token] });

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

  const loadMessages = async (): Promise<ExternalMessage[]> => {
    const fresh = await financeApi.getPublicOrderStatus(token);
    return fresh.events.map((event, index) => ({ id: index + 1, document_type: 'storefront_order', document_id: 0, sender_type: event.actor_type === 'customer' ? 'guest' : 'team', sender_name: event.actor_type === 'customer' ? 'You' : order.storefront_name, message: event.message || orderLabel(event.event_type), created_at: event.created_at }));
  };
  const money = (minor: string) => formatMinorAmount(minor, order.currency, order.currency_exponent);
  return <main className="min-h-screen bg-background px-4 py-8 sm:px-8"><div className="mx-auto max-w-7xl">
    <DocumentShell stickyColumns actions={<DocumentActions primary={<DocumentChat docType="storefront_order" docId={token} partyName={order.storefront_name} isGuest label="Messages" fetchMessages={loadMessages} sendMessage={async (message) => { await financeApi.postPublicOrderMessage(token, message); await invalidate(); }} />} more={[
      canCancelBeforeConfirm && { key: "cancel", label: "Cancel order request", danger: true, onClick: () => setAction("cancel") },
      ["fulfilled", "partially_fulfilled"].includes(order.fulfilment_status) && { key: "return", label: "Request a return", onClick: () => setAction("return") },
    ]} />} back={{ href: '/s/' + order.storefront_slug + '/shop', label: order.storefront_name }} title={order.order_reference} subtitle={'Placed ' + formatDate(order.created_at)} status={<StatusPill tone={['confirmed', 'completed'].includes(order.commercial_status) ? 'success' : 'neutral'}>{orderLabel(order.commercial_status)}</StatusPill>}
      kpis={<><KpiCard tone="accent" icon={Receipt} label="Order total" value={money(order.total_minor)} hint="Including delivery" /><KpiCard icon={Package} label="Items" value={String(order.lines.length)} hint="Products in your order" /><KpiCard icon={Truck} label="Delivery" value={orderLabel(order.fulfilment_status)} hint={orderLabel(order.delivery_method)} /><KpiCard icon={CreditCard} label="Payment" value={orderLabel(order.payment_status)} hint={order.payment_arrangement || 'Contact the store for payment details'} /></>}
      banner={<>{order.requires_customer_ack ? <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-warning bg-warning/10 p-5"><div className="min-w-0 flex-1"><h2 className="flex items-center gap-2 font-semibold"><Warning size={20} />Please review your updated order</h2><p className="mt-2 text-sm">{order.latest_change_summary || 'The store has updated your order details.'}</p></div><AppButton label="Accept updated details" isLoading={ackMutation.isPending} startContent={<CheckCircle />} onPress={() => ackMutation.mutate(order.version)} /></div> : null}{actionError ? <p role="alert" className="text-sm text-danger">{actionError}</p> : null}</>}
      aside={<>
        <SummaryRowsCard tone="ink" title="Your order" leading={<Receipt size={21} />} headline={{ label: 'Estimated order total', value: money(order.total_minor) }} rows={[{ icon: Package, label: 'Subtotal', value: money(order.subtotal_minor) }, { icon: Truck, label: 'Delivery', value: money(order.delivery_fee_minor) }, { icon: CreditCard, label: 'Payment', value: orderLabel(order.payment_status) }]} />
        <StatusTimeline title="Order progress" steps={orderProgress(order)} />
        <SummaryRowsCard title={order.storefront_name} subtitle="Contact & delivery" rows={[{ icon: Phone, label: 'Phone', value: order.merchant_phone ? <a href={'tel:' + order.merchant_phone}>{order.merchant_phone}</a> : 'Not provided' }, { icon: EnvelopeSimple, label: 'Email', value: <span className="block max-w-48 break-all text-right">{order.merchant_email || 'Not provided'}</span> }, { icon: Truck, label: 'Method', value: orderLabel(order.delivery_method) }, { icon: MapPin, label: 'Address', value: <span className="block max-w-48 whitespace-normal text-right">{order.delivery_address || 'Arrange with the store'}</span> }]} />
        {order.linked_invoice_share_token ? <Link href={'/public/invoices/' + order.linked_invoice_share_token} className="block rounded-full border border-border bg-surface px-5 py-3 text-center text-sm font-medium">View invoice</Link> : null}

      </>}>
      <CardFrame><CardHeader title="Your items" icon={Package} /><div className="mt-4"><ItemsTable rows={order.lines.map((line, index) => ({ ...line, row_id: index }))} rowKey={(line) => line.row_id} columns={[{ key: 'item', label: 'Item', render: (line) => <div><p className="font-medium">{line.title}</p>{line.variant_name ? <p className="mt-1 text-xs text-muted">{line.variant_name}</p> : null}</div> }, { key: 'quantity', label: 'Requested', align: 'right', render: (line) => Number(line.requested_quantity) }, { key: 'confirmed', label: 'Confirmed', align: 'right', render: (line) => Number(line.confirmed_quantity) }, { key: 'delivered', label: 'Delivered', align: 'right', render: (line) => Number(line.fulfilled_quantity) }, { key: 'total', label: 'Total', align: 'right', render: (line) => money(line.line_total_minor) }]} card={(line) => ({ title: line.title, sub: 'Requested ' + Number(line.requested_quantity) + ' · Delivered ' + Number(line.fulfilled_quantity), amount: money(line.line_total_minor) })} total={{ label: 'Order total', amount: money(order.total_minor) }} /></div></CardFrame>
      {order.decline_or_cancel_reason ? <CardFrame><CardHeader title="Order update" icon={Receipt} /><p className="mt-3 text-sm text-muted">{order.decline_or_cancel_reason}</p></CardFrame> : null}
    </DocumentShell>
    {action ? <OrderReasonModal key={action} title={action === "cancel" ? "Cancel order request" : "Request a return"} confirmLabel={action === "cancel" ? "Cancel request" : "Send return request"} danger={action === "cancel"} required={action === "return"} onClose={() => setAction(null)} onSubmit={async (reason) => { if (action === "cancel") await cancelMutation.mutateAsync(reason); else await returnMutation.mutateAsync(reason); }} /> : null}
  </div></main>;
}
