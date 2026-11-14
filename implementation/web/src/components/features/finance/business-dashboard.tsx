"use client";

// Business dashboard.
// Row 1: cash balance | this period's results (four tiles) | this week's takings.
// Row 2: money to collect and pay + cash by account | recent records.
// Every amount is a server figure formatted from its exact string.

import { ArrowDownLeft, ArrowRight, ArrowUpRight, Check, Clock, CoinVertical, FileText, HandCoins, Receipt, ShoppingCart, X } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { format, startOfMonth, subMonths } from "date-fns";
import Link from "next/link";
import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { BalanceHeroCard, CardFrame, KpiCard, SummaryRowsCard, type Delta } from "@/components/ui/cards";
import { PageHeader } from "@/components/ui/page";
import { financeApi, formatMinorAmount, moneyApi, moneyKeys } from "@/lib/money";
import { useUIStore } from "@/stores/ui-store";
import type { AuthorizedWorkspace } from "@/types/auth";
import type { FinanceSummary } from "@/types/finance";

import {
  CashByAccountCard,
  change,
  compareLabel,
  KpiRow,
  PeriodSelect,
  ratio,
  RecentRecordsTable,
  sumMinor,
  WeekChartCard,
  type DashboardPeriod,
} from "./dashboard-parts";

/* -------------------------------------------------------------------------- */
/* Setup steps                                                                 */
/* -------------------------------------------------------------------------- */

function SetupSteps({ workspace }: { workspace: AuthorizedWorkspace }) {
  const [dismissed, setDismissed] = useState(false);
  const checklist = useQuery({
    queryKey: [...moneyKeys.workspace(workspace.id), "onboarding-checklist"],
    queryFn: () => financeApi.getOnboardingChecklist(workspace.id),
  });
  const data = checklist.data;
  if (!data || data.all_done || dismissed) return null;

  const steps = [
    { done: data.has_account, label: "Add an account", href: "/accounts" },
    { done: data.has_income, label: "Record income", href: "/transactions" },
    { done: data.has_expense, label: "Record an expense", href: "/transactions" },
    { done: data.has_customer, label: "Add a customer", href: "/customers" },
    { done: data.has_invoice, label: "Send an invoice", href: "/invoices" },
  ];
  const doneCount = steps.filter((step) => step.done).length;
  const next = steps.find((step) => !step.done);

  return (
    <CardFrame>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold">Finish setting up {workspace.name}</h2>
          <p className="mt-0.5 text-[13px] text-muted">
            {doneCount} of {steps.length} done. Each step makes your numbers more complete.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {next ? (
            <Link
              href={next.href}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-foreground px-4 text-[13px] font-semibold text-background transition-opacity hover:opacity-90"
            >
              Next: {next.label}
              <ArrowRight size={14} weight="bold" aria-hidden="true" />
            </Link>
          ) : null}
          <button
            type="button"
            aria-label="Hide setup steps"
            onClick={() => setDismissed(true)}
            className="grid size-9 cursor-pointer place-items-center rounded-full text-muted transition-colors hover:bg-surface-secondary hover:text-foreground"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      </div>

      <ol className="mt-5 grid grid-cols-5 gap-1">
        {steps.map((step, index) => (
          <li key={step.label} className="relative flex flex-col items-center text-center">
            {index > 0 ? (
              <span
                aria-hidden="true"
                className={`absolute top-3.5 right-1/2 left-[-50%] h-0.5 ${steps[index - 1].done && step.done ? "bg-primary" : "bg-separator"}`}
              />
            ) : null}
            <Link
              href={step.href}
              aria-label={`${step.label}${step.done ? ", done" : ""}`}
              className={`relative z-10 grid size-7 place-items-center rounded-full border-2 text-[12px] font-bold transition-colors ${
                step.done
                  ? "border-primary bg-primary text-white"
                  : step === next
                    ? "border-foreground bg-surface text-foreground"
                    : "border-border bg-surface text-muted hover:border-foreground"
              }`}
            >
              {step.done ? <Check size={14} weight="bold" aria-hidden="true" /> : index + 1}
            </Link>
            <span className={`mt-2 text-[11px] leading-tight sm:text-[12px] ${step.done ? "text-foreground" : "text-muted"}`}>{step.label}</span>
          </li>
        ))}
      </ol>
    </CardFrame>
  );
}

/* -------------------------------------------------------------------------- */
/* Dashboard                                                                   */
/* -------------------------------------------------------------------------- */

export function BusinessDashboard({
  workspace,
  period,
  onPeriodChange,
}: {
  workspace: AuthorizedWorkspace;
  period: DashboardPeriod;
  onPeriodChange: (period: DashboardPeriod) => void;
}) {
  const openMoneyRecord = useUIStore((state) => state.openMoneyRecord);
  const months = Number(period);
  const fromDate = format(startOfMonth(subMonths(new Date(), months - 1)), "yyyy-MM-dd");
  const summary = useQuery({
    queryKey: [...moneyKeys.workspace(workspace.id), "summary", fromDate],
    queryFn: () => financeApi.summary(workspace.id, { from_date: fromDate, currency: workspace.base_currency }),
  });
  const accounts = useQuery({
    queryKey: moneyKeys.accounts(workspace.id),
    queryFn: () => moneyApi.listAccounts({ workspaceId: workspace.id }),
  });

  const data: FinanceSummary | undefined = summary.data;
  const loading = summary.isPending;
  const currency = data?.currency ?? workspace.base_currency;
  const exponent = data?.currency_exponent ?? 2;
  const show = (value?: string) => formatMinorAmount(value ?? "0", currency, exponent);
  const delta = (current?: string, previous?: string, goodWhen: Delta["goodWhen"] = "up"): Delta | undefined => {
    const percent = change(current, previous);
    return percent === null ? undefined : { percent, label: compareLabel(months), goodWhen };
  };

  const net = Number(data?.net_minor ?? 0);
  const collected = ratio(data?.sales_paid_minor, data?.sales_minor);
  const open = data?.open;
  const owedToYou = open ? sumMinor([open.sales_unpaid_minor, open.invoices_unpaid_minor]) : "0";
  const periodWord = months === 1 ? "this month" : `in ${months} months`;

  return (
    <div className="mx-auto w-full max-w-[1320px] space-y-5">
      <PageHeader
        title="Dashboard"
        description={`How ${workspace.name} is doing ${months === 1 ? "this month" : `over the last ${months} months`}.`}
        inlineActions
        actions={<PeriodSelect value={period} onChange={onPeriodChange} />}
      />

      <SetupSteps workspace={workspace} />

      {summary.isError ? <Alert status="error" description={`Unable to load figures for ${workspace.name}.`} /> : null}

      {/* Row 1: cash | results | this week */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-12">
        <BalanceHeroCard
          className="xl:col-span-4"
          loading={loading}
          label="Cash balance"
          value={show(data?.cash_balance_minor)}
          caption="Across your active accounts, right now"
          actions={[
            { label: "Money in", icon: ArrowDownLeft, onPress: () => openMoneyRecord("money_in") },
            { label: "Money out", icon: ArrowUpRight, onPress: () => openMoneyRecord("money_out") },
          ]}
        />

        <KpiRow className="xl:col-span-5">
          <KpiCard
            loading={loading}
            tone="accent"
            icon={Receipt}
            label="Sales"
            value={show(data?.sales_minor)}
            hint={data ? `${show(data.sales_paid_minor)} collected · ${data.sales_count ?? 0} sales` : undefined}
            href="/sales"
          />
          <KpiCard loading={loading} icon={ArrowDownLeft} label="Income" value={show(data?.income_minor)} delta={delta(data?.income_minor, data?.previous?.income_minor)} hint={`Earned ${periodWord}`} />
          <KpiCard
            loading={loading}
            icon={ArrowUpRight}
            label="Expenses"
            value={show(data?.expense_minor)}
            delta={delta(data?.expense_minor, data?.previous?.expense_minor, "down")}
            hint={`Spent ${periodWord}`}
          />
          <KpiCard
            loading={loading}
            icon={CoinVertical}
            label={net < 0 ? "Net loss" : "Net profit"}
            value={show(data?.net_minor)}
            delta={delta(data?.net_minor, data?.previous?.net_minor)}
            hint="Income minus expenses"
          />
        </KpiRow>

        <WeekChartCard
          className="md:col-span-2 xl:col-span-3"
          title="This week's takings"
          days={data?.last_7_days}
          pick="income_minor"
          currency={currency}
          exponent={exponent}
          loading={loading}
          emptyText="No income recorded in the last 7 days"
        />
      </div>

      {/* Row 2: money to collect and pay + cash by account | recent records */}
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="flex flex-col gap-4">
          <CashByAccountCard accounts={accounts.data} currency={currency} loading={accounts.isPending} />
          <SummaryRowsCard
            tone="ink"
            className="flex-1"
            loading={loading}
            leading={<HandCoins size={20} aria-hidden="true" />}
            title="Money to collect and pay"
            subtitle="Unpaid today, whatever period you view"
            headline={{ label: "Customers owe you", value: show(owedToYou) }}
            rows={[
              { icon: Receipt, label: `Unpaid sales (${open?.sales_unpaid_count ?? 0})`, value: show(open?.sales_unpaid_minor) },
              { icon: FileText, label: `Unpaid invoices (${open?.invoices_unpaid_count ?? 0})`, value: show(open?.invoices_unpaid_minor) },
              {
                icon: Clock,
                label: `Overdue invoices (${open?.invoices_overdue_count ?? 0})`,
                value: show(open?.invoices_overdue_minor),
                status: open && open.invoices_overdue_count > 0 ? "danger" : "good",
              },
              {
                icon: ShoppingCart,
                label: `You owe suppliers (${open?.purchases_unpaid_count ?? 0})`,
                value: show(open?.purchases_unpaid_minor),
                status: open && open.purchases_unpaid_count > 0 ? "warning" : "good",
              },
            ]}
            footer={{
              from: { label: "Sold this period", value: show(data?.sales_minor) },
              to: { label: "Collected", value: show(data?.sales_paid_minor) },
              note: Number(data?.sales_minor ?? 0) > 0 ? `${Math.round(collected * 100)}% collected` : undefined,
            }}
          />
        </div>
        <div className="min-w-0 xl:col-span-2">
          <RecentRecordsTable workspace={workspace} />
        </div>
      </div>
    </div>
  );
}
