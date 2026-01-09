'use client';

import React, { useEffect } from 'react';
import { Card, CardBody, CardHeader } from '@heroui/card';
import { CreditCard, TrendingDown, Filter, DollarSign } from 'lucide-react';
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
import { useExpenseStore } from '@/store/expense-store';
import { formatCurrency } from '@/lib/fn';
import StatCard from '@/components/ui/StatCard';
import UniversalListSkeleton from '@/components/skeleton/UniversalListSkeleton';

const COLORS = ['#ef4444', '#f59e0b', '#3b82f6', '#10b981', '#8b5cf6'];

export default function ExpensesReportPage() {
  const { summary, chartData, isInitialLoading, fetchExpenses } =
    useExpenseStore();

  useEffect(() => {
    fetchExpenses();
  }, [fetchExpenses]);

  if (isInitialLoading || !summary) {
    return <UniversalListSkeleton gridConfig={{ default: 1, md: 1 }} />;
  }

  // Prepare chart data
  const categoryBreakdownData =
    chartData?.byCategory.map((item, index) => ({
      name: item.name,
      value: item.value,
      percentage: item.percentage,
      color: COLORS[index % COLORS.length],
    })) || [];

  const monthlyData = chartData?.monthly || [];

  // Purchase vs Expense breakdown
  const typeBreakdownData = [
    {
      name: 'Purchases',
      value: summary.breakdown.purchases.net,
      color: COLORS[0],
    },
    {
      name: 'Other Expenses',
      value: summary.breakdown.expenses.total,
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
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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

      {/* Monthly Trend */}
      <Card className="rounded-3xl" shadow="none">
        <CardHeader className="pb-0 pt-6 px-6">
          <div>
            <h3 className="text-lg font-semibold">Monthly Expense Trend</h3>
            <p className="text-sm text-default-500">
              Expense payments over time
            </p>
          </div>
        </CardHeader>
        <CardBody className="py-6">
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
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
                dataKey="amount"
                stroke="#ef4444"
                strokeWidth={2}
                name="Expenses"
              />
            </LineChart>
          </ResponsiveContainer>
        </CardBody>
      </Card>

      {/* Breakdowns */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Expense by Category */}
        <Card className="rounded-2xl" shadow="none">
          <CardHeader className="pb-0 pt-4 px-4">
            <h3 className="text-base font-semibold">Expenses by Category</h3>
          </CardHeader>
          <CardBody className="py-4">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={categoryBreakdownData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={entry =>
                    `${entry.name}: ${(entry.percent || 0).toFixed(0)}%`
                  }
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
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
          </CardBody>
        </Card>

        {/* Purchase vs Other Expenses */}
        <Card className="rounded-2xl" shadow="none">
          <CardHeader className="pb-0 pt-4 px-4">
            <h3 className="text-base font-semibold">Expense Type Breakdown</h3>
          </CardHeader>
          <CardBody className="py-4">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={typeBreakdownData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={entry =>
                    `${entry.name}: ${((entry.value / summary.netExpenses) * 100).toFixed(0)}%`
                  }
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
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
          </CardBody>
        </Card>
      </div>

      {/* Tax Deductibility */}
      <Card className="rounded-3xl" shadow="none">
        <CardHeader className="pb-0 pt-6 px-6">
          <div>
            <h3 className="text-lg font-semibold">
              Tax Deductibility Analysis
            </h3>
            <p className="text-sm text-default-500">
              Breakdown of deductible vs non-deductible expenses
            </p>
          </div>
        </CardHeader>
        <CardBody className="py-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={deductibilityData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={entry =>
                    `${entry.name}: ${(entry.percent || 0).toFixed(0)}%`
                  }
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
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

            <div className="flex flex-col justify-center space-y-4">
              <div>
                <h4 className="text-sm font-semibold text-success mb-2">
                  Tax-Deductible Expenses
                </h4>
                <p className="text-2xl font-bold text-success">
                  {formatCurrency(summary.totalDeductible)}
                </p>
                <p className="text-xs text-default-500 mt-1">
                  {summary.deductiblePercentage.toFixed(1)}% of total cash paid
                </p>
              </div>

              <div>
                <h4 className="text-sm font-semibold text-danger mb-2">
                  Non-Deductible Expenses
                </h4>
                <p className="text-2xl font-bold text-danger">
                  {formatCurrency(summary.totalNonDeductible)}
                </p>
                <p className="text-xs text-default-500 mt-1">
                  {(100 - summary.deductiblePercentage).toFixed(1)}% of total
                  cash paid
                </p>
              </div>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Detailed Breakdown Table */}
      <Card className="rounded-3xl" shadow="none">
        <CardHeader className="pb-0 pt-6 px-6">
          <h3 className="text-lg font-semibold">Detailed Breakdown</h3>
        </CardHeader>
        <CardBody className="py-6">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-default-500">Purchases (Net)</p>
                <p className="text-lg font-semibold">
                  {formatCurrency(summary.breakdown.purchases.net)}
                </p>
                <p className="text-xs text-default-400">
                  Refunds: {formatCurrency(summary.breakdown.purchases.refunds)}
                </p>
              </div>
              <div>
                <p className="text-sm text-default-500">Other Expenses</p>
                <p className="text-lg font-semibold">
                  {formatCurrency(summary.breakdown.expenses.total)}
                </p>
                <p className="text-xs text-default-400">
                  Cash Paid:{' '}
                  {formatCurrency(summary.breakdown.expenses.cashPaid)}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-4 border-t">
              <div>
                <p className="text-sm text-default-500">Outstanding Payables</p>
                <p className="text-lg font-semibold">
                  {formatCurrency(summary.balance)}
                </p>
              </div>
              <div>
                <p className="text-sm text-default-500">Total Refunds</p>
                <p className="text-lg font-semibold">
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
