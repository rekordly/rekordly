"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { CheckCircle, Package, CreditCard, CurrencyDollar, Truck } from "@phosphor-icons/react";
import { AppButton } from "@/components/ui/app-button";
import { AppInput } from "@/components/ui/app-input";
import { DocumentChat } from "@/components/features/finance/document-chat";
import { DocumentActions, DocumentShell, DetailsPanel, ItemsTable, StatusTimeline, SummaryRow } from "@/components/features/finance/document-page";
import { KpiCard } from "@/components/ui/cards/kpi-card";
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
  const fulfil = useFinanceAction(workspaceId, (body: unknown) => financeApi.fulfilStorefrontOrder(workspaceId, id, body), { success: "Order fulfilled and COGS posted", onDone: after });
  const pack = useFinanceAction(workspaceId, (body: { expected_version: number }) => financeApi.packStorefrontOrder(workspaceId, id, body), { success: "Order marked packed", onDone: after });
  const cancel = useFinanceAction(workspaceId, (action: { kind: "cancel" | "decline"; reason: string }) => action.kind === "cancel" ? financeApi.cancelStorefrontOrder(workspaceId, id, action.reason) : financeApi.declineStorefrontOrder(workspaceId, id, action.reason), { success: "Order updated", onDone: after });
  const change = useFinanceAction(workspaceId, (body: unknown) => financeApi.requestOrderChange(workspaceId, id, body), { success: "Revision sent for review", onDone: after });
  const recordReturn = useFinanceAction(workspaceId, (body: {reason:string}) => financeApi.returnStorefrontOrder(workspaceId, id, body), { success: "Return recorded and stock restored", onDone: after });
  const linkCustomer = useFinanceAction(workspaceId, (customerId?: number) => financeApi.linkOrderCustomer(workspaceId, id, customerId), { success: "Customer linked", onDone: after });
  const invoice = useFinanceAction(workspaceId, (proforma: boolean) => financeApi.convertOrderToInvoice(workspaceId, id, proforma), { success: "Sales document created", onDone: after });
  if (!order) return <DocumentShell back={{href:"/store/orders",label:"Orders"}} title={query.isError ? "Order unavailable" : "Loading order…"} aside={<div />}><p className="text-sm text-muted">{query.isError ? "This order could not be loaded." : "Loading order details…"}</p></DocumentShell>;
  const status = order.commercial_status;
  const activeStep = status === "request_received" || status === "needs_review" ? 0 : order.fulfilment_status === "reserved" ? 1 : order.fulfilment_status === "packed" || order.fulfilment_status === "partially_fulfilled" ? 2 : order.fulfilment_status === "fulfilled" ? 3 : 0;
  const steps = ["Placed", "Confirmed", "Packed", "Delivered"].map((label, index) => ({ key: label.toLowerCase(), label, state: index < activeStep ? "done" as const : index === activeStep ? "current" as const : "todo" as const, date: index === 0 ? order.created_at : undefined }));
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
  return <DocumentShell back={{href:"/store/orders",label:"Orders"}} title={order.order_reference} subtitle={`Order from ${order.customer_name}`} status={<StatusBadge status={status} />} actions={<DocumentActions primary={primary} more={[
    canConfirm && ["request_received", "needs_review", "quote_changes_requested"].includes(status) && {key:"revision",label:"Request change",onClick:()=>change.mutate({expected_version:order.version,change_summary:"Please confirm the requested order details.",requires_customer_ack:true})},
    canConfirm && ["request_received", "needs_review", "quote_changes_requested"].includes(status) && {key:"decline",label:"Decline request",onClick:()=>cancel.mutate({kind:"decline",reason:reason||"Unable to fulfil this request"})},
    canFulfil && ["fulfilled","partially_fulfilled"].includes(order.fulfilment_status) && {key:"return",label:"Record return",onClick:()=>recordReturn.mutate({reason:reason||"Customer return"})},
    canCancel && !["fulfilled","partially_fulfilled"].includes(order.fulfilment_status) && !["declined","cancelled","completed"].includes(status) && {key:"cancel",label:"Cancel order",onClick:()=>cancel.mutate({kind:"cancel",reason:reason||"Cancelled by store"})},
    !order.linked_invoice_id && !["declined","cancelled"].includes(status) && {key:"invoice",label:"Create draft invoice",onClick:()=>invoice.mutate(false)},
    !order.linked_invoice_id && !["declined","cancelled"].includes(status) && {key:"proforma",label:"Create proforma",onClick:()=>invoice.mutate(true)},
  ]} />} kpis={<><KpiCard icon={CurrencyDollar} label="Order total" value={money(order.total_minor)} /><KpiCard icon={Package} label="Items" value={String(order.lines?.length ?? 0)} /><KpiCard icon={CreditCard} label="Payment" value={order.payment_status} /><KpiCard icon={Truck} label="Fulfilment" value={order.fulfilment_status} /></>} aside={<><StatusTimeline steps={steps} title="Order progress" /><DetailsPanel title="Customer"><SummaryRow label="Name">{order.customer_name}</SummaryRow><SummaryRow label="Phone">{order.customer_phone || "Not provided"}</SummaryRow><SummaryRow label="Email">{order.customer_email || "Not provided"}</SummaryRow><SummaryRow label="Delivery">{order.delivery_method}</SummaryRow><SummaryRow label="Address">{order.delivery_address || "Not provided"}</SummaryRow>{order.customer_id ? <SummaryRow label="Customer record">#{order.customer_id}</SummaryRow> : null}</DetailsPanel>{!order.customer_id && <AppButton size="sm" variant="secondary" label="Create and link customer" isLoading={linkCustomer.isPending} onPress={()=>linkCustomer.mutate(undefined)} />}{!order.customer_id && (order.suggested_customers ?? []).map((customer)=><AppButton key={customer.id} size="sm" variant="secondary" label={`Link ${customer.name}`} isLoading={linkCustomer.isPending} onPress={()=>linkCustomer.mutate(customer.id)} />)}<AppInput label="Reason or note" value={reason} onChange={(e)=>setReason(e.target.value)} placeholder="Add a reason before cancelling or returning" /><DocumentChat workspaceId={workspaceId} docType="storefront_order" docId={id} partyName={order.customer_name} senderName="Store" fetchMessages={loadMessages} sendMessage={async(message)=>{await financeApi.postMerchantOrderMessage(workspaceId,id,message,true);}} /></>}>
    <ItemsTable rows={order.lines ?? []} rowKey={(line)=>line.id} columns={[{key:"title",label:"Item",render:(line)=><span className="font-semibold">{line.title}</span>},{key:"quantity",label:"Requested",align:"right",render:(line)=>line.requested_quantity},{key:"confirmed",label:"Confirmed",align:"right",render:(line)=>line.confirmed_quantity},{key:"fulfilled",label:"Delivered",align:"right",render:(line)=>line.fulfilled_quantity},{key:"total",label:"Total",align:"right",render:(line)=><span className="font-semibold">{money(line.line_total_minor)}</span>}]} card={(line)=>({title:line.title,sub:`Requested ${line.requested_quantity} · Delivered ${line.fulfilled_quantity}`,amount:money(line.line_total_minor)})} total={{label:"Order total",amount:money(order.total_minor)}} />
    {order.customer_note ? <div className="rounded-2xl border border-border bg-surface p-4"><h2 className="font-semibold">Customer note</h2><p className="mt-2 text-sm text-muted">{order.customer_note}</p></div> : null}
    {order.linked_sale_id ? <AppButton variant="secondary" label={`View sale #${order.linked_sale_id}`} onPress={()=>router.push(`/sales?source=online_store`)} /> : null}
  </DocumentShell>;
}

export function StorefrontOrderPage({ id }: { id: number }) { return <WorkspaceGate businessOnly>{(ws)=><OrderContent {...ws} id={id}/>}</WorkspaceGate>; }
