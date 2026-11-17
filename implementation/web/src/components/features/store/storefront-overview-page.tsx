"use client";

import { ArrowSquareOut, ChartLineUp, Coins, Copy, Eye, Globe, Package, PencilSimple, Receipt, ShareNetwork, Storefront, TrendUp, Users } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";

import { TypeBadge, WorkspaceGate } from "@/components/features/finance/shared";
import { AppButton } from "@/components/ui/app-button";
import { AppRowActions } from "@/components/ui/app-row-actions";
import { CashFlowCard, CardCornerLink, CardFrame, CardHeader, KpiCard, SummaryRowsCard, type CashFlowPoint } from "@/components/ui/cards";
import { AppSelect } from "@/components/ui/app-select";
import { Page, PageHeader, StatusPill } from "@/components/ui/page";
import { financeApi, formatMinorAmount, moneyKeys } from "@/lib/money";
import type { StorefrontOverview } from "@/types/finance";

type OverviewPeriod = "7d" | "30d" | "90d";
const PERIOD_OPTIONS = [
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "90d", label: "Last 90 days" },
];

function OverviewContent({ workspaceId }: { workspaceId: number }) {
  const client = useQueryClient();
  const storeKey = [...moneyKeys.workspace(workspaceId), "storefront"];
  const [period, setPeriod] = useState<OverviewPeriod>("30d");
  const overviewQuery = useQuery({ queryKey: [...storeKey, "overview", period], queryFn: () => financeApi.getStorefrontOverview(workspaceId, period), retry: false });
  const overview = overviewQuery.data;
  const storefront = overview?.storefront;
  const [copied, setCopied] = useState(false);
  const publish = useMutation({
    mutationFn: () => storefront?.status === "published" ? financeApi.unpublishStorefront(workspaceId) : financeApi.publishStorefront(workspaceId),
    onSuccess: () => void client.invalidateQueries({ queryKey: [...storeKey, "overview"] }),
  });
  const link = storefront ? `https://${storefront.subdomain_host || `${storefront.slug}.rekordly.com`}` : "";
  const copyLink = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  if (overviewQuery.isLoading) return <Page><PageHeader title="Store overview" description="Loading your storefront activity…" /></Page>;
  if (!overview && !overviewQuery.isError) return <Page><PageHeader title="Set up your store" description="Add your store details, choose your template and publish when ready." /><CardFrame className="mx-auto max-w-xl"><div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-primary-soft text-primary"><Storefront size={22} /></div><p className="mb-5 text-sm text-muted">Start with your business information. You’ll review it before creating your storefront.</p><Link href="/store/information"><AppButton label="Store information" /></Link></CardFrame></Page>;
  if (overviewQuery.isError || !overview) return <Page><PageHeader title="Store overview" description="Could not load your store overview." actions={<AppButton variant="secondary" label="Try again" onPress={() => void overviewQuery.refetch()} />} /></Page>;

  const shareLink = async () => {
    if (typeof navigator.share === "function") {
      try { await navigator.share({ title: storefront?.name ?? "My store", url: link }); } catch { /* Sharing was dismissed. */ }
      return;
    }
    await copyLink();
  };

  return <OverviewDashboard overview={overview} period={period} setPeriod={setPeriod} link={link} copied={copied} copyLink={() => void copyLink()} shareLink={() => void shareLink()} publish={() => publish.mutate()} publishing={publish.isPending} />;
}

function OverviewDashboard({ overview, period, setPeriod, link, copied, copyLink, shareLink, publish, publishing }: {
  overview: StorefrontOverview;
  period: OverviewPeriod;
  setPeriod: (p: OverviewPeriod) => void;
  link: string;
  copied: boolean;
  copyLink: () => void;
  shareLink: () => void;
  publish: () => void;
  publishing: boolean;
}) {
  const sf = overview.storefront;
  const money = (minor: number | string) => formatMinorAmount(minor, overview.currency, overview.currency_exponent);
  const chartData = useMemo<CashFlowPoint[]>(() => overview.daily.map((day) => ({
    label: day.date.slice(5),
    income: Number(day.sales_minor),
    expense: day.visitors,
    incomeDisplay: money(day.sales_minor),
    expenseDisplay: `${day.visitors} ${day.visitors === 1 ? "visitor" : "visitors"}`,
    comparisonLabel: "on the previous day",
  })), [overview.daily, overview.currency, overview.currency_exponent]);
  const peakCandidate = overview.daily.reduce<StorefrontOverview["daily"][number] | undefined>((peak, day) => !peak || BigInt(day.sales_minor) > BigInt(peak.sales_minor) ? day : peak, undefined);
  const peakDay = peakCandidate && BigInt(peakCandidate.sales_minor) > BigInt(0) ? peakCandidate : undefined;
  const peakShare = peakDay && Number(overview.sales_minor) > 0 ? Number(peakDay.sales_minor) / Number(overview.sales_minor) : 0;

  return <Page>
    <PageHeader title="Store overview" description="Your online sales and shoppers at a glance." badge={<StatusPill tone={sf.status === "published" ? "success" : "neutral"}>{sf.status === "published" ? "Live" : sf.status === "draft" ? "Draft" : "Unpublished"}</StatusPill>} actions={<><Link href="/store/information"><AppButton startContent={<PencilSimple size={17} />} label="Store information" /></Link><AppRowActions ariaLabel="Store actions" size="md" className="border border-border bg-surface" items={[
      { key: "publish", label: sf.status === "published" ? "Unpublish store" : "Publish store", icon: <Storefront size={16} />, disabled: publishing, onClick: publish },
      { key: "open", label: "Open store", icon: <ArrowSquareOut size={16} />, disabled: !link, onClick: () => { if (link) window.open(link, "_blank", "noopener,noreferrer"); } },
      { key: "share", label: copied ? "Link copied" : "Share store link", icon: <ShareNetwork size={16} />, disabled: !link, onClick: shareLink },
      { key: "copy", label: "Copy store link", icon: <Copy size={16} />, disabled: !link, onClick: copyLink },
      { key: "design", label: "Templates", icon: <PencilSimple size={16} />, href: "/store/templates" },
      { key: "products", label: "Store products", icon: <Package size={16} />, href: "/store/products" },
      { key: "settings", label: "Advanced store settings", icon: <Storefront size={16} />, href: "/store/settings" },
    ]} /></>} />

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard icon={Coins} tone="accent" label="Online sales" value={money(overview.sales_minor)} hint={`${overview.paid_orders.toLocaleString()} sales · ${period.replace("d", " days")}`} />
      <KpiCard icon={Users} label="Visitors" value={String(overview.visitors)} hint={`${overview.page_views} page views`} />
      <KpiCard icon={TrendUp} label="Conversion rate" value={`${overview.conversion_rate}%`} hint="Paid sales per visitor" />
      <KpiCard icon={Receipt} label="Average sale value" value={money(overview.average_order_value_minor)} hint="Per paid online sale" />
    </div>

    <div className="grid gap-4 lg:grid-cols-12">
      <CashFlowCard className="lg:col-span-8" title="Sales trend" icon={ChartLineUp}
        income={{ label: "Sales", value: money(overview.sales_minor) }}
        expenses={{ label: "Visitors", value: overview.visitors.toLocaleString() }}
        incomeIcon={Coins} expensesIcon={Users}
        data={chartData} independentScales height={210} empty="Sales activity will appear here when shoppers visit your store."
        action={<AppSelect aria-label="Overview period" size="sm" className="w-36" triggerClassName="rounded-full" options={PERIOD_OPTIONS} selectedKey={period} onSelectionChange={(key) => setPeriod(key as OverviewPeriod)} />} />
      <SummaryRowsCard className="lg:col-span-4" tone="ink" title="Sales summary" subtitle={`${period.replace("d", " days")} · online store`} leading={<Coins size={20} />} headline={{
        label: peakDay ? `Peak sales · ${peakDay.date}` : "Peak sales day",
        value: peakDay ? money(peakDay.sales_minor) : money(0),
        aside: peakDay ? <span className="rounded-full bg-primary px-2.5 py-1 text-[11px] font-semibold text-white">{Math.round(peakShare * 100)}% of total</span> : undefined,
      }} rows={[
        { icon: Coins, label: "Total sales", value: money(overview.sales_minor) },
        { icon: Users, label: "Visitors", value: overview.visitors.toLocaleString() },
        { icon: Eye, label: "Page views", value: overview.page_views.toLocaleString() },
        { icon: Package, label: "Product views", value: overview.funnel.product_views.toLocaleString() },
      ]} />
    </div>

    <div className="grid items-start gap-4 xl:grid-cols-12">
      <CardFrame className="xl:col-span-6">
        <CardHeader title="Top products" action={<CardCornerLink href="/store/products" label="Manage products" />} />
        {overview.top_products.length ? <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[420px] text-left text-[12px]"><thead><tr className="border-b border-separator text-muted"><th className="pb-2 pr-3 font-medium">Product</th><th className="pb-2 px-2 text-right font-medium">Views</th><th className="pb-2 pl-2 text-right font-medium">Sales</th></tr></thead><tbody>{overview.top_products.slice(0, 6).map((product) => <tr key={product.product_id} className="border-b border-separator last:border-0"><td className="max-w-[220px] py-2.5 pr-3"><span className="block truncate font-medium">{product.name}</span><span className="mt-1 inline-block"><TypeBadge type={product.kind} /></span></td><td className="px-2 py-2.5 text-right tabular">{product.product_views.toLocaleString()}</td><td className="py-2.5 pl-2 text-right"><span className="block whitespace-nowrap font-semibold tabular">{money(product.sales_minor)}</span><span className="text-muted">{product.orders.toLocaleString()} sales</span></td></tr>)}</tbody></table></div> : <p className="mt-4 text-[13px] text-muted">Product activity will appear here.</p>}
      </CardFrame>
      <SummaryRowsCard className="xl:col-span-3" title="Traffic sources" subtitle="Where shoppers found your store" leading={<Globe size={19} />} rows={overview.referrers.length ? overview.referrers.slice(0, 5).map((referrer) => ({ icon: Globe, label: referrer.referrer_class.replaceAll("_", " "), value: `${referrer.visits.toLocaleString()} visits` })) : [{ icon: Globe, label: "Sources", value: "Activity will appear here" }]} />
      <CardFrame tone="brand" className="justify-between xl:col-span-3 xl:min-h-[230px]">
        <div><p className="text-[13px] font-medium text-white/75">Sales workspace</p><p className="mt-2 text-[22px] leading-tight font-semibold">Online sales live in Sales.</p><p className="mt-3 text-[13px] text-white/75">{overview.paid_orders.toLocaleString()} online sales in this period.</p></div>
        <Link href="/sales?source=online_store" className="mt-6 inline-flex h-10 items-center justify-center rounded-full bg-white px-4 text-[13px] font-semibold text-primary hover:bg-white/90">View online sales</Link>
      </CardFrame>
    </div>
  </Page>;
}

export function StorefrontOverviewPage() {
  return <WorkspaceGate businessOnly>{({ workspaceId }) => <OverviewContent workspaceId={workspaceId} />}</WorkspaceGate>;
}
