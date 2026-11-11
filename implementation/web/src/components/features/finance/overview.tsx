"use client";

import { ArrowDownLeft, ArrowUpRight, ChartLineUp, CheckCircle, Circle, Vault, X } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { format, parse, startOfMonth, subMonths } from "date-fns";
import Link from "next/link";
import { useState } from "react";

import { CategoryPieChart, RevenueChart } from "@/components/charts/charts";
import { Alert } from "@/components/ui/alert";
import { DashboardCard } from "@/components/ui/dashboard-card";
import { Page, PageHeader, SectionHeader, Segmented } from "@/components/ui/page";
import { StatCard } from "@/components/ui/stat-card";
import { formatDate } from "@/lib/format";
import { financeApi, formatMinorAmount, listRecords, moneyKeys } from "@/lib/money";
import { useActiveWorkspace } from "@/stores/workspace-store";
import type { AuthorizedWorkspace } from "@/types/auth";
import type { MoneyTransaction } from "@/types/finance";

import { money, StatusBadge } from "./shared";

const PERIODS = [
  { key: "1", label: "This month" },
  { key: "3", label: "3 months" },
  { key: "6", label: "6 months" },
  { key: "12", label: "12 months" },
] as const;

type Period = (typeof PERIODS)[number]["key"];

const SECTIONS = [
  { key: "charts", label: "Charts" },
  { key: "recent", label: "Recent activity" },
] as const;

function monthLabel(month: string): string {
  return format(parse(month, "yyyy-MM", new Date()), "MMM yy");
}

function WorkspaceOverview({
  workspace,
  months,
  showRecent,
}: {
  workspace: AuthorizedWorkspace;
  months: number;
  showRecent: boolean;
}) {
  const [section, setSection] = useState<"charts" | "recent">("charts");
  const [checklistDismissed, setChecklistDismissed] = useState(false);
  const fromDate = format(startOfMonth(subMonths(new Date(), months - 1)), "yyyy-MM-dd");
  const summary = useQuery({
    queryKey: [...moneyKeys.workspace(workspace.id), "summary", fromDate],
    queryFn: () => financeApi.summary(workspace.id, { from_date: fromDate, currency: workspace.base_currency }),
  });
  const checklist = useQuery({
    queryKey: [...moneyKeys.workspace(workspace.id), "onboarding-checklist"],
    queryFn: () => financeApi.getOnboardingChecklist(workspace.id),
    enabled: showRecent,
  });
  const recent = useQuery({
    queryKey: [...moneyKeys.workspace(workspace.id), "recent"],
    queryFn: () => listRecords<MoneyTransaction>(workspace.id, "transactions", { limit: 5 }),
    enabled: showRecent,
  });

  if (summary.isError) {
    return <Alert status="error" description={`Unable to load figures for ${workspace.name}.`} />;
  }

  const data = summary.data;
  const currency = data?.currency ?? workspace.base_currency;
  const exponent = data?.currency_exponent ?? 2;
  const show = (value?: string) => formatMinorAmount(value ?? "0", currency, exponent);
  const isLoading = summary.isPending;

  const checklistSteps = checklist.data
    ? [
        { done: checklist.data.has_account, label: "Add cash or bank account", href: "/accounts" },
        { done: checklist.data.has_income, label: "Record first income", href: "/transactions" },
        { done: checklist.data.has_expense, label: "Record first expense", href: "/transactions" },
        ...(workspace.kind === "business"
          ? [
              { done: checklist.data.has_customer, label: "Add first customer", href: "/customers" },
              { done: checklist.data.has_invoice, label: "Create first invoice", href: "/invoices" },
            ]
          : []),
      ]
    : [];

  return (
    <section className="space-y-5">
      {showRecent && checklist.data && !checklist.data.all_done && !checklistDismissed ? (
        <DashboardCard>
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-primary">Getting Started Checklist</p>
              <p className="text-xs text-muted mt-0.5">Complete these quick actions to set up {workspace.name}.</p>
            </div>
            <button
              type="button"
              aria-label="Dismiss checklist"
              onClick={() => setChecklistDismissed(true)}
              className="text-muted hover:text-foreground p-1 rounded-lg"
            >
              <X size={16} />
            </button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {checklistSteps.map((step) => (
              <Link
                key={step.label}
                href={step.href}
                className={`flex items-center gap-2 rounded-2xl border px-3 py-2.5 text-xs font-medium transition-colors ${
                  step.done
                    ? "border-primary/30 bg-primary-soft/30 text-foreground"
                    : "border-border bg-background text-muted hover:border-primary/50 hover:text-foreground"
                }`}
              >
                {step.done ? (
                  <CheckCircle size={16} weight="fill" className="text-primary shrink-0" />
                ) : (
                  <Circle size={16} className="text-muted shrink-0" />
                )}
                <span className="truncate">{step.label}</span>
              </Link>
            ))}
          </div>
        </DashboardCard>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard tag="Income" tone="success" gradient compact isLoading={isLoading} title={show(data?.income_minor)} icon={<ArrowDownLeft size={22} />} />
        <StatCard tag="Expenses" tone="danger" gradient compact isLoading={isLoading} title={show(data?.expense_minor)} icon={<ArrowUpRight size={22} />} />
        <StatCard tag="Net" tone="primary" gradient compact isLoading={isLoading} title={show(data?.net_minor)} icon={<ChartLineUp size={22} />} />
        <StatCard tag="Cash balance" tone="secondary" gradient compact isLoading={isLoading} title={show(data?.cash_balance_minor)} description="Across active accounts" icon={<Vault size={22} />} />
      </div>

      {showRecent ? <Segmented aria-label="Dashboard sections" options={SECTIONS} value={section} onChange={setSection} /> : null}

      {section === "charts" ? (
      <div className="grid gap-4 xl:grid-cols-3">
        <DashboardCard className="xl:col-span-2">
          <SectionHeader title="Income and expenses" className="mb-4" />
          {data ? (
            <RevenueChart
              currency={currency}
              exponent={exponent}
              data={data.monthly.map((point) => ({ ...point, label: monthLabel(point.month) }))}
            />
          ) : (
            <div className="h-[280px] animate-pulse rounded-2xl bg-default" />
          )}
        </DashboardCard>
        <DashboardCard>
          <SectionHeader title="Spending by category" className="mb-4" />
          {data ? (
            <CategoryPieChart currency={currency} exponent={exponent} data={data.spending_by_category} />
          ) : (
            <div className="h-[200px] animate-pulse rounded-2xl bg-default" />
          )}
        </DashboardCard>
      </div>
      ) : (
        <DashboardCard className="p-0">
          <SectionHeader
            title="Recent activity"
            className="px-6 pt-5 pb-3"
            actions={
              <Link href="/transactions" className="text-[13px] font-medium text-link hover:underline">
                View all
              </Link>
            }
          />
          {recent.data?.length ? (
            <ul>
              {recent.data.map((transaction) => (
                <li key={transaction.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-separator px-6 py-3">
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-medium text-foreground">{transaction.purpose || "Transaction"}</span>
                    <span className="block text-xs text-muted">{formatDate(transaction.effective_date)}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    <StatusBadge status={transaction.status} />
                    <span className="tabular text-[13px] font-semibold text-foreground">{money(transaction.amount_minor, transaction)}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="border-t border-separator px-6 py-8 text-center text-[13px] text-muted">
              No activity yet. Use Add to record your first transaction.
            </p>
          )}
        </DashboardCard>
      )}
    </section>
  );
}

/** Dashboard and reports. "All spaces" tabs through each owned space; it never totals money in the browser. */
export function FinanceOverview({ title, description, showRecent }: { title: string; description: string; showRecent: boolean }) {
  const { inScope } = useActiveWorkspace();
  const [period, setPeriod] = useState<Period>("6");
  const [shownId, setShownId] = useState("");
  const shown = inScope.find((workspace) => String(workspace.id) === shownId) ?? inScope[0];

  return (
    <Page>
      <PageHeader
        title={title}
        description={description}
        actions={<Segmented size="sm" aria-label="Period" options={PERIODS} value={period} onChange={setPeriod} />}
      />
      {inScope.length > 1 ? (
        <Segmented
          aria-label="Space"
          options={inScope.map((workspace) => ({ key: String(workspace.id), label: workspace.name }))}
          value={String(shown?.id ?? "")}
          onChange={setShownId}
        />
      ) : null}
      {shown ? <WorkspaceOverview key={shown.id} workspace={shown} months={Number(period)} showRecent={showRecent} /> : null}
    </Page>
  );
}
