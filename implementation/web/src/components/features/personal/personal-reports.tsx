"use client";

import { DownloadSimple } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { endOfMonth, format, startOfMonth, subMonths } from "date-fns";
import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { AppButton } from "@/components/ui/app-button";
import { DashboardCard } from "@/components/ui/dashboard-card";
import { Page, PageHeader, SectionHeader, Segmented, StatusPill } from "@/components/ui/page";
import { ArrowDownLeft, ArrowsLeftRight, ArrowUpRight, PiggyBank } from "@phosphor-icons/react";

import { KpiCard } from "@/components/ui/cards";

import { KpiRow } from "../finance/dashboard-parts";
import { formatDate } from "@/lib/format";
import { formatMinorAmount } from "@/lib/money";
import { personalApi, personalKeys } from "@/lib/personal-finance";

import { WorkspaceGate, type WorkspaceInfo } from "../finance/shared";

const PERIODS = [
  { key: "1", label: "This month" },
  { key: "3", label: "3 months" },
  { key: "6", label: "6 months" },
  { key: "12", label: "12 months" },
] as const;

type Period = (typeof PERIODS)[number]["key"];

function PersonalReportsContent({ workspaceId, currency, isBusiness }: WorkspaceInfo) {
  const [period, setPeriod] = useState<Period>("1");
  const months = Number(period);
  const now = new Date();
  const fromDate = format(startOfMonth(subMonths(now, months - 1)), "yyyy-MM-dd");
  const toDate = format(now, "yyyy-MM-dd");

  const prevEnd = endOfMonth(subMonths(startOfMonth(subMonths(now, months - 1)), 1));
  const prevStart = startOfMonth(subMonths(prevEnd, months - 1));
  const prevFromDate = format(prevStart, "yyyy-MM-dd");
  const prevToDate = format(prevEnd, "yyyy-MM-dd");

  const currentDash = useQuery({
    queryKey: [...personalKeys.dashboard(workspaceId, fromDate, toDate), "report"],
    queryFn: () => personalApi.getDashboard(workspaceId, { from_date: fromDate, to_date: toDate, currency }),
    enabled: !isBusiness,
  });

  const previousDash = useQuery({
    queryKey: [...personalKeys.dashboard(workspaceId, prevFromDate, prevToDate), "report-prev"],
    queryFn: () => personalApi.getDashboard(workspaceId, { from_date: prevFromDate, to_date: prevToDate, currency }),
    enabled: !isBusiness,
  });

  const budgets = useQuery({
    queryKey: personalKeys.budgets(workspaceId),
    queryFn: () => personalApi.listBudgets(workspaceId),
    enabled: !isBusiness,
  });

  const loans = useQuery({
    queryKey: personalKeys.loans(workspaceId),
    queryFn: () => personalApi.listLoans(workspaceId),
    enabled: !isBusiness,
  });

  const investments = useQuery({
    queryKey: personalKeys.investments(workspaceId),
    queryFn: () => personalApi.listInvestments(workspaceId),
    enabled: !isBusiness,
  });

  const assets = useQuery({
    queryKey: personalKeys.assets(workspaceId),
    queryFn: () => personalApi.listAssets(workspaceId),
    enabled: !isBusiness,
  });

  if (isBusiness) {
    return (
      <Page>
        <PageHeader title="Personal Reports" description="Switch to your Personal space to view Personal reports." />
        <Alert status="info" description="Personal reports are strictly separated from Business books." />
      </Page>
    );
  }

  const d = currentDash.data;
  const p = previousDash.data;
  const exp = d?.currency_exponent ?? 2;
  const show = (val?: string) => formatMinorAmount(val ?? "0", d?.currency ?? currency, exp);
  const loading = currentDash.isPending;

  const exportCsv = () => {
    if (!d) return;
    const lines: string[] = [
      `Rekordly Personal Finance Report`,
      `Period,${d.from_date} to ${d.to_date}`,
      `As Of,${d.as_of}`,
      `Currency,${d.currency}`,
      `Basis,"${d.basis_note}"`,
      ``,
      `Section,Metric,Value`,
      `Cash Movement,Came In,"${show(d.cash_inflow_minor)}"`,
      `Cash Movement,Went Out,"${show(d.cash_outflow_minor)}"`,
      `Cash Movement,Net Cash Movement,"${show(d.net_cash_movement_minor)}"`,
      `Income vs Expense,Income,"${show(d.income_minor)}"`,
      `Income vs Expense,Expense,"${show(d.expense_minor)}"`,
      `Income vs Expense,Net Income,"${show(d.net_income_minor)}"`,
      ``,
      `Spending by Category,Category,Amount`,
      ...d.spending_by_category.map((c) => `Category,"${c.category_name}","${show(c.total_minor)}"`),
      ``,
      `Accounts,Name,Balance`,
      ...d.accounts.map((a) => `Account,"${a.name} (${a.account_type})","${formatMinorAmount(a.current_balance_minor, a.currency, a.currency_exponent)}"`),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rekordly-personal-report-${d.from_date}-to-${d.to_date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Page>
      <PageHeader
        title="Personal Reports"
        description="Income vs expense, cash movement, budgets, loans, investments, assets, and period comparison."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Segmented size="sm" aria-label="Report period" options={PERIODS} value={period} onChange={setPeriod} />
            <AppButton
              size="sm"
              variant="secondary"
              startContent={<DownloadSimple size={16} weight="bold" />}
              label="Export CSV"
              isDisabled={!d}
              onPress={exportCsv}
            />
          </div>
        }
      />

      {currentDash.isError ? (
        <Alert status="error" description="Unable to load Personal report figures. Please retry." />
      ) : null}

      {/* 1. Cash movement & 2. Income vs Expense */}
      <div className="space-y-3">
        <SectionHeader
          title="Cash movement vs Income & Expense"
          description={d ? `${formatDate(d.from_date)} to ${formatDate(d.to_date)} · ${d.currency}` : "Selected period"}
        />
        <KpiRow className="lg:grid-cols-3">
          <KpiCard loading={loading} icon={ArrowDownLeft} label="Cash inflow" value={show(d?.cash_inflow_minor)} hint="All money that came in" />
          <KpiCard loading={loading} icon={ArrowUpRight} label="Cash outflow" value={show(d?.cash_outflow_minor)} hint="All money that went out" />
          <KpiCard loading={loading} tone="accent" icon={ArrowsLeftRight} label="Net cash movement" value={show(d?.net_cash_movement_minor)} hint="Inflow minus outflow" />
          <KpiCard loading={loading} icon={ArrowDownLeft} label="Income" value={show(d?.income_minor)} hint="Excludes loans and transfers" />
          <KpiCard loading={loading} icon={ArrowUpRight} label="Expense" value={show(d?.expense_minor)} hint="Excludes loans and transfers" />
          <KpiCard loading={loading} icon={PiggyBank} label="Net income" value={show(d?.net_income_minor)} hint="Income minus expense" />
        </KpiRow>
      </div>

      {/* 3. Period Comparison */}
      <DashboardCard>
        <h3 className="text-sm font-semibold mb-3">
          Period comparison ({fromDate} – {toDate} vs {prevFromDate} – {prevToDate})
        </h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-xs">
          <div className="rounded-2xl border border-border/60 p-3">
            <p className="text-muted">Cash inflow</p>
            <p className="tabular font-semibold mt-1">{show(d?.cash_inflow_minor)}</p>
            <p className="text-muted mt-0.5">Prev: {show(p?.cash_inflow_minor)}</p>
          </div>
          <div className="rounded-2xl border border-border/60 p-3">
            <p className="text-muted">Cash outflow</p>
            <p className="tabular font-semibold mt-1">{show(d?.cash_outflow_minor)}</p>
            <p className="text-muted mt-0.5">Prev: {show(p?.cash_outflow_minor)}</p>
          </div>
          <div className="rounded-2xl border border-border/60 p-3">
            <p className="text-muted">Income</p>
            <p className="tabular font-semibold mt-1">{show(d?.income_minor)}</p>
            <p className="text-muted mt-0.5">Prev: {show(p?.income_minor)}</p>
          </div>
          <div className="rounded-2xl border border-border/60 p-3">
            <p className="text-muted">Expense</p>
            <p className="tabular font-semibold mt-1">{show(d?.expense_minor)}</p>
            <p className="text-muted mt-0.5">Prev: {show(p?.expense_minor)}</p>
          </div>
        </div>
      </DashboardCard>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* 4. Spending by category */}
        <DashboardCard>
          <h3 className="text-sm font-semibold mb-3">Spending by category</h3>
          {d?.spending_by_category.length ? (
            <div className="space-y-2 text-xs">
              {d.spending_by_category.map((c) => (
                <div key={c.category_name} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
                  <span className="font-medium">{c.category_name}</span>
                  <span className="tabular font-semibold">{show(c.total_minor)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted">No lifestyle spending recorded in this period.</p>
          )}
        </DashboardCard>

        {/* 5. Account balances */}
        <DashboardCard>
          <h3 className="text-sm font-semibold mb-3">Account balances</h3>
          {d?.accounts.length ? (
            <div className="space-y-2 text-xs">
              {d.accounts.map((a) => (
                <div key={a.id} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{a.name}</span>
                    <span className="text-muted capitalize">{a.account_type.replace(/_/g, " ")}</span>
                    {!a.is_active ? <StatusPill tone="neutral">Archived</StatusPill> : null}
                  </div>
                  <span className="tabular font-semibold">{formatMinorAmount(a.current_balance_minor, a.currency, a.currency_exponent)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted">No accounts yet.</p>
          )}
        </DashboardCard>

        {/* 6. Budget vs Actual */}
        <DashboardCard>
          <h3 className="text-sm font-semibold mb-3">Budget vs actual</h3>
          {budgets.data?.length ? (
            <div className="space-y-2.5 text-xs">
              {budgets.data.map((b) => (
                <div key={b.budget.id} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
                  <div>
                    <p className="font-medium">{b.budget.name}</p>
                    <p className="text-muted">
                      {formatDate(b.budget.start_date)} – {formatDate(b.budget.end_date)} · {b.usage_percentage_formatted}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="tabular font-semibold">
                      {formatMinorAmount(b.actual_spending_minor, b.budget.currency, b.budget.currency_exponent)} /{" "}
                      {formatMinorAmount(b.budget_amount_minor, b.budget.currency, b.budget.currency_exponent)}
                    </p>
                    <p className="text-muted">
                      Remaining: {formatMinorAmount(b.remaining_minor, b.budget.currency, b.budget.currency_exponent)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted">No budgets created yet.</p>
          )}
        </DashboardCard>

        {/* 7. Loan balances */}
        <DashboardCard>
          <h3 className="text-sm font-semibold mb-3">Loans (borrowed & lent)</h3>
          {loans.data?.length ? (
            <div className="space-y-2 text-xs">
              {loans.data.map((l) => (
                <div key={l.loan.id} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
                  <div>
                    <p className="font-medium">{l.loan.counterparty_name}</p>
                    <p className="text-muted capitalize">
                      {l.loan.direction} · {l.derived_status.replace(/_/g, " ")}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="tabular font-semibold">
                      {formatMinorAmount(l.loan.outstanding_principal_minor, l.loan.currency, l.loan.currency_exponent)}
                    </p>
                    <p className="text-muted">
                      of {formatMinorAmount(l.loan.principal_minor, l.loan.currency, l.loan.currency_exponent)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted">No loans recorded.</p>
          )}
        </DashboardCard>

        {/* 8. Investments */}
        <DashboardCard>
          <h3 className="text-sm font-semibold mb-3">Investments (cost, manual value & income)</h3>
          {investments.data?.length ? (
            <div className="space-y-2 text-xs">
              {investments.data.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
                  <div>
                    <p className="font-medium">{inv.name}</p>
                    <p className="text-muted">
                      Cost: {formatMinorAmount(inv.cost_basis_minor, inv.currency, inv.currency_exponent)} · Income:{" "}
                      {formatMinorAmount(inv.total_income_minor, inv.currency, inv.currency_exponent)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="tabular font-semibold">
                      {inv.latest_manual_value_minor
                        ? formatMinorAmount(inv.latest_manual_value_minor, inv.currency, inv.currency_exponent)
                        : "Not valued"}
                    </p>
                    <p className="text-[11px] text-muted">
                      {inv.latest_valuation_date ? `Manual est. ${formatDate(inv.latest_valuation_date)}` : "Manual estimate"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted">No investments recorded.</p>
          )}
        </DashboardCard>

        {/* 9. Assets */}
        <DashboardCard>
          <h3 className="text-sm font-semibold mb-3">Personal assets (cost, manual value & disposal)</h3>
          {assets.data?.length ? (
            <div className="space-y-2 text-xs">
              {assets.data.map((ast) => (
                <div key={ast.id} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
                  <div>
                    <p className="font-medium">{ast.name}</p>
                    <p className="text-muted capitalize">
                      {ast.status} · Cost: {formatMinorAmount(ast.acquisition_cost_minor, ast.currency, ast.currency_exponent)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="tabular font-semibold">
                      {ast.disposal_proceeds_minor
                        ? `Disposed: ${formatMinorAmount(ast.disposal_proceeds_minor, ast.currency, ast.currency_exponent)}`
                        : ast.latest_manual_value_minor
                          ? formatMinorAmount(ast.latest_manual_value_minor, ast.currency, ast.currency_exponent)
                          : "Not valued"}
                    </p>
                    <p className="text-[11px] text-muted">
                      {ast.latest_valuation_date ? `Manual est. ${formatDate(ast.latest_valuation_date)}` : "Manual estimate"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted">No personal assets recorded.</p>
          )}
        </DashboardCard>
      </div>

      {d ? (
        <p className="text-[11px] text-muted">
          {d.basis_note} Manual valuations are user-entered estimates with as-of dates, not live market prices. As of {formatDate(d.as_of)}.
        </p>
      ) : null}
    </Page>
  );
}

export function PersonalReportsPage() {
  return (
    <WorkspaceGate>
      {(info) => <PersonalReportsContent {...info} />}
    </WorkspaceGate>
  );
}
