"use client";

// One page per procurement document, all on the shared DocumentShell:
// header → progress → [summary + linked documents | tabs].
//
//   PurchaseRequestDetailPage  /purchase-requests/[id]
//   PurchaseOrderDetailPage    /purchase-orders/[id]   (messages, share link, inline price edits)
//   GoodsReceiptDetailPage     /procurement/[id]
//   SupplierBillDetailPage     /bills/[id]
//   PurchaseDetailPage         /purchases/[id]

import {
  ArrowRight,
  ArrowUUpLeft,
  CalendarBlank,
  Coins,
  FileText,
  Flag,
  Scales,
  Truck,
  Wallet,
  CheckCircle,
  Copy,
  EnvelopeSimple,
  HandCoins,
  LinkSimple,
  Package,
  PaperPlaneTilt,
  PencilSimple,
  Receipt,
  ShoppingCart,
  Warning,
  WhatsappLogo,
} from "@phosphor-icons/react";
import { toast } from "@heroui/react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { toMinor } from "@/components/pickers";
import { Alert } from "@/components/ui/alert";
import { AppButton } from "@/components/ui/app-button";
import { AppInput } from "@/components/ui/app-input";
import { MoneyInput } from "@/components/ui/money-input";
import { KpiCard } from "@/components/ui/cards";
import { StatusPill } from "@/components/ui/page";
import { SideSheet } from "@/components/ui/side-sheet";
import { capitalise, formatDate } from "@/lib/format";
import { financeApi, formatMinorAmount, moneyKeys } from "@/lib/money";
import type { PurchaseOrder } from "@/types/finance";

import { DocumentChat } from "./document-chat";
import { DocumentFilesTab } from "./document-files-tab";
import {
  ActivityCard,
  daysUntil,
  DocumentActions,
  DocumentError,
  StatusTimeline,
  DocumentShell,
  DocumentSkeleton,
  DocumentTabs,
  LineList,
  LinkedDocuments,
  minorToInput,
  QuantityBar,
  DetailsPanel,
  ItemsTable,
  SummaryRow,
  trimQty,
  type ActivityItem,
  type DocumentStep,
  type LinkedDocument,
  type StepState,
} from "./document-page";
import { PaymentDrawer } from "./payment-drawer";
import { StatusBadge, useFinanceAction, WorkspaceGate, type WorkspaceInfo } from "./shared";

const step = (key: string, label: string, state: StepState, extra: Partial<DocumentStep> = {}): DocumentStep => ({ key, label, state, ...extra });
const ZERO = BigInt(0);
/** "In 5 days", "Today", "3 days ago". */
const dueText = (date: string) => {
  const days = daysUntil(date);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days > 0) return `In ${days} days`;
  return days === -1 ? "Yesterday" : `${-days} days ago`;
};
const isDead = (status?: string) => ["cancelled", "voided", "reversed", "rejected"].includes(status ?? "");

/* -------------------------------------------------------------------------- */
/* 1. Purchase request                                                         */
/* -------------------------------------------------------------------------- */

const DECISION_TITLE: Record<string, string> = {
  submit: "Sent for approval",
  approve: "Approved",
  reject: "Rejected",
  request_changes: "Changes asked for",
  cancel: "Cancelled",
};

function PurchaseRequestDetailContent({ workspaceId, id }: WorkspaceInfo & { id: number }) {
  const router = useRouter();
  const back = { href: "/purchase-requests", label: "Purchase requests" };
  const requestQuery = useQuery({ queryKey: [...moneyKeys.workspace(workspaceId), "purchase-request", id], queryFn: () => financeApi.getPurchaseRequest(workspaceId, id) });
  const submitReq = useFinanceAction(workspaceId, ({ version }: { version: number }, key) => financeApi.submitPurchaseRequest(workspaceId, id, version, key), {
    success: "Sent for approval",
    onDone: () => void requestQuery.refetch(),
  });
  const approveReq = useFinanceAction(workspaceId, ({ version }: { version: number }, key) => financeApi.approvePurchaseRequest(workspaceId, id, version, key), {
    success: "Request approved",
    onDone: () => void requestQuery.refetch(),
  });

  if (requestQuery.isPending) return <DocumentSkeleton />;
  if (requestQuery.isError || !requestQuery.data) return <DocumentError back={back} message="This purchase request could not be loaded." />;

  const req = requestQuery.data;
  const supplierName = req.supplier?.name || req.supplier_name || "Any supplier";
  const money = (minor: string | number) => formatMinorAmount(minor, req.currency, req.currency_exponent);
  const linkedOrders = req.orders ?? [];
  const decided = (command: string) => [...(req.decisions ?? [])].reverse().find((decision) => decision.command === command)?.created_at;
  const canConvert = req.status === "draft" || req.status === "submitted" || req.status === "approved";
  const reached = { draft: 0, changes_requested: 0, submitted: 1, approved: 2, rejected: 1, cancelled: 0 }[req.status] ?? 0;
  const at = (index: number): StepState => (isDead(req.status) && index > reached ? "skipped" : index < reached || (index === reached && req.status === "approved") ? "done" : index === reached ? "current" : "todo");

  const steps = [
    step("draft", "Drafted", "done", { date: req.created_at }),
    step("submitted", "Sent for approval", reached >= 1 ? "done" : at(1), { date: req.submitted_at ?? decided("submit") }),
    step("approved", req.status === "rejected" ? "Rejected" : "Approved", req.status === "rejected" ? "current" : reached >= 2 ? "done" : at(2), {
      date: req.status === "rejected" ? decided("reject") : req.approved_at ?? decided("approve"),
      hint: req.status === "rejected" ? req.latest_decision_reason ?? undefined : undefined,
    }),
    step("ordered", "Ordered", linkedOrders.length ? "done" : req.status === "approved" ? "current" : at(3), {
      href: linkedOrders[0] ? `/purchase-orders/${linkedOrders[0].id}` : undefined,
      hint: linkedOrders[0] ? linkedOrders[0].order_number || `PO #${linkedOrders[0].id}` : undefined,
    }),
  ];

  const activity: ActivityItem[] = [
    { key: "created", title: "Request created", date: req.created_at, tone: "muted" },
    ...(req.decisions ?? []).map((decision) => ({
      key: `d-${decision.id}`,
      title: DECISION_TITLE[decision.command] ?? capitalise(decision.command.replace(/_/g, " ")),
      subtitle: [decision.actor_name ? `by ${decision.actor_name}` : "", decision.reason].filter(Boolean).join(" · ") || undefined,
      date: decision.created_at,
      tone: (decision.command === "reject" || decision.command === "cancel" ? "danger" : "primary") as ActivityItem["tone"],
    })),
    ...linkedOrders.map((order) => ({ key: `o-${order.id}`, title: `Ordered as ${order.order_number || `PO #${order.id}`}`, date: req.updated_at, href: `/purchase-orders/${order.id}` })),
  ];

  return (
    <DocumentShell
      back={back}
      title={req.reason}
      subtitle={`Request #${req.id} · ${supplierName}`}
      status={<StatusBadge status={req.status} />}
      actions={
        canConvert ? (
          <DocumentActions
            primary={
              req.status === "draft" ? (
                <AppButton startContent={<PaperPlaneTilt weight="duotone" />} label="Send for approval" isLoading={submitReq.isPending} onPress={() => submitReq.mutate({ version: req.version })} />
              ) : req.status === "submitted" ? (
                <AppButton startContent={<CheckCircle weight="duotone" />} label="Approve" isLoading={approveReq.isPending} onPress={() => approveReq.mutate({ version: req.version })} />
              ) : (
                <AppButton endContent={<ArrowRight size={15} />} label="Create order" onPress={() => router.push(`/purchase-orders/new?requestId=${req.id}`)} />
              )
            }
            more={[
              req.status !== "approved" && { key: "po", label: "Create order", icon: <Package size={16} />, onClick: () => router.push(`/purchase-orders/new?requestId=${req.id}`) },
              { key: "receipt", label: "Receive goods", icon: <ShoppingCart size={16} />, onClick: () => router.push(`/procurement/new?requestId=${req.id}`) },
            ]}
          />
        ) : undefined
      }
      banner={req.latest_decision_reason && (req.status === "rejected" || req.status === "changes_requested") ? <Alert status="warning" description={req.latest_decision_reason} /> : null}
      kpis={
        <>
          <KpiCard tone="accent" icon={Coins} label="Estimated cost" value={money(req.estimated_total_minor)} hint={`${req.lines?.length ?? 0} ${req.lines?.length === 1 ? "item" : "items"}`} />
          <KpiCard icon={Flag} label="Priority" value={capitalise(req.priority)} hint={req.priority === "urgent" ? "Needs action now" : req.priority === "high" ? "Soon" : "No rush"} />
          <KpiCard icon={CalendarBlank} label="Needed by" value={req.needed_by ? formatDate(req.needed_by) : "Flexible"} hint={req.needed_by ? dueText(req.needed_by) : "No date set"} />
          <KpiCard icon={FileText} label="Orders" value={String(linkedOrders.length)} hint={linkedOrders.length ? "Made from this request" : "No order yet"} />
        </>
      }
      aside={
        <>
          <StatusTimeline steps={steps} />
          <DetailsPanel>
            <SummaryRow label="Supplier">{supplierName}</SummaryRow>
            <SummaryRow label="Priority">
              <StatusPill tone={req.priority === "urgent" ? "danger" : req.priority === "high" ? "warning" : "neutral"}>{capitalise(req.priority)}</StatusPill>
            </SummaryRow>
            <SummaryRow label="Created">{formatDate(req.created_at)}</SummaryRow>
            {req.reference ? <SummaryRow label="Reference">{req.reference}</SummaryRow> : null}
          </DetailsPanel>
          <LinkedDocuments
            items={linkedOrders.map((order) => ({ key: `o-${order.id}`, kind: "order", label: order.order_number || `PO #${order.id}`, sub: money(order.total_minor), href: `/purchase-orders/${order.id}`, status: <StatusBadge status={order.status} /> }))}
          />
        </>
      }
    >
      <DocumentTabs
        tabs={[
          {
            key: "items",
            label: "Items",
            count: req.lines?.length,
            content: (
              <ItemsTable
                rows={req.lines ?? []}
                rowKey={(line) => line.id}
                columns={[
                  { key: "item", label: "Item", render: (line) => <span className="font-semibold">{line.description}</span> },
                  { key: "qty", label: "Quantity", align: "right", render: (line) => `${trimQty(line.quantity)} ${line.unit_name}` },
                  { key: "price", label: "Est. price", align: "right", render: (line) => money(line.estimated_unit_price_minor) },
                  { key: "total", label: "Total", align: "right", render: (line) => <span className="font-semibold">{money(line.estimated_line_total_minor)}</span> },
                ]}
                card={(line) => ({ title: line.description, sub: `${trimQty(line.quantity)} ${line.unit_name} × ${money(line.estimated_unit_price_minor)}`, amount: money(line.estimated_line_total_minor) })}
                total={{ label: "Estimate", amount: money(req.estimated_total_minor) }}
              />
            ),
          },
        ]}
      />
      <ActivityCard items={activity} />
    </DocumentShell>
  );
}

export function PurchaseRequestDetailPage({ id }: { id: number }) {
  return <WorkspaceGate businessOnly>{(ws) => <PurchaseRequestDetailContent {...ws} id={id} />}</WorkspaceGate>;
}

/* -------------------------------------------------------------------------- */
/* 2. Purchase order                                                           */
/* -------------------------------------------------------------------------- */

const PO_EVENT: Record<string, string> = {
  created: "Order created",
  submitted: "Sent for approval",
  approved: "Approved",
  issued: "Sent to supplier",
  acknowledged: "Supplier confirmed",
  revised: "Prices or quantities changed",
  partially_received: "Part of the goods arrived",
  fully_received: "All goods arrived",
  cancelled: "Cancelled",
  closed: "Closed",
};

type DraftLine = { id: number; productId?: number | null; description: string; unitName: string; quantity: string; unitCost: string };

const draftFrom = (order: PurchaseOrder): DraftLine[] =>
  (order.lines ?? []).map((line) => ({
    id: line.id,
    productId: line.product_id,
    description: line.description,
    unitName: line.unit_name,
    quantity: trimQty(line.quantity),
    unitCost: minorToInput(line.expected_unit_cost_minor, order.currency_exponent ?? 2) || "0",
  }));

const lineTotal = (quantity: string, unitCost: string) => {
  const qty = Number(quantity);
  if (!Number.isFinite(qty) || qty <= 0) return ZERO;
  return (toMinor(unitCost) * BigInt(Math.round(qty * 10000)) + BigInt(5000)) / BigInt(10000);
};

function PurchaseOrderDetailContent({ workspaceId, id }: WorkspaceInfo & { id: number }) {
  const router = useRouter();
  const back = { href: "/purchase-orders", label: "Purchase orders" };
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<number, { quantity: string; unitCost: string }>>({});
  const [editing, setEditing] = useState<{ id: number; quantity: string; unitCost: string } | null>(null);
  const [reason, setReason] = useState("");

  const orderQuery = useQuery({ queryKey: [...moneyKeys.workspace(workspaceId), "purchase-order", id], queryFn: () => financeApi.getPurchaseOrder(workspaceId, id) });

  const linkedReceipts = orderQuery.data?.receipts ?? [];
  const linkedBills = orderQuery.data?.bills ?? [];
  const received = new Map<number, number>();
  const billed = new Map<number, number>();
  for (const line of orderQuery.data?.lines ?? []) {
    received.set(line.id, Number(line.received_quantity || 0));
    billed.set(line.id, Number(line.billed_quantity || 0));
  }

  const ensureIssued = async (po: PurchaseOrder): Promise<PurchaseOrder> => {
    if (po.status === "issued" || po.status === "partially_received" || po.status === "fully_received" || po.status === "closed") return po;
    const res = await financeApi.issuePurchaseOrder(workspaceId, id, {}, `${crypto.randomUUID()}-issue`);
    return res.order;
  };

  const advance = useFinanceAction(workspaceId, ({ version, command }: { version: number; command: "submitted" | "approved" | "issued" }, key) => financeApi.advancePurchaseOrder(workspaceId, id, version, command, key), {
    success: "Purchase order updated",
    onDone: () => void orderQuery.refetch(),
  });
  const issueAndShare = useFinanceAction(
    workspaceId,
    async (_po: PurchaseOrder, key: string) => {
      return financeApi.issuePurchaseOrder(workspaceId, id, { share: true }, key);
    },
    {
      success: "Order sent. Share the link below.",
      onDone: (res) => {
        const r = res as { share?: { token: string }; stopped_at?: string; message?: string };
        if (r.share?.token) setShareToken(r.share.token);
        void orderQuery.refetch();
      },
    },
  );

  const order = orderQuery.data;
  const base = useMemo(() => (order ? draftFrom(order) : []), [order]);
  const lines = base.map((line) => ({ ...line, ...edits[line.id] }));
  const changed = (line: DraftLine) => {
    const original = base.find((item) => item.id === line.id);
    return Boolean(original) && (Number(line.quantity) !== Number(original!.quantity) || toMinor(line.unitCost) !== toMinor(original!.unitCost));
  };
  const changeCount = lines.filter(changed).length;

  const revise = useFinanceAction(
    workspaceId,
    (po: PurchaseOrder, key: string) =>
      financeApi.revisePurchaseOrder(
        workspaceId,
        id,
        {
          expected_version: po.version,
          reason: reason.trim() || "Prices or quantities updated",
          lines: lines.map((line) => ({ id: line.id, product_id: line.productId ?? undefined, description: line.description, quantity: line.quantity, unit_name: line.unitName, expected_unit_cost: line.unitCost })),
        },
        key,
      ),
    {
      success: "Order updated",
      onDone: () => {
        setEdits({});
        setReason("");
        void orderQuery.refetch();
      },
    },
  );

  if (orderQuery.isPending) return <DocumentSkeleton />;
  if (orderQuery.isError || !order) return <DocumentError back={back} message="This purchase order could not be loaded." />;

  const exp = order.currency_exponent ?? 2;
  const supplier = order.supplier;
  const supplierName = supplier?.name || order.supplier_name || "Supplier";
  const money = (minor: string | number | bigint) => formatMinorAmount(String(minor), order.currency, exp);
  const title = order.order_number || `PO #${order.id}`;
  const shareUrl = shareToken ? `${typeof window !== "undefined" ? window.location.origin : ""}/purchase-orders/share/${shareToken}` : "";
  const shareMessage = `Hello ${supplierName}, here is Purchase Order ${title} (${money(order.total_minor)}): ${shareUrl}`;
  const phone = (supplier?.phone || "").replace(/[^\d]/g, "");
  const whatsappHref = `https://wa.me/${phone}?text=${encodeURIComponent(shareMessage)}`;
  const mailtoHref = `mailto:${encodeURIComponent(supplier?.email || "")}?subject=${encodeURIComponent(`Purchase Order ${title}`)}&body=${encodeURIComponent(shareMessage)}`;

  const preIssue = ["draft", "submitted", "approved"].includes(order.status);
  const sent = !preIssue && !isDead(order.status);
  const canReceive = ["issued", "acknowledged", "partially_received"].includes(order.status);
  const canBill = ["issued", "acknowledged", "partially_received", "fully_received"].includes(order.status);
  const canRevise = ["draft", "submitted", "approved", "issued", "acknowledged", "partially_received"].includes(order.status);
  const orderedTotal = (order.lines ?? []).reduce((total, line) => total + Number(line.quantity || 0), 0);
  const receivedTotal = [...received.values()].reduce((a, b) => a + b, 0);
  const billedTotal = [...billed.values()].reduce((a, b) => a + b, 0);
  const fullyReceived = order.status === "fully_received" || order.status === "closed";
  const overdueDays = order.expected_date && !fullyReceived && !isDead(order.status) ? -daysUntil(order.expected_date) : 0;
  const draftTotal = lines.reduce((total, line) => total + lineTotal(line.quantity, line.unitCost), ZERO);

  const dead = isDead(order.status);
  const eventDate = (type: string) => (order.events ?? []).find((event) => event.event_type === type)?.created_at;
  const billedMinor = linkedBills.reduce((sum, bill) => sum + BigInt(bill.total_minor || "0"), ZERO);
  const paidMinor = BigInt(order.paid_minor || "0");
  const allPaid = linkedBills.length > 0 && billedTotal >= orderedTotal && paidMinor >= billedMinor;
  const firstReceipt = linkedReceipts[0];
  const lastReceipt = linkedReceipts[linkedReceipts.length - 1];
  const steps = [
    step("created", "Created", "done", { date: eventDate("created") ?? order.events?.[0]?.created_at }),
    step("approved", "Approved", order.status === "draft" ? (dead ? "skipped" : "todo") : order.status === "submitted" ? "current" : "done", { date: eventDate("approved") }),
    step("sent", "Sent to supplier", sent ? "done" : order.status === "approved" ? "current" : dead ? "skipped" : "todo", {
      date: eventDate("issued"),
      hint: order.acknowledged_at ? `Supplier confirmed ${formatDate(order.acknowledged_at)}` : sent ? "Waiting for the supplier to confirm" : undefined,
    }),
    step("received", fullyReceived ? "Goods received" : "Receive goods", fullyReceived ? "done" : canReceive ? "current" : dead ? "skipped" : "todo", {
      date: fullyReceived ? lastReceipt?.received_on : firstReceipt?.received_on,
      hint: receivedTotal ? `${trimQty(receivedTotal)} of ${trimQty(orderedTotal)} received` : order.expected_date && !dead ? `Expected ${formatDate(order.expected_date)}` : undefined,
      href: firstReceipt ? `/procurement/${firstReceipt.id}` : undefined,
    }),
    step("billed", "Billed", linkedBills.length && billedTotal >= orderedTotal ? "done" : linkedBills.length || fullyReceived ? "current" : dead ? "skipped" : "todo", {
      date: linkedBills[0]?.bill_date,
      hint: linkedBills.length ? `${money(billedMinor)} in ${linkedBills.length} ${linkedBills.length === 1 ? "bill" : "bills"}` : undefined,
      href: linkedBills[0] ? `/bills/${linkedBills[0].id}` : undefined,
    }),
    step("paid", "Paid", allPaid ? "done" : paidMinor > ZERO || linkedBills.length ? "current" : dead ? "skipped" : "todo", {
      hint: linkedBills.length ? `${money(paidMinor)} of ${money(billedMinor)}` : undefined,
    }),
  ];

  const activity: ActivityItem[] = [
    ...(order.events ?? []).map((event) => ({
      key: `e-${event.id}`,
      title: PO_EVENT[event.event_type] ?? capitalise(event.event_type.replace(/_/g, " ")),
      subtitle: [event.actor_name ? `by ${event.actor_name}` : "", event.note].filter(Boolean).join(" · ") || undefined,
      date: event.created_at,
      tone: (event.event_type === "cancelled" ? "danger" : "primary") as ActivityItem["tone"],
    })),
    ...linkedReceipts.map((receipt) => ({ key: `r-${receipt.id}`, title: `Goods received · ${receipt.receipt_reference || `#${receipt.id}`}`, date: receipt.received_on, href: `/procurement/${receipt.id}`, amount: receipt.total_minor ? money(receipt.total_minor) : undefined })),
    ...linkedBills.map((bill) => ({ key: `b-${bill.id}`, title: `Bill recorded · ${bill.supplier_invoice_number || `#${bill.id}`}`, date: bill.bill_date || "", href: `/bills/${bill.id}`, amount: money(bill.total_minor) })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  const linked: LinkedDocument[] = [
    ...(order.source_purchase_request_id > 0 ? [{ key: "req", kind: "request" as const, label: `Request #${order.source_purchase_request_id}`, href: `/purchase-requests/${order.source_purchase_request_id}` }] : []),
    ...linkedReceipts.map((receipt) => ({ key: `r-${receipt.id}`, kind: "receipt" as const, label: receipt.receipt_reference || `Receipt #${receipt.id}`, sub: `Received ${formatDate(receipt.received_on)}`, href: `/procurement/${receipt.id}`, status: receipt.status ? <StatusBadge status={receipt.status} /> : undefined })),
    ...linkedBills.map((bill) => ({ key: `b-${bill.id}`, kind: "bill" as const, label: bill.supplier_invoice_number || `Bill #${bill.id}`, sub: money(bill.total_minor), href: `/bills/${bill.id}`, status: <StatusBadge status={bill.status} /> })),
  ];

  const saveEdit = () => {
    if (!editing) return;
    const qty = Number(editing.quantity);
    if (!Number.isFinite(qty) || qty <= 0) return toast.danger("Enter a quantity above zero.");
    if (!editing.unitCost) return toast.danger("Enter a unit price.");
    setEdits({ ...edits, [editing.id]: { quantity: editing.quantity, unitCost: editing.unitCost } });
    setEditing(null);
  };

  const original = (line: DraftLine) => base.find((item) => item.id === line.id)!;
  const editButton = (line: DraftLine) =>
    canRevise ? (
      <button type="button" aria-label={`Edit ${line.description}`} onClick={() => setEditing({ id: line.id, quantity: line.quantity, unitCost: line.unitCost })} className="-my-1 grid size-8 shrink-0 cursor-pointer place-items-center rounded-full text-muted transition-colors hover:bg-surface-secondary hover:text-foreground">
        <PencilSimple size={15} aria-hidden="true" />
      </button>
    ) : null;
  const itemName = (line: DraftLine) => (
    <span className="flex min-w-0 items-center gap-2">
      <span className="truncate font-semibold">{line.description}</span>
      {changed(line) ? <StatusPill tone="accent">Changed</StatusPill> : null}
    </span>
  );
  const progressOf = (line: DraftLine) => (
    <div className="flex flex-wrap gap-x-5 gap-y-1">
      <QuantityBar label="received" done={received.get(line.id) ?? 0} of={Number(line.quantity)} />
      {billed.get(line.id) ? <QuantityBar label="billed" done={billed.get(line.id) ?? 0} of={Number(line.quantity)} tone={(billed.get(line.id) ?? 0) > (received.get(line.id) ?? 0) ? "warning" : "primary"} /> : null}
    </div>
  );
  const editingLine = editing ? lines.find((line) => line.id === editing.id) : undefined;

  return (
    <DocumentShell
      back={back}
      title={title}
      subtitle={`Order for ${supplierName}`}
      status={<StatusBadge status={order.status} />}
      actions={
        <>
          {order.supplier_id ? <DocumentChat workspaceId={workspaceId} docType="purchase_order" docId={order.id} partyName={supplierName} unreadCount={order.unread_messages} /> : null}
          <DocumentActions
            primary={
              preIssue ? (
                <AppButton startContent={<PaperPlaneTilt weight="duotone" />} label={order.status === "submitted" ? "Approve and send" : "Send to supplier"} isLoading={issueAndShare.isPending || advance.isPending} onPress={() => issueAndShare.mutate(order)} />
              ) : canReceive ? (
                <AppButton endContent={<ArrowRight size={15} />} label="Receive goods" onPress={() => router.push(`/procurement/new?poId=${order.id}`)} />
              ) : order.status === "fully_received" ? (
                <AppButton endContent={<ArrowRight size={15} />} label="Create bill" onPress={() => router.push(`/bills/new?poId=${order.id}`)} />
              ) : null
            }
            more={[
              !dead && { key: "share", label: "Share link with supplier", icon: <LinkSimple size={16} />, onClick: () => issueAndShare.mutate(order) },
              order.status === "draft" && { key: "submit", label: "Send for approval", icon: <PaperPlaneTilt size={16} />, onClick: () => advance.mutate({ version: order.version, command: "submitted" }) },
              order.status === "submitted" && { key: "approve", label: "Approve without sending", icon: <CheckCircle size={16} />, onClick: () => advance.mutate({ version: order.version, command: "approved" }) },
              canBill && order.status !== "fully_received" && { key: "bill", label: "Create bill", icon: <Receipt size={16} />, onClick: () => router.push(`/bills/new?poId=${order.id}`) },
            ]}
          />
        </>
      }
      kpis={
        <>
          <KpiCard tone="accent" icon={Coins} label="Order total" value={money(changeCount ? draftTotal : BigInt(order.total_minor || "0"))} hint={changeCount ? "Not saved yet" : `${lines.length} ${lines.length === 1 ? "item" : "items"}`} />
          <KpiCard icon={Package} label="Received" value={`${trimQty(receivedTotal)} of ${trimQty(orderedTotal)}`} hint={receivedTotal ? `${Math.min(100, Math.round((receivedTotal / Math.max(orderedTotal, 1)) * 100))}% of the order` : sent ? "Nothing yet" : "Not sent yet"} />
          <KpiCard icon={Receipt} label="Billed" value={money(billedMinor)} hint={linkedBills.length ? `${money(paidMinor)} paid` : "No bill yet"} />
          <KpiCard icon={CalendarBlank} label="Delivery" value={order.expected_date ? formatDate(order.expected_date) : "Not set"} hint={fullyReceived ? "Delivered" : overdueDays > 0 ? `${overdueDays} ${overdueDays === 1 ? "day" : "days"} late` : order.expected_date ? dueText(order.expected_date) : "Ask the supplier"} />
        </>
      }
      banner={
        shareToken ? (
          <div className="animate-fade-up flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4">
            <div className="min-w-0">
              <p className="text-[14px] font-semibold">Send {title} to {supplierName}</p>
              <p className="truncate text-[12px] text-muted">{shareUrl}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <AppButton
                size="sm"
                variant="secondary"
                startContent={<Copy />}
                label="Copy"
                onPress={() => {
                  void navigator.clipboard?.writeText(shareUrl);
                  toast.success("Link copied");
                }}
              />
              <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-full bg-primary px-3.5 text-[13px] font-medium text-primary-foreground hover:opacity-90">
                <WhatsappLogo size={15} weight="fill" aria-hidden="true" />
                WhatsApp
              </a>
              <a href={mailtoHref} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-surface px-3.5 text-[13px] font-medium hover:bg-surface-secondary">
                <EnvelopeSimple size={15} aria-hidden="true" />
                Email
              </a>
            </div>
          </div>
        ) : order.cancellation_reason ? (
          <Alert status="warning" description={`Cancelled: ${order.cancellation_reason}`} />
        ) : null
      }
      aside={
        <>
          <StatusTimeline steps={steps} />
          <DetailsPanel>
            <SummaryRow label="Supplier">{supplierName}</SummaryRow>
            {supplier?.phone ? <SummaryRow label="Phone">{supplier.phone}</SummaryRow> : null}
            <SummaryRow label="Terms">{order.payment_terms || "Standard"}</SummaryRow>
            {order.acknowledgement_note ? <SummaryRow label="Supplier note">{order.acknowledgement_note}</SummaryRow> : null}
            {order.notes ? <SummaryRow label="Notes">{order.notes}</SummaryRow> : null}
          </DetailsPanel>
          <LinkedDocuments items={linked} />
        </>
      }
    >
      <DocumentTabs
        tabs={[
          {
            key: "items",
            label: "Items",
            count: lines.length,
            content: (
              <>
                <ItemsTable
                  rows={lines}
                  rowKey={(line) => line.id}
                  columns={[
                    { key: "item", label: "Item", render: (line) => <div className="space-y-1.5">{itemName(line)}{sent ? progressOf(line) : null}</div> },
                    {
                      key: "qty",
                      label: "Quantity",
                      align: "right",
                      render: (line) => (
                        <>
                          {trimQty(line.quantity)} <span className="text-muted">{line.unitName}</span>
                          {Number(line.quantity) !== Number(original(line).quantity) ? <span className="block text-[11px] text-muted line-through">{trimQty(original(line).quantity)}</span> : null}
                        </>
                      ),
                    },
                    {
                      key: "price",
                      label: "Unit price",
                      align: "right",
                      render: (line) => (
                        <>
                          {money(toMinor(line.unitCost))}
                          {toMinor(line.unitCost) !== toMinor(original(line).unitCost) ? <span className="block text-[11px] text-muted line-through">{money(toMinor(original(line).unitCost))}</span> : null}
                        </>
                      ),
                    },
                    { key: "total", label: "Total", align: "right", render: (line) => <span className="font-semibold">{money(lineTotal(line.quantity, line.unitCost))}</span> },
                    ...(canRevise ? [{ key: "edit", label: "", align: "right" as const, render: (line: DraftLine) => editButton(line) }] : []),
                  ]}
                  card={(line) => ({
                    title: itemName(line),
                    sub: `${trimQty(line.quantity)} ${line.unitName} × ${money(toMinor(line.unitCost))}`,
                    amount: money(lineTotal(line.quantity, line.unitCost)),
                    action: editButton(line),
                    extra: sent ? progressOf(line) : undefined,
                  })}
                  total={{ label: changeCount ? "New total" : "Total", amount: money(changeCount ? draftTotal : BigInt(order.total_minor || "0")) }}
                />
                {changeCount ? (
                  <div className="animate-fade-up mt-4 flex flex-wrap items-start gap-2 border-t border-separator pt-4">
                    <AppInput aria-label="Reason for the change" placeholder="Reason, e.g. supplier price update" value={reason} onChange={(event) => setReason(event.target.value)} containerClassName="min-w-0 flex-1 basis-56" />
                    <AppButton variant="ghost" label="Reset" isDisabled={revise.isPending} onPress={() => setEdits({})} />
                    <AppButton label={`Save ${changeCount} ${changeCount === 1 ? "change" : "changes"}`} isLoading={revise.isPending} onPress={() => revise.mutate(order)} />
                  </div>
                ) : null}
              </>
            ),
          },
          {
            key: "files",
            label: "Files",
            count: order.files?.length,
            content: (
              <DocumentFilesTab
                workspaceId={workspaceId}
                docType="purchase_order"
                docId={order.id}
                files={order.files ?? []}
                onChanged={() => void orderQuery.refetch()}
              />
            ),
          },
        ]}
      />
      <ActivityCard items={activity} />
      <SideSheet
        isOpen={Boolean(editing && editingLine)}
        onClose={() => setEditing(null)}
        title="Edit item"
        description={editingLine?.description}
        footer={
          <>
            <AppButton variant="ghost" label="Cancel" onPress={() => setEditing(null)} />
            <AppButton label="Save item" onPress={saveEdit} />
          </>
        }
      >
        {editing && editingLine ? (
          <div className="space-y-4">
            <AppInput label="Quantity" type="number" value={editing.quantity} onChange={(event) => setEditing({ ...editing, quantity: event.target.value })} endContent={<span className="text-[13px] text-muted">{editingLine.unitName}</span>} description={`Ordered ${trimQty(original(editingLine).quantity)}`} />
            <MoneyInput label="Unit price" currency={order.currency} exponent={exp} value={editing.unitCost} onValueChange={(value) => setEditing({ ...editing, unitCost: value })} description={`Was ${money(toMinor(original(editingLine).unitCost))}`} />
            <div className="flex items-center justify-between border-t border-separator pt-3 text-[14px]">
              <span className="text-muted">Line total</span>
              <span className="font-bold tabular">{money(lineTotal(editing.quantity, editing.unitCost))}</span>
            </div>
          </div>
        ) : null}
      </SideSheet>
    </DocumentShell>
  );
}

export function PurchaseOrderDetailPage({ id }: { id: number }) {
  return <WorkspaceGate businessOnly>{(ws) => <PurchaseOrderDetailContent {...ws} id={id} />}</WorkspaceGate>;
}

/* -------------------------------------------------------------------------- */
/* 3. Goods receipt                                                            */
/* -------------------------------------------------------------------------- */

function GoodsReceiptDetailContent({ workspaceId, currency, id }: WorkspaceInfo & { id: number }) {
  const router = useRouter();
  const back = { href: "/procurement", label: "Procurement" };
  const [paying, setPaying] = useState(false);
  const [returning, setReturning] = useState(false);
  const [returnLineId, setReturnLineId] = useState<number | null>(null);
  const [returnQty, setReturnQty] = useState("1");
  const [returnReason, setReturnReason] = useState("");

  const receiptQuery = useQuery({ queryKey: [...moneyKeys.workspace(workspaceId), "goods-receipt", id], queryFn: () => financeApi.getGoodsReceipt(workspaceId, id) });
  const createReturn = useFinanceAction(
    workspaceId,
    (_: null, key: string) =>
      financeApi.createSupplierReturn(
        workspaceId,
        { goods_receipt_id: id, effective_on: new Date().toISOString().slice(0, 10), reason: returnReason.trim() || "Returned to supplier", lines: [{ goods_receipt_line_id: returnLineId, quantity: returnQty }] },
        key,
      ),
    {
      success: "Return recorded",
      onDone: () => {
        setReturning(false);
        void receiptQuery.refetch();
      },
    },
  );

  if (receiptQuery.isPending) return <DocumentSkeleton />;
  if (receiptQuery.isError || !receiptQuery.data) return <DocumentError back={back} message="This goods receipt could not be loaded." />;

  const receipt = receiptQuery.data;
  const exp = receipt.currency_exponent ?? 2;
  const cur = receipt.currency || currency;
  const money = (minor?: string | number) => formatMinorAmount(minor ?? "0", cur, exp);
  const supplierName = receipt.supplier?.name || receipt.supplier_name || "Supplier";
  const total = receipt.total_minor ?? receipt.goods_total_minor ?? "0";
  const outstanding = receipt.outstanding_minor ?? total;
  const paid = receipt.paid_minor ?? (BigInt(total || "0") - BigInt(outstanding || "0")).toString();
  const canPay = receipt.status !== "paid" && BigInt(outstanding || "0") > ZERO;
  const title = receipt.receipt_reference || `Receipt #${receipt.id}`;
  const lines = receipt.lines ?? [];
  const fromPo = receipt.purchase_order_id > 0;
  const fullyPaid = BigInt(outstanding || "0") <= ZERO;
  const historyDate = (kind: string, last = false) => {
    const found = (receipt.history ?? []).filter((event) => event.kind === kind);
    return (last ? found[found.length - 1] : found[0])?.date;
  };

  const steps = [
    ...(fromPo ? [step("ordered", "Ordered", "done", { date: historyDate("order"), href: `/purchase-orders/${receipt.purchase_order_id}`, hint: `PO #${receipt.purchase_order_id}` })] : []),
    step("received", "Goods received", "done", { date: receipt.received_on, hint: `${lines.length} ${lines.length === 1 ? "item" : "items"}` }),
    step("billed", "Billed", receipt.bill_id ? "done" : "current", { date: historyDate("bill"), href: receipt.bill_id ? `/bills/${receipt.bill_id}` : undefined, hint: receipt.bill_id ? undefined : "Record the supplier's bill" }),
    step("paid", "Paid", fullyPaid ? "done" : BigInt(paid || "0") > ZERO || receipt.bill_id ? "current" : "todo", {
      date: fullyPaid ? historyDate("payment", true) : undefined,
      hint: fullyPaid ? undefined : `${money(paid)} of ${money(total)}`,
    }),
  ];

  const activity: ActivityItem[] = (receipt.history ?? []).map((event, index) => ({
    key: `h-${index}`,
    title: event.title,
    subtitle: event.subtitle,
    date: event.date,
    href: event.href,
    amount: event.amount_minor && event.amount_minor !== "0" ? money(event.amount_minor) : undefined,
    tone: event.kind === "return" ? "danger" : event.kind === "request" || event.kind === "order" ? "muted" : "primary",
  }));

  const linked: LinkedDocument[] = [
    ...(fromPo ? [{ key: "po", kind: "order" as const, label: `PO #${receipt.purchase_order_id}`, href: `/purchase-orders/${receipt.purchase_order_id}` }] : []),
    ...(receipt.bill_id ? [{ key: "bill", kind: "bill" as const, label: `Bill #${receipt.bill_id}`, href: `/bills/${receipt.bill_id}`, status: receipt.bill_status ? <StatusBadge status={receipt.bill_status} /> : undefined }] : []),
  ];

  const openReturn = (lineId?: number) => {
    setReturnLineId(lineId ?? lines[0]?.id ?? null);
    setReturnQty("1");
    setReturnReason("");
    setReturning(true);
  };
  const returnLine = lines.find((line) => line.id === returnLineId);
  type GoodsLine = (typeof lines)[number];
  const goodsName = (line: GoodsLine) =>
    line.product_id ? (
      <Link href={`/products/${line.product_id}`} className="font-semibold hover:text-primary hover:underline">
        {line.description}
      </Link>
    ) : (
      <span className="font-semibold">{line.description}</span>
    );
  const goodsNote = (line: GoodsLine) => {
    const unit = line.actual_unit_cost_minor || line.unit_cost_minor;
    const priceDiff = Boolean(line.ordered_unit_cost_minor) && line.ordered_unit_cost_minor !== unit;
    const qtyDiff = Boolean(line.ordered_quantity) && Number(line.ordered_quantity) !== Number(line.accepted_quantity);
    const extraCost = line.landed_cost_minor && line.landed_cost_minor !== "0";
    if (!extraCost && !priceDiff && !qtyDiff) return null;
    return (
      <div className="space-y-0.5 text-[12px]">
        {extraCost ? <p className="text-muted">+{money(line.landed_cost_minor)} extra costs → {money(line.effective_unit_cost_minor)} each</p> : null}
        {priceDiff || qtyDiff ? (
          <p className="inline-flex items-center gap-1 font-medium text-warning">
            <Warning size={12} weight="fill" aria-hidden="true" />
            Ordered {trimQty(line.ordered_quantity ?? 0)} × {money(line.ordered_unit_cost_minor ?? "0")}
          </p>
        ) : null}
      </div>
    );
  };

  return (
    <DocumentShell
      back={back}
      title={title}
      subtitle={`Received from ${supplierName}`}
      status={<StatusBadge status={receipt.status || "unpaid"} />}
      actions={
        <DocumentActions
          primary={canPay ? <AppButton startContent={<HandCoins weight="duotone" />} label="Record payment" onPress={() => setPaying(true)} /> : undefined}
          more={[
            receipt.bill_id
              ? { key: "bill", label: "Open bill", icon: <Receipt size={16} />, onClick: () => router.push(`/bills/${receipt.bill_id}`) }
              : { key: "bill", label: "Create bill", icon: <Receipt size={16} />, onClick: () => router.push(`/bills/new?receiptId=${receipt.id}`) },
            lines.length > 0 && { key: "return", label: "Return goods", icon: <ArrowUUpLeft size={16} />, onClick: () => openReturn() },
          ]}
        />
      }
      kpis={
        <>
          <KpiCard tone="accent" icon={Package} label="Goods received" value={money(total)} hint={`${lines.length} ${lines.length === 1 ? "item" : "items"}`} />
          <KpiCard icon={HandCoins} label="Paid" value={money(paid)} hint={BigInt(total || "0") > ZERO ? `${Number((BigInt(paid || "0") * BigInt(100)) / BigInt(total))}% of the total` : "—"} />
          <KpiCard icon={Wallet} label="Still to pay" value={money(outstanding)} hint={fullyPaid ? "Fully paid" : receipt.bill_id ? "Bill recorded" : "No bill yet"} />
          <KpiCard icon={Truck} label="Extra costs" value={money(receipt.landed_cost_minor ?? "0")} hint="Delivery, loading and similar" />
        </>
      }
      aside={
        <>
          <StatusTimeline steps={steps} />
          <DetailsPanel>
            <SummaryRow label="Supplier">{supplierName}</SummaryRow>
            <SummaryRow label="Received">{formatDate(receipt.received_on)}</SummaryRow>
            {receipt.delivery_reference ? <SummaryRow label="Waybill">{receipt.delivery_reference}</SummaryRow> : null}
            {receipt.reason ? <SummaryRow label="Notes">{receipt.reason}</SummaryRow> : null}
          </DetailsPanel>
          <LinkedDocuments items={linked} />
        </>
      }
    >
      <DocumentTabs
        tabs={[
          {
            key: "goods",
            label: "Goods",
            count: lines.length,
            content: (
              <ItemsTable
                rows={lines}
                rowKey={(line) => line.id}
                columns={[
                  { key: "item", label: "Item", render: (line) => <div className="space-y-1">{goodsName(line)}{goodsNote(line)}</div> },
                  { key: "qty", label: "Accepted", align: "right", render: (line) => trimQty(line.accepted_quantity) },
                  { key: "rejected", label: "Rejected", align: "right", render: (line) => (Number(line.rejected_quantity || 0) ? <span className="text-danger">{trimQty(line.rejected_quantity ?? 0)}</span> : <span className="text-muted">—</span>) },
                  { key: "cost", label: "Unit cost", align: "right", render: (line) => money(line.actual_unit_cost_minor || line.unit_cost_minor) },
                  { key: "total", label: "Total", align: "right", render: (line) => <span className="font-semibold">{money(line.line_total_minor)}</span> },
                ]}
                card={(line) => ({
                  title: goodsName(line),
                  sub: `${trimQty(line.accepted_quantity)} accepted × ${money(line.actual_unit_cost_minor || line.unit_cost_minor)}${Number(line.rejected_quantity || 0) ? ` · ${trimQty(line.rejected_quantity ?? 0)} rejected` : ""}`,
                  amount: money(line.line_total_minor),
                  extra: goodsNote(line),
                })}
                total={{ label: "Total", amount: money(total) }}
              />
            ),
          },
          {
            key: "files",
            label: "Files",
            count: receipt.files?.length,
            content: (
              <DocumentFilesTab
                workspaceId={workspaceId}
                docType="goods_receipt"
                docId={receipt.id}
                files={receipt.files ?? []}
                onChanged={() => void receiptQuery.refetch()}
              />
            ),
          },
        ]}
      />
      <ActivityCard items={activity} empty={`Received on ${formatDate(receipt.received_on)}.`} />

      <PaymentDrawer
        workspaceId={workspaceId}
        currency={cur}
        isOpen={paying}
        onClose={() => {
          setPaying(false);
          void receiptQuery.refetch();
        }}
        preset={{
          direction: "outgoing",
          linkedType: "goods_receipt",
          linkedId: receipt.id,
          supplierId: receipt.supplier_id,
          billId: receipt.bill_id,
          billStatus: receipt.bill_status,
          billVersion: receipt.bill_version,
          partyName: supplierName,
          defaultAmount: minorToInput(outstanding, exp),
          summary: `Pay ${supplierName} for ${title} (${money(outstanding)} due).`,
        }}
      />

      <SideSheet
        isOpen={returning}
        onClose={() => setReturning(false)}
        title="Return goods"
        description={`To ${supplierName}`}
        footer={
          <>
            <AppButton variant="ghost" label="Cancel" onPress={() => setReturning(false)} />
            <AppButton label="Record return" isDisabled={!returnLineId || !(Number(returnQty) > 0)} isLoading={createReturn.isPending} onPress={() => createReturn.mutate(null)} />
          </>
        }
      >
        <div className="space-y-5">
          <div>
            <p className="mb-2 text-[14px] font-semibold">Item</p>
            <ul className="divide-y divide-separator" role="radiogroup" aria-label="Item to return">
              {lines.map((line) => (
                <li key={line.id}>
                  <button type="button" role="radio" aria-checked={returnLineId === line.id} onClick={() => setReturnLineId(line.id)} className="flex w-full cursor-pointer items-center gap-3 py-2.5 text-left">
                    <span className={`grid size-5 shrink-0 place-items-center rounded-full border-2 ${returnLineId === line.id ? "border-primary" : "border-border"}`}>
                      {returnLineId === line.id ? <span className="size-2.5 rounded-full bg-primary" /> : null}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{line.description}</span>
                    <span className="shrink-0 text-[12px] text-muted tabular">{trimQty(line.accepted_quantity)} received</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <AppInput label="Quantity" type="number" value={returnQty} onChange={(event) => setReturnQty(event.target.value)} description={returnLine ? `Up to ${trimQty(returnLine.accepted_quantity)}` : undefined} />
          <AppInput label="Reason" placeholder="Damaged or wrong item" value={returnReason} onChange={(event) => setReturnReason(event.target.value)} />
        </div>
      </SideSheet>
    </DocumentShell>
  );
}

export function GoodsReceiptDetailPage({ id }: { id: number }) {
  return <WorkspaceGate businessOnly>{(ws) => <GoodsReceiptDetailContent {...ws} id={id} />}</WorkspaceGate>;
}

/* -------------------------------------------------------------------------- */
/* 4. Supplier bill                                                            */
/* -------------------------------------------------------------------------- */

function SupplierBillDetailContent({ workspaceId, currency, id }: WorkspaceInfo & { id: number }) {
  const router = useRouter();
  const back = { href: "/bills", label: "Bills" };
  const [paying, setPaying] = useState(false);
  const billQuery = useQuery({ queryKey: [...moneyKeys.workspace(workspaceId), "supplier-bill", id], queryFn: () => financeApi.getSupplierBill(workspaceId, id) });
  const approve = useFinanceAction(workspaceId, ({ version, acceptVariance }: { version: number; acceptVariance: boolean }, key) => financeApi.approveSupplierBill(workspaceId, id, version, key, acceptVariance), {
    success: "Bill approved",
    onDone: () => void billQuery.refetch(),
  });

  if (billQuery.isPending) return <DocumentSkeleton />;
  if (billQuery.isError || !billQuery.data) return <DocumentError back={back} message="This bill could not be loaded." />;

  const bill = billQuery.data;
  const cur = bill.currency || currency;
  const exp = bill.currency_exponent ?? 2;
  const money = (minor?: string | number) => formatMinorAmount(minor ?? "0", cur, exp);
  const supplierName = bill.supplier?.name || bill.supplier_name || "Supplier";
  const hasVariance = Boolean(bill.variance_minor && bill.variance_minor !== "0");
  const outstanding = BigInt(bill.outstanding_minor || "0");
  const paid = (BigInt(bill.total_minor || "0") - outstanding - BigInt(bill.credited_minor || "0")).toString();
  const approved = !["draft", "disputed", "rejected"].includes(bill.status);
  const canPay = (bill.status === "approved" || bill.status === "partially_paid") && outstanding > ZERO;
  const canReceive = !bill.goods_receipt_linked && !isDead(bill.status);
  const title = bill.supplier_invoice_number || `Bill #${bill.id}`;
  const days = bill.due_date && outstanding > ZERO && !isDead(bill.status) ? daysUntil(bill.due_date) : null;
  const dueBadge =
    days === null ? null : bill.overdue || days < 0 ? (
      <StatusPill tone="danger">{days < 0 ? `${-days} ${days === -1 ? "day" : "days"} overdue` : "Overdue"}</StatusPill>
    ) : days <= 7 ? (
      <StatusPill tone="warning">{days === 0 ? "Due today" : `Due in ${days} ${days === 1 ? "day" : "days"}`}</StatusPill>
    ) : null;

  const steps = [
    ...(bill.goods_receipt_linked ? [step("received", "Received", "done" as StepState, { href: `/procurement/${bill.goods_receipt_id}` })] : []),
    step("billed", "Bill recorded", "done", { date: bill.bill_date }),
    step("approved", bill.status === "disputed" ? "Disputed" : "Approved", approved ? "done" : isDead(bill.status) ? "skipped" : "current", {
      date: bill.approved_at,
      hint: approved ? undefined : hasVariance ? `Check the ${money(bill.variance_minor)} difference` : "Waiting for approval",
    }),
    step("paid", "Paid", bill.status === "paid" || (approved && outstanding <= ZERO) ? "done" : approved ? "current" : isDead(bill.status) ? "skipped" : "todo", {
      hint: approved && outstanding > ZERO ? `${money(paid)} of ${money(bill.total_minor)}${bill.due_date ? ` · due ${formatDate(bill.due_date)}` : ""}` : undefined,
    }),
  ];

  const activity: ActivityItem[] = [
    ...(bill.events ?? []).map((event) => ({
      key: `e-${event.id}`,
      title: capitalise(event.event_type.replace(/_/g, " ")),
      subtitle: [event.actor_name ? `by ${event.actor_name}` : "", event.note].filter(Boolean).join(" · ") || undefined,
      date: event.created_at,
      tone: (event.event_type === "rejected" || event.event_type === "disputed" ? "danger" : "primary") as ActivityItem["tone"],
    })),
    ...(bill.payments ?? []).map((pmt) => ({
      key: `p-${pmt.id}`,
      title: `Payment recorded${pmt.reference ? ` · ${pmt.reference}` : ""}`,
      subtitle: pmt.account_name ? `via ${pmt.account_name}` : undefined,
      date: pmt.payment_date,
      amount: money(pmt.amount_minor),
      tone: "primary" as ActivityItem["tone"],
    })),
  ].sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  return (
    <DocumentShell
      back={back}
      title={title}
      subtitle={`Bill from ${supplierName}`}
      status={<StatusBadge status={bill.status} />}
      actions={
        <DocumentActions
          primary={
            bill.status === "draft" || bill.status === "disputed" ? (
              <AppButton startContent={<CheckCircle weight="duotone" />} label={hasVariance ? "Approve difference" : "Approve"} isLoading={approve.isPending} onPress={() => approve.mutate({ version: bill.version, acceptVariance: hasVariance })} />
            ) : canPay ? (
              <AppButton startContent={<HandCoins weight="duotone" />} label="Record payment" onPress={() => setPaying(true)} />
            ) : canReceive ? (
              <AppButton endContent={<ArrowRight size={15} />} label="Receive goods" onPress={() => router.push(`/procurement/new?billId=${bill.id}`)} />
            ) : null
          }
          more={[
            bill.goods_receipt_linked
              ? { key: "receipt", label: "Open receipt", icon: <Package size={16} />, onClick: () => router.push(`/procurement/${bill.goods_receipt_id}`) }
              : canReceive && { key: "receive", label: "Receive goods into stock", icon: <ShoppingCart size={16} />, onClick: () => router.push(`/procurement/new?billId=${bill.id}`) },
          ]}
        />
      }
      banner={hasVariance && !approved ? <Alert status="warning" description={`This bill is ${money(bill.variance_minor)} different from what was ordered or received. Check the prices before you approve.`} /> : null}
      kpis={
        <>
          <KpiCard tone="accent" icon={Receipt} label="Bill total" value={money(bill.total_minor)} hint={bill.bill_date ? `Dated ${formatDate(bill.bill_date)}` : `${bill.lines?.length ?? 0} items`} />
          <KpiCard icon={HandCoins} label="Paid" value={approved ? money(paid) : "—"} hint={approved ? (outstanding <= ZERO ? "Fully paid" : "Part paid") : "Approve it first"} />
          <KpiCard icon={Wallet} label="Still to pay" value={money(bill.outstanding_minor)} hint={days === null ? (bill.due_date ? `Due ${formatDate(bill.due_date)}` : "Due on receipt") : dueText(bill.due_date!)} />
          <KpiCard icon={Scales} label="Difference" value={hasVariance ? money(bill.variance_minor) : "None"} hint={hasVariance ? "From the order or receipt" : "Matches what was received"} />
        </>
      }
      aside={
        <>
          <StatusTimeline steps={steps} />
          <DetailsPanel>
            {dueBadge ? <SummaryRow label="Status">{dueBadge}</SummaryRow> : null}
            <SummaryRow label="Supplier">{supplierName}</SummaryRow>
            {bill.bill_date ? <SummaryRow label="Bill date">{formatDate(bill.bill_date)}</SummaryRow> : null}
            <SummaryRow label="Due">{bill.due_date ? formatDate(bill.due_date) : "On receipt"}</SummaryRow>
            {hasVariance ? (
              <SummaryRow label="Difference">
                <span className="font-semibold text-warning tabular">{money(bill.variance_minor)}</span>
              </SummaryRow>
            ) : null}
            {bill.tax_amount_minor && bill.tax_amount_minor !== "0" ? <SummaryRow label="Tax">{money(bill.tax_amount_minor)}</SummaryRow> : null}
            {bill.discount_minor && bill.discount_minor !== "0" ? <SummaryRow label="Discount">{money(bill.discount_minor)}</SummaryRow> : null}
            {bill.credited_minor && bill.credited_minor !== "0" ? <SummaryRow label="Credited">{money(bill.credited_minor)}</SummaryRow> : null}
          </DetailsPanel>
          <LinkedDocuments items={bill.goods_receipt_linked ? [{ key: "receipt", kind: "receipt", label: `Receipt #${bill.goods_receipt_id}`, href: `/procurement/${bill.goods_receipt_id}` }] : []} />
        </>
      }
    >
      <DocumentTabs
        tabs={[
          {
            key: "items",
            label: "Items",
            count: bill.lines?.length,
            content: (
              <ItemsTable
                rows={bill.lines ?? []}
                rowKey={(line) => line.id}
                columns={[
                  {
                    key: "item",
                    label: "Item",
                    render: (line) => (
                      <div>
                        <span className="font-semibold">{line.description}</span>
                        {line.variance_minor && line.variance_minor !== "0" ? (
                          <div className="text-[11px] text-warning">
                            {BigInt(line.variance_minor) > 0 ? "+" : ""}{money(line.variance_minor)} vs expected ({money(line.expected_unit_cost_minor)})
                          </div>
                        ) : null}
                      </div>
                    ),
                  },
                  { key: "qty", label: "Quantity", align: "right", render: (line) => trimQty(line.quantity) },
                  { key: "cost", label: "Unit cost", align: "right", render: (line) => money(line.unit_cost_minor) },
                  { key: "discount", label: "Discount", align: "right", render: (line) => (line.discount_minor && line.discount_minor !== "0" ? `−${money(line.discount_minor)}` : <span className="text-muted">—</span>) },
                  { key: "total", label: "Total", align: "right", render: (line) => <span className="font-semibold">{money(line.line_total_minor)}</span> },
                ]}
                card={(line) => ({ title: line.description, sub: `${trimQty(line.quantity)} × ${money(line.unit_cost_minor)}`, amount: money(line.line_total_minor) })}
                total={{ label: "Total", amount: money(bill.total_minor) }}
              />
            ),
          },
          {
            key: "payments",
            label: "Payments",
            count: bill.payments?.length,
            content: (
              <ItemsTable
                rows={bill.payments ?? []}
                rowKey={(p) => p.id}
                empty="No payments recorded."
                columns={[
                  { key: "date", label: "Payment date", render: (p) => formatDate(p.payment_date) },
                  { key: "account", label: "Account", render: (p) => p.account_name || "—" },
                  { key: "ref", label: "Reference", render: (p) => p.reference || "—" },
                  { key: "amount", label: "Amount", align: "right", render: (p) => <span className="font-semibold">{money(p.amount_minor)}</span> },
                ]}
                card={(p) => ({
                  title: money(p.amount_minor),
                  sub: `${formatDate(p.payment_date)}${p.account_name ? ` · ${p.account_name}` : ""}`,
                  amount: p.reference || undefined,
                })}
              />
            ),
          },
          {
            key: "files",
            label: "Files",
            count: bill.files?.length,
            content: (
              <DocumentFilesTab
                workspaceId={workspaceId}
                docType="supplier_bill"
                docId={bill.id}
                files={bill.files ?? []}
                onChanged={() => void billQuery.refetch()}
              />
            ),
          },
        ]}
      />
      <ActivityCard items={activity} />

      <PaymentDrawer
        workspaceId={workspaceId}
        currency={cur}
        isOpen={paying}
        onClose={() => {
          setPaying(false);
          void billQuery.refetch();
        }}
        preset={{
          direction: "outgoing",
          linkedType: "supplier_bill",
          linkedId: bill.id,
          partyName: supplierName,
          defaultAmount: minorToInput(bill.outstanding_minor || "0", exp),
          summary: `Pay ${title} (${money(bill.outstanding_minor)} due).`,
        }}
      />
    </DocumentShell>
  );
}

export function SupplierBillDetailPage({ id }: { id: number }) {
  return <WorkspaceGate businessOnly>{(ws) => <SupplierBillDetailContent {...ws} id={id} />}</WorkspaceGate>;
}

/* -------------------------------------------------------------------------- */
/* 5. Direct purchase                                                          */
/* -------------------------------------------------------------------------- */

function PurchaseDetailContent({ workspaceId, currency, id }: WorkspaceInfo & { id: number }) {
  const back = { href: "/purchases", label: "Purchases" };
  const [paying, setPaying] = useState(false);
  const purchaseQuery = useQuery({ queryKey: [...moneyKeys.workspace(workspaceId), "purchase", id], queryFn: () => financeApi.getPurchase(workspaceId, id) });

  if (purchaseQuery.isPending) return <DocumentSkeleton />;
  if (purchaseQuery.isError || !purchaseQuery.data) return <DocumentError back={back} message="This purchase could not be loaded." />;

  const { purchase, items = [], payments = [] } = purchaseQuery.data;
  const cur = purchase.currency || currency;
  const exp = purchase.currency_exponent ?? 2;
  const money = (minor?: string | number) => formatMinorAmount(minor ?? 0, cur, exp);
  const remaining = BigInt(purchase.total_amount_minor) - BigInt(purchase.paid_amount_minor);
  const cancelled = purchase.status === "cancelled";
  const lastPayment = payments.map(({ payment }) => payment.payment_date).sort().pop();

  return (
    <DocumentShell
      back={back}
      title={purchase.supplier_name}
      subtitle={`Purchase #${purchase.id} · ${formatDate(purchase.purchase_date)}`}
      status={<StatusBadge status={purchase.status} />}
      actions={remaining > ZERO && !cancelled ? <AppButton startContent={<HandCoins weight="duotone" />} label="Record payment" onPress={() => setPaying(true)} /> : null}
      kpis={
        <>
          <KpiCard tone="accent" icon={ShoppingCart} label="Total" value={money(purchase.total_amount_minor)} hint={`${items.length} ${items.length === 1 ? "item" : "items"}`} />
          <KpiCard icon={HandCoins} label="Paid" value={money(purchase.paid_amount_minor)} hint={`${payments.length} ${payments.length === 1 ? "payment" : "payments"}`} />
          <KpiCard icon={Wallet} label="Still to pay" value={money((remaining > ZERO ? remaining : ZERO).toString())} hint={remaining > ZERO ? "Owed to the supplier" : "Fully paid"} />
          <KpiCard icon={CalendarBlank} label="Date" value={formatDate(purchase.purchase_date)} hint={purchase.reference || "No reference"} />
        </>
      }
      aside={
        <>
          <StatusTimeline
            steps={[
              step("recorded", "Recorded", "done", { date: purchase.purchase_date }),
              step("paid", "Paid", cancelled ? "skipped" : remaining <= ZERO ? "done" : "current", {
                date: remaining <= ZERO ? lastPayment : undefined,
                hint: remaining > ZERO ? `${money(purchase.paid_amount_minor)} of ${money(purchase.total_amount_minor)}` : undefined,
              }),
            ]}
          />
          <DetailsPanel>
          <SummaryRow label="Supplier">{purchase.supplier_name}</SummaryRow>
          <SummaryRow label="Date">{formatDate(purchase.purchase_date)}</SummaryRow>
          {purchase.reference ? <SummaryRow label="Reference">{purchase.reference}</SummaryRow> : null}
          {purchase.notes ? <SummaryRow label="Notes">{purchase.notes}</SummaryRow> : null}
          </DetailsPanel>
        </>
      }
    >
      <DocumentTabs
        tabs={[
          {
            key: "items",
            label: "Items",
            count: items.length,
            content: (
              <ItemsTable
                rows={items}
                rowKey={(item) => item.id}
                columns={[
                  { key: "item", label: "Item", render: (item) => <span className="font-semibold">{item.description}</span> },
                  { key: "qty", label: "Quantity", align: "right", render: (item) => trimQty(item.quantity) },
                  { key: "price", label: "Unit price", align: "right", render: (item) => money(item.unit_price_minor) },
                  { key: "total", label: "Total", align: "right", render: (item) => <span className="font-semibold">{money(item.line_total_minor)}</span> },
                ]}
                card={(item) => ({ title: item.description, sub: `${trimQty(item.quantity)} × ${money(item.unit_price_minor)}`, amount: money(item.line_total_minor) })}
                total={{ label: "Total", amount: money(purchase.total_amount_minor) }}
                empty="No item lines on this purchase."
              />
            ),
          },
          {
            key: "payments",
            label: "Payments",
            count: payments.length,
            content: (
              <LineList
                rows={payments.map(({ payment }) => ({
                  key: payment.id,
                  title: formatDate(payment.payment_date),
                  sub: payment.reference || payment.notes || capitalise(payment.status),
                  amount: <span className="text-primary">{money(payment.total_amount_minor)}</span>,
                }))}
                empty="No payments yet."
              />
            ),
          },
          {
            key: "files",
            label: "Files",
            count: purchaseQuery.data.files?.length,
            content: (
              <DocumentFilesTab
                workspaceId={workspaceId}
                docType="purchase"
                docId={purchase.id}
                files={purchaseQuery.data.files ?? []}
                onChanged={() => void purchaseQuery.refetch()}
              />
            ),
          },
        ]}
      />

      <PaymentDrawer
        workspaceId={workspaceId}
        currency={cur}
        isOpen={paying}
        onClose={() => {
          setPaying(false);
          void purchaseQuery.refetch();
        }}
        preset={{
          direction: "outgoing",
          linkedType: "purchase",
          linkedId: purchase.id,
          partyName: purchase.supplier_name,
          defaultAmount: remaining > ZERO ? minorToInput(remaining, exp) : undefined,
          summary: `${purchase.supplier_name}: ${money(purchase.paid_amount_minor)} paid of ${money(purchase.total_amount_minor)}.`,
        }}
      />
    </DocumentShell>
  );
}

export function PurchaseDetailPage({ id }: { id: number }) {
  return <WorkspaceGate businessOnly>{(ws) => <PurchaseDetailContent {...ws} id={id} />}</WorkspaceGate>;
}
