"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ShoppingBag } from "@phosphor-icons/react";
import { CardFrame, CardHeader } from "@/components/ui/cards";
import { AppButton } from "@/components/ui/app-button";
import { useFinanceAction } from "@/components/features/finance/shared";
import { financeApi, moneyKeys, formatMinorAmount } from "@/lib/money";
import { hasWorkspacePermission, useActiveWorkspace } from "@/stores/workspace-store";
import type { Contact } from "@/types/finance";

const phoneKey = (value?: string | null) => (value || "").replace(/\D/g, "").replace(/^00/, "");

export function CustomerStoreOrders({ workspaceId, customer }: { workspaceId: number; customer: Contact }) {
  const scope = useActiveWorkspace();
  const canView = hasWorkspacePermission(scope, "orders.view");
  const canLink = customer.is_active && hasWorkspacePermission(scope, ["orders.review", "contacts.manage"], true);
  const query = useQuery({ queryKey: [...moneyKeys.workspace(workspaceId), "storefront-orders"], queryFn: () => financeApi.listMerchantOrders(workspaceId), enabled: canView });
  const link = useFinanceAction(workspaceId, (orderID: number) => financeApi.linkOrderCustomer(workspaceId, orderID, customer.id), { success: "Order linked to customer" });
  if (!canView) return null;
  const email = customer.email?.trim().toLowerCase();
  const phone = phoneKey(customer.phone);
  const orders = (query.data ?? []).filter((order) => order.customer_id === customer.id || (!order.customer_id && ((email && order.customer_email?.trim().toLowerCase() === email) || (phone && phoneKey(order.customer_phone) === phone))));
  return <CardFrame><CardHeader title="Recent store orders" icon={ShoppingBag} />
    {query.isPending ? <p className="mt-4 text-sm text-muted">Loading orders…</p> : query.isError ? <p role="alert" className="mt-4 text-sm text-danger">Could not load orders.</p> : orders.length ? <ul className="mt-4 divide-y divide-border">{orders.map((order) => <li key={order.id} className="flex flex-wrap items-center justify-between gap-4 py-4"><div className="min-w-0"><Link href={`/store/orders/${order.id}`} className="text-sm font-semibold hover:text-primary">{order.order_reference}</Link><p className="mt-1 text-xs text-muted">{order.customer_name} · {formatMinorAmount(order.total_minor, order.currency, order.currency_exponent)}</p>{!order.customer_id ? <p className="mt-1 text-xs text-muted">{[order.customer_email, order.customer_phone].filter(Boolean).join(" · ")}</p> : null}</div>{!order.customer_id && canLink ? <AppButton size="sm" variant="secondary" label="Link order" isLoading={link.isPending && link.variables === order.id} isDisabled={link.isPending} onPress={() => link.mutate(order.id)} /> : <span className="text-xs text-muted">{order.customer_id ? "Linked" : "Review contact details"}</span>}</li>)}</ul> : <p className="mt-4 text-sm text-muted">No recent orders match this customer.</p>}
  </CardFrame>;
}
