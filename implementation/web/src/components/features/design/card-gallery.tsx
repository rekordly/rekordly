"use client";

// Review page for the stat card family. All figures are sample values, labelled as such.

import {
  ArrowDownLeft,
  ArrowUpRight,
  Bank,
  Car,
  ChartLineUp,
  Clock,
  CoinVertical,
  FileText,
  ForkKnife,
  HandCoins,
  House,
  Lightning,
  Plus,
  Receipt,
  ShoppingCart,
  Target,
  TrendDown,
  Users,
  Wallet,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";

import {
  BalanceHeroCard,
  CardCornerLink,
  CashFlowCard,
  MetricDotsCard,
  ChartStatCard,
  KpiCard,
  ProgressListCard,
  RingStatCard,
  SplitBarCard,
  SummaryRowsCard,
} from "@/components/ui/cards";
import { Page, PageHeader, SectionHeader } from "@/components/ui/page";

const naira = (value: number) =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(value);
const compact = (value: number) =>
  `₦${new Intl.NumberFormat("en-NG", { notation: "compact", maximumFractionDigits: 1 }).format(value)}`;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const SALES = [420, 510, 380, 640, 590, 720, 680, 810, 760, 905, 870, 990].map((value) => value * 1000);
const salesSeries = MONTHS.map((label, index) => ({ label, value: SALES[index], display: naira(SALES[index]) }));
const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const weekSeries = [42, 65, 38, 80, 71, 96, 54].map((value, index) => ({ label: WEEK[index], value: value * 1000, display: compact(value * 1000) }));

const EXPENSES = [180, 210, 260, 240, 220, 300, 280, 310, 290, 330, 360, 350].map((value) => value * 1000);
const cashFlowSeries = MONTHS.map((label, index) => ({
  label,
  income: SALES[index],
  expense: EXPENSES[index],
  incomeDisplay: naira(SALES[index]),
  expenseDisplay: naira(EXPENSES[index]),
}));

const noop = () => {};

function PeriodPill({ children, onColour = false }: { children: ReactNode; onColour?: boolean }) {
  return (
    <span
      className={`inline-flex h-8 items-center rounded-full px-3 text-[12px] font-medium ${
        onColour ? "border border-current/30 text-current" : "border border-border text-muted"
      }`}
    >
      {children}
    </span>
  );
}

function Block({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <SectionHeader title={title} description={description} />
      {children}
    </section>
  );
}

export function CardGallery() {
  return (
    <Page>
      <PageHeader title="Card gallery" description="Every stat card, in each tone. All figures are sample values." />

      <Block title="1. KPI tile" description="Top row of every hub: label, one amount, change against the previous period.">
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          <KpiCard icon={ArrowDownLeft} label="Income" value={naira(12_540_000)} delta={{ percent: 8.2 }} />
          <KpiCard icon={ArrowUpRight} label="Expenses" value={naira(5_000_000)} delta={{ percent: -5.3, goodWhen: "down" }} />
          <KpiCard icon={CoinVertical} label="Net profit" value={naira(7_540_000)} delta={{ percent: 12.2 }} trend={[3, 5, 4, 6, 5, 8, 9]} />
          <KpiCard icon={Wallet} label="Cash balance" value={naira(6_750_750)} hint="Across 3 accounts" action={<CardCornerLink href="/accounts" label="Open accounts" />} />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          <KpiCard tone="brand" icon={Receipt} label="Sales this month" value={naira(990_000)} delta={{ percent: 13.8 }} />
          <KpiCard tone="accent" icon={Clock} label="Overdue invoices" value={naira(240_000)} hint="4 invoices past due" />
          <KpiCard tone="ink" icon={Users} label="Customers owing" value="12" hint="₦1.83M outstanding" />
          <KpiCard icon={Wallet} label="Loading state" value="" loading />
        </div>
      </Block>

      <Block title="2. Hero balance" description="One per page at most: the dashboard or accounts headline, with the two most common actions.">
        <div className="grid gap-4 lg:grid-cols-3">
          <BalanceHeroCard
            label="Total balance"
            value="20,670,000"
            unit="NGN"
            delta={{ percent: 12.4, label: "vs last week" }}
            actions={[
              { label: "Money in", icon: ArrowDownLeft, onPress: noop },
              { label: "Money out", icon: ArrowUpRight, onPress: noop },
            ]}
            corner={
              <button type="button" aria-label="Add account" className="grid size-9 place-items-center rounded-full bg-white text-neutral-900">
                <Plus size={16} weight="bold" aria-hidden="true" />
              </button>
            }
          />
          <BalanceHeroCard label="Cash at hand" value="1,250,500" unit="NGN" caption="Moniepoint, GTBank and cash box" actions={[{ label: "Transfer", onPress: noop }]} />
          <BalanceHeroCard label="Loading" value="" loading />
        </div>
      </Block>

      <Block title="3. Ring progress" description="Progress toward a limit or target: budgets, collection, tax readiness, savings goals.">
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          <RingStatCard icon={Target} label="Monthly budget" value={naira(816_756)} progress={0.68} caption="of ₦1,200,000 limit" />
          <RingStatCard icon={FileText} label="Invoices collected" value={naira(1_830_200)} progress={0.86} caption="₦300k still unpaid" />
          <RingStatCard icon={Lightning} label="Tax readiness" value="61%" progress={0.61} status="warning" caption="3 records need a category" />
          <RingStatCard tone="ink" icon={HandCoins} label="Loan repaid" value={naira(500_000)} progress={0.25} caption="₦1.5M remaining" />
        </div>
      </Block>

      <Block title="4. Split bar" description="How one amount divides: income vs spending vs savings, or paid vs unpaid.">
        <div className="grid gap-4 lg:grid-cols-2">
          <SplitBarCard
            icon={ChartLineUp}
            label="Net profit"
            value={naira(7_540_000)}
            delta={{ percent: 12.2 }}
            segments={[
              { label: "Income", weight: 48, display: compact(12_540_000) },
              { label: "Expenses", weight: 28, display: compact(5_000_000) },
              { label: "Kept", weight: 24, display: compact(7_540_000) },
            ]}
          />
          <SplitBarCard
            tone="brand"
            icon={FileText}
            label="Invoices this quarter"
            value={naira(2_130_200)}
            action={<PeriodPill onColour>Quarter</PeriodPill>}
            segments={[
              { label: "Paid", weight: 1_830_200, display: compact(1_830_200) },
              { label: "Partly paid", weight: 180_000, display: compact(180_000) },
              { label: "Unpaid", weight: 120_000, display: compact(120_000) },
            ]}
          />
        </div>
      </Block>

      <Block title="5. Chart card" description="A few figures over a small chart: cash flow, sales trend, daily takings.">
        <div className="grid gap-4 lg:grid-cols-3">
          <ChartStatCard
            className="lg:col-span-2"
            icon={ChartLineUp}
            title="Cash flow"
            action={<PeriodPill>This year</PeriodPill>}
            metrics={[
              { label: "Total sales", value: compact(8_275_000) },
              { label: "Total orders", value: "9,800" },
              { label: "Customers", value: "231" },
            ]}
            data={salesSeries}
          />
          <ChartStatCard
            tone="ink"
            icon={Receipt}
            title="This week's takings"
            variant="columns"
            highlightIndex={5}
            metrics={[{ label: "Total", value: compact(446_000) }]}
            data={weekSeries}
            footer="Best day: Saturday"
          />
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <ChartStatCard tone="brand" title="Sales trend" metrics={[{ label: "Last 12 months", value: compact(8_275_000) }]} data={salesSeries} height={120} />
          <ChartStatCard
            className="lg:col-span-2"
            icon={TrendDown}
            title="Earning overview"
            variant="columns"
            highlightIndex={6}
            action={<PeriodPill>This year</PeriodPill>}
            metrics={[{ label: "Earned", value: naira(9_864_324) }]}
            data={salesSeries}
            height={170}
          />
        </div>
      </Block>

      <Block title="6. Progress list" description="Several items against their own limits: budgets by category, top debtors, spend by supplier.">
        <div className="grid gap-4 lg:grid-cols-2">
          <ProgressListCard
            tone="ink"
            icon={Target}
            title="Budgets by category"
            action={<PeriodPill onColour>November</PeriodPill>}
            items={[
              { key: "food", label: "Food & dining", icon: ForkKnife, progress: 0.72, detail: "₦72k / ₦100k" },
              { key: "rent", label: "Rent", icon: House, progress: 1, detail: "₦350k / ₦350k" },
              { key: "fuel", label: "Fuel & transport", icon: Car, progress: 1.12, detail: "₦56k / ₦50k" },
              { key: "stock", label: "Stock", icon: ShoppingCart, progress: 0.28, detail: "₦140k / ₦500k" },
            ]}
          />
          <ProgressListCard
            icon={Users}
            title="Who owes you most"
            action={<CardCornerLink href="/customers" label="Open customers" />}
            items={[
              { key: "a", label: "Ada Stores", progress: 0.45, detail: "₦450k of ₦1M" },
              { key: "b", label: "Kemi Fabrics", progress: 0.3, detail: "₦300k of ₦1M" },
              { key: "c", label: "Bayo & Sons", progress: 0.15, detail: "₦150k of ₦1M" },
            ]}
          />
        </div>
      </Block>

      <Block title="7. Summary rows" description="Detail pages: a customer, supplier or account with its key figures.">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <SummaryRowsCard
            leading="AS"
            title="Ada Stores"
            subtitle="Customer since March 2026"
            action={<CardCornerLink href="/customers" label="Open customer" />}
            headline={{ label: "Owes you", value: naira(450_000) }}
            rows={[
              { icon: Receipt, label: "Sales this year", value: naira(2_800_000), delta: { percent: 18 } },
              { icon: Clock, label: "Average days to pay", value: "12 days", status: "good" },
              { icon: FileText, label: "Open invoices", value: "3", status: "warning" },
            ]}
            footer={{ from: { label: "Invoiced", value: compact(2_800_000) }, to: { label: "Collected", value: compact(2_350_000) }, note: "84% collected" }}
          />
          <SummaryRowsCard
            tone="ink"
            leading={<Bank size={20} aria-hidden="true" />}
            title="GTBank current"
            subtitle="Business account · NGN"
            headline={{ label: "Balance", value: naira(4_250_000) }}
            rows={[
              { icon: ArrowDownLeft, label: "Money in this month", value: naira(1_900_000) },
              { icon: ArrowUpRight, label: "Money out this month", value: naira(1_120_000) },
              { icon: Clock, label: "Last record", value: "Today" },
            ]}
          />
          <SummaryRowsCard loading title="" rows={[]} />
        </div>
      </Block>

      <Block title="8. Cash flow" description="Income against expenses month by month. Hover a month to compare it with the one before.">
        <CashFlowCard
          income={{ value: compact(8_275_000) }}
          expenses={{ value: compact(3_330_000) }}
          data={cashFlowSeries}
          formatAxis={compact}
          action={<PeriodPill>This year</PeriodPill>}
        />
      </Block>

      <Block title="9. Metric dots" description="One share that should be felt at a glance: paid on time, income kept, budget used.">
        <div className="grid gap-4 md:grid-cols-3 md:items-center">
          <MetricDotsCard label="Paid on time" value="80%" description="of invoices were paid by their due date this quarter." progress={0.8} />
          <MetricDotsCard tone="brand" className="md:py-8" label="Income kept" value="50%" description="of what you earned this month is still in your accounts." progress={0.5} />
          <MetricDotsCard tone="ink" label="Budget used" value="69%" description="of this month's spending limit has been used." progress={0.69} />
        </div>
      </Block>
    </Page>
  );
}
