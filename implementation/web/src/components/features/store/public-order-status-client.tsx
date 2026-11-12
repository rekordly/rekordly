"use client";

import { CheckCircle, PaperPlaneTilt, ShoppingBag, Trash, Warning } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { AppButton } from "@/components/ui/app-button";
import { AppInput } from "@/components/ui/app-input";
import { StatusPill } from "@/components/ui/page";
import { formatDate } from "@/lib/format";
import { financeApi, formatMinorAmount } from "@/lib/money";

export function PublicOrderStatusClient({ token }: { token: string }) {
  const qc = useQueryClient();
  const [message, setMessage] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [returnReason, setReturnReason] = useState("");
  const [actionError, setActionError] = useState("");

  const orderQuery = useQuery({
    queryKey: ["public-order-status", token],
    queryFn: () => financeApi.getPublicOrderStatus(token),
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

  const msgMutation = useMutation({
    mutationFn: (msg: string) => financeApi.postPublicOrderMessage(token, msg),
    onSuccess: () => {
      setMessage("");
      setActionError("");
      void invalidate();
    },
    onError: (err: Error) => setActionError(err.message),
  });

  const cancelMutation = useMutation({
    mutationFn: (reason: string) => financeApi.cancelPublicOrder(token, reason),
    onSuccess: () => {
      setCancelReason("");
      setActionError("");
      void invalidate();
    },
    onError: (err: Error) => setActionError(err.message),
  });

  const returnMutation = useMutation({
    mutationFn: (reason: string) => financeApi.requestPublicOrderReturn(token, reason),
    onSuccess: () => {
      setReturnReason("");
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

  return (
    <main className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="rounded-2xl border border-default bg-surface p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs text-muted">{order.storefront_name}</p>
              <h1 className="text-xl font-bold text-foreground">{order.order_reference}</h1>
            </div>
            <Link href={`/s/${order.storefront_slug}`} className="text-xs font-medium text-primary underline">
              Back to storefront
            </Link>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusPill tone={order.commercial_status === "confirmed" || order.commercial_status === "completed" ? "success" : "neutral"}>
              Order: {order.commercial_status}
            </StatusPill>
            <StatusPill tone="neutral">Fulfilment: {order.fulfilment_status}</StatusPill>
            <StatusPill tone="neutral">Payment: {order.payment_status}</StatusPill>
          </div>
          {order.payment_arrangement ? <p className="text-xs text-foreground">Payment arrangement: {order.payment_arrangement}</p> : null}
          {order.linked_invoice_share_token ? (
            <Link href={`/public/invoices/${order.linked_invoice_share_token}`} className="inline-block text-xs font-semibold text-primary underline">
              View shared invoice
            </Link>
          ) : null}
        </div>

        {order.requires_customer_ack ? (
          <div className="rounded-2xl border border-warning bg-warning/10 p-4 space-y-3">
            <div className="flex items-start gap-2 text-sm font-semibold text-foreground">
              <Warning size={18} className="shrink-0 mt-0.5" />
              <span>Merchant updated your order terms (v{order.version})</span>
            </div>
            {order.latest_change_summary ? <p className="text-xs text-foreground">{order.latest_change_summary}</p> : null}
            <AppButton
              size="sm"
              variant="primary"
              startContent={<CheckCircle weight="duotone" />}
              label="Acknowledge updated terms"
              isLoading={ackMutation.isPending}
              onPress={() => ackMutation.mutate(order.version)}
            />
          </div>
        ) : null}

        {actionError ? <p className="text-xs font-medium text-danger">{actionError}</p> : null}

        <div className="rounded-2xl border border-default bg-surface p-5 space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Items</h2>
          {order.lines.map((l, idx) => (
            <div key={idx} className="flex justify-between gap-3 text-xs border-b border-default pb-2 last:border-0">
              <div>
                <p className="font-semibold text-foreground">{l.title}</p>
                <p className="text-muted">Confirmed: {l.confirmed_quantity} {l.unit_name} · Fulfilled: {l.fulfilled_quantity}</p>
              </div>
              <span className="tabular font-semibold">{formatMinorAmount(l.line_total_minor, order.currency, order.currency_exponent)}</span>
            </div>
          ))}
          <div className="flex justify-between text-xs pt-1">
            <span className="text-muted">Delivery ({order.delivery_method})</span>
            <span className="tabular">{formatMinorAmount(order.delivery_fee_minor, order.currency, order.currency_exponent)}</span>
          </div>
          <div className="flex justify-between text-sm font-bold">
            <span>Total</span>
            <span className="tabular">{formatMinorAmount(order.total_minor, order.currency, order.currency_exponent)}</span>
          </div>
        </div>

        <div className="rounded-2xl border border-default bg-surface p-5 space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Messages & Updates</h2>
          <div className="space-y-2 text-xs">
            {order.events.map((ev, i) => (
              <div key={i} className="flex justify-between gap-2 border-b border-default pb-1.5 last:border-0">
                <span><strong>{ev.actor_type}:</strong> {ev.message || ev.event_type}</span>
                <span className="text-muted shrink-0">{formatDate(ev.created_at)}</span>
              </div>
            ))}
          </div>
          <form
            className="flex gap-2 pt-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (message.trim()) msgMutation.mutate(message.trim());
            }}
          >
            <AppInput placeholder="Ask the merchant a question…" value={message} onChange={(e) => setMessage(e.target.value)} />
            <AppButton type="submit" size="sm" variant="secondary" startContent={<PaperPlaneTilt />} label="Send" isLoading={msgMutation.isPending} />
          </form>
        </div>

        {canCancelBeforeConfirm ? (
          <div className="rounded-2xl border border-default bg-surface p-4 flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[200px]">
              <AppInput label="Cancel order request" placeholder="Optional reason" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
            </div>
            <AppButton size="sm" variant="tertiary" startContent={<Trash />} label="Cancel request" isLoading={cancelMutation.isPending} onPress={() => cancelMutation.mutate(cancelReason)} />
          </div>
        ) : null}

        {["fulfilled", "partially_fulfilled"].includes(order.fulfilment_status) ? (
          <div className="rounded-2xl border border-default bg-surface p-4 flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[200px]">
              <AppInput label="Request a return" placeholder="Reason for return (damaged, wrong item, etc.)" value={returnReason} onChange={(e) => setReturnReason(e.target.value)} />
            </div>
            <AppButton size="sm" variant="secondary" label="Request return" isLoading={returnMutation.isPending} onPress={() => returnMutation.mutate(returnReason)} />
          </div>
        ) : null}
      </div>
    </main>
  );
}
