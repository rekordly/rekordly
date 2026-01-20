'use client';

import React, { useEffect, useMemo } from 'react';
import { Card, CardBody, CardHeader } from '@heroui/card';
import {
  CreditCard,
  TrendingDown,
  Filter,
  DollarSign,
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
import { useExpenseStore } from '@/store/expense-store';
import { formatCurrency } from '@/lib/fn';
import StatCard from '@/components/ui/StatCard';
import UniversalListSkeleton from '@/components/skeleton/UniversalListSkeleton';

const COLORS = ['#ef4444', '#f59e0b', '#3b82f6', '#10b981', '#8b5cf6'];

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

export default function ExpensesReportPage() {
  const { summary, chartData, isInitialLoading, fetchExpenses } =
    useExpenseStore();

  useEffect(() => {
    fetchExpenses();
  }, [fetchExpenses]);

  // Prepare chart data with all 12 months
  const monthlyData = useMemo(() => {
    if (!chartData?.monthly) {
      return ALL_MONTHS.map(month => ({
        month,
        amount: 0,
      }));
    }

    const dataMap = new Map(chartData.monthly.map(item => [item.month, item]));

    return ALL_MONTHS.map(month => {
      const existingData = dataMap.get(month);
      return (
        existingData || {
          month,
          amount: 0,
        }
      );
    });
  }, [chartData]);

  const categoryBreakdownData = useMemo(() => {
    if (!chartData?.byCategory) return [];
    return chartData.byCategory.map((item, index) => ({
      name: item.name,
      value: item.value,
      percentage: item.percentage,
      color: COLORS[index % COLORS.length],
    }));
  }, [chartData]);

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
          <p className="font-semibold mb-2">{label}</p>
          {payload.map((item: any, index: number) => (
            <p key={index} className="text-sm">
              {item.name}: {formatCurrency(item.value)}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  if (isInitialLoading || !summary) {
    return <UniversalListSkeleton gridConfig={{ default: 1, md: 1 }} />;
  }

  // Purchase vs Expense breakdown
  const typeBreakdownData = [
    {
      name: 'Purchases',
      value: summary.breakdown.purchases.net,
      percentage: (summary.breakdown.purchases.net / summary.netExpenses) * 100,
      color: COLORS[0],
    },
    {
      name: 'Other Expenses',
      value: summary.breakdown.expenses.total,
      percentage:
        (summary.breakdown.expenses.total / summary.netExpenses) * 100,
      color: COLORS[1],
    },
  ];

  // Tax deductibility breakdown
  const deductibilityData = [
    {
      name: 'Deductible',
      value: summary.totalDeductible,
      percentage: summary.deductiblePercentage,
      color: '#10b981',
    },
    {
      name: 'Non-Deductible',
      value: summary.totalNonDeductible,
      percentage: 100 - summary.deductiblePercentage,
      color: '#ef4444',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          gradient
          description={`Gross expenses of ${formatCurrency(summary.grossExpenses)} less ${formatCurrency(summary.totalPurchaseRefunds)} in refunds. Outstanding: ${formatCurrency(summary.balance)}`}
          gradientColor="danger"
          tag="Net Expenses (Accrual)"
          tagColor="danger"
          title={formatCurrency(summary.netExpenses)}
          icon={<CreditCard size={24} />}
        />

        <StatCard
          gradient
          description={`${formatCurrency(summary.totalDeductible)} (${summary.deductiblePercentage.toFixed(1)}%) is tax-deductible`}
          gradientColor="primary"
          tag="Cash Paid"
          tagColor="primary"
          title={formatCurrency(summary.totalPaid)}
          icon={<TrendingDown size={24} />}
        />

        <StatCard
          gradient
          description={`Purchases: ${formatCurrency(summary.breakdown.purchases.net)} | Other: ${formatCurrency(summary.breakdown.expenses.total)}`}
          gradientColor="warning"
          tag="Top Category"
          tagColor="warning"
          title={summary.topCategory.replace(/_/g, ' ')}
          icon={<Filter size={24} />}
        />

        <StatCard
          gradient
          description={`Based on ${summary.netExpenses > 0 ? 'net expenses' : 'current spend'}`}
          gradientColor="secondary"
          tag="Avg Monthly Expense"
          tagColor="secondary"
          title={formatCurrency(summary.averagePerMonth)}
          icon={<DollarSign size={24} />}
        />
      </div>

      {/* Breakdowns - Donut Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Expense by Category */}
        <Card className="rounded-3xl" shadow="none">
          <CardHeader className="py-6 px-6">
            <div className="flex items-center gap-2">
              <PieChartIcon size={20} className="text-[#ef4444]" />
              <div>
                <h3 className="text-base font-semibold">
                  Expenses by Category
                </h3>
                <p className="text-xs text-default-500">Expense Distribution</p>
              </div>
            </div>
          </CardHeader>
          <CardBody className="flex flex-col items-center">
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={categoryBreakdownData}
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
                  {categoryBreakdownData.map((entry, index) => (
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
              {categoryBreakdownData.map((entry, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-2 rounded-lg hover:bg-default-100 transition-colors"
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
                    <span className="text-sm font-semibold text-default-500 min-w-[45px] text-right">
                      {entry.percentage.toFixed(1)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>

        {/* Purchase vs Other Expenses */}
        <Card className="rounded-3xl" shadow="none">
          <CardHeader className="py-6 px-6">
            <div className="flex items-center gap-2">
              <PieChartIcon size={20} className="text-[#f59e0b]" />
              <div>
                <h3 className="text-base font-semibold">
                  Expense Type Breakdown
                </h3>
                <p className="text-xs text-default-500">Purchases vs Others</p>
              </div>
            </div>
          </CardHeader>
          <CardBody className="flex flex-col items-center">
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={typeBreakdownData}
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
                  {typeBreakdownData.map((entry, index) => (
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
              {typeBreakdownData.map((entry, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-2 rounded-lg hover:bg-default-100 transition-colors"
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
                    <span className="text-sm font-semibold text-default-500 min-w-[45px] text-right">
                      {entry.percentage.toFixed(1)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>

        {/* Tax Deductibility */}
        <Card className="rounded-3xl" shadow="none">
          <CardHeader className="py-6 px-6">
            <div className="flex items-center gap-2">
              <PieChartIcon size={20} className="text-[#10b981]" />
              <div>
                <h3 className="text-base font-semibold">Tax Deductibility</h3>
                <p className="text-xs text-default-500">Deductible Analysis</p>
              </div>
            </div>
          </CardHeader>
          <CardBody className="flex flex-col items-center">
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={deductibilityData}
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
                  {deductibilityData.map((entry, index) => (
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
              {deductibilityData.map((entry, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-2 rounded-lg hover:bg-default-100 transition-colors"
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
                    <span className="text-sm font-semibold text-default-500 min-w-[45px] text-right">
                      {entry.percentage.toFixed(1)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Monthly Trend */}
      <Card className="rounded-3xl" shadow="none">
        <CardHeader className="py-6 px-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold">Monthly Expense Trend</h3>
              <p className="text-xs text-default-500">
                Expense payments over 12 months
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[#ef4444]" />
              <span className="text-xs font-medium">Expenses</span>
            </div>
          </div>
        </CardHeader>
        <CardBody>
          <ResponsiveContainer width="100%" height={350}>
            <LineChart data={monthlyData}>
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
                dataKey="amount"
                stroke="#ef4444"
                strokeWidth={3}
                name="Expenses"
                dot={{ fill: '#ef4444', r: 5, strokeWidth: 2, stroke: '#fff' }}
                activeDot={{ r: 7 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardBody>
      </Card>

      {/* Detailed Breakdown Table */}
      <Card className="rounded-3xl" shadow="none">
        <CardHeader className="py-6 px-6">
          <h3 className="text-base font-semibold">Detailed Breakdown</h3>
        </CardHeader>
        <CardBody className="py-6">
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-default-50">
                <p className="text-sm text-default-500 mb-1">Purchases (Net)</p>
                <p className="text-xl font-semibold">
                  {formatCurrency(summary.breakdown.purchases.net)}
                </p>
                <p className="text-xs text-default-400 mt-1">
                  Refunds: {formatCurrency(summary.breakdown.purchases.refunds)}
                </p>
              </div>
              <div className="p-4 rounded-xl bg-default-50">
                <p className="text-sm text-default-500 mb-1">Other Expenses</p>
                <p className="text-xl font-semibold">
                  {formatCurrency(summary.breakdown.expenses.total)}
                </p>
                <p className="text-xs text-default-400 mt-1">
                  Cash Paid:{' '}
                  {formatCurrency(summary.breakdown.expenses.cashPaid)}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-default-50">
                <p className="text-sm text-default-500 mb-1">
                  Outstanding Payables
                </p>
                <p className="text-xl font-semibold">
                  {formatCurrency(summary.balance)}
                </p>
              </div>
              <div className="p-4 rounded-xl bg-default-50">
                <p className="text-sm text-default-500 mb-1">Total Refunds</p>
                <p className="text-xl font-semibold">
                  {formatCurrency(summary.totalPurchaseRefunds)}
                </p>
              </div>
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
