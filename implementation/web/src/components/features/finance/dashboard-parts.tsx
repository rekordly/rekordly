"use client";

// Pieces shared by the business and personal dashboards.

import { ArrowDownLeft, ArrowRight, ArrowsLeftRight, ArrowUpRight, Bank, ChartLineUp } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import Link from "next/link";
import { Children, useState, type ReactNode } from "react";

import { AppSelect } from "@/components/ui/app-select";
import { CardCornerLink, CardFrame, CardHeader, CardSkeleton, ChartStatCard, SplitBarCard, type CardTone } from "@/components/ui/cards";
import { DataView } from "@/components/ui/data-view";
import { formatDate } from "@/lib/format";
import { formatMinorAmount, listRecords, moneyKeys } from "@/lib/money";
import type { AuthorizedWorkspace } from "@/types/auth";
import type { MoneyAccount, MoneyTransaction } from "@/types/finance";

import { StatusBadge } from "./shared";

/* -------------------------------------------------------------------------- */
/* Period                                                                      */
/* -------------------------------------------------------------------------- */

export const DASHBOARD_PERIODS = [
  { key: "1", label: "This month" },
  { key: "3", label: "Last 3 months" },
  { key: "6", label: "Last 6 months" },
  { key: "12", label: "Last 12 months" },
] as const;

export type DashboardPeriod = (typeof DASHBOARD_PERIODS)[number]["key"];

export function PeriodSelect({ value, onChange }: { value: DashboardPeriod; onChange: (value: DashboardPeriod) => void }) {
  return (
    <AppSelect
      aria-label="Period"
      size="sm"
      className="w-40"
      options={DASHBOARD_PERIODS.map((option) => ({ key: option.key, label: option.label }))}
      selectedKey={value}
      onSelectionChange={(key) => onChange(String(key) as DashboardPeriod)}
    />
  );
}

export function compareLabel(months: number) {
  return months === 1 ? "vs same days last month" : `vs previous ${months} months`;
}

/* -------------------------------------------------------------------------- */
/* Number helpers. Ratios only position marks; amounts stay exact strings.     */
/* -------------------------------------------------------------------------- */

/** Percentage change, or null when there is no earlier figure to compare with. */
export function change(current?: string, previous?: string): number | null {
  if (current === undefined || previous === undefined) return null;
  const now = Number(current);
  const before = Number(previous);
  if (!Number.isFinite(now) || !Number.isFinite(before) || before === 0) return null;
  return ((now - before) / Math.abs(before)) * 100;
}

export function ratio(part?: string, whole?: string): number {
  const top = Number(part ?? 0);
  const bottom = Number(whole ?? 0);
  if (!Number.isFinite(top) || !Number.isFinite(bottom) || bottom <= 0) return 0;
  return top / bottom;
}

export function sumMinor(values: (string | number)[]): string {
  return String(values.reduce<bigint>((total, value) => total + BigInt(value), BigInt(0)));
}

/* -------------------------------------------------------------------------- */
/* KPI row: a 2×2 grid, or a sideways-scrolling strip on phones                 */
/* -------------------------------------------------------------------------- */

export function KpiRow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 pb-1 scrollbar-none sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0 ${className}`}
    >
      {Children.map(children, (child) => (child ? <div className="w-[72%] shrink-0 snap-start sm:w-auto [&>*]:h-full">{child}</div> : null))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Cash by account                                                             */
/* -------------------------------------------------------------------------- */

export function CashByAccountCard({
  accounts,
  currency,
  loading,
  className,
}: {
  accounts?: MoneyAccount[];
  currency: string;
  loading?: boolean;
  className?: string;
}) {
  if (loading) return <CardSkeleton className={className} lines={3} />;
  const active = (accounts ?? [])
    .filter((account) => account.is_active && account.currency === currency)
    .sort((a, b) => Number(b.current_balance_minor) - Number(a.current_balance_minor));

  if (active.length === 0) {
    return (
      <CardFrame className={className}>
        <CardHeader icon={Bank} title="Cash by account" />
        <p className="mt-3 text-[13px] text-muted">Add your bank, POS or cash box to see where your money sits.</p>
        <Link href="/accounts" className="mt-3 inline-flex h-9 w-fit items-center rounded-full bg-foreground px-4 text-[13px] font-semibold text-background">
          Add account
        </Link>
      </CardFrame>
    );
  }

  const shown = active.slice(0, 3);
  const rest = active.slice(3);
  const exponent = active[0].currency_exponent;
  const segments = [
    ...shown.map((account) => ({
      label: account.name,
      weight: Math.max(0, Number(account.current_balance_minor)),
      display: formatMinorAmount(account.current_balance_minor, account.currency, account.currency_exponent),
    })),
    ...(rest.length
      ? [
          {
            label: `${rest.length} more`,
            weight: rest.reduce((sum, account) => sum + Math.max(0, Number(account.current_balance_minor)), 0),
            display: formatMinorAmount(sumMinor(rest.map((account) => account.current_balance_minor)), currency, exponent),
          },
        ]
      : []),
  ];
  return <SplitBarCard className={className} icon={Bank} label="Cash by account" segments={segments} action={<CardCornerLink href="/accounts" label="Open accounts" />} />;
}

/* -------------------------------------------------------------------------- */
/* Seven-day column chart                                                      */
/* -------------------------------------------------------------------------- */

export function WeekChartCard({
  title,
  days,
  pick,
  currency,
  exponent,
  loading,
  tone = "ink",
  emptyText,
  className,
}: {
  title: string;
  days?: { date: string; income_minor: string; expense_minor: string }[];
  pick: "income_minor" | "expense_minor";
  currency: string;
  exponent: number;
  loading?: boolean;
  tone?: CardTone;
  emptyText: string;
  className?: string;
}) {
  const week = (days ?? []).map((day) => ({
    label: format(parseISO(day.date), "EEE"),
    value: Number(day[pick]),
    display: formatMinorAmount(day[pick], currency, exponent),
  }));
  const total = formatMinorAmount(sumMinor((days ?? []).map((day) => day[pick])), currency, exponent);
  const best = week.reduce<(typeof week)[number] | null>((top, day) => (day.value > (top?.value ?? 0) ? day : top), null);

  return (
    <ChartStatCard
      className={className}
      loading={loading}
      tone={tone}
      icon={ChartLineUp}
      title={title}
      variant="columns"
      highlightIndex={best ? week.indexOf(best) : week.length - 1}
      metrics={[{ label: "Last 7 days", value: total }]}
      data={week}
      height="fill"
      footer={best ? `Highest: ${best.label}, ${best.display}` : emptyText}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Recent records table                                                        */
/* -------------------------------------------------------------------------- */

const DIRECTION = {
  money_in: { icon: ArrowDownLeft, tile: "bg-primary-soft text-primary-soft-foreground", sign: "+", label: "Money in" },
  money_out: { icon: ArrowUpRight, tile: "bg-danger/10 text-danger", sign: "−", label: "Money out" },
  transfer: { icon: ArrowsLeftRight, tile: "bg-surface-secondary text-foreground", sign: "", label: "Transfer" },
} as const;

const DIRECTION_FILTERS = [
  { key: "all", label: "All records" },
  { key: "money_in", label: "Money in" },
  { key: "money_out", label: "Money out" },
  { key: "transfer", label: "Transfers" },
];

function humanise(value: string) {
  const text = value.replace(/_/g, " ").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

function SignedAmount({ record }: { record: MoneyTransaction }) {
  const look = DIRECTION[record.direction];
  const crossed = record.status === "voided" || record.status === "reversed";
  return (
    <span className={`font-semibold tabular ${crossed ? "text-muted line-through" : record.direction === "money_in" ? "text-primary" : "text-foreground"}`}>
      {look.sign}
      {formatMinorAmount(record.amount_minor, record.currency, record.currency_exponent)}
    </span>
  );
}

function RecordTitle({ record }: { record: MoneyTransaction }) {
  const look = DIRECTION[record.direction];
  const RecordIcon = look.icon;
  return (
    <span className="flex min-w-0 items-center gap-3">
      <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${look.tile}`}>
        <RecordIcon size={15} weight="bold" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block max-w-[220px] truncate font-semibold text-foreground">{humanise(record.purpose) || "Record"}</span>
        <span className="block max-w-[220px] truncate text-[12px] text-muted">{record.counterparty_name || look.label}</span>
      </span>
    </span>
  );
}

export function RecentRecordsTable({ workspace, limit = 8 }: { workspace: AuthorizedWorkspace; limit?: number }) {
  const [direction, setDirection] = useState("all");
  const recent = useQuery({
    queryKey: [...moneyKeys.workspace(workspace.id), "recent", limit],
    queryFn: () => listRecords<MoneyTransaction>(workspace.id, "transactions", { limit }),
  });
  const rows = (recent.data ?? []).filter((record) => direction === "all" || record.direction === direction);

  return (
    <DataView<MoneyTransaction>
      embedded
      title="Recent records"
      heading="Recent records"
      rows={rows}
      rowKey={(record) => record.id}
      isLoading={recent.isPending}
      isError={recent.isError}
      searchPlaceholder="Search records"
      getSearchText={(record) => `${record.purpose} ${record.counterparty_name ?? ""} ${record.reference ?? ""}`}
      filters={
        <AppSelect
          aria-label="Filter by type"
          size="sm"
          className="w-36"
          options={DIRECTION_FILTERS}
          selectedKey={direction}
          onSelectionChange={(key) => setDirection(String(key))}
        />
      }
      toolbarActions={
        <Link
          href="/transactions"
          className="inline-flex h-9 items-center gap-1 rounded-lg border border-border px-3 text-[13px] font-semibold hover:bg-surface-secondary"
        >
          View all
          <ArrowRight size={13} weight="bold" aria-hidden="true" />
        </Link>
      }
      empty={<p className="px-5 py-10 text-center text-[13px] text-muted">No records yet. Use “New record” in the sidebar to add your first one.</p>}
      columns={[
        { key: "record", label: "Record", render: (record) => <RecordTitle record={record} />, sortValue: (record) => record.purpose },
        { key: "ref", label: "Reference", render: (record) => <span className="text-muted">{record.reference || `#${record.id}`}</span> },
        { key: "amount", label: "Amount", align: "right", render: (record) => <SignedAmount record={record} />, sortValue: (record) => Number(record.amount_minor) },
        { key: "status", label: "Status", render: (record) => <StatusBadge status={record.status} /> },
        { key: "date", label: "Date", render: (record) => formatDate(record.effective_date), sortValue: (record) => record.effective_date },
      ]}
      renderCard={(record) => (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4 text-[13px]">
          <RecordTitle record={record} />
          <span className="shrink-0 text-right">
            <SignedAmount record={record} />
            <span className="block text-[12px] text-muted">{formatDate(record.effective_date)}</span>
          </span>
        </div>
      )}
    />
  );
}
