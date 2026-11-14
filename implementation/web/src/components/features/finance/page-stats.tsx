"use client";

// The stat tiles at the top of each money page. One query to the summary report
// (this month so far) feeds every page, so the figures always agree with the dashboard.

import {
  ArrowDownLeft,
  ArrowUpRight,
  Bank,
  CheckCircle,
  Clock,
  CoinVertical,
  FileText,
  HandCoins,
  Hash,
  Receipt,
  ShoppingCart,
  Wallet,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { format, startOfMonth } from "date-fns";

import { KpiCard, type Delta } from "@/components/ui/cards";
import { financeApi, formatMinorAmount, moneyApi, moneyKeys } from "@/lib/money";

import { change, compareLabel, KpiRow, ratio, sumMinor } from "./dashboard-parts";

export type PageStatsKind = "sales" | "purchases" | "invoices" | "payments" | "records" | "accounts";

export function PageStats({ kind, workspaceId, currency }: { kind: PageStatsKind; workspaceId: number; currency: string }) {
  const fromDate = format(startOfMonth(new Date()), "yyyy-MM-dd");
  const summary = useQuery({
    queryKey: [...moneyKeys.workspace(workspaceId), "summary", fromDate],
    queryFn: () => financeApi.summary(workspaceId, { from_date: fromDate, currency }),
  });
  const accounts = useQuery({
    queryKey: moneyKeys.accounts(workspaceId),
    queryFn: () => moneyApi.listAccounts({ workspaceId }),
    enabled: kind === "accounts",
  });

  const d = summary.data;
  const loading = summary.isPending;
  const exponent = d?.currency_exponent ?? 2;
  const show = (value?: string) => formatMinorAmount(value ?? "0", d?.currency ?? currency, exponent);
  const delta = (current?: string, previous?: string, goodWhen: Delta["goodWhen"] = "up"): Delta | undefined => {
    const percent = change(current, previous);
    return percent === null ? undefined : { percent, label: compareLabel(1), goodWhen };
  };
  const open = d?.open;
  const plural = (count: number | undefined, word: string) => `${count ?? 0} ${word}${count === 1 ? "" : "s"}`;

  if (summary.isError) return null;

  if (kind === "sales") {
    const collected = Math.round(ratio(d?.sales_paid_minor, d?.sales_minor) * 100);
    return (
      <KpiRow className="lg:grid-cols-4">
        <KpiCard loading={loading} tone="accent" icon={Receipt} label="Sales this month" value={show(d?.sales_minor)} hint={plural(d?.sales_count, "sale")} />
        <KpiCard loading={loading} icon={CheckCircle} label="Collected" value={show(d?.sales_paid_minor)} hint={Number(d?.sales_minor ?? 0) > 0 ? `${collected}% of this month's sales` : "Nothing sold yet this month"} />
        <KpiCard loading={loading} icon={HandCoins} label="Unpaid sales" value={show(open?.sales_unpaid_minor)} hint={plural(open?.sales_unpaid_count, "sale")} />
        <KpiCard loading={loading} icon={Hash} label="Number of sales" value={String(d?.sales_count ?? 0)} hint="Recorded this month" />
      </KpiRow>
    );
  }

  if (kind === "purchases") {
    const paid = Math.round(ratio(d?.purchases_paid_minor, d?.purchases_minor) * 100);
    return (
      <KpiRow className="lg:grid-cols-4">
        <KpiCard loading={loading} tone="accent" icon={ShoppingCart} label="Bought this month" value={show(d?.purchases_minor)} hint={plural(d?.purchases_count, "purchase")} />
        <KpiCard loading={loading} icon={CheckCircle} label="Paid" value={show(d?.purchases_paid_minor)} hint={Number(d?.purchases_minor ?? 0) > 0 ? `${paid}% of this month's purchases` : "Nothing bought yet this month"} />
        <KpiCard loading={loading} icon={HandCoins} label="You owe suppliers" value={show(open?.purchases_unpaid_minor)} hint={plural(open?.purchases_unpaid_count, "unpaid purchase")} />
        <KpiCard loading={loading} icon={Hash} label="Number of purchases" value={String(d?.purchases_count ?? 0)} hint="Recorded this month" />
      </KpiRow>
    );
  }

  if (kind === "invoices") {
    const overdue = (open?.invoices_overdue_count ?? 0) > 0;
    return (
      <KpiRow className="lg:grid-cols-4">
        <KpiCard loading={loading} tone="accent" icon={FileText} label="Unpaid invoices" value={show(open?.invoices_unpaid_minor)} hint={plural(open?.invoices_unpaid_count, "invoice")} />
        <KpiCard
          loading={loading}
          tone="plain"
          icon={Clock}
          label="Overdue"
          value={show(open?.invoices_overdue_minor)}
          hint={overdue ? `${plural(open?.invoices_overdue_count, "invoice")} past due date` : "Nothing overdue"}
        />
        <KpiCard
          loading={loading}
          icon={HandCoins}
          label="Customers owe you"
          value={show(open ? sumMinor([open.sales_unpaid_minor, open.invoices_unpaid_minor]) : "0")}
          hint="Unpaid invoices and sales"
        />
        <KpiCard loading={loading} icon={ArrowDownLeft} label="Income this month" value={show(d?.income_minor)} delta={delta(d?.income_minor, d?.previous?.income_minor)} />
      </KpiRow>
    );
  }

  if (kind === "payments") {
    return (
      <KpiRow className="lg:grid-cols-4">
        <KpiCard loading={loading} tone="accent" icon={ArrowDownLeft} label="Money in this month" value={show(d?.income_minor)} delta={delta(d?.income_minor, d?.previous?.income_minor)} />
        <KpiCard loading={loading} icon={ArrowUpRight} label="Money out this month" value={show(d?.expense_minor)} delta={delta(d?.expense_minor, d?.previous?.expense_minor, "down")} />
        <KpiCard
          loading={loading}
          icon={HandCoins}
          label="Still to collect"
          value={show(open ? sumMinor([open.sales_unpaid_minor, open.invoices_unpaid_minor]) : "0")}
          hint="From customers"
        />
        <KpiCard loading={loading} icon={ShoppingCart} label="Still to pay" value={show(open?.purchases_unpaid_minor)} hint="To suppliers" />
      </KpiRow>
    );
  }

  if (kind === "accounts") {
    const active = (accounts.data ?? []).filter((account) => account.is_active);
    const largest = [...active].sort((a, b) => Number(b.current_balance_minor) - Number(a.current_balance_minor))[0];
    return (
      <KpiRow className="lg:grid-cols-4">
        <KpiCard loading={loading} tone="accent" icon={Wallet} label="Cash balance" value={show(d?.cash_balance_minor)} hint="Across active accounts" />
        <KpiCard loading={accounts.isPending} icon={Bank} label="Active accounts" value={String(active.length)} hint="Bank, POS, wallet and cash" />
        <KpiCard
          loading={accounts.isPending}
          icon={CoinVertical}
          label="Largest balance"
          value={largest ? formatMinorAmount(largest.current_balance_minor, largest.currency, largest.currency_exponent) : show("0")}
          hint={largest?.name ?? "No accounts yet"}
        />
        <KpiCard loading={loading} icon={ArrowDownLeft} label="Money in this month" value={show(d?.income_minor)} delta={delta(d?.income_minor, d?.previous?.income_minor)} />
      </KpiRow>
    );
  }

  // records
  return (
    <KpiRow className="lg:grid-cols-4">
      <KpiCard loading={loading} icon={ArrowDownLeft} label="Income this month" value={show(d?.income_minor)} delta={delta(d?.income_minor, d?.previous?.income_minor)} />
      <KpiCard loading={loading} icon={ArrowUpRight} label="Expenses this month" value={show(d?.expense_minor)} delta={delta(d?.expense_minor, d?.previous?.expense_minor, "down")} />
      <KpiCard loading={loading} icon={CoinVertical} label={Number(d?.net_minor ?? 0) < 0 ? "Net loss" : "Net profit"} value={show(d?.net_minor)} delta={delta(d?.net_minor, d?.previous?.net_minor)} />
      <KpiCard loading={loading} tone="accent" icon={Wallet} label="Cash balance" value={show(d?.cash_balance_minor)} hint="Across active accounts" />
    </KpiRow>
  );
}
