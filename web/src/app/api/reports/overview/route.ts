// app/api/reports/overview/route.ts
import { NextRequest } from 'next/server';
import {
  calculateIncome,
  calculateExpenses,
  calculateRevenue,
} from '@/lib/handlers/financial-reports';
import { getMonthCount, calculateMonthlyData } from '@/lib/utils/reports';
import { toTwoDecimals } from '@/lib/fn';
import {
  parseReportQuery,
  createReportMeta,
  apiResponse,
  handleApiError,
} from '@/lib/utils/api-helpers';

export async function GET(request: NextRequest) {
  try {
    const { userId, queryParams, startDate, endDate } =
      await parseReportQuery(request);

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

    // Calculate monthly trend data
    const revenuePayments = [
      ...revenueData.rawData.sales.flatMap(s => s.payments),
      ...revenueData.rawData.quotations.flatMap(q => q.payments),
      ...revenueData.rawData.otherIncomes.flatMap(i => i.payments),
    ];

    const expensePayments = [
      ...expenseData.rawData.purchases.flatMap(p => p.payments),
      ...expenseData.rawData.expenses.flatMap(e => e.payments),
    ];

    const revenueMonthly = calculateMonthlyData(
      revenuePayments,
      startDate,
      endDate
    );
    const expenseMonthly = calculateMonthlyData(
      expensePayments,
      startDate,
      endDate
    );

    // Combine revenue and expense monthly data
    const allMonths = new Set([
      ...revenueMonthly.map(d => d.month),
      ...expenseMonthly.map(d => d.month),
    ]);

    const monthlyTrend = Array.from(allMonths)
      .map(month => {
        const revenue = revenueMonthly.find(d => d.month === month);
        const expense = expenseMonthly.find(d => d.month === month);
        const revenueAmount = revenue?.amount || 0;
        const expenseAmount = expense?.amount || 0;

        return {
          month,
          revenue: revenueAmount,
          expenses: expenseAmount,
          profit: revenueAmount - expenseAmount,
        };
      })
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-12); // Last 12 months

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

    // Expense Breakdown
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

    // Profitability Chart
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

    return apiResponse({
      success: true,
      meta: createReportMeta(
        'financial-overview',
        queryParams.range,
        startDate,
        endDate,
        { monthCount }
      ),
      overview,
      chartData: {
        monthlyTrend,
        revenueBreakdown,
        expenseBreakdown,
        profitability: profitabilityChart,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
