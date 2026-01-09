'use client';

import { useEffect, useMemo } from 'react';
import { Card, CardBody, CardHeader } from '@heroui/card';
import {
  Wallet,
  CreditCard,
  TrendingUp,
  TrendingDown,
  Activity,
  PieChart as PieChartIcon,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from 'recharts';

import { useOverviewStore } from '@/store/overview-store';
import { useRevenueStore } from '@/store/revenue-store';
import { useExpenseStore } from '@/store/expense-store';
import StatCard from '@/components/ui/StatCard';
import { formatCurrency } from '@/lib/fn';
import { QuickLinksGrid } from '@/components/QuickLinksGrid';

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'];

export default function Dashboard() {
  const {
    overview,
    chartData: overviewChartData,
    fetchOverview,
  } = useOverviewStore();

  const { chartData: revenueChartData, fetchRevenue } = useRevenueStore();

  const { chartData: expenseChartData, fetchExpenses } = useExpenseStore();

  useEffect(() => {
    fetchOverview();
    fetchRevenue();
    fetchExpenses();
  }, [fetchOverview, fetchRevenue, fetchExpenses]);

  // Revenue vs Expenses comparison data
  const comparisonData = useMemo(() => {
    if (!overview) return [];

    return [
      {
        name: 'Revenue',
        Accrual: overview.revenue.accrual,
        Cash: overview.revenue.cash,
      },
      {
        name: 'Expenses',
        Accrual: overview.expenses.accrual,
        Cash: overview.expenses.cash,
      },
      {
        name: 'Net Profit',
        Accrual: overview.income.netIncome.accrual,
        Cash: overview.income.netIncome.cash,
      },
    ];
  }, [overview]);

  // Revenue breakdown pie chart
  const revenueBreakdownData = useMemo(() => {
    if (!overviewChartData?.revenueBreakdown) return [];
    return overviewChartData.revenueBreakdown.map((item, index) => ({
      name: item.name,
      value: item.value,
      percentage: item.percentage,
      color: COLORS[index % COLORS.length],
    }));
  }, [overviewChartData]);

  // Expense breakdown pie chart
  const expenseBreakdownData = useMemo(() => {
    if (!overviewChartData?.expenseBreakdown) return [];
    return overviewChartData.expenseBreakdown.map((item, index) => ({
      name: item.name,
      value: item.value,
      percentage: item.percentage,
      color: COLORS[index % COLORS.length],
    }));
  }, [overviewChartData]);

  // Monthly revenue vs expenses trend
  const monthlyTrendData = useMemo(() => {
    const revenueMonthly = revenueChartData?.monthly || [];
    const expenseMonthly = expenseChartData?.monthly || [];

    const allMonths = new Set([
      ...revenueMonthly.map(d => d.month),
      ...expenseMonthly.map(d => d.month),
    ]);

    return Array.from(allMonths)
      .map(month => {
        const revenue = revenueMonthly.find(d => d.month === month);
        const expense = expenseMonthly.find(d => d.month === month);

        return {
          month,
          Revenue: revenue?.amount || 0,
          Expenses: expense?.amount || 0,
          Profit: (revenue?.amount || 0) - (expense?.amount || 0),
        };
      })
      .slice(-6); // Last 6 months
  }, [revenueChartData, expenseChartData]);

  // Profitability metrics
  const profitabilityData = useMemo(() => {
    if (!overviewChartData?.profitability) return [];
    return [
      {
        name: 'Gross Profit Margin',
        Accrual: overviewChartData.profitability.grossProfitMargin.accrual,
        Cash: overviewChartData.profitability.grossProfitMargin.cash,
      },
      {
        name: 'Net Profit Margin',
        Accrual: overviewChartData.profitability.netProfitMargin.accrual,
        Cash: overviewChartData.profitability.netProfitMargin.cash,
      },
    ];
  }, [overviewChartData]);

  if (!overview) {
    return (
      <div className="flex items-center justify-center min-h-100">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <p className="text-sm text-default-500">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          gradient
          description={`Accrual: ${formatCurrency(overview.revenue.accrual)} | Outstanding: ${formatCurrency(overview.revenue.outstanding)}`}
          gradientColor="success"
          tag="Revenue (Cash)"
          tagColor="success"
          title={formatCurrency(overview.revenue.cash)}
          icon={<Wallet size={24} />}
        />

        <StatCard
          gradient
          description={`Accrual: ${formatCurrency(overview.expenses.accrual)} | Outstanding: ${formatCurrency(overview.expenses.outstanding)}`}
          gradientColor="danger"
          tag="Expenses (Cash)"
          tagColor="danger"
          title={formatCurrency(overview.expenses.cash)}
          icon={<CreditCard size={24} />}
        />

        <StatCard
          gradient
          description={`Profit margin: ${overview.income.profitMargin.net.cash.toFixed(1)}% | Gross profit: ${formatCurrency(overview.income.grossProfit.cash)}`}
          gradientColor={
            overview.income.netIncome.cash >= 0 ? 'success' : 'danger'
          }
          tag="Net Profit (Cash)"
          tagColor={overview.income.netIncome.cash >= 0 ? 'success' : 'danger'}
          title={formatCurrency(overview.income.netIncome.cash)}
          icon={
            overview.income.netIncome.cash >= 0 ? (
              <TrendingUp size={24} />
            ) : (
              <TrendingDown size={24} />
            )
          }
        />

        <StatCard
          gradient
          description={`Receivables: ${formatCurrency(overview.metrics.outstandingReceivables)} | Payables: ${formatCurrency(overview.metrics.outstandingPayables)}`}
          gradientColor="primary"
          tag="Avg Monthly Profit"
          tagColor="primary"
          title={formatCurrency(overview.metrics.averageMonthlyProfit.cash)}
          icon={<Activity size={24} />}
        />
      </div>

      {/* Quick Actions */}
      <Card
        className="rounded-3xl border dark:border-primary-700/20 border-primary-200/10"
        shadow="none"
      >
        <CardHeader className="py-6 px-6">
          <div>
            <h3 className="text-base font-semibold">Quick Actions</h3>
            <p className="text-xs text-default-500">
              Quickly add income, expenses, and more
            </p>
          </div>
        </CardHeader>
        <CardBody>
          <QuickLinksGrid
            showSearch={false}
            columns={{ default: 4, sm: 8, md: 8, lg: 12 }}
          />
        </CardBody>
      </Card>

      {/* Revenue vs Expenses Comparison */}
      <Card className="rounded-3xl" shadow="none">
        <CardHeader className="py-6 px-6">
          <div>
            <h3 className="text-base font-semibold">Revenue vs Expenses</h3>
            <p className="text-xs text-default-500">
              Accrual and cash basis comparison
            </p>
          </div>
        </CardHeader>
        <CardBody>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={comparisonData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip
                formatter={(value: any) => formatCurrency(value)}
                contentStyle={{
                  backgroundColor: 'rgba(255, 255, 255, 0.95)',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                }}
              />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Bar dataKey="Accrual" fill="#3b82f6" name="Accrual Basis" />
              <Bar dataKey="Cash" fill="#10b981" name="Cash Basis" />
            </BarChart>
          </ResponsiveContainer>
        </CardBody>
      </Card>

      {/* Monthly Trend */}
      <Card className="rounded-3xl" shadow="none">
        <CardHeader className="py-6 px-6">
          <div>
            <h3 className="text-base font-semibold">6-Month Trend</h3>
            <p className="text-xs text-default-500">
              Revenue, expenses, and profit over time
            </p>
          </div>
        </CardHeader>
        <CardBody>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={monthlyTrendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip
                formatter={(value: any) => formatCurrency(value)}
                contentStyle={{
                  backgroundColor: 'rgba(255, 255, 255, 0.95)',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                }}
              />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Line
                type="monotone"
                dataKey="Revenue"
                stroke="#10b981"
                strokeWidth={2}
                name="Revenue"
              />
              <Line
                type="monotone"
                dataKey="Expenses"
                stroke="#ef4444"
                strokeWidth={2}
                name="Expenses"
              />
              <Line
                type="monotone"
                dataKey="Profit"
                stroke="#3b82f6"
                strokeWidth={2}
                name="Profit"
              />
            </LineChart>
          </ResponsiveContainer>
        </CardBody>
      </Card>

      {/* Revenue & Expense Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Revenue Breakdown */}
        <Card className="rounded-3xl" shadow="none">
          <CardHeader className="py-6 px-6">
            <div className="flex items-center gap-2">
              <PieChartIcon size={20} className="text-success" />
              <div>
                <h3 className="text-base font-semibold">Revenue by Source</h3>
                <p className="text-xs text-default-500">Income distribution</p>
              </div>
            </div>
          </CardHeader>
          <CardBody>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={revenueBreakdownData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={entry => `${entry.name}: ${entry.percent}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {revenueBreakdownData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: any) => formatCurrency(value)}
                  contentStyle={{
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>

        {/* Expense Breakdown */}
        <Card className="rounded-3xl" shadow="none">
          <CardHeader className="py-6 px-6">
            <div className="flex items-center gap-2">
              <PieChartIcon size={20} className="text-danger" />
              <div>
                <h3 className="text-base font-semibold">Expenses by Type</h3>
                <p className="text-xs text-default-500">Expense distribution</p>
              </div>
            </div>
          </CardHeader>
          <CardBody>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={expenseBreakdownData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={entry => `${entry.name}: ${entry.percent}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {expenseBreakdownData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: any) => formatCurrency(value)}
                  contentStyle={{
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>
      </div>

      {/* Profitability Margins */}
      <Card className="rounded-3xl" shadow="none">
        <CardHeader className="py-6 px-6">
          <div>
            <h3 className="text-base font-semibold">Profit Margins</h3>
            <p className="text-xs text-default-500">
              Gross and net profit margins comparison
            </p>
          </div>
        </CardHeader>
        <CardBody>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={profitabilityData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} unit="%" />
              <Tooltip
                formatter={(value: any) => `${value.toFixed(1)}%`}
                contentStyle={{
                  backgroundColor: 'rgba(255, 255, 255, 0.95)',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                }}
              />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Bar dataKey="Accrual" fill="#3b82f6" name="Accrual Basis" />
              <Bar dataKey="Cash" fill="#10b981" name="Cash Basis" />
            </BarChart>
          </ResponsiveContainer>
        </CardBody>
      </Card>
    </div>
  );
}
