"use client";

// Personal home.
// Row 1: cash balance | this week's spending | four tiles (saved first).
// Row 2: budgets + where your money went | recent records.
// Row 3: cash flow (income vs expenses) | cash by account + loans due soon.

import { ArrowDownLeft, ArrowsLeftRight, ArrowUpRight, ChartLineUp, HandCoins, PiggyBank, Tag, Target, WarningCircle } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { format, parse, startOfMonth, subMonths } from "date-fns";
import Link from "next/link";

import { Alert } from "@/components/ui/alert";
import { BalanceHeroCard, CardFrame, CardHeader, CardSkeleton, CashFlowCard, KpiCard, ProgressListCard } from "@/components/ui/cards";
import { PageHeader, StatusPill } from "@/components/ui/page";
import { formatDate } from "@/lib/format";
import { financeApi, formatMinorAmount, moneyKeys } from "@/lib/money";
import { personalApi, personalKeys } from "@/lib/personal-finance";
import { useAuthStore } from "@/stores/auth-store";
import { useUIStore } from "@/stores/ui-store";
import type { AuthorizedWorkspace } from "@/types/auth";

import { CashByAccountCard, KpiRow, PeriodSelect, ratio, RecentRecordsTable, WeekChartCard, type DashboardPeriod } from "../finance/dashboard-parts";

function greeting() {
  const hour = new Date().getHours();
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

export function PersonalDashboard({
  workspace,
  period,
  onPeriodChange,
}: {
  workspace: AuthorizedWorkspace;
  period: DashboardPeriod;
  onPeriodChange: (period: DashboardPeriod) => void;
}) {
  const openMoneyRecord = useUIStore((state) => state.openMoneyRecord);
  const firstName = useAuthStore((state) => state.user?.display_name?.trim().split(/\s+/)[0]);
  const months = Number(period);
  const fromDate = format(startOfMonth(subMonths(new Date(), months - 1)), "yyyy-MM-dd");
  const toDate = format(new Date(), "yyyy-MM-dd");
  const trendMonths = Math.max(months, 6);
  const trendFrom = format(startOfMonth(subMonths(new Date(), trendMonths - 1)), "yyyy-MM-dd");

  const dash = useQuery({
    queryKey: personalKeys.dashboard(workspace.id, fromDate, toDate),
    queryFn: () => personalApi.getDashboard(workspace.id, { from_date: fromDate, to_date: toDate, currency: workspace.base_currency }),
  });
  // Monthly trend and the seven-day series come from the shared summary report.
  const trend = useQuery({
    queryKey: [...moneyKeys.workspace(workspace.id), "summary", trendFrom],
    queryFn: () => financeApi.summary(workspace.id, { from_date: trendFrom, currency: workspace.base_currency }),
  });

  const d = dash.data;
  const loading = dash.isPending;
  const currency = d?.currency ?? workspace.base_currency;
  const exponent = d?.currency_exponent ?? 2;
  const show = (value?: string) => formatMinorAmount(value ?? "0", currency, exponent);
  const periodWord = months === 1 ? "this month" : `in ${months} months`;

  const saved = Number(d?.net_income_minor ?? 0);
  const hasIncome = Number(d?.income_minor ?? 0) > 0;
  const savingsRate = ratio(d?.net_income_minor, d?.income_minor);
  const categories = d?.spending_by_category ?? [];
  const categoryTotal = categories.reduce((sum, category) => sum + Number(category.total_minor), 0) || 1;

  return (
    <div className="mx-auto w-full max-w-[1320px] space-y-5">
      <PageHeader
        title={firstName ? `${greeting()}, ${firstName}` : "Home"}
        description={`Here is your money ${months === 1 ? "this month" : `over the last ${months} months`}.`}
        inlineActions
        actions={<PeriodSelect value={period} onChange={onPeriodChange} />}
      />

      {dash.isError ? <Alert status="error" description={`Unable to load ${workspace.name}.`} /> : null}
      {d && d.needs_review_count > 0 ? (
        <Alert
          status="warning"
          description={`${d.needs_review_count} record${d.needs_review_count === 1 ? "" : "s"} need a category or are still drafts. Drafts do not count in these totals.`}
        />
      ) : null}

      {/* Row 1: cash | this week | four tiles */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-12">
        <BalanceHeroCard
          className="xl:col-span-4"
          loading={loading}
          label="Cash balance"
          value={show(d?.total_cash_balance_minor)}
          caption="Across your accounts, right now"
          actions={[
            { label: "Money in", icon: ArrowDownLeft, onPress: () => openMoneyRecord("money_in") },
            { label: "Money out", icon: ArrowUpRight, onPress: () => openMoneyRecord("money_out") },
          ]}
        />

        <WeekChartCard
          className="xl:col-span-3"
          title="This week's spending"
          days={trend.data?.last_7_days}
          pick="expense_minor"
          currency={currency}
          exponent={exponent}
          loading={trend.isPending}
          emptyText="No spending recorded in the last 7 days"
        />

        <KpiRow className="md:col-span-2 xl:col-span-5">
          <KpiCard
            loading={loading}
            tone="accent"
            icon={PiggyBank}
            label={saved < 0 ? "Overspent" : "Saved"}
            value={show(d?.net_income_minor)}
            hint={hasIncome ? `${Math.round(savingsRate * 100)}% of your income` : "Income minus spending"}
          />
          <KpiCard loading={loading} icon={ArrowDownLeft} label="Income" value={show(d?.income_minor)} hint={`Earned ${periodWord}`} />
          <KpiCard loading={loading} icon={ArrowUpRight} label="Spending" value={show(d?.expense_minor)} hint={`Spent ${periodWord}`} />
          <KpiCard
            loading={loading}
            icon={ArrowsLeftRight}
            label="Net cash movement"
            value={show(d?.net_cash_movement_minor)}
            hint={d ? `${show(d.cash_inflow_minor)} in · ${show(d.cash_outflow_minor)} out` : undefined}
          />
        </KpiRow>
      </div>

      {/* Row 2: budgets + where money went | recent records */}
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="flex flex-col gap-4">
          <ProgressListCard
            loading={loading}
            icon={Target}
            title="Budgets"
            action={<Link href="/budgets" className="text-[13px] font-semibold hover:underline">All</Link>}
            empty="No active budgets. Set a monthly limit to see how close you are."
            items={(d?.budgets ?? []).slice(0, 3).map((budget) => ({
              key: String(budget.budget.id),
              label: budget.budget.name,
              progress: budget.usage_basis_points / 10_000,
              detail: `${show(budget.actual_spending_minor)} / ${show(budget.budget_amount_minor)}`,
            }))}
          />
          <ProgressListCard
            className="flex-1"
            loading={loading}
            icon={Tag}
            title="Where your money went"
            meaning="share"
            action={<Link href="/reports" className="text-[13px] font-semibold hover:underline">Reports</Link>}
            empty="Spending by category shows here once you record expenses."
            items={categories.slice(0, 5).map((category) => ({
              key: category.category_name,
              label: category.category_name,
              progress: Number(category.total_minor) / categoryTotal,
              detail: show(category.total_minor),
            }))}
          />
        </div>
        <div className="min-w-0 xl:col-span-2">
          <RecentRecordsTable workspace={workspace} />
        </div>
      </div>

      {/* Row 3: six-month trend | accounts + loans */}
      <div className="grid gap-4 xl:grid-cols-3">
        <CashFlowCard
          className="xl:col-span-2"
          loading={trend.isPending}
          icon={ChartLineUp}
          title="Cash flow"
          action={<span className="text-[12px] text-muted">Last {trendMonths} months</span>}
          income={{ value: show(trend.data?.income_minor) }}
          expenses={{ value: show(trend.data?.expense_minor) }}
          formatAxis={(value) => new Intl.NumberFormat("en-NG", { notation: "compact", maximumFractionDigits: 1 }).format(value / 10 ** exponent)}
          data={(trend.data?.monthly ?? []).map((point) => ({
            label: format(parse(point.month, "yyyy-MM", new Date()), "MMM"),
            income: Number(point.income_minor),
            expense: Number(point.expense_minor),
            incomeDisplay: show(point.income_minor),
            expenseDisplay: show(point.expense_minor),
          }))}
        />
        <div className="flex flex-col gap-4">
          <CashByAccountCard accounts={d?.accounts} currency={currency} loading={loading} />
          {loading ? (
            <CardSkeleton lines={4} />
          ) : (
            <CardFrame tone="ink" className="flex-1">
              <CardHeader
                icon={HandCoins}
                title="Loans due soon"
                tone="ink"
                action={<Link href="/loans" className="text-[13px] font-semibold hover:underline">All loans</Link>}
              />
              {d?.upcoming_loans.length ? (
                <ul className="mt-4 space-y-2">
                  {d.upcoming_loans.slice(0, 4).map((item) => (
                    <li key={item.loan.id} className="flex items-center justify-between gap-3 rounded-xl bg-ink-foreground/5 px-3 py-2.5">
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-semibold">{item.loan.counterparty_name}</span>
                        <span className="block text-[12px] text-ink-muted">{item.loan.due_date ? `Due ${formatDate(item.loan.due_date)}` : "No due date"}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="text-[13px] font-bold tabular">
                          {formatMinorAmount(item.loan.outstanding_principal_minor, item.loan.currency, item.loan.currency_exponent)}
                        </span>
                        <StatusPill tone={item.derived_status === "overdue" ? "danger" : "warning"}>{item.derived_status}</StatusPill>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 text-[13px] text-ink-muted">Nothing due in the next 14 days.</p>
              )}
            </CardFrame>
          )}
        </div>
      </div>

      {d ? (
        <p className="flex items-center gap-1.5 text-[11px] text-muted">
          <WarningCircle className="size-3.5 shrink-0" aria-hidden="true" />
          {d.basis_note} As of {formatDate(d.as_of)}.
        </p>
      ) : null}
    </div>
  );
}
