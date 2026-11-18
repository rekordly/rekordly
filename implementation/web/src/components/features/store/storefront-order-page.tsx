"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { CheckCircle, Package, CreditCard, CurrencyDollar, Truck, User, Phone, EnvelopeSimple, MapPin, ChatCircleDots, Receipt } from "@phosphor-icons/react";
import { AppButton } from "@/components/ui/app-button";
import { AppInput } from "@/components/ui/app-input";
import { DocumentChat } from "@/components/features/finance/document-chat";
import { DocumentActions, DocumentShell, ItemsTable, StatusTimeline } from "@/components/features/finance/document-page";
import { KpiCard, SummaryRowsCard, CardFrame, CardHeader } from "@/components/ui/cards";
import { orderLabel, orderProgress } from "@/lib/store-order-display";
import { formatDate } from "@/lib/format";
import { financeApi, formatMinorAmount, moneyKeys } from "@/lib/money";
import { WorkspaceGate, StatusBadge, useFinanceAction, type WorkspaceInfo } from "../finance/shared";
import { hasWorkspacePermission, useActiveWorkspace } from "@/stores/workspace-store";
import type { ExternalMessage } from "@/types/finance";
import { useState } from "react";

function OrderContent({ workspaceId, id }: WorkspaceInfo & { id: number }) {
  const router = useRouter();
  const active = useActiveWorkspace();
  const canConfirm = hasWorkspacePermission(active, ["orders.confirm"]);
  const canFulfil = hasWorkspacePermission(active, ["orders.fulfil"]);
  const canCancel = hasWorkspacePermission(active, ["orders.cancel", "orders.review"]);
  const query = useQuery({ queryKey: [...moneyKeys.workspace(workspaceId), "storefront-order", id], queryFn: () => financeApi.getMerchantOrder(workspaceId, id) });
  const outlets = useQuery({ queryKey: [...moneyKeys.workspace(workspaceId), "outlets"], queryFn: () => financeApi.listOutlets(workspaceId) });
  const [reason, setReason] = useState("");
  const order = query.data;
  const after = () => void query.refetch();
  const confirm = useFinanceAction(workspaceId, (body: unknown, key: string) => financeApi.confirmStorefrontOrder(workspaceId, id, body, key), { success: "Order confirmed and stock reserved", onDone: after });
  const fulfil = useFinanceAction(workspaceId, (body: unknown) => financeApi.fulfilStorefrontOrder(workspaceId, id, body), { success: "Order marked delivered", onDone: after });
  const pack = useFinanceAction(workspaceId, (body: { expected_version: number }) => financeApi.packStorefrontOrder(workspaceId, id, body), { success: "Order marked packed", onDone: after });
  const cancel = useFinanceAction(workspaceId, (action: { kind: "cancel" | "decline"; reason: string }) => action.kind === "cancel" ? financeApi.cancelStorefrontOrder(workspaceId, id, action.reason) : financeApi.declineStorefrontOrder(workspaceId, id, action.reason), { success: "Order updated", onDone: after });
  const change = useFinanceAction(workspaceId, (body: unknown) => financeApi.requestOrderChange(workspaceId, id, body), { success: "Revision sent for review", onDone: after });
  const recordReturn = useFinanceAction(workspaceId, (body: {reason:string}) => financeApi.returnStorefrontOrder(workspaceId, id, body), { success: "Return recorded and stock restored", onDone: after });
  const linkCustomer = useFinanceAction(workspaceId, (customerId?: number) => financeApi.linkOrderCustomer(workspaceId, id, customerId), { success: "Customer linked", onDone: after });
  const invoice = useFinanceAction(workspaceId, (proforma: boolean) => financeApi.convertOrderToInvoice(workspaceId, id, proforma), { success: "Sales document created", onDone: after });
  if (!order) return <DocumentShell back={{href:"/store/orders",label:"Orders"}} title={query.isError ? "Order unavailable" : "Loading order…"} aside={<div />}><p className="text-sm text-muted">{query.isError ? "This order could not be loaded." : "Loading order details…"}</p></DocumentShell>;
  const status = order.commercial_status;
  const steps = orderProgress(order);
  const money = (minor: string) => formatMinorAmount(minor, order.currency, order.currency_exponent);
  const primary = canConfirm && ["request_received", "needs_review"].includes(status)
    ? <AppButton startContent={<CheckCircle />} label="Confirm order" isLoading={confirm.isPending} onPress={() => confirm.mutate({ expected_version: order.version, outlet_id: order.outlet_id ?? outlets.data?.find((outlet) => outlet.is_default)?.id ?? outlets.data?.[0]?.id ?? 0, payment_arrangement: order.payment_arrangement ?? "" })} />
    : canFulfil && status === "confirmed" && order.fulfilment_status === "reserved"
      ? <AppButton startContent={<Package />} label="Mark packed" isLoading={pack.isPending} onPress={() => pack.mutate({ expected_version: order.version })} />
      : canFulfil && status === "confirmed" && ["packed", "partially_fulfilled"].includes(order.fulfilment_status)
      ? <AppButton startContent={<Package />} label="Mark delivered" isLoading={fulfil.isPending} onPress={() => fulfil.mutate({ expected_version: order.version, recipient_name: order.customer_name, lines: (order.lines ?? []).map((line) => ({ order_line_id: line.id, quantity: String(Math.max(0, Number(line.confirmed_quantity) - Number(line.fulfilled_quantity))) })).filter((line) => Number(line.quantity) > 0) })} />
      : undefined;
  const loadMessages = async (): Promise<ExternalMessage[]> => {
    const fresh = await financeApi.getMerchantOrder(workspaceId, id);
    return (fresh.events ?? []).map((event, index) => ({ id: index + 1, document_type: "storefront_order", document_id: id, sender_type: event.actor_type === "customer" ? "guest" : "team", sender_name: event.actor_type === "customer" ? order.customer_name : "Store", message: event.message || event.event_type, created_at: event.created_at }));
  };
  return <DocumentShell back={{ href: "/store/orders", label: "Store orders" }} title={order.order_reference} subtitle={"Order from " + order.customer_name + " · " + formatDate(order.created_at)} status={<StatusBadge status={status} />} actions={<DocumentActions primary={primary} more={[
    canConfirm && ["request_received", "needs_review", "quote_changes_requested"].includes(status) && {key:"revision",label:"Request change",onClick:()=>change.mutate({expected_version:order.version,change_summary:"Please confirm the requested order details.",requires_customer_ack:true})},
    canConfirm && ["request_received", "needs_review", "quote_changes_requested"].includes(status) && {key:"decline",label:"Decline request",onClick:()=>cancel.mutate({kind:"decline",reason:reason||"Unable to fulfil this request"})},
    canFulfil && ["fulfilled","partially_fulfilled"].includes(order.fulfilment_status) && {key:"return",label:"Record return",onClick:()=>recordReturn.mutate({reason:reason||"Customer return"})},
    canCancel && !["fulfilled","partially_fulfilled"].includes(order.fulfilment_status) && !["declined","cancelled","completed"].includes(status) && {key:"cancel",label:"Cancel order",onClick:()=>cancel.mutate({kind:"cancel",reason:reason||"Cancelled by store"})},
    !order.linked_invoice_id && !["declined","cancelled"].includes(status) && {key:"invoice",label:"Create draft invoice",onClick:()=>invoice.mutate(false)},
    !order.linked_invoice_id && !["declined","cancelled"].includes(status) && {key:"proforma",label:"Create proforma",onClick:()=>invoice.mutate(true)},
  ]} />}
    kpis={<><KpiCard tone="accent" icon={CurrencyDollar} label="Order total" value={money(order.total_minor)} hint="Including delivery" /><KpiCard icon={Package} label="Items" value={String(order.lines?.length ?? 0)} hint="Products in this order" /><KpiCard icon={CreditCard} label="Payment" value={orderLabel(order.payment_status)} hint={order.payment_arrangement || "Payment arrangement not set"} /><KpiCard icon={Truck} label="Delivery progress" value={orderLabel(order.fulfilment_status)} hint={orderLabel(order.delivery_method)} /></>}
    aside={<>
      <SummaryRowsCard title="Order summary" tone="ink" leading={<Receipt size={21} />} headline={{ label: "Order total", value: money(order.total_minor) }} rows={[{ icon: Package, label: "Subtotal", value: money(order.subtotal_minor) }, { icon: Truck, label: "Delivery", value: money(order.delivery_fee_minor) }, { icon: CreditCard, label: "Payment", value: orderLabel(order.payment_status) }]} />
      <StatusTimeline steps={steps} title="Order progress" />
      <SummaryRowsCard title={order.customer_name} subtitle="Customer & delivery" leading={<User size={21} />} rows={[
        { icon: Phone, label: "Phone", value: order.customer_phone ? <a href={"tel:" + order.customer_phone}>{order.customer_phone}</a> : "Not provided" },
        { icon: EnvelopeSimple, label: "Email", value: <span className="block max-w-48 break-all text-right">{order.customer_email || "Not provided"}</span> },
        { icon: Truck, label: "Method", value: orderLabel(order.delivery_method) },
        { icon: MapPin, label: "Address", value: <span className="block max-w-48 whitespace-normal text-right">{order.delivery_address || "Not provided"}</span> },
      ]} />
      {!order.customer_id ? <CardFrame><CardHeader title="Customer record" icon={User} /><div className="mt-4 grid gap-2"><AppButton size="sm" variant="secondary" label="Create and link customer" isLoading={linkCustomer.isPending} onPress={() => linkCustomer.mutate(undefined)} />{(order.suggested_customers ?? []).map((customer) => <AppButton key={customer.id} size="sm" variant="secondary" label={"Link " + customer.name} isLoading={linkCustomer.isPending} onPress={() => linkCustomer.mutate(customer.id)} />)}</div></CardFrame> : null}
      <CardFrame><CardHeader title="Action note" icon={Receipt} /><div className="mt-4"><AppInput label="Reason or note" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason for a cancellation or return" /></div></CardFrame>
    </>}>
    <CardFrame><CardHeader title="Order items" icon={Package} /><div className="mt-4"><ItemsTable rows={order.lines ?? []} rowKey={(line) => line.id} columns={[{ key: "title", label: "Item", render: (line) => <div><span className="font-medium">{line.title}</span>{line.variant_name ? <p className="mt-1 text-xs text-muted">{line.variant_name}</p> : null}</div> }, { key: "requested", label: "Requested", align: "right", render: (line) => Number(line.requested_quantity) }, { key: "confirmed", label: "Confirmed", align: "right", render: (line) => Number(line.confirmed_quantity) }, { key: "delivered", label: "Delivered", align: "right", render: (line) => Number(line.fulfilled_quantity) }, { key: "total", label: "Total", align: "right", render: (line) => money(line.line_total_minor) }]} card={(line) => ({ title: line.title, sub: "Requested " + Number(line.requested_quantity) + " · Delivered " + Number(line.fulfilled_quantity), amount: money(line.line_total_minor) })} total={{ label: "Order total", amount: money(order.total_minor) }} /></div></CardFrame>
    {order.customer_note ? <CardFrame><CardHeader title="Customer note" icon={User} /><p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-muted">{order.customer_note}</p></CardFrame> : null}
    <CardFrame><CardHeader title="Conversation" icon={ChatCircleDots} action={<DocumentChat workspaceId={workspaceId} docType="storefront_order" docId={id} partyName={order.customer_name} senderName="Store" fetchMessages={loadMessages} sendMessage={async (message) => { await financeApi.postMerchantOrderMessage(workspaceId, id, message, true); }} />} /><p className="mt-3 text-sm text-muted">View customer messages and reply about this order.</p></CardFrame>
    {order.linked_sale_id ? <AppButton variant="secondary" label={"View sale #" + order.linked_sale_id} onPress={() => router.push("/sales?source=online_store")} /> : null}
  </DocumentShell>;
}

export function StorefrontOrderPage({ id }: { id: number }) { return <WorkspaceGate businessOnly>{(ws)=><OrderContent {...ws} id={id}/>}</WorkspaceGate>; }
