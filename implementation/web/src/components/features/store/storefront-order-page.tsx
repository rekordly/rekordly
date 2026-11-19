"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { CheckCircle, Package, CreditCard, CurrencyDollar, Truck, User, Phone, EnvelopeSimple, MapPin, Receipt, Warning, QrCode } from "@phosphor-icons/react";
import { AppButton } from "@/components/ui/app-button";
import { AppInput } from "@/components/ui/app-input";
import { AppSelect } from "@/components/ui/app-select";
import { SideSheet } from "@/components/ui/side-sheet";
import { OrderReasonModal } from "./order-reason-modal";
import Link from "next/link";
import { DocumentChat } from "@/components/features/finance/document-chat";
import { DocumentActions, DocumentShell, ItemsTable, StatusTimeline } from "@/components/features/finance/document-page";
import { KpiCard, SummaryRowsCard, CardFrame, CardHeader } from "@/components/ui/cards";
import { orderLabel, orderProgress } from "@/lib/store-order-display";
import { formatDate } from "@/lib/format";
import { financeApi, formatMinorAmount, moneyApi, moneyKeys } from "@/lib/money";
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
  const accountsQuery = useQuery({ queryKey: [...moneyKeys.workspace(workspaceId), "accounts"], queryFn: () => moneyApi.listAccounts({ workspaceId }) });
  const [action, setAction] = useState<"cancel" | "decline" | "return" | "revision" | null>(null);
  const [collectOpen, setCollectOpen] = useState(false);
  const [pickupCodeInput, setPickupCodeInput] = useState("");
  const [markPaidOpen, setMarkPaidOpen] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [paidNote, setPaidNote] = useState("");
  const order = query.data;
  const after = () => void query.refetch();
  const confirm = useFinanceAction(workspaceId, (body: unknown, key: string) => financeApi.confirmStorefrontOrder(workspaceId, id, body, key), { success: "Order confirmed and stock reserved", onDone: after });
  const fulfil = useFinanceAction(workspaceId, (body: unknown) => financeApi.fulfilStorefrontOrder(workspaceId, id, body), { success: "Order marked delivered", onDone: after });
  const pack = useFinanceAction(workspaceId, (body: { expected_version: number }) => financeApi.packStorefrontOrder(workspaceId, id, body), { success: "Order marked packed", onDone: after });
  const readyPickup = useFinanceAction(workspaceId, (expectedVersion: number) => financeApi.readyForPickupStorefrontOrder(workspaceId, id, expectedVersion), { success: "Order marked ready for pickup", onDone: after });
  const collectPickup = useFinanceAction(
    workspaceId,
    (body: { expected_version: number; pickup_code: string; money_account_id?: number }) => financeApi.collectStorefrontOrder(workspaceId, id, body),
    { success: "Order collected and fulfilled", onDone: () => { setCollectOpen(false); setPickupCodeInput(""); after(); } },
  );
  const markPaid = useFinanceAction(
    workspaceId,
    (body: { money_account_id: number; notes?: string }) => financeApi.markStorefrontOrderPaid(workspaceId, id, body),
    { success: "Order marked paid", onDone: () => { setMarkPaidOpen(false); setPaidNote(""); after(); } },
  );
  const cancel = useFinanceAction(workspaceId, (action: { kind: "cancel" | "decline"; reason: string }) => action.kind === "cancel" ? financeApi.cancelStorefrontOrder(workspaceId, id, action.reason) : financeApi.declineStorefrontOrder(workspaceId, id, action.reason), { success: "Order updated", onDone: after });
  const change = useFinanceAction(workspaceId, (body: unknown) => financeApi.requestOrderChange(workspaceId, id, body), { success: "Revision sent for review", onDone: after });
  const recordReturn = useFinanceAction(workspaceId, (body: {reason:string}) => financeApi.returnStorefrontOrder(workspaceId, id, body), { success: "Return recorded and stock restored", onDone: after });
  const invoice = useFinanceAction(workspaceId, (proforma: boolean) => financeApi.convertOrderToInvoice(workspaceId, id, proforma), { success: "Sales document created", onDone: after });
  if (!order) return <DocumentShell back={{href:"/store/orders",label:"Orders"}} title={query.isError ? "Order unavailable" : "Loading order…"} aside={<div />}><p className="text-sm text-muted">{query.isError ? "This order could not be loaded." : "Loading order details…"}</p></DocumentShell>;
  const status = order.commercial_status;
  const steps = orderProgress(order);
  const money = (minor: string) => formatMinorAmount(minor, order.currency, order.currency_exponent);
  const moneyAccountOptions = (accountsQuery.data ?? []).filter((a) => a.account_type !== "clearing").map((a) => ({ key: String(a.id), label: `${a.name} (${a.account_type})` }));
  const isPickup = order.delivery_method === "pickup";
  const primary = canConfirm && ["request_received", "needs_review"].includes(status)
    ? <AppButton startContent={<CheckCircle />} label="Confirm order" isLoading={confirm.isPending} onPress={() => confirm.mutate({ expected_version: order.version, outlet_id: order.outlet_id ?? outlets.data?.find((outlet) => outlet.is_default)?.id ?? outlets.data?.[0]?.id ?? 0, payment_arrangement: order.payment_arrangement ?? "" })} />
    : canFulfil && isPickup && status === "confirmed" && order.fulfilment_status === "reserved"
      ? <AppButton startContent={<Package />} label="Ready for pickup" isLoading={readyPickup.isPending} onPress={() => readyPickup.mutate(order.version)} />
      : canFulfil && isPickup && status === "confirmed" && ["packed", "partially_fulfilled"].includes(order.fulfilment_status)
      ? <AppButton startContent={<QrCode />} label="Collected (code)" onPress={() => { setPickupCodeInput(""); setSelectedAccountId(moneyAccountOptions[0]?.key ?? ""); setCollectOpen(true); }} />
    : canFulfil && status === "confirmed" && order.fulfilment_status === "reserved"
      ? <AppButton startContent={<Package />} label="Mark packed" isLoading={pack.isPending} onPress={() => pack.mutate({ expected_version: order.version })} />
      : canFulfil && status === "confirmed" && ["packed", "partially_fulfilled"].includes(order.fulfilment_status)
      ? <AppButton startContent={<Package />} label="Mark delivered" isLoading={fulfil.isPending} onPress={() => fulfil.mutate({ expected_version: order.version, recipient_name: order.customer_name, lines: (order.lines ?? []).map((line) => ({ order_line_id: line.id, quantity: String(Math.max(0, Number(line.confirmed_quantity) - Number(line.fulfilled_quantity))) })).filter((line) => Number(line.quantity) > 0) })} />
      : undefined;
  const loadMessages = async (): Promise<ExternalMessage[]> => {
    const fresh = await financeApi.getMerchantOrder(workspaceId, id);
    return (fresh.events ?? []).map((event, index) => ({ id: index + 1, document_type: "storefront_order", document_id: id, sender_type: event.actor_type === "customer" ? "guest" : "team", sender_name: event.actor_type === "customer" ? order.customer_name : "Store", message: event.message || event.event_type, created_at: event.created_at }));
  };
  return <><DocumentShell stickyColumns back={{ href: "/store/orders", label: "Store orders" }} title={order.order_reference} subtitle={"Order from " + order.customer_name + " · " + formatDate(order.created_at)} status={<StatusBadge status={status} />} actions={<><DocumentChat label="Messages" workspaceId={workspaceId} docType="storefront_order" docId={id} partyName={order.customer_name} senderName="Store" fetchMessages={loadMessages} sendMessage={async (message) => { await financeApi.postMerchantOrderMessage(workspaceId, id, message, true); }} /><DocumentActions primary={primary} more={[
    canFulfil && isPickup && status === "confirmed" && order.fulfilment_status === "reserved" && {key:"ready_pickup",label:"Ready for pickup",onClick:()=>readyPickup.mutate(order.version)},
    canFulfil && isPickup && status === "confirmed" && ["packed","partially_fulfilled"].includes(order.fulfilment_status) && {key:"collect_pickup",label:"Collected (code)",onClick:()=>{setPickupCodeInput("");setSelectedAccountId((cur)=>cur||moneyAccountOptions[0]?.key||"");setCollectOpen(true);}},
    order.payment_status !== "paid" && !["declined","cancelled"].includes(status) && {key:"mark_paid",label:"Mark paid",onClick:()=>{setSelectedAccountId((cur)=>cur||moneyAccountOptions[0]?.key||"");setPaidNote("");setMarkPaidOpen(true);}},
    canConfirm && ["request_received", "needs_review", "quote_changes_requested"].includes(status) && {key:"revision",label:"Request change",onClick:()=>setAction("revision")},
    canConfirm && ["request_received", "needs_review", "quote_changes_requested"].includes(status) && {key:"decline",label:"Decline request",onClick:()=>setAction("decline")},
    canFulfil && ["fulfilled","partially_fulfilled"].includes(order.fulfilment_status) && {key:"return",label:"Record return",onClick:()=>setAction("return")},
    canCancel && !["fulfilled","partially_fulfilled"].includes(order.fulfilment_status) && !["declined","cancelled","completed"].includes(status) && {key:"cancel",label:"Cancel order",onClick:()=>setAction("cancel")},
    !order.linked_invoice_id && !["declined","cancelled"].includes(status) && {key:"invoice",label:"Create draft invoice",onClick:()=>invoice.mutate(false)},
    !order.linked_invoice_id && !["declined","cancelled"].includes(status) && {key:"proforma",label:"Create proforma",onClick:()=>invoice.mutate(true)},
  ]} /></>}
    kpis={<><KpiCard tone="accent" icon={CurrencyDollar} label="Order total" value={money(order.total_minor)} hint="Including delivery" /><KpiCard icon={Package} label="Items" value={String(order.lines?.length ?? 0)} hint="Products in this order" /><KpiCard icon={CreditCard} label="Payment" value={orderLabel(order.payment_status)} hint={order.payment_arrangement || "Payment arrangement not set"} /><KpiCard icon={Truck} label="Delivery progress" value={orderLabel(order.fulfilment_status)} hint={orderLabel(order.delivery_method)} /></>}
    aside={<>
      <SummaryRowsCard title="Order summary" tone="ink" leading={<Receipt size={21} />} headline={{ label: "Order total", value: money(order.total_minor) }} rows={[{ icon: Package, label: "Subtotal", value: money(order.subtotal_minor) }, { icon: Truck, label: "Delivery", value: money(order.delivery_fee_minor) }, { icon: CreditCard, label: "Payment", value: orderLabel(order.payment_status) }]} />
      <StatusTimeline steps={steps} title="Order progress" />
      <SummaryRowsCard title={order.customer_name} subtitle="Customer & delivery" leading={<User size={21} />} action={<Link href={order.customer_id ? `/customers/${order.customer_id}` : "/customers"} className="text-xs font-medium text-primary">{order.customer_id ? "View profile" : "Customers"}</Link>} rows={[
        { icon: Phone, label: "Phone", value: order.customer_phone ? <a href={"tel:" + order.customer_phone}>{order.customer_phone}</a> : "Not provided" },
        { icon: EnvelopeSimple, label: "Email", value: <span className="block max-w-48 break-all text-right">{order.customer_email || "Not provided"}</span> },
        { icon: Truck, label: "Method", value: orderLabel(order.delivery_method) },
        { icon: MapPin, label: "Address", value: <span className="block max-w-48 whitespace-normal text-right">{order.delivery_address || "Not provided"}</span> },
        ...(order.pickup_code ? [{ icon: QrCode, label: "Pickup code", value: <span className="font-mono font-semibold tracking-wider">{order.pickup_code}</span> }] : []),
        ...(order.courier_tracking_number ? [{ icon: Truck, label: "Tracking", value: order.courier_tracking_url ? <a href={order.courier_tracking_url} target="_blank" rel="noreferrer" className="text-primary underline">{order.courier_tracking_number}</a> : order.courier_tracking_number }] : []),
      ]} />
    </>}>
    {status === "paid_needs_attention" ? <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"><Warning size={20} className="mt-0.5 shrink-0" /><div><p className="font-medium">Payment received after hold expired</p><p className="mt-1 text-amber-800">Check current item stock before confirming or fulfilling this order, or issue a refund if items sold out.</p></div></div> : null}
    <CardFrame><CardHeader title="Order items" icon={Package} /><div className="mt-4"><ItemsTable rows={order.lines ?? []} rowKey={(line) => line.id} columns={[{ key: "title", label: "Item", render: (line) => <div><span className="font-medium">{line.title}</span>{line.variant_name ? <p className="mt-1 text-xs text-muted">{line.variant_name}</p> : null}</div> }, { key: "requested", label: "Requested", align: "right", render: (line) => Number(line.requested_quantity) }, { key: "confirmed", label: "Confirmed", align: "right", render: (line) => Number(line.confirmed_quantity) }, { key: "delivered", label: "Delivered", align: "right", render: (line) => Number(line.fulfilled_quantity) }, { key: "total", label: "Total", align: "right", render: (line) => money(line.line_total_minor) }]} card={(line) => ({ title: line.title, sub: "Requested " + Number(line.requested_quantity) + " · Delivered " + Number(line.fulfilled_quantity), amount: money(line.line_total_minor) })} total={{ label: "Order total", amount: money(order.total_minor) }} /></div></CardFrame>
    {order.customer_note ? <CardFrame><CardHeader title="Customer note" icon={User} /><p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-muted">{order.customer_note}</p></CardFrame> : null}
    {order.linked_sale_id ? <AppButton variant="secondary" label={"View sale #" + order.linked_sale_id} onPress={() => router.push("/sales?source=online_store")} /> : null}
  </DocumentShell>
  <SideSheet isOpen={collectOpen} onClose={() => setCollectOpen(false)} title="Confirm pickup handover" footer={<div className="flex w-full justify-end gap-2"><AppButton variant="secondary" label="Cancel" onPress={() => setCollectOpen(false)} /><AppButton label={collectPickup.isPending ? "Confirming..." : "Confirm handover"} isLoading={collectPickup.isPending} isDisabled={!pickupCodeInput.trim()} onPress={() => collectPickup.mutate({ expected_version: order.version, pickup_code: pickupCodeInput.trim(), money_account_id: order.payment_status !== "paid" && selectedAccountId ? Number(selectedAccountId) : undefined })} /></div>}>
    <div className="space-y-4">
      <p className="text-sm text-muted">Enter the 6-character pickup code shown on the customer&apos;s order status page.</p>
      <AppInput label="Pickup code" isRequired value={pickupCodeInput} onChange={(e) => setPickupCodeInput(e.target.value.toUpperCase())} placeholder="e.g. A7K9M2" maxLength={12} />
      {order.payment_status !== "paid" && moneyAccountOptions.length > 0 ? <AppSelect label="Account receiving payment (if paying at pickup)" placeholder="Optional" selectedKey={selectedAccountId || undefined} onSelectionChange={(key) => setSelectedAccountId(key)} options={moneyAccountOptions} /> : null}
    </div>
  </SideSheet>
  <SideSheet isOpen={markPaidOpen} onClose={() => setMarkPaidOpen(false)} title="Mark order as paid" footer={<div className="flex w-full justify-end gap-2"><AppButton variant="secondary" label="Cancel" onPress={() => setMarkPaidOpen(false)} /><AppButton label={markPaid.isPending ? "Saving..." : "Confirm payment"} isLoading={markPaid.isPending} isDisabled={!selectedAccountId} onPress={() => markPaid.mutate({ money_account_id: Number(selectedAccountId), notes: paidNote.trim() || undefined })} /></div>}>
    <div className="space-y-4">
      <p className="text-sm text-muted">Choose the cash or bank account where you received payment for this order.</p>
      <AppSelect label="Money account" placeholder="Select account" isRequired selectedKey={selectedAccountId || undefined} onSelectionChange={(key) => setSelectedAccountId(key)} options={moneyAccountOptions} />
      <AppInput label="Note (optional)" value={paidNote} onChange={(e) => setPaidNote(e.target.value)} placeholder="e.g. Bank transfer ref or cash receipt" maxLength={240} />
    </div>
  </SideSheet>
  {action ? <OrderReasonModal key={action} title={action === "cancel" ? "Cancel order" : action === "decline" ? "Decline request" : action === "return" ? "Record return" : "Request order changes"} confirmLabel={action === "revision" ? "Send requested changes" : action === "return" ? "Record return" : action === "decline" ? "Decline request" : "Cancel order"} required danger={action === "cancel" || action === "decline"} onClose={() => setAction(null)} onSubmit={async (reason) => {
    if (action === "revision") await change.mutateAsync({ expected_version: order.version, change_summary: reason, requires_customer_ack: true });
    else if (action === "return") await recordReturn.mutateAsync({ reason });
    else await cancel.mutateAsync({ kind: action, reason });
  }} /> : null}</>;
}

export function StorefrontOrderPage({ id }: { id: number }) { return <WorkspaceGate businessOnly>{(ws)=><OrderContent {...ws} id={id}/>}</WorkspaceGate>; }
