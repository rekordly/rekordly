"use client";

import { ArrowSquareOut, Copy, Storefront as StoreIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";

import { AppButton } from "@/components/ui/app-button";
import { AppInput } from "@/components/ui/app-input";
import { Page, PageHeader, StatusPill } from "@/components/ui/page";
import { WorkspaceGate } from "@/components/features/finance/shared";
import { financeApi, formatMinorAmount, moneyKeys } from "@/lib/money";
import type { StorefrontOverview } from "@/types/finance";

function OverviewContent({ workspaceId }: { workspaceId: number }) {
  const client = useQueryClient();
  const storeKey = [...moneyKeys.workspace(workspaceId), "storefront"];
  const [period, setPeriod] = useState<"7d" | "30d" | "90d">("30d");
  const overviewQuery = useQuery({ queryKey: [...storeKey, "overview", period], queryFn: () => financeApi.getStorefrontOverview(workspaceId, period), retry: false });
  const overview = overviewQuery.data;
  const storefront = overview?.storefront;
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
    onSuccess: (created) => { client.setQueryData(storeKey, created); void client.invalidateQueries({ queryKey: [...storeKey, "overview"] }); },
    onError: (cause) => setError(cause instanceof Error ? cause.message : "Could not create your store."),
  });
  const publish = useMutation({
    mutationFn: () => storefront?.status === "published" ? financeApi.unpublishStorefront(workspaceId) : financeApi.publishStorefront(workspaceId),
    onSuccess: () => void client.invalidateQueries({ queryKey: [...storeKey, "overview"] }),
  });
  const link = storefront ? `https://${storefront.subdomain_host || `${storefront.slug}.rekordly.com`}` : "";
  const copyLink = async () => { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1600); };

  if (overviewQuery.isLoading) return <Page><PageHeader title="Store overview" description="Loading your storefront activity…" /></Page>;
  if (!overview && !overviewQuery.isError) return <Page><PageHeader title="Set up your store" description="Choose a look, add your brand and publish when you’re ready." /><div className="mx-auto max-w-xl rounded-2xl border border-border bg-surface p-5"><div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-primary-soft text-primary"><StoreIcon size={22} /></div><ol className="mb-5 list-inside list-decimal space-y-2 text-sm text-muted"><li>Start with the Simple theme.</li><li>Add your logo, name and store sections in Design.</li><li>Publish when your products are ready.</li></ol><form className="space-y-3" onSubmit={(event) => { event.preventDefault(); setError(""); create.mutate(); }}><AppInput label="Store name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Ade Stores" isRequired /><AppButton type="submit" label="Create my store" isLoading={create.isPending} />{error ? <p className="text-sm text-danger">{error}</p> : null}</form></div></Page>;
  if (overviewQuery.isError || !overview) return <Page><PageHeader title="Store overview" description="Could not load your store overview." actions={<AppButton variant="secondary" label="Try again" onPress={() => void overviewQuery.refetch()} />} /></Page>;
  return <OverviewDashboard overview={overview} period={period} setPeriod={setPeriod} link={link} copied={copied} copyLink={() => void copyLink()} publish={() => publish.mutate()} publishing={publish.isPending} />;
}

function OverviewDashboard({ overview, period, setPeriod, link, copied, copyLink, publish, publishing }: { overview: StorefrontOverview; period: "7d" | "30d" | "90d"; setPeriod: (p: "7d" | "30d" | "90d") => void; link: string; copied: boolean; copyLink: () => void; publish: () => void; publishing: boolean }) {
  const sf = overview.storefront;
  const currency = (minor: number | string) => formatMinorAmount(minor, overview.currency, overview.currency_exponent);
  const points = useMemo(() => {
    const values = overview.daily.map((d) => Number(d.sales_minor));
    const max = Math.max(1, ...values);
    return values.map((v, i) => `${values.length < 2 ? 50 : i * 100 / (values.length - 1)},${92 - v * 78 / max}`).join(" ");
  }, [overview.daily]);
  const orderBars = useMemo(() => {
    const max = Math.max(1, ...overview.daily.map((d) => d.paid_orders));
    return overview.daily.map((d, i) => ({ x: i * 100 / Math.max(1, overview.daily.length), h: d.paid_orders * 28 / max }));
  }, [overview.daily]);
  const funnel = [["Visits", overview.funnel.visits], ["Product views", overview.funnel.product_views], ["Added to cart", overview.funnel.add_to_cart], ["Checkout started", overview.funnel.checkout_started], ["Checkout submitted", overview.funnel.checkout_submitted], ["Paid", overview.funnel.paid]] as const;
  return <Page><PageHeader title="Store overview" description="Your online shop and orders at a glance." actions={<div className="flex flex-wrap items-center gap-2"><StatusPill tone={sf.status === "published" ? "success" : "neutral"}>{sf.status === "published" ? "Live" : sf.status === "draft" ? "Draft" : "Unpublished"}</StatusPill><AppButton label={sf.status === "published" ? "Unpublish" : "Publish store"} onPress={publish} isLoading={publishing} />{link ? <><AppButton variant="secondary" startContent={<Copy size={16} />} label={copied ? "Copied" : "Copy link"} onPress={copyLink} /><a href={link} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-full border border-border px-4 text-sm font-medium"><ArrowSquareOut size={16} />Open</a></> : null}</div>} />
    <div className="mb-5 rounded-2xl border border-border bg-surface p-4"><p className="text-xs text-muted">Your store link</p><a href={link} target="_blank" rel="noreferrer" className="break-all font-semibold text-primary">{link}</a><div className="mt-3 flex gap-4"><Link href="/store/design" className="text-sm font-semibold text-primary">Design</Link><Link href="/store/products" className="text-sm font-semibold text-primary">Products</Link><Link href="/store/settings" className="text-sm font-semibold text-primary">Settings</Link></div></div>
    <div className="mb-4 flex justify-end gap-1">{(["7d", "30d", "90d"] as const).map((value) => <button key={value} onClick={() => setPeriod(value)} className={`rounded-full px-3 py-1.5 text-sm ${period === value ? "bg-primary text-white" : "bg-surface-secondary text-muted"}`}>{value === "7d" ? "7 days" : value === "30d" ? "30 days" : "90 days"}</button>)}</div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{[["Store sales", currency(overview.sales_minor)], ["Paid orders", overview.paid_orders], ["Visitors", overview.visitors], ["Conversion", `${overview.conversion_rate}%`], ["Average order value", currency(overview.average_order_value_minor)]].map(([label, value]) => <div key={String(label)} className="rounded-2xl border border-border bg-surface p-4"><p className="text-xs text-muted">{label}</p><p className="mt-2 text-2xl font-semibold tabular">{value}</p></div>)}</div>
    <div className="mt-5 grid gap-4 xl:grid-cols-2"><section className="rounded-2xl border border-border bg-surface p-4"><h2 className="font-semibold">Sales over time</h2><p className="text-xs text-muted">Daily paid sales · {overview.since_date} to today</p><svg viewBox="0 0 100 100" preserveAspectRatio="none" className="mt-4 h-36 w-full overflow-visible"><polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" className="text-primary" /></svg><p className="text-xs text-muted">Paid orders per day</p><svg viewBox="0 0 100 32" preserveAspectRatio="none" className="h-9 w-full" aria-label="Paid orders per day">{orderBars.map((bar, i) => <rect key={overview.daily[i]?.date} x={bar.x} y={32 - bar.h} width={Math.max(0.5, 100 / overview.daily.length - 0.35)} height={bar.h} rx="0.3" className="fill-primary" />)}</svg><div className="flex justify-between text-xs text-muted"><span>{overview.daily[0]?.date}</span><span>{overview.daily.at(-1)?.date}</span></div></section><section className="rounded-2xl border border-border bg-surface p-4"><h2 className="font-semibold">Shopping funnel</h2><div className="mt-4 space-y-3">{funnel.map(([label, value]) => <div key={label}><div className="mb-1 flex justify-between text-sm"><span>{label}</span><span className="tabular text-muted">{value}</span></div><div className="h-2 overflow-hidden rounded-full bg-surface-secondary"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Math.max(value ? 3 : 0, value * 100 / Math.max(1, overview.funnel.visits)))}%` }} /></div></div>)}</div></section></div>
    <div className="mt-4 grid gap-4 xl:grid-cols-3"><section className="rounded-2xl border border-border bg-surface p-4"><h2 className="font-semibold">Top products</h2><div className="mt-3 space-y-3">{overview.top_products.length ? overview.top_products.map((p) => <div key={p.product_id} className="flex justify-between gap-3 border-b border-border pb-2 text-sm"><span className="truncate">{p.name}<small className="block text-muted">{p.product_views} views · {p.orders} orders</small></span><span className="shrink-0 font-medium">{currency(p.sales_minor)}</span></div>) : <p className="text-sm text-muted">Product activity will appear here.</p>}</div></section><section className="rounded-2xl border border-border bg-surface p-4"><h2 className="font-semibold">Traffic sources</h2><div className="mt-3 space-y-2">{overview.referrers.length ? overview.referrers.map((r) => <div key={r.referrer_class} className="flex justify-between text-sm"><span className="capitalize">{r.referrer_class.replaceAll("_", " ")}</span><span className="tabular text-muted">{r.visits}</span></div>) : <p className="text-sm text-muted">Traffic sources will appear here.</p>}</div></section><section className="rounded-2xl border border-border bg-surface p-4"><h2 className="font-semibold">Orders needing action</h2><div className="mt-3 space-y-2">{[["Confirm", overview.needs_action.to_confirm, "request_received"], ["Pack", overview.needs_action.to_pack, "confirmed"], ["Deliver", overview.needs_action.to_deliver, "packed"]].map(([label, count, status]) => <Link key={String(label)} href={`/store/orders?status=${status}`} className="flex justify-between rounded-xl bg-surface-secondary p-3 text-sm"><span>{label} orders</span><strong className="tabular">{count}</strong></Link>)}</div><Link href="/store/orders" className="mt-3 inline-block text-sm font-semibold text-primary">View all orders</Link></section></div>
  </Page>;
}

export function StorefrontOverviewPage() { return <WorkspaceGate businessOnly>{({ workspaceId }) => <OverviewContent workspaceId={workspaceId} />}</WorkspaceGate>; }
