// app/api/reports/expenses/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getAuthUser } from '@/lib/utils/server';
import { calculateExpenses } from '@/lib/handlers/financial-reports';
import {
  getDateRange,
  calculateMonthlyData,
  getMonthCount,
  formatCategoryName,
} from '@/lib/utils/reports';
import { reportQuerySchema } from '@/lib/validations/general';

export async function GET(request: NextRequest) {
  try {
    const { userId } = await getAuthUser(request);

    const searchParams = request.nextUrl.searchParams;
    const queryParams = reportQuerySchema.parse({
      range: searchParams.get('range') || 'thisYear',
      startDate: searchParams.get('startDate') || undefined,
      endDate: searchParams.get('endDate') || undefined,
    });

    const { startDate, endDate } = getDateRange(
      queryParams.range,
      queryParams.startDate,
      queryParams.endDate
    );

    // Get expense data using helper
    const expenseData = await calculateExpenses(userId, startDate, endDate);

    // Transform purchase data for detailed list
    const purchaseData = expenseData.rawData.purchases.map(purchase => {
      const netAmount = purchase.totalAmount - (purchase.refundAmount || 0);
      const balance = Math.max(0, netAmount - purchase.amountPaid);
      const payment = purchase.payments[0];

      return {
        id: purchase.id,
        date: purchase.purchaseDate,
        type: 'PURCHASE' as const,
        number: purchase.purchaseNumber,
        vendorName: purchase.vendorName,
        title: purchase.title,
        description: purchase.description,
        totalAmount: purchase.totalAmount,
        refundAmount: purchase.refundAmount || 0,
        netAmount,
        amountPaid: purchase.amountPaid,
        balance,
        status: purchase.status,
        purchaseType: purchase.purchaseType,
        category: 'PURCHASE',
        includesVAT: purchase.includeVAT,
        vatAmount: purchase.vatAmount,
        paymentMethod: payment?.paymentMethod || null,
      };
    });

    // Transform expense data for detailed list
    const expensesDetailedData = expenseData.rawData.expenses.map(expense => {
      const totalPaid = expense.payments.reduce((sum, p) => sum + p.amount, 0);
      const payment = expense.payments[0];

      return {
        id: expense.id,
        date: expense.date,
        type: 'EXPENSE' as const,
        number: null,
        vendorName: expense.vendorName,
        title: null,
        description: expense.description,
        totalAmount: expense.amount,
        refundAmount: 0,
        netAmount: expense.amount,
        amountPaid: totalPaid,
        balance: 0,
        status: 'PAID',
        category: expense.category,
        subCategory: expense.subCategory,
        isDeductible: expense.isDeductible,
        deductionPercentage: expense.deductionPercentage,
        receipt: expense.receipt,
        paymentMethod: payment?.paymentMethod || null,
      };
    });

    // Combine and sort by date
    const detailedList = [...purchaseData, ...expensesDetailedData].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    // Calculate monthly data for chart
    const allPayments = [
      ...expenseData.rawData.purchases.flatMap(p => p.payments),
      ...expenseData.rawData.expenses.flatMap(e => e.payments),
    ];

    const monthlyData = calculateMonthlyData(allPayments, startDate, endDate);

    // Category breakdown for chart - combine purchases and expenses
    const allCategories = {
      ...expenseData.byType.purchases.breakdown,
      ...expenseData.byType.expenses.breakdown,
    };

    const categoryBreakdown = Object.entries(allCategories).map(
      ([name, value]) => ({
        name: formatCategoryName(name),
        value,
        percentage:
          expenseData.summary.netExpensesAccrual > 0
            ? ((value / expenseData.summary.netExpensesAccrual) * 100).toFixed(
                2
              )
            : 0,
      })
    );

    // Find top category
    const topCategory =
      Object.keys(allCategories).length > 0
        ? Object.keys(allCategories).reduce((a, b) =>
            allCategories[a] > allCategories[b] ? a : b
          )
        : 'OTHER';

    const result = {
      summary: {
        // Accrual Basis
        totalExpensesAccrual: expenseData.summary.totalExpensesAccrual,
        totalRefunds: expenseData.summary.totalRefunds,
        netExpensesAccrual: expenseData.summary.netExpensesAccrual,

        // Cash Basis
        totalCashPaid: expenseData.summary.totalCashPaid,
        totalOutstanding: expenseData.summary.totalOutstanding,

        // Tax deductibility
        deductibleExpenses: expenseData.summary.deductibleExpenses,
        nonDeductibleExpenses: expenseData.summary.nonDeductibleExpenses,
        deductiblePercentage:
          expenseData.summary.totalCashPaid > 0
            ? (
                (expenseData.summary.deductibleExpenses /
                  expenseData.summary.totalCashPaid) *
                100
              ).toFixed(2)
            : 0,

        // Breakdown
        byType: expenseData.byType,

        // Averages
        averagePerMonth: (
          expenseData.summary.netExpensesAccrual /
          getMonthCount(startDate, endDate)
        ).toFixed(2),

        topCategory,
      },
      chartData: {
        monthly: monthlyData,
        byCategory: categoryBreakdown,
      },
      data: detailedList,
    };

    console.log(JSON.stringify(result, null, 2));
    return NextResponse.json(
      {
        success: true,
        meta: {
          type: 'expense',
          range: queryParams.range,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          totalRecords: detailedList.length,
          purchaseRecords: expenseData.rawData.purchases.length,
          expenseRecords: expenseData.rawData.expenses.length,
          currency: 'NGN',
        },
        summary: {
          // Accrual Basis
          totalExpensesAccrual: expenseData.summary.totalExpensesAccrual,
          totalRefunds: expenseData.summary.totalRefunds,
          netExpensesAccrual: expenseData.summary.netExpensesAccrual,

          // Cash Basis
          totalCashPaid: expenseData.summary.totalCashPaid,
          totalOutstanding: expenseData.summary.totalOutstanding,

          // Tax deductibility
          deductibleExpenses: expenseData.summary.deductibleExpenses,
          nonDeductibleExpenses: expenseData.summary.nonDeductibleExpenses,
          deductiblePercentage:
            expenseData.summary.totalCashPaid > 0
              ? (
                  (expenseData.summary.deductibleExpenses /
                    expenseData.summary.totalCashPaid) *
                  100
                ).toFixed(2)
              : 0,

          // Breakdown
          byType: expenseData.byType,

          // Averages
          averagePerMonth: (
            expenseData.summary.netExpensesAccrual /
            getMonthCount(startDate, endDate)
          ).toFixed(2),

          topCategory,
        },
        chartData: {
          monthly: monthlyData,
          byCategory: categoryBreakdown,
        },
        data: detailedList,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Get expense report error:', error);

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
