import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getAuthUser } from '@/lib/utils/server';
import { calculateRevenue } from '@/lib/handlers/financial-reports';
import {
  getDateRange,
  calculateMonthlyData,
  getMonthCount,
} from '@/lib/utils/reports';
import { reportQuerySchema } from '@/lib/validations/general';

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

    // Get revenue data using helper
    const revenueData = await calculateRevenue(userId, startDate, endDate);

    // Transform data for detailed list
    const salesData = revenueData.rawData.sales.map(sale => ({
      id: sale.id,
      date: sale.saleDate,
      type: 'SALE' as const,
      number: sale.receiptNumber,
      customerName: sale.customerName,
      title: sale.title,
      description: sale.description,
      totalAmount: sale.totalAmount,
      refundAmount: sale.refundAmount || 0,
      netAmount: sale.totalAmount - (sale.refundAmount || 0),
      amountPaid: sale.amountPaid,
      balance: sale.balance,
      status: sale.status,
      includesVAT: sale.includeVAT,
      vatAmount: sale.vatAmount,
    }));

    const quotationData = revenueData.rawData.quotations.map(quotation => ({
      id: quotation.id,
      date: quotation.issueDate,
      type: 'QUOTATION' as const,
      number: quotation.quotationNumber,
      customerName: quotation.customerName,
      title: quotation.title,
      description: quotation.description,
      totalAmount: quotation.totalAmount,
      refundAmount: quotation.refundAmount || 0,
      netAmount: quotation.totalAmount - (quotation.refundAmount || 0),
      amountPaid: quotation.amountPaid,
      balance: quotation.balance,
      status: quotation.status,
      includesVAT: quotation.includeVAT,
      vatAmount: quotation.vatAmount,
    }));

    const otherIncomeData = revenueData.rawData.otherIncomes.map(income => {
      const totalPaid = income.payments.reduce((sum, p) => sum + p.amount, 0);
      return {
        id: income.id,
        date: income.date,
        type: 'OTHER_INCOME' as const,
        number: null,
        customerName: null,
        title: null,
        description: income.description,
        mainCategory: income.mainCategory,
        subCategory: income.subCategory,
        customSubCategory: income.customSubCategory,
        totalAmount: income.grossAmount,
        refundAmount: 0,
        netAmount: income.grossAmount,
        amountPaid: totalPaid || income.grossAmount,
        balance: 0,
        status: 'PAID',
        taxablePercentage: income.taxablePercentage,
      };
    });

    // Combine and sort by date
    const detailedList = [
      ...salesData,
      ...quotationData,
      ...otherIncomeData,
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Calculate monthly data for chart
    const allPayments = [
      ...revenueData.rawData.sales.flatMap(s => s.payments),
      ...revenueData.rawData.quotations.flatMap(q => q.payments),
      ...revenueData.rawData.otherIncomes.flatMap(i => i.payments),
    ];

    const monthlyData = calculateMonthlyData(allPayments, startDate, endDate);

    // Source breakdown for chart
    const sourceBreakdown = [
      {
        name: 'Sales',
        value: revenueData.bySource.sales.netRevenue,
        percentage:
          revenueData.summary.netRevenueAccrual > 0
            ? (
                (revenueData.bySource.sales.netRevenue /
                  revenueData.summary.netRevenueAccrual) *
                100
              ).toFixed(2)
            : 0,
      },
      {
        name: 'Quotations',
        value: revenueData.bySource.quotations.netRevenue,
        percentage:
          revenueData.summary.netRevenueAccrual > 0
            ? (
                (revenueData.bySource.quotations.netRevenue /
                  revenueData.summary.netRevenueAccrual) *
                100
              ).toFixed(2)
            : 0,
      },
      {
        name: 'Other Income',
        value: revenueData.bySource.otherIncome.revenue,
        percentage:
          revenueData.summary.netRevenueAccrual > 0
            ? (
                (revenueData.bySource.otherIncome.revenue /
                  revenueData.summary.netRevenueAccrual) *
                100
              ).toFixed(2)
            : 0,
      },
    ];

    return NextResponse.json(
      {
        success: true,
        meta: {
          type: 'revenue',
          range: queryParams.range,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          totalRecords: detailedList.length,
          currency: 'NGN',
        },
        summary: {
          // Accrual Basis
          totalRevenueAccrual: revenueData.summary.totalRevenueAccrual,
          totalRefunds: revenueData.summary.totalRefunds,
          netRevenueAccrual: revenueData.summary.netRevenueAccrual,

          // Cash Basis
          totalCashCollected: revenueData.summary.totalCashCollected,
          totalOutstanding: revenueData.summary.totalOutstanding,

          // Breakdown
          bySource: revenueData.bySource,

          // Averages
          averagePerMonth: (
            revenueData.summary.netRevenueAccrual /
            getMonthCount(startDate, endDate)
          ).toFixed(2),
        },
        chartData: {
          monthly: monthlyData,
          bySource: sourceBreakdown,
        },
        data: detailedList,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Get revenue report error:', error);

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
