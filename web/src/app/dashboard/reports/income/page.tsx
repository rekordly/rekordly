'use client';

import React, { useEffect } from 'react';
import { Card, CardBody, CardHeader } from '@heroui/card';
import { TrendingUp, TrendingDown, DollarSign, Activity } from 'lucide-react';
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
} from 'recharts';
import { useIncomeStore } from '@/store/income-store';
import { formatCurrency } from '@/lib/fn';
import StatCard from '@/components/ui/StatCard';
import UniversalListSkeleton from '@/components/skeleton/UniversalListSkeleton';

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444'];

export default function IncomeStatementPage() {
  const {
    incomeStatement,
    incomeStatementChartData,
    isLoadingStatement,
    fetchIncomeStatement,
  } = useIncomeStore();

  useEffect(() => {
    fetchIncomeStatement();
  }, [fetchIncomeStatement]);

  if (isLoadingStatement || !incomeStatement) {
    return <UniversalListSkeleton gridConfig={{ default: 1, md: 1 }} />;
  }

  const { revenue, directCosts, grossProfit, operatingExpenses, netIncome } =
    incomeStatement;

  // Prepare chart data
  const comparisonData = incomeStatementChartData
    ? [
        {
          name: 'Revenue',
          Accrual: incomeStatementChartData.comparison.revenue.accrual,
          Cash: incomeStatementChartData.comparison.revenue.cash,
        },
        {
          name: 'Direct Costs',
          Accrual: -incomeStatementChartData.comparison.directCosts.accrual,
          Cash: -incomeStatementChartData.comparison.directCosts.cash,
        },
        {
          name: 'Operating Exp.',
          Accrual:
            -incomeStatementChartData.comparison.operatingExpenses.accrual,
          Cash: -incomeStatementChartData.comparison.operatingExpenses.cash,
        },
        {
          name: 'Net Income',
          Accrual: incomeStatementChartData.comparison.netIncome.accrual,
          Cash: incomeStatementChartData.comparison.netIncome.cash,
        },
      ]
    : [];

  const revenueBreakdownData = revenue.breakdown.map((item, index) => ({
    name: item.name,
    value: item.accrual,
    color: COLORS[index % COLORS.length],
  }));

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          gradient
          description={`Accrual: ${formatCurrency(revenue.total.accrual)} | Cash: ${formatCurrency(revenue.total.cash)}`}
          gradientColor="success"
          tag="Total Revenue"
          tagColor="success"
          title={formatCurrency(revenue.total.accrual)}
          icon={<DollarSign size={24} />}
        />

        <StatCard
          gradient
          description={`Margin: ${grossProfit.marginAccrual.toFixed(1)}% | After COGS & direct costs`}
          gradientColor="primary"
          tag="Gross Profit"
          tagColor="primary"
          title={formatCurrency(grossProfit.accrual)}
          icon={<TrendingUp size={24} />}
        />

        <StatCard
          gradient
          description={`All operating expenses including salaries, rent, utilities`}
          gradientColor="warning"
          tag="Operating Expenses"
          tagColor="warning"
          title={formatCurrency(operatingExpenses.total)}
          icon={<Activity size={24} />}
        />

        <StatCard
          gradient
          description={`Margin: ${netIncome.marginAccrual.toFixed(1)}% | Avg: ${formatCurrency(netIncome.averagePerMonth.accrual)}/mo`}
          gradientColor={netIncome.accrual >= 0 ? 'success' : 'danger'}
          tag="Net Income (Profit)"
          tagColor={netIncome.accrual >= 0 ? 'success' : 'danger'}
          title={formatCurrency(netIncome.accrual)}
          icon={
            netIncome.accrual >= 0 ? (
              <TrendingUp size={24} />
            ) : (
              <TrendingDown size={24} />
            )
          }
        />
      </div>

      {/* Income Statement Breakdown */}
      <Card className="rounded-3xl" shadow="none">
        <CardHeader className="pb-0 pt-6 px-6">
          <div>
            <h3 className="text-lg font-semibold">
              Income Statement Breakdown
            </h3>
            <p className="text-sm text-default-500">
              Detailed profit & loss analysis
            </p>
          </div>
        </CardHeader>
        <CardBody className="py-6">
          <div className="space-y-6">
            {/* Revenue Section */}
            <div className="space-y-3">
              <h4 className="font-semibold text-sm">Revenue</h4>
              {revenue.breakdown.map((item, index) => (
                <div
                  key={index}
                  className="flex justify-between items-center pl-4"
                >
                  <span className="text-sm text-default-600">{item.name}</span>
                  <div className="text-right">
                    <p className="text-sm font-medium">
                      {formatCurrency(item.accrual)}
                    </p>
                    <p className="text-xs text-default-400">
                      Cash: {formatCurrency(item.cash)}
                    </p>
                  </div>
                </div>
              ))}
              <div className="flex justify-between items-center font-semibold pt-2 border-t">
                <span className="text-sm">Total Revenue</span>
                <div className="text-right">
                  <p className="text-sm">
                    {formatCurrency(revenue.total.accrual)}
                  </p>
                  <p className="text-xs text-default-400">
                    Cash: {formatCurrency(revenue.total.cash)}
                  </p>
                </div>
              </div>
            </div>

            {/* Direct Costs Section */}
            <div className="space-y-3">
              <h4 className="font-semibold text-sm">Direct Costs</h4>
              <div className="flex justify-between items-center pl-4">
                <span className="text-sm text-default-600">
                  Cost of Goods Sold
                </span>
                <span className="text-sm font-medium text-danger">
                  ({formatCurrency(directCosts.costOfGoodsSold)})
                </span>
              </div>
              <div className="flex justify-between items-center pl-4">
                <span className="text-sm text-default-600">
                  Discounts Given
                </span>
                <span className="text-sm font-medium text-danger">
                  ({formatCurrency(directCosts.discounts)})
                </span>
              </div>
              <div className="flex justify-between items-center pl-4">
                <span className="text-sm text-default-600">Delivery Costs</span>
                <span className="text-sm font-medium text-danger">
                  ({formatCurrency(directCosts.deliveryCosts)})
                </span>
              </div>
              <div className="flex justify-between items-center pl-4">
                <span className="text-sm text-default-600">
                  Other Sale Expenses
                </span>
                <span className="text-sm font-medium text-danger">
                  ({formatCurrency(directCosts.otherSaleExpenses)})
                </span>
              </div>
              <div className="flex justify-between items-center font-semibold pt-2 border-t">
                <span className="text-sm">Total Direct Costs</span>
                <span className="text-sm text-danger">
                  ({formatCurrency(directCosts.total)})
                </span>
              </div>
            </div>

            {/* Gross Profit */}
            <div className="flex justify-between items-center font-bold text-base pt-2 border-t-2">
              <span>Gross Profit</span>
              <div className="text-right">
                <p>{formatCurrency(grossProfit.accrual)}</p>
                <p className="text-xs font-normal text-default-400">
                  {grossProfit.marginAccrual.toFixed(1)}% margin
                </p>
              </div>
            </div>

            {/* Operating Expenses */}
            <div className="space-y-3">
              <h4 className="font-semibold text-sm">Operating Expenses</h4>
              <div className="flex justify-between items-center pl-4">
                <span className="text-sm text-default-600">
                  Total Operating Expenses
                </span>
                <span className="text-sm font-medium text-danger">
                  ({formatCurrency(operatingExpenses.total)})
                </span>
              </div>
            </div>

            {/* Net Income */}
            <div
              className={`flex justify-between items-center font-bold text-lg pt-4 border-t-2 ${
                netIncome.accrual >= 0 ? 'text-success' : 'text-danger'
              }`}
            >
              <span>Net Income (Profit)</span>
              <div className="text-right">
                <p>{formatCurrency(netIncome.accrual)}</p>
                <p className="text-xs font-normal text-default-400">
                  {netIncome.marginAccrual.toFixed(1)}% margin
                </p>
              </div>
            </div>

            {/* Cash vs Accrual Note */}
            <div className="bg-default-100 rounded-lg p-4 mt-4">
              <p className="text-xs text-default-600">
                <strong>Cash Basis:</strong> Net Income:{' '}
                {formatCurrency(netIncome.cash)} | Margin:{' '}
                {netIncome.marginCash.toFixed(1)}%
              </p>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Accrual vs Cash Comparison */}
        <Card className="rounded-2xl" shadow="none">
          <CardHeader className="pb-0 pt-4 px-4">
            <h3 className="text-base font-semibold">Accrual vs Cash Basis</h3>
          </CardHeader>
          <CardBody className="py-4">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={comparisonData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
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
                <Bar dataKey="Accrual" fill="#3b82f6" name="Accrual Basis" />
                <Bar dataKey="Cash" fill="#10b981" name="Cash Basis" />
              </BarChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>

        {/* Revenue Breakdown */}
        <Card className="rounded-2xl" shadow="none">
          <CardHeader className="pb-0 pt-4 px-4">
            <h3 className="text-base font-semibold">Revenue Sources</h3>
          </CardHeader>
          <CardBody className="py-4">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={revenueBreakdownData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={entry =>
                    `${entry.name}: ${((entry.value / revenue.total.accrual) * 100).toFixed(0)}%`
                  }
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
      </div>
    </div>
  );
}
