// app/api/reports/overview/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getAuthUser } from '@/lib/utils/server';
import {
  calculateIncome,
  calculateExpenses,
  calculateRevenue,
} from '@/lib/handlers/financial-reports';
import { getDateRange, getMonthCount } from '@/lib/utils/reports';
import { reportQuerySchema } from '@/lib/validations/general';
import { toTwoDecimals } from '@/lib/fn';

export async function GET(request: NextRequest) {
  try {
    const { userId } = await getAuthUser(request);

    // Parse query params
    const searchParams = request.nextUrl.searchParams;
    const queryParams = reportQuerySchema.parse({
      range: searchParams.get('range') || 'thisYear',
      startDate: searchParams.get('startDate') || undefined,
      endDate: searchParams.get('endDate') || undefined,
    });

    // Calculate date range
    const { startDate, endDate } = getDateRange(
      queryParams.range,
      queryParams.startDate,
      queryParams.endDate
    );

    // Fetch all data in parallel for performance
    const [incomeData, expenseData, revenueData] = await Promise.all([
      calculateIncome(userId, startDate, endDate),
      calculateExpenses(userId, startDate, endDate),
      calculateRevenue(userId, startDate, endDate),
    ]);

    const monthCount = getMonthCount(startDate, endDate);

    // ============================================
    // OVERVIEW SUMMARY
    // ============================================

    const overview = {
      // Revenue Summary
      revenue: {
        accrual: revenueData.summary.netRevenueAccrual,
        cash: revenueData.summary.totalCashCollected,
        outstanding: revenueData.summary.totalOutstanding,
        bySource: {
          sales: revenueData.bySource.sales.netRevenue,
          quotations: revenueData.bySource.quotations.netRevenue,
          otherIncome: revenueData.bySource.otherIncome.revenue,
        },
      },

      // Expense Summary
      expenses: {
        accrual: expenseData.summary.netExpensesAccrual,
        cash: expenseData.summary.totalCashPaid,
        outstanding: expenseData.summary.totalOutstanding,
        deductible: expenseData.summary.deductibleExpenses,
        nonDeductible: expenseData.summary.nonDeductibleExpenses,
      },

      // Income Statement Summary (Net Profit)
      income: {
        grossProfit: {
          accrual: incomeData.grossProfit.accrual,
          cash: incomeData.grossProfit.cash,
        },
        netIncome: {
          accrual: incomeData.netIncome.accrual,
          cash: incomeData.netIncome.cash,
        },
        profitMargin: {
          gross: {
            accrual:
              incomeData.revenue.accrual > 0
                ? toTwoDecimals(
                    (incomeData.grossProfit.accrual /
                      incomeData.revenue.accrual) *
                      100
                  )
                : 0,
            cash:
              incomeData.revenue.cash > 0
                ? toTwoDecimals(
                    (incomeData.grossProfit.cash / incomeData.revenue.cash) *
                      100
                  )
                : 0,
          },
          net: {
            accrual:
              incomeData.revenue.accrual > 0
                ? toTwoDecimals(
                    (incomeData.netIncome.accrual /
                      incomeData.revenue.accrual) *
                      100
                  )
                : 0,
            cash:
              incomeData.revenue.cash > 0
                ? toTwoDecimals(
                    (incomeData.netIncome.cash / incomeData.revenue.cash) * 100
                  )
                : 0,
          },
        },
      },

      // Key Metrics
      metrics: {
        averageMonthlyRevenue: {
          accrual: toTwoDecimals(
            revenueData.summary.netRevenueAccrual / monthCount
          ),
          cash: toTwoDecimals(
            revenueData.summary.totalCashCollected / monthCount
          ),
        },
        averageMonthlyExpense: {
          accrual: toTwoDecimals(
            expenseData.summary.netExpensesAccrual / monthCount
          ),
          cash: toTwoDecimals(expenseData.summary.totalCashPaid / monthCount),
        },
        averageMonthlyProfit: {
          accrual: toTwoDecimals(incomeData.netIncome.accrual / monthCount),
          cash: toTwoDecimals(incomeData.netIncome.cash / monthCount),
        },
        outstandingReceivables: revenueData.summary.totalOutstanding,
        outstandingPayables: expenseData.summary.totalOutstanding,
      },
    };

    // ============================================
    // CHART DATA
    // ============================================

    // Revenue vs Expenses Over Time (simplified monthly)
    const comparisonChart = {
      labels: [], // You can generate month labels based on date range
      revenue: {
        accrual: revenueData.summary.netRevenueAccrual,
        cash: revenueData.summary.totalCashCollected,
      },
      expenses: {
        accrual: expenseData.summary.netExpensesAccrual,
        cash: expenseData.summary.totalCashPaid,
      },
      profit: {
        accrual: incomeData.netIncome.accrual,
        cash: incomeData.netIncome.cash,
      },
    };

    // Revenue Breakdown
    const revenueBreakdown = [
      {
        name: 'Sales',
        value: revenueData.bySource.sales.netRevenue,
        percentage:
          revenueData.summary.netRevenueAccrual > 0
            ? toTwoDecimals(
                (revenueData.bySource.sales.netRevenue /
                  revenueData.summary.netRevenueAccrual) *
                  100
              )
            : 0,
      },
      {
        name: 'Quotations',
        value: revenueData.bySource.quotations.netRevenue,
        percentage:
          revenueData.summary.netRevenueAccrual > 0
            ? toTwoDecimals(
                (revenueData.bySource.quotations.netRevenue /
                  revenueData.summary.netRevenueAccrual) *
                  100
              )
            : 0,
      },
      {
        name: 'Other Income',
        value: revenueData.bySource.otherIncome.revenue,
        percentage:
          revenueData.summary.netRevenueAccrual > 0
            ? toTwoDecimals(
                (revenueData.bySource.otherIncome.revenue /
                  revenueData.summary.netRevenueAccrual) *
                  100
              )
            : 0,
      },
    ];

    // Expense Type Breakdown
    const expenseBreakdown = [
      {
        name: 'Purchases',
        value: expenseData.byType.purchases.net,
        percentage:
          expenseData.summary.netExpensesAccrual > 0
            ? toTwoDecimals(
                (expenseData.byType.purchases.net /
                  expenseData.summary.netExpensesAccrual) *
                  100
              )
            : 0,
      },
      {
        name: 'Other Expenses',
        value: expenseData.byType.expenses.total,
        percentage:
          expenseData.summary.netExpensesAccrual > 0
            ? toTwoDecimals(
                (expenseData.byType.expenses.total /
                  expenseData.summary.netExpensesAccrual) *
                  100
              )
            : 0,
      },
    ];

    // Profitability Trend
    const profitabilityChart = {
      grossProfitMargin: {
        accrual:
          incomeData.revenue.accrual > 0
            ? toTwoDecimals(
                (incomeData.grossProfit.accrual / incomeData.revenue.accrual) *
                  100
              )
            : 0,
        cash:
          incomeData.revenue.cash > 0
            ? toTwoDecimals(
                (incomeData.grossProfit.cash / incomeData.revenue.cash) * 100
              )
            : 0,
      },
      netProfitMargin: {
        accrual:
          incomeData.revenue.accrual > 0
            ? toTwoDecimals(
                (incomeData.netIncome.accrual / incomeData.revenue.accrual) *
                  100
              )
            : 0,
        cash:
          incomeData.revenue.cash > 0
            ? toTwoDecimals(
                (incomeData.netIncome.cash / incomeData.revenue.cash) * 100
              )
            : 0,
      },
    };

    return NextResponse.json(
      {
        success: true,
        meta: {
          type: 'financial-overview',
          range: queryParams.range,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          monthCount,
          currency: 'NGN',
        },
        overview,
        chartData: {
          comparison: comparisonChart,
          revenueBreakdown,
          expenseBreakdown,
          profitability: profitabilityChart,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Get financial overview error:', error);

    if (error instanceof z.ZodError) {
      const flatErrors = error.flatten().fieldErrors;
      const message = Object.values(flatErrors).flat()[0] || 'Invalid input';
      return NextResponse.json(
        { error: 'Validation failed', message },
        { status: 400 }
      );
    }

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ message: error.message }, { status: 401 });
    }

    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
