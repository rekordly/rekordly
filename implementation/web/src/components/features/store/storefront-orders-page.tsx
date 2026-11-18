"use client";

import { Package, ShoppingBag, Truck, ClipboardText } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { WorkspaceGate } from "@/components/features/finance/shared";
import { AppSelect } from "@/components/ui/app-select";
import { KpiCard } from "@/components/ui/cards";
import { DataView } from "@/components/ui/data-view";
import { EmptyState, Page, PageHeader, StatusPill } from "@/components/ui/page";
import { RecordCard } from "@/components/ui/record-card";
import { financeApi, formatMinorAmount, moneyKeys } from "@/lib/money";
import { orderLabel } from "@/lib/store-order-display";
import { formatDate } from "@/lib/format";
import type { MerchantOrder } from "@/types/finance";

function Orders({ workspaceId }: { workspaceId: number }) {
  const router = useRouter();
  const [status, setStatus] = useState("all");
  const query = useQuery({ queryKey: [...moneyKeys.workspace(workspaceId), "storefront-orders"], queryFn: () => financeApi.listMerchantOrders(workspaceId), refetchInterval: 30_000, retry: false });
  const orders = query.data ?? [];
  const pending = orders.filter((order) => ["request_received", "needs_review", "quote_changes_requested"].includes(order.commercial_status)).length;
  const packing = orders.filter((order) => order.commercial_status === "confirmed" && order.fulfilment_status === "reserved").length;
  const delivering = orders.filter((order) => ["packed", "partially_fulfilled"].includes(order.fulfilment_status)).length;
  const tone = (order: MerchantOrder) => ["confirmed", "completed"].includes(order.commercial_status) ? "success" as const : ["cancelled", "declined"].includes(order.commercial_status) ? "neutral" as const : "warning" as const;
  return <Page>
    <PageHeader title="Store orders" description="Review requests, prepare orders and keep your customers updated." />
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><KpiCard tone="accent" icon={ClipboardText} label="Needs review" value={pending} hint="Requests awaiting a decision" loading={query.isPending} /><KpiCard icon={Package} label="To pack" value={packing} hint="Confirmed orders to prepare" loading={query.isPending} /><KpiCard icon={Truck} label="To deliver" value={delivering} hint="Packed or partly delivered" loading={query.isPending} /><KpiCard icon={ShoppingBag} label="All orders" value={orders.length} hint="Storefront order requests" loading={query.isPending} /></div>
    <div className="max-w-xs"><AppSelect label="Order status" selectedKey={status} onSelectionChange={setStatus} options={[{ key: "all", label: "All orders" }, ...["request_received", "needs_review", "quote_changes_requested", "confirmed", "completed", "cancelled", "declined"].map((key) => ({ key, label: orderLabel(key) }))]} /></div>
    <DataView<MerchantOrder> title="Orders" rows={status === "all" ? orders : orders.filter((order) => order.commercial_status === status)} rowKey={(order) => order.id} isLoading={query.isPending} isError={query.isError} searchPlaceholder="Search reference or customer" getSearchText={(order) => `${order.order_reference} ${order.customer_name}`} empty={<EmptyState icon={ShoppingBag} title="No orders to show" description="Customer order requests will appear here." />} columns={[
      { key: "reference", label: "Order", render: (order) => <Link className="font-semibold hover:text-primary" href={`/store/orders/${order.id}`}>{order.order_reference}</Link> },
      { key: "customer", label: "Customer", render: (order) => order.customer_name },
      { key: "created", label: "Placed", render: (order) => formatDate(order.created_at) },
      { key: "status", label: "Status", render: (order) => <StatusPill tone={tone(order)}>{orderLabel(order.commercial_status)}</StatusPill> },
      { key: "delivery", label: "Delivery", render: (order) => orderLabel(order.fulfilment_status) },
      { key: "total", label: "Total", align: "right", render: (order) => formatMinorAmount(order.total_minor, order.currency, order.currency_exponent) },
      { key: "action", label: "", align: "right", render: (order) => <Link href={`/store/orders/${order.id}`} className="text-sm font-medium text-primary">Review</Link> },
    ]} renderCard={(order) => <RecordCard icon={<ShoppingBag size={18} />} reference={order.order_reference} title={order.customer_name} amount={formatMinorAmount(order.total_minor, order.currency, order.currency_exponent)} status={<StatusPill tone={tone(order)}>{orderLabel(order.commercial_status)}</StatusPill>} meta={[{ label: "Placed", value: formatDate(order.created_at) }, { label: "Delivery", value: orderLabel(order.fulfilment_status) }]} onView={() => router.push(`/store/orders/${order.id}`)} />} />
  </Page>;
}

export function StorefrontOrdersPage() { return <WorkspaceGate businessOnly>{({ workspaceId }) => <Orders workspaceId={workspaceId} />}</WorkspaceGate>; }
