// app/api/reports/income-statement/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getAuthUser } from '@/lib/utils/server';
import { calculateIncome } from '@/lib/handlers/financial-reports';
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

    // Get income data using helper
    const incomeData = await calculateIncome(userId, startDate, endDate);

    // Calculate monthly trend data
    const monthCount = getMonthCount(startDate, endDate);

    // Group revenue by source
    const revenueBreakdown = [
      {
        name: 'Sales Revenue',
        accrual: incomeData.revenue.bySource.sales.netRevenue,
        cash: incomeData.revenue.bySource.sales.cashCollected,
      },
      {
        name: 'Quotation Revenue',
        accrual: incomeData.revenue.bySource.quotations.netRevenue,
        cash: incomeData.revenue.bySource.quotations.cashCollected,
      },
      {
        name: 'Other Income',
        accrual: incomeData.revenue.bySource.otherIncome.revenue,
        cash: incomeData.revenue.bySource.otherIncome.cashCollected,
      },
    ];

    // Calculate gross profit margin
    const grossProfitMarginAccrual =
      incomeData.revenue.accrual > 0
        ? toTwoDecimals(
            (incomeData.grossProfit.accrual / incomeData.revenue.accrual) * 100
          )
        : 0;

    const grossProfitMarginCash =
      incomeData.revenue.cash > 0
        ? toTwoDecimals(
            (incomeData.grossProfit.cash / incomeData.revenue.cash) * 100
          )
        : 0;

    // Calculate net profit margin
    const netProfitMarginAccrual =
      incomeData.revenue.accrual > 0
        ? toTwoDecimals(
            (incomeData.netIncome.accrual / incomeData.revenue.accrual) * 100
          )
        : 0;

    const netProfitMarginCash =
      incomeData.revenue.cash > 0
        ? toTwoDecimals(
            (incomeData.netIncome.cash / incomeData.revenue.cash) * 100
          )
        : 0;

    // Chart data: Income vs Expenses comparison
    const comparisonChart = {
      revenue: {
        accrual: incomeData.revenue.accrual,
        cash: incomeData.revenue.cash,
      },
      directCosts: {
        accrual: incomeData.directCosts.total,
        cash: incomeData.directCosts.total, // Simplified
      },
      operatingExpenses: {
        accrual: incomeData.operatingExpenses.total,
        cash: incomeData.operatingExpenses.total, // Simplified
      },
      netIncome: {
        accrual: incomeData.netIncome.accrual,
        cash: incomeData.netIncome.cash,
      },
    };

    return NextResponse.json(
      {
        success: true,
        meta: {
          type: 'income-statement',
          range: queryParams.range,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          currency: 'NGN',
        },
        incomeStatement: {
          // REVENUE SECTION
          revenue: {
            breakdown: revenueBreakdown,
            total: {
              accrual: incomeData.revenue.accrual,
              cash: incomeData.revenue.cash,
            },
          },

          // COST OF GOODS SOLD / DIRECT COSTS
          directCosts: {
            costOfGoodsSold: incomeData.directCosts.cogs,
            discounts: incomeData.directCosts.discounts,
            deliveryCosts: incomeData.directCosts.deliveryCosts,
            otherSaleExpenses: incomeData.directCosts.otherSaleExpenses,
            total: incomeData.directCosts.total,
          },

          // GROSS PROFIT
          grossProfit: {
            accrual: incomeData.grossProfit.accrual,
            cash: incomeData.grossProfit.cash,
            marginAccrual: grossProfitMarginAccrual,
            marginCash: grossProfitMarginCash,
          },

          // OPERATING EXPENSES
          operatingExpenses: {
            total: incomeData.operatingExpenses.total,
          },

          // NET INCOME (THE ACTUAL INCOME)
          netIncome: {
            accrual: incomeData.netIncome.accrual,
            cash: incomeData.netIncome.cash,
            marginAccrual: netProfitMarginAccrual,
            marginCash: netProfitMarginCash,
            averagePerMonth: {
              accrual: toTwoDecimals(incomeData.netIncome.accrual / monthCount),
              cash: toTwoDecimals(incomeData.netIncome.cash / monthCount),
            },
          },
        },
        chartData: {
          comparison: comparisonChart,
          profitability: {
            grossProfitMargin: {
              accrual: grossProfitMarginAccrual,
              cash: grossProfitMarginCash,
            },
            netProfitMargin: {
              accrual: netProfitMarginAccrual,
              cash: netProfitMarginCash,
            },
          },
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Get income statement error:', error);

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
