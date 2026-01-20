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
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  ReferenceLine,
} from 'recharts';

import { useOverviewStore } from '@/store/overview-store';
import StatCard from '@/components/ui/StatCard';
import { formatCurrency } from '@/lib/fn';

const COLORS = ['#009e10', '#3b82f6', '#fa8901', '#ef4444', '#8b5cf6'];

// All 12 months template
const ALL_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

export default function Dashboard() {
  const { overview, chartData, fetchOverview } = useOverviewStore();

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  // Revenue breakdown pie chart
  const revenueBreakdownData = useMemo(() => {
    if (!chartData?.revenueBreakdown) return [];
    return chartData.revenueBreakdown.map((item, index) => ({
      name: item.name,
      value: item.value,
      percentage: item.percentage,
      color: COLORS[index % COLORS.length],
    }));
  }, [chartData]);

  // Expense breakdown pie chart
  const expenseBreakdownData = useMemo(() => {
    if (!chartData?.expenseBreakdown) return [];
    return chartData.expenseBreakdown.map((item, index) => ({
      name: item.name,
      value: item.value,
      percentage: item.percentage,
      color: COLORS[index % COLORS.length],
    }));
  }, [chartData]);

  // Monthly trend data - ensure all 12 months are present
  const monthlyTrendData = useMemo(() => {
    if (!chartData?.monthlyTrend) {
      // Return all 12 months with 0 values if no data
      return ALL_MONTHS.map(month => ({
        month,
        revenue: 0,
        expenses: 0,
        profit: 0,
      }));
    }

    // Create a map of existing data
    const dataMap = new Map(
      chartData.monthlyTrend.map(item => [item.month, item])
    );

    // Fill in all 12 months
    return ALL_MONTHS.map(month => {
      const existingData = dataMap.get(month);
      return (
        existingData || {
          month,
          revenue: 0,
          expenses: 0,
          profit: 0,
        }
      );
    });
  }, [chartData]);

  // Custom tooltip for negative values
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
          <p className="font-semibold mb-2">{label}</p>
          {payload.map((item: any, index: number) => (
            <p
              key={index}
              className={`text-sm ${item.value < 0 ? 'text-[#ef4444]' : ''}`}
            >
              {item.name}: {formatCurrency(item.value)}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

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

  const refunds =
    overview.revenue.accrual -
    overview.revenue.cash -
    overview.revenue.outstanding;

  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <StatCard
          gradient
          description={`Your business recorded a gross revenue of ${formatCurrency(overview.revenue.accrual)}. After ${formatCurrency(Math.abs(refunds))} in ${refunds < 0 ? 'adjustments' : 'refunds'}, with ${formatCurrency(overview.revenue.outstanding)} still outstanding from customers.`}
          gradientColor="success"
          tag="Revenue (Collected)"
          tagColor="success"
          title={formatCurrency(overview.revenue.cash)}
          icon={<Wallet size={24} />}
        />

        <StatCard
          gradient
          description={`Total expenses expected were ${formatCurrency(overview.expenses.accrual)}. You've paid ${formatCurrency(overview.expenses.cash)} with ${formatCurrency(overview.expenses.outstanding)} pending payment to vendors.`}
          gradientColor="danger"
          tag="Expenses (Paid)"
          tagColor="danger"
          title={formatCurrency(overview.expenses.cash)}
          icon={<CreditCard size={24} />}
        />

        <StatCard
          gradient
          description={`Your net profit margin is ${overview.income.profitMargin.net.cash >= 0 ? '' : '-'}${Math.abs(overview.income.profitMargin.net.cash).toFixed(1)}% with a gross profit of ${formatCurrency(overview.income.grossProfit.cash)} from collected revenue.`}
          gradientColor={
            overview.income.netIncome.cash >= 0 ? 'success' : 'danger'
          }
          tag="Net Profit (Collected)"
          tagColor={overview.income.netIncome.cash >= 0 ? 'success' : 'danger'}
          title={
            <span
              className={
                overview.income.netIncome.cash < 0 ? 'text-[#ef4444]' : ''
              }
            >
              {formatCurrency(overview.income.netIncome.cash)}
            </span>
          }
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
          description={`On average, your monthly profit is ${formatCurrency(overview.metrics.averageMonthlyProfit.cash)}. Outstanding receivables: ${formatCurrency(overview.metrics.outstandingReceivables)}, payables: ${formatCurrency(overview.metrics.outstandingPayables)}.`}
          gradientColor="primary"
          tag="Avg Monthly Profit"
          tagColor="primary"
          title={
            <span
              className={
                overview.metrics.averageMonthlyProfit.cash < 0
                  ? 'text-[#ef4444]'
                  : ''
              }
            >
              {formatCurrency(overview.metrics.averageMonthlyProfit.cash)}
            </span>
          }
          icon={<Activity size={24} />}
        />
      </div>

      {/* Revenue vs Expenses & Breakdown - New Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Revenue Breakdown - Donut Chart */}
        <Card className="rounded-3xl" shadow="none">
          <CardHeader className="py-6 px-6">
            <div className="flex items-center gap-2">
              <PieChartIcon size={20} className="text-[#009e10]" />
              <div>
                <h3 className="text-base font-semibold">Income by Category</h3>
                <p className="text-xs text-default-500">Revenue Distribution</p>
              </div>
            </div>
          </CardHeader>
          <CardBody className="flex flex-col items-center">
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={revenueBreakdownData}
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={100}
                  labelLine={false}
                  fill="#8884d8"
                  dataKey="value"
                  strokeWidth={3}
                  stroke="#fff"
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
            <div className="mt-4 w-full space-y-1">
              {revenueBreakdownData.map((entry, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between px-2 rounded-lg hover:bg-default-100 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-sm"
                      style={{ backgroundColor: entry.color }}
                    />
                    <span className="text-sm font-medium">{entry.name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-default-600">
                      {formatCurrency(entry.value)}
                    </span>
                    <span className="text-sm font-semibold text-default-500 min-w-11.25 text-right">
                      {entry.percentage.toFixed(1)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>

        {/* Expense Breakdown - Donut Chart */}
        <Card className="rounded-3xl" shadow="none">
          <CardHeader className="py-6 px-6">
            <div className="flex items-center gap-2">
              <PieChartIcon size={20} className="text-[#fa8901]" />
              <div>
                <h3 className="text-base font-semibold">Expenses by Type</h3>
                <p className="text-xs text-default-500">Expense Distribution</p>
              </div>
            </div>
          </CardHeader>
          <CardBody className="flex flex-col items-center">
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={expenseBreakdownData}
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={100}
                  labelLine={false}
                  fill="#8884d8"
                  dataKey="value"
                  strokeWidth={3}
                  stroke="#fff"
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
            <div className="mt-4 w-full space-y-1">
              {expenseBreakdownData.map((entry, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between px-2 rounded-lg hover:bg-default-100 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-sm"
                      style={{ backgroundColor: entry.color }}
                    />
                    <span className="text-sm font-medium">{entry.name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-default-600">
                      {formatCurrency(entry.value)}
                    </span>
                    <span className="text-sm font-semibold text-default-500 min-w-11.25 text-right">
                      {entry.percentage.toFixed(1)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Monthly Trend - Original 3 Lines */}
      <Card className="rounded-3xl" shadow="none">
        <CardHeader className="py-6 px-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold">Revenue Overview</h3>
              <p className="text-xs text-default-500">
                Income vs Expenses - 12 Month Trend
              </p>
            </div>
          </div>
        </CardHeader>
        <CardBody>
          <ResponsiveContainer width="100%" height={350}>
            <LineChart data={monthlyTrendData}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#e5e7eb"
                vertical={false}
              />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 11, fill: '#6b7280' }}
                axisLine={{ stroke: '#e5e7eb' }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#6b7280' }}
                axisLine={{ stroke: '#e5e7eb' }}
                tickLine={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine y={0} stroke="#94a3b8" strokeWidth={1} />
              <Line
                type="monotone"
                dataKey="revenue"
                stroke="#009e10"
                strokeWidth={3}
                name="Revenue"
                dot={{ fill: '#009e10', r: 5, strokeWidth: 2, stroke: '#fff' }}
                activeDot={{ r: 7 }}
              />
              <Line
                type="monotone"
                dataKey="expenses"
                stroke="#fa8901"
                strokeWidth={3}
                name="Expenses"
                dot={{ fill: '#fa8901', r: 5, strokeWidth: 2, stroke: '#fff' }}
                activeDot={{ r: 7 }}
              />
              <Line
                type="monotone"
                dataKey="profit"
                stroke="#3b82f6"
                strokeWidth={3}
                name="Profit"
                dot={(props: any) => {
                  const { cx, cy, payload } = props;
                  return (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={5}
                      fill={payload.profit < 0 ? '#ef4444' : '#3b82f6'}
                      stroke="#fff"
                      strokeWidth={2}
                    />
                  );
                }}
                activeDot={{ r: 7 }}
              />
            </LineChart>
          </ResponsiveContainer>

          <div className="flex justify-center py-4 items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[#009e10]" />
              <span className="text-xs font-medium">Revenue</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[#fa8901]" />
              <span className="text-xs font-medium">Expenses</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[#3b82f6]" />
              <span className="text-xs font-medium">Profit</span>
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
