"use client";

import { ArrowDownLeft, ArrowUpRight, ChartLineUp, HandCoins, Vault, WarningCircle } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { Alert } from "@/components/ui/alert";
import { DashboardCard } from "@/components/ui/dashboard-card";
import { SectionHeader, StatusPill } from "@/components/ui/page";
import { StatCard } from "@/components/ui/stat-card";
import { formatDate } from "@/lib/format";
import { formatMinorAmount } from "@/lib/money";
import { personalApi, personalKeys } from "@/lib/personal-finance";
import type { AuthorizedWorkspace } from "@/types/auth";

export function PersonalHome({ workspace, fromDate, toDate }: { workspace: AuthorizedWorkspace; fromDate?: string; toDate?: string }) {
  const dash = useQuery({
    queryKey: personalKeys.dashboard(workspace.id, fromDate, toDate),
    queryFn: () => personalApi.getDashboard(workspace.id, { from_date: fromDate, to_date: toDate, currency: workspace.base_currency }),
  });

  if (dash.isError) {
    return <Alert status="error" description={`Unable to load Personal Home for ${workspace.name}.`} />;
  }

  const d = dash.data;
  const currency = d?.currency ?? workspace.base_currency;
  const exp = d?.currency_exponent ?? 2;
  const show = (val?: string) => formatMinorAmount(val ?? "0", currency, exp);
  const loading = dash.isPending;

  return (
    <section className="space-y-6">
      {/* Cash Flow Summary */}
      <div className="space-y-3">
        <SectionHeader
          title="Cash movement"
          description={d ? `${formatDate(d.from_date)} to ${formatDate(d.to_date)} · excludes own-account transfers` : "Selected period"}
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard tag="Came in" title={show(d?.cash_inflow_minor)} tone="success" icon={<ArrowDownLeft weight="duotone" className="size-4" />} isLoading={loading} />
          <StatCard tag="Went out" title={show(d?.cash_outflow_minor)} tone="warning" icon={<ArrowUpRight weight="duotone" className="size-4" />} isLoading={loading} />
          <StatCard tag="Net cash movement" title={show(d?.net_cash_movement_minor)} icon={<ChartLineUp weight="duotone" className="size-4" />} isLoading={loading} />
          <StatCard tag="Current account balances" title={show(d?.total_cash_balance_minor)} icon={<Vault weight="duotone" className="size-4" />} isLoading={loading} />
        </div>
      </div>

      {/* Income vs Expense (separate from cash movement) */}
      <div className="space-y-3">
        <SectionHeader
          title="Income vs Expense"
          description="Excludes borrowed/lent principal, loan repayments, transfers, investment purchases, and asset acquisitions."
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard tag="Income" title={show(d?.income_minor)} tone="success" isLoading={loading} />
          <StatCard tag="Expense" title={show(d?.expense_minor)} tone="warning" isLoading={loading} />
          <StatCard tag="Net income" title={show(d?.net_income_minor)} isLoading={loading} />
        </div>
      </div>

      {d && d.needs_review_count > 0 ? (
        <Alert
          status="warning"
          description={`${d.needs_review_count} unclassified or draft record(s) need review. Drafts do not affect posted totals.`}
        />
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Accounts */}
        <DashboardCard>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Accounts</h3>
            <Link href="/accounts" className="text-xs font-medium text-primary hover:underline">Manage</Link>
          </div>
          {d?.accounts.length ? (
            <div className="space-y-2">
              {d.accounts.slice(0, 6).map((acc) => (
                <div key={acc.id} className="flex items-center justify-between text-xs py-1.5 border-b border-border/50 last:border-0">
                  <div>
                    <span className="font-medium text-foreground">{acc.name}</span>
                    <span className="ml-2 text-muted capitalize">{acc.account_type.replace(/_/g, " ")}</span>
                  </div>
                  <span className="tabular font-semibold">{formatMinorAmount(acc.current_balance_minor, acc.currency, acc.currency_exponent)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted">No accounts yet. Add a cash, bank, or mobile wallet account.</p>
          )}
        </DashboardCard>

        {/* Spending by Category */}
        <DashboardCard>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Spending by category</h3>
            <Link href="/reports" className="text-xs font-medium text-primary hover:underline">Reports</Link>
          </div>
          {d?.spending_by_category.length ? (
            <div className="space-y-2">
              {d.spending_by_category.slice(0, 6).map((cat) => (
                <div key={cat.category_name} className="flex items-center justify-between text-xs py-1.5 border-b border-border/50 last:border-0">
                  <span className="font-medium text-foreground">{cat.category_name}</span>
                  <span className="tabular font-semibold">{show(cat.total_minor)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted">No posted lifestyle expenses in this period.</p>
          )}
        </DashboardCard>

        {/* Budget Progress */}
        <DashboardCard>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Budget progress</h3>
            <Link href="/budgets" className="text-xs font-medium text-primary hover:underline">All budgets</Link>
          </div>
          {d?.budgets.length ? (
            <div className="space-y-3">
              {d.budgets.slice(0, 4).map((b) => (
                <div key={b.budget.id} className="space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{b.budget.name}</span>
                    <span className="tabular text-muted">
                      {show(b.actual_spending_minor)} / {show(b.budget_amount_minor)} ({b.usage_percentage_formatted})
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-default overflow-hidden">
                    <div
                      className={`h-full rounded-full ${b.is_over_budget ? "bg-danger" : "bg-primary"}`}
                      style={{ width: `${Math.min(b.usage_basis_points / 100, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted">No active budgets. Create a monthly or category budget to track spending.</p>
          )}
        </DashboardCard>

        {/* Upcoming Loan Due Dates */}
        <DashboardCard>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Upcoming loan due dates</h3>
            <Link href="/loans" className="text-xs font-medium text-primary hover:underline">Loans</Link>
          </div>
          {d?.upcoming_loans.length ? (
            <div className="space-y-2">
              {d.upcoming_loans.map((l) => (
                <div key={l.loan.id} className="flex items-center justify-between text-xs py-1.5 border-b border-border/50 last:border-0">
                  <div className="flex items-center gap-2">
                    <HandCoins weight="duotone" className="size-4 text-muted" />
                    <div>
                      <p className="font-medium">{l.loan.counterparty_name}</p>
                      <p className="text-[11px] text-muted">{l.loan.due_date ? `Due ${formatDate(l.loan.due_date)}` : ""}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="tabular font-semibold">{formatMinorAmount(l.loan.outstanding_principal_minor, l.loan.currency, l.loan.currency_exponent)}</span>
                    <StatusPill tone={l.derived_status === "overdue" ? "danger" : "warning"}>{l.derived_status}</StatusPill>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted">No upcoming or overdue loans in the next 14 days.</p>
          )}
        </DashboardCard>
      </div>

      {/* Recent Activity */}
      <DashboardCard>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Recent activity</h3>
          <Link href="/transactions" className="text-xs font-medium text-primary hover:underline">View all</Link>
        </div>
        {d?.recent_activity.length ? (
          <div className="space-y-2">
            {d.recent_activity.map((item) => (
              <div key={item.id} className="flex items-center justify-between text-xs py-1.5 border-b border-border/50 last:border-0">
                <div>
                  <p className="font-medium">{item.category_name ?? item.purpose.replace(/_/g, " ")}</p>
                  <p className="text-muted">
                    {formatDate(item.effective_date)} · {item.account_name ?? "Account"}
                    {item.counterparty_name ? ` · ${item.counterparty_name}` : ""}
                  </p>
                </div>
                <span className="tabular font-semibold">{formatMinorAmount(item.amount_minor, item.currency, item.currency_exponent)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted">No recent posted activity.</p>
        )}
      </DashboardCard>

      {d ? (
        <p className="flex items-center gap-1.5 text-[11px] text-muted">
          <WarningCircle className="size-3.5 shrink-0" />
          {d.basis_note} As of {formatDate(d.as_of)}.
        </p>
      ) : null}
    </section>
  );
}

export function AllOwnerSummaryView({
  anchorWorkspaceId,
  fromDate,
  toDate,
}: {
  anchorWorkspaceId: number;
  fromDate?: string;
  toDate?: string;
}) {
  const summary = useQuery({
    queryKey: personalKeys.allSummary(fromDate, toDate),
    queryFn: () => personalApi.getAllSummary(anchorWorkspaceId, { from_date: fromDate, to_date: toDate }),
    enabled: anchorWorkspaceId > 0,
  });

  if (summary.isError) {
    return <Alert status="error" description="Unable to load combined owner summary." />;
  }

  const data = summary.data;

  return (
    <section className="space-y-6">
      <Alert
        status="info"
        description="Read-only owner projection across your Personal and owned Business workspaces. Invited Business workspaces are excluded. Select a specific Personal or Business workspace to post records."
      />

      {data?.combined_by_currency.map((curr) => (
        <div key={curr.currency} className="space-y-3">
          <SectionHeader
            title={`Combined ${curr.currency} cash position`}
            description={`Eliminated ${formatMinorAmount(curr.eliminated_transfer_minor, curr.currency, curr.currency_exponent)} in mirrored owner transfers`}
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              tag="Combined cash balance"
              title={formatMinorAmount(curr.combined_cash_balance_minor, curr.currency, curr.currency_exponent)}
            />
            <StatCard
              tag="External inflow"
              title={formatMinorAmount(curr.combined_inflow_minor, curr.currency, curr.currency_exponent)}
              tone="success"
            />
            <StatCard
              tag="External outflow"
              title={formatMinorAmount(curr.combined_outflow_minor, curr.currency, curr.currency_exponent)}
              tone="warning"
            />
            <StatCard
              tag="Net cash movement"
              title={formatMinorAmount(curr.combined_net_cash_movement_minor, curr.currency, curr.currency_exponent)}
            />
          </div>
        </div>
      ))}

      <div className="grid gap-4 md:grid-cols-2">
        {data?.workspaces.map((ws) => (
          <DashboardCard key={ws.workspace_id}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold">{ws.workspace_name}</h3>
                <p className="text-xs text-muted capitalize">{ws.kind} ledger (separate books)</p>
              </div>
              <StatusPill tone="neutral">{ws.currency}</StatusPill>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="text-muted">Cash balance</p>
                <p className="tabular font-semibold">{formatMinorAmount(ws.cash_balance_minor, ws.currency, ws.currency_exponent)}</p>
              </div>
              <div>
                <p className="text-muted">Cash inflow / outflow</p>
                <p className="tabular font-medium">
                  {formatMinorAmount(ws.cash_inflow_minor, ws.currency, ws.currency_exponent)} /{" "}
                  {formatMinorAmount(ws.cash_outflow_minor, ws.currency, ws.currency_exponent)}
                </p>
              </div>
              <div>
                <p className="text-muted">Income</p>
                <p className="tabular font-medium">{formatMinorAmount(ws.income_minor, ws.currency, ws.currency_exponent)}</p>
              </div>
              <div>
                <p className="text-muted">Expense</p>
                <p className="tabular font-medium">{formatMinorAmount(ws.expense_minor, ws.currency, ws.currency_exponent)}</p>
              </div>
            </div>
          </DashboardCard>
        ))}
      </div>

      {data ? (
        <p className="text-[11px] text-muted">
          {data.projection_note} As of {formatDate(data.as_of)}.
        </p>
      ) : null}
    </section>
  );
}
