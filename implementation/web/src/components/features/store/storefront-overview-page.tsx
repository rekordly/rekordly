"use client";

import { ArrowSquareOut, Copy, Storefront as StoreIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";

import { AppButton } from "@/components/ui/app-button";
import { AppInput } from "@/components/ui/app-input";
import { Page, PageHeader, StatusPill } from "@/components/ui/page";
import { WorkspaceGate } from "@/components/features/finance/shared";
import { financeApi, moneyKeys } from "@/lib/money";

function OverviewContent({ workspaceId }: { workspaceId: number }) {
  const client = useQueryClient();
  const storeKey = [...moneyKeys.workspace(workspaceId), "storefront"];
  const storeQuery = useQuery({ queryKey: storeKey, queryFn: () => financeApi.getMerchantStorefront(workspaceId), retry: false });
  const storefront = storeQuery.data;
  const analytics = useQuery({ queryKey: [...storeKey, "today"], queryFn: () => financeApi.getStorefrontAnalytics(workspaceId, 1), enabled: Boolean(storefront) });
  const orders = useQuery({ queryKey: [...storeKey, "action-orders"], queryFn: () => financeApi.listMerchantOrders(workspaceId), enabled: Boolean(storefront) });
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const create = useMutation({
    mutationFn: () => {
      const storeName = name.trim();
      const slug = storeName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
      if (storeName.length < 2 || slug.length < 3) throw new Error("Enter a store name with at least 3 letters or numbers.");
      return financeApi.createStorefront(workspaceId, { name: storeName, slug, theme_key: "simple", currency: "NGN" });
    },
    onSuccess: (created) => { client.setQueryData(storeKey, created); void client.invalidateQueries({ queryKey: storeKey }); },
    onError: (cause) => setError(cause instanceof Error ? cause.message : "Could not create your store."),
  });
  const publish = useMutation({
    mutationFn: () => storefront?.status === "published" ? financeApi.unpublishStorefront(workspaceId) : financeApi.publishStorefront(workspaceId),
    onSuccess: (updated) => { client.setQueryData(storeKey, updated); void client.invalidateQueries({ queryKey: storeKey }); },
  });
  const totals = useMemo(() => {
    const rows = orders.data ?? [];
    return {
      confirm: rows.filter((order) => ["request_received", "needs_review"].includes(order.commercial_status)).length,
      pack: rows.filter((order) => order.commercial_status === "confirmed" && ["reserved", "partially_fulfilled"].includes(order.fulfilment_status)).length,
      deliver: rows.filter((order) => order.fulfilment_status === "fulfilled" && order.delivery_method !== "pickup").length,
    };
  }, [orders.data]);
  const link = storefront ? `https://${storefront.subdomain_host || `${storefront.slug}.rekordly.com`}` : "";
  const copyLink = async () => { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1600); };

  if (!storefront && !storeQuery.isLoading) return <Page><PageHeader title="Set up your store" description="Choose a look, add your brand and publish when you’re ready." /><div className="mx-auto max-w-xl rounded-2xl border border-border bg-surface p-5"><div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-primary-soft text-primary"><StoreIcon size={22} /></div><ol className="mb-5 list-inside list-decimal space-y-2 text-sm text-muted"><li>Start with the Simple theme and green colour.</li><li>Add your logo, name and store sections in Design.</li><li>Publish when your products are ready.</li></ol><form className="space-y-3" onSubmit={(event) => { event.preventDefault(); setError(""); create.mutate(); }}><AppInput label="Store name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Ade Stores" isRequired /><AppButton type="submit" label="Create my store" isLoading={create.isPending} />{error ? <p className="text-sm text-danger">{error}</p> : null}</form></div></Page>;

  const rows = orders.data ?? [];
  return <Page><PageHeader title="Store overview" description="Your online shop and orders at a glance." actions={<div className="flex flex-wrap items-center gap-2">{storefront ? <StatusPill tone={storefront.status === "published" ? "success" : "neutral"}>{storefront.status === "published" ? "Live" : storefront.status === "draft" ? "Draft" : "Unpublished"}</StatusPill> : null}<AppButton label={storefront?.status === "published" ? "Unpublish" : "Publish store"} onPress={() => publish.mutate()} isLoading={publish.isPending} />{storefront && link ? <><AppButton variant="secondary" startContent={<Copy size={16} />} label={copied ? "Copied" : "Copy link"} onPress={() => void copyLink()} /><a href={link} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-full border border-border px-4 text-sm font-medium"><ArrowSquareOut size={16} />Open</a></> : null}</div>} />
    {storefront ? <><div className="mb-5 rounded-2xl border border-border bg-surface p-4"><p className="text-xs text-muted">Your store link</p><a href={link} target="_blank" rel="noreferrer" className="break-all font-semibold text-primary">{link}</a><div className="mt-3 flex gap-2"><Link href="/store/design" className="text-sm font-semibold text-primary">Design</Link><Link href="/store/products" className="text-sm font-semibold text-primary">Products</Link><Link href="/store/settings" className="text-sm font-semibold text-primary">Settings</Link></div></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[["Page views", analytics.data?.page_views ?? 0], ["Added to carts", analytics.data?.add_to_carts ?? 0], ["Orders confirmed", analytics.data?.orders_confirmed ?? 0], ["Conversion", `${analytics.data?.page_views ? ((analytics.data.orders_confirmed / analytics.data.page_views) * 100).toFixed(1) : "0"}%`]].map(([label, value]) => <div key={String(label)} className="rounded-2xl border border-border bg-surface p-4"><p className="text-xs text-muted">{label}</p><p className="mt-2 text-2xl font-semibold tabular">{value}</p></div>)}</div><section className="mt-6 rounded-2xl border border-border bg-surface p-4"><h2 className="font-semibold">Needs action</h2><div className="mt-3 grid gap-3 sm:grid-cols-3">{[["Confirm", totals.confirm, "request_received"], ["Pack", totals.pack, "confirmed"], ["Deliver", totals.deliver, "fulfilled"]].map(([label, count, status]) => <Link key={String(label)} href={`/store/orders?status=${status}`} className="rounded-xl bg-surface-secondary p-4"><span className="block text-2xl font-semibold tabular">{count}</span><span className="text-sm text-muted">{label} orders</span></Link>)}</div><Link href="/store/orders" className="mt-4 inline-block text-sm font-semibold text-primary">View all orders</Link></section>{rows.length === 0 ? <p className="mt-5 text-sm text-muted">When shoppers place orders, you’ll find them here.</p> : null}</> : null}</Page>;
}

export function StorefrontOverviewPage() { return <WorkspaceGate businessOnly>{({ workspaceId }) => <OverviewContent workspaceId={workspaceId} />}</WorkspaceGate>; }
