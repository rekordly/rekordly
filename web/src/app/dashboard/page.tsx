'use client';
import { useMemo, useEffect } from 'react';
import { Card, CardBody, CardHeader } from '@heroui/card';
import { Wallet, CreditCard } from 'lucide-react';

import { useIncomeStore } from '@/store/income-store';
import StatCard from '@/components/ui/StatCard';
import { formatCurrency } from '@/lib/fn';
import { useExpenseStore } from '@/store/expense-store';
import { RevenueChart, CategoryPieChart } from '@/components/chart/dashboard';
import { QuickLinksGrid } from '@/components/QuickLinksGrid';

interface MonthlyData {
  month: string;
  amount: number;
  count: number;
}

interface CategoryData {
  name: string;
  value: number;
  percentage: number;
  deductible?: boolean;
  refundAmount?: number;
}

// Main Dashboard Component
export default function Dashboard() {
  const {
    summary: incomeSummary,
    chartData: incomeChartData,
    fetchIncome,
  } = useIncomeStore();
  const {
    summary: expenseSummary,
    chartData: expenseChartData,
    fetchExpenses,
  } = useExpenseStore();

  useEffect(() => {
    fetchIncome();
    fetchExpenses();
  }, [fetchExpenses, fetchIncome]);

  // Transform data for revenue chart
  const revenueData = useMemo(() => {
    const incomeMonthly = (incomeChartData?.monthly || []) as MonthlyData[];
    const expenseMonthly = (expenseChartData?.monthly || []) as MonthlyData[];

    // Get all unique months
    const allMonths = new Set([
      ...incomeMonthly.map(d => d.month),
      ...expenseMonthly.map(d => d.month),
    ]);

    // Combine data by month
    return Array.from(allMonths).map(month => {
      const income = incomeMonthly.find(d => d.month === month);
      const expense = expenseMonthly.find(d => d.month === month);

      return {
        month,
        Income: income?.amount || 0,
        Expenses: expense?.amount || 0,
      };
    });
  }, [incomeChartData, expenseChartData]);

  // Transform data for category pie chart
  const categoryData = useMemo(() => {
    const bySource = incomeChartData?.bySource || [];
    return bySource.map((item: CategoryData) => ({
      name: item.name,
      value: item.value,
      percentage: item.percentage,
    }));
  }, [incomeChartData]);

  // Transform data for expense category pie chart
  const expenseCategoryData = useMemo(() => {
    const byCategory = expenseChartData?.byCategory || [];
    return byCategory.map((item: CategoryData) => ({
      name: item.name,
      value: item.value,
      percentage: item.percentage,
    }));
  }, [expenseChartData]);

  return (
    <div className="min-h-screen px-0">
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <StatCard
            gradient
            description={`Your business recorded a gross revenue of ${formatCurrency(incomeSummary?.grossRevenue || 0)}. After ${formatCurrency(incomeSummary?.totalRefunds || 0)} in refunds, your net income is ${formatCurrency(incomeSummary?.netIncome || 0)} with ${formatCurrency(incomeSummary?.outstandingBalance || 0)} still outstanding from customers.`}
            gradientColor="success"
            tag="Net Income"
            tagColor="success"
            title={formatCurrency(incomeSummary?.netIncome || 0)}
            icon={<Wallet size={24} />}
          />

          <StatCard
            gradient
            description={`Your business incurred ${formatCurrency(expenseSummary?.grossExpenses || 0)} in expenses. After receiving ${formatCurrency(expenseSummary?.totalPurchaseRefunds || 0)} in refunds from vendors, net expenses are ${formatCurrency(expenseSummary?.netExpenses || 0)}. You've paid ${formatCurrency(expenseSummary?.totalPaid || 0)} with ${formatCurrency(expenseSummary?.balance || 0)} still owed to vendors.`}
            gradientColor="danger"
            tag="Net Expenses"
            tagColor="danger"
            title={formatCurrency(expenseSummary?.netExpenses || 0)}
            icon={<CreditCard size={24} />}
          />
        </div>

        {/* Quick Links Section */}
        <Card
          className="rounded-3xl border dark:border-primary-700/20 border-primary-200/10 dark:bg-black"
          shadow="none"
        >
          <CardHeader className="py-6 px-6">
            <div>
              <h3 className="text-base font-semibold text-foreground font-heading tracking-tight leading-tight">
                Quick Actions
              </h3>
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

        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          <Card
            className="col-span-1 md:col-span-12 rounded-3xl border dark:border-primary-700/20 border-primary-200/10 dark:bg-black"
            shadow="none"
          >
            <CardHeader className="flex items-center justify-between py-6 px-6">
              <div>
                <h3 className="text-base font-semibold text-foreground font-heading tracking-tight leading-tight">
                  Revenue Overview
                </h3>
                <p className="text-xs text-default-500">Income vs Expenses</p>
              </div>
            </CardHeader>
            <CardBody>
              <RevenueChart data={revenueData} />
            </CardBody>
          </Card>

          <Card
            className="col-span-1 md:col-span-6 rounded-3xl border dark:border-primary-700/20 border-primary-200/10 dark:bg-black"
            shadow="none"
          >
            <CardHeader className="flex items-center justify-between py-6 px-6">
              <div>
                <h3 className="text-base font-semibold text-foreground font-heading tracking-tight leading-tight">
                  Revenue by Category
                </h3>
                <p className="text-xs text-default-500">Income Distribution</p>
              </div>
            </CardHeader>
            <CardBody>
              <CategoryPieChart data={categoryData} type="income" />
            </CardBody>
          </Card>

          <Card
            className="col-span-1 md:col-span-6 rounded-3xl border dark:border-primary-700/20 border-primary-200/10 dark:bg-black"
            shadow="none"
          >
            <CardHeader className="flex items-center justify-between py-6 px-6">
              <div>
                <h3 className="text-base font-semibold text-foreground font-heading tracking-tight leading-tight">
                  Expenses by Category
                </h3>
                <p className="text-xs text-default-500">Expense Distribution</p>
              </div>
            </CardHeader>
            <CardBody>
              <CategoryPieChart data={expenseCategoryData} type="expense" />
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
