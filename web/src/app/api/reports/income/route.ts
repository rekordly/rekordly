import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/utils/server';
import { toTwoDecimals } from '@/lib/fn';
import {
  getDateRange,
  calculateMonthlyData,
  getMonthCount,
  formatSourceName,
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

    // Fetch all sales (paid and unpaid)
    const sales = await prisma.sale.findMany({
      where: {
        userId,
        saleDate: {
          gte: startDate,
          lte: endDate,
        },
        // Include only income-generating statuses
        status: {
          in: ['UNPAID', 'PARTIALLY_PAID', 'PAID', 'PARTIALLY_REFUNDED'],
        },
      },
      include: {
        payments: true,
        customer: true,
      },
      orderBy: {
        saleDate: 'desc',
      },
    });

    // Fetch all quotations (paid and unpaid) - exclude non-income statuses
    const quotations = await prisma.quotation.findMany({
      where: {
        userId,
        issueDate: {
          gte: startDate,
          lte: endDate,
        },
        // Include only income-generating statuses
        status: {
          in: ['UNPAID', 'PARTIALLY_PAID', 'PAID', 'PARTIALLY_REFUNDED'],
          notIn: ['DRAFT', 'SENT', 'EXPIRED', 'CANCELLED'],
        },
      },
      include: {
        payments: true,
        customer: true,
      },
      orderBy: {
        issueDate: 'desc',
      },
    });

    // Fetch all other income
    const otherIncomes = await prisma.incomeRecord.findMany({
      where: {
        userId,
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        payments: true,
      },
      orderBy: {
        date: 'desc',
      },
    });

    // Transform sale data
    const saleData = sales.map(sale => {
      // Get payment details (if any)
      const payment = sale.payments[0]; // Assuming at least one payment

      return {
        id: sale.id,
        date: sale.saleDate,
        amount: sale.amountPaid,
        paymentMethod: payment?.paymentMethod || 'UNPAID',
        reference: payment?.reference || null,
        notes: payment?.notes || null,
        sourceType: 'SALE' as const,
        sourceId: sale.id,
        sourceNumber: sale.receiptNumber,
        sourceTitle: sale.title,
        sourceDescription: sale.description,
        sourceTotalAmount: sale.totalAmount,
        sourceAmountPaid: sale.amountPaid,
        sourceBalance: sale.balance,
        sourceStatus: sale.status,
        refundAmount: sale.refundAmount,
        refundDate: sale.refundDate,
        refundReason: sale.refundReason,
        customerName: sale.customerName,
        customerEmail: sale.customerEmail,
        customerPhone: sale.customerPhone,
        includesVAT: sale.includeVAT,
        vatAmount: sale.vatAmount,
        hasPayment: sale.amountPaid > 0,
      };
    });

    // Transform quotation data
    const quotationData = quotations.map(quotation => {
      // Get payment details (if any)
      const payment = quotation.payments[0]; // Assuming at least one payment

      return {
        id: quotation.id,
        date: quotation.issueDate,
        amount: quotation.amountPaid,
        paymentMethod: payment?.paymentMethod || 'UNPAID',
        reference: payment?.reference || null,
        notes: payment?.notes || null,
        sourceType: 'QUOTATION' as const,
        sourceId: quotation.id,
        sourceNumber: quotation.quotationNumber,
        sourceTitle: quotation.title,
        sourceDescription: quotation.description,
        sourceTotalAmount: quotation.totalAmount,
        sourceAmountPaid: quotation.amountPaid,
        sourceBalance: quotation.balance,
        sourceStatus: quotation.status,
        refundAmount: quotation.refundAmount,
        refundDate: quotation.refundDate,
        refundReason: quotation.refundReason,
        customerName: quotation.customerName,
        customerEmail: quotation.customerEmail,
        customerPhone: quotation.customerPhone,
        includesVAT: quotation.includeVAT,
        vatAmount: quotation.vatAmount,
        hasPayment: quotation.amountPaid > 0,
      };
    });

    // Transform other income data
    const otherIncomeData = otherIncomes.map(income => {
      // Get payment details (if any)
      const payment = income.payments[0]; // Assuming at least one payment

      return {
        id: income.id,
        date: income.date,
        amount: payment?.amount || income.grossAmount,
        paymentMethod: payment?.paymentMethod || 'OTHER',
        reference: payment?.reference || null,
        notes: payment?.notes || null,
        sourceType: 'OTHER_INCOME' as const,
        sourceId: income.id,
        sourceNumber: null,
        sourceTitle: null,
        sourceDescription: income.description,
        sourceTotalAmount: income.grossAmount,
        sourceAmountPaid: null,
        sourceBalance: null,
        sourceStatus: null,
        refundAmount: null,
        refundDate: null,
        refundReason: null,
        taxablePercentage: income.taxablePercentage,
        incomeMainCategory: income.mainCategory,
        incomeSubCategory: income.subCategory,
        customSubCategory: income.customSubCategory,
        customerName: null,
        customerEmail: null,
        customerPhone: null,
        includesVAT: false,
        vatAmount: null,
        hasPayment: !!payment,
      };
    });

    // Combine all data
    const data = [...saleData, ...quotationData, ...otherIncomeData].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    // Calculate totals
    let grossRevenue = 0;
    let salesRefunds = 0;
    let quotationRefunds = 0;
    let totalReceived = 0;
    let outstandingBalance = 0;

    // Process sales
    sales.forEach(sale => {
      grossRevenue += sale.totalAmount;
      salesRefunds += sale.refundAmount || 0;
      totalReceived += sale.amountPaid || 0;
      outstandingBalance += sale.balance || 0;
    });

    // Process quotations
    quotations.forEach(quotation => {
      grossRevenue += quotation.totalAmount;
      quotationRefunds += quotation.refundAmount || 0;
      totalReceived += quotation.amountPaid || 0;
      outstandingBalance += quotation.balance || 0;
    });

    // Process other incomes
    otherIncomes.forEach(income => {
      grossRevenue += income.grossAmount;
      totalReceived += income.grossAmount; // Other income is always fully received
    });

    grossRevenue = toTwoDecimals(grossRevenue);
    salesRefunds = toTwoDecimals(salesRefunds);
    quotationRefunds = toTwoDecimals(quotationRefunds);
    const totalRefunds = toTwoDecimals(salesRefunds + quotationRefunds);

    // Net Income = Gross Revenue - Total Refunds
    const netIncome = toTwoDecimals(grossRevenue - totalRefunds);
    totalReceived = toTwoDecimals(totalReceived);
    outstandingBalance = toTwoDecimals(outstandingBalance);

    // Calculate by source breakdown - using NET INCOME (gross - refunds)
    const bySource = {} as Record<string, number>;
    const sourceRefunds = {} as Record<string, number>;

    // Process sales by source
    sales.forEach(sale => {
      const source = 'SALE';
      const grossAmount = sale.totalAmount;
      const refundAmount = sale.refundAmount || 0;
      const netAmount = grossAmount - refundAmount;

      bySource[source] = toTwoDecimals((bySource[source] || 0) + netAmount);
      sourceRefunds[source] = toTwoDecimals(
        (sourceRefunds[source] || 0) + refundAmount
      );
    });

    // Process quotations by source
    quotations.forEach(quotation => {
      const source = 'QUOTATION';
      const grossAmount = quotation.totalAmount;
      const refundAmount = quotation.refundAmount || 0;
      const netAmount = grossAmount - refundAmount;

      bySource[source] = toTwoDecimals((bySource[source] || 0) + netAmount);
      sourceRefunds[source] = toTwoDecimals(
        (sourceRefunds[source] || 0) + refundAmount
      );
    });

    // Process other income
    otherIncomes.forEach(income => {
      const source = 'OTHER_INCOME';
      const netAmount = income.grossAmount; // Other income doesn't have refunds

      bySource[source] = toTwoDecimals((bySource[source] || 0) + netAmount);
      sourceRefunds[source] = sourceRefunds[source] || 0;
    });

    // By payment method breakdown
    const byPaymentMethod = {} as Record<string, number>;

    // Sales payments
    sales.forEach(sale => {
      sale.payments.forEach(payment => {
        byPaymentMethod[payment.paymentMethod] = toTwoDecimals(
          (byPaymentMethod[payment.paymentMethod] || 0) + payment.amount
        );
      });
    });

    // Quotation payments
    quotations.forEach(quotation => {
      quotation.payments.forEach(payment => {
        byPaymentMethod[payment.paymentMethod] = toTwoDecimals(
          (byPaymentMethod[payment.paymentMethod] || 0) + payment.amount
        );
      });
    });

    // Other income payments
    otherIncomes.forEach(income => {
      income.payments.forEach(payment => {
        byPaymentMethod[payment.paymentMethod] = toTwoDecimals(
          (byPaymentMethod[payment.paymentMethod] || 0) + payment.amount
        );
      });
    });

    // Calculate monthly data for charts
    // Combine all payments for monthly calculation
    const allPaymentsForMonthly = [
      ...sales.flatMap(s => s.payments),
      ...quotations.flatMap(q => q.payments),
      ...otherIncomes.flatMap(i => i.payments),
    ];

    const monthlyData = calculateMonthlyData(
      allPaymentsForMonthly,
      startDate,
      endDate
    );

    // Calculate source breakdown for chart (using NET income)
    const sourceBreakdown = Object.entries(bySource).map(
      ([name, netValue]) => ({
        name: formatSourceName(name),
        value: netValue,
        percentage:
          netIncome > 0 ? toTwoDecimals((netValue / netIncome) * 100) : 0,
        refundAmount: sourceRefunds[name] || 0,
      })
    );

    // Find top source based on NET income
    const topSource =
      Object.keys(bySource).length > 0
        ? Object.keys(bySource).reduce((a, b) =>
            bySource[a] > bySource[b] ? a : b
          )
        : 'OTHER_INCOME';

    const summary = {
      grossRevenue,
      totalRefunds,
      refundsBySource: {
        SALE: salesRefunds,
        QUOTATION: quotationRefunds,
      },
      netIncome,
      totalReceived,
      outstandingBalance,
      averagePerMonth: toTwoDecimals(
        netIncome / getMonthCount(startDate, endDate)
      ),
      topSource,
      bySource,
      byPaymentMethod,
    };

    const chartData = {
      monthly: monthlyData,
      bySource: sourceBreakdown,
    };

    return NextResponse.json(
      {
        success: true,
        meta: {
          type: 'income',
          range: queryParams.range,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          totalRecords: data.length,
          saleRecords: sales.length,
          quotationRecords: quotations.length,
          otherIncomeRecords: otherIncomes.length,
          currency: 'NGN',
        },
        summary,
        chartData,
        data,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Get income report error:', error);

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
