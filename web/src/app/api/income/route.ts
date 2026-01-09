// app/api/income/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/utils/server';
import { toTwoDecimals } from '@/lib/fn';
import { validateRequest } from '@/lib/utils/validation';
import { addIncomeSchema } from '@/lib/validations/income';
import {
  formatCustomSubCategory,
  IncomeMainCategory,
  IncomeRecordStatus,
  IncomeSubCategory,
  normalizeIncomeSubCategory,
} from '@/types/income';
import { PaymentMethod } from '@/types/index';
import { validateWorkTypeForCategory } from '@/lib/utils/workTypeValidation';
import { calculateRevenue } from '@/lib/handlers/financial-reports';
import { reportQuerySchema } from '@/lib/validations/general';
import {
  calculateMonthlyData,
  formatSourceName,
  getDateRange,
  getMonthCount,
} from '@/lib/utils/reports';
import z from 'zod';

export async function POST(request: NextRequest) {
  try {
    const { userId, workTypes } = await getAuthUser(request);

    const incomeData = await validateRequest(request, addIncomeSchema);
    const normalizedSubCategory = normalizeIncomeSubCategory(
      incomeData.subCategory
    );

    const subCategory = normalizedSubCategory
      ? normalizedSubCategory
      : IncomeSubCategory.CUSTOM;

    const customSubCategory = normalizedSubCategory
      ? null
      : formatCustomSubCategory(incomeData.subCategory);

    validateWorkTypeForCategory(
      workTypes,
      incomeData.mainCategory as IncomeMainCategory,
      true
    );

    const result = await prisma.$transaction(
      async tx => {
        const grossAmount = toTwoDecimals(incomeData.grossAmount);

        // Create income record with payment tracking
        const income = await tx.incomeRecord.create({
          data: {
            userId,
            mainCategory: incomeData.mainCategory as IncomeMainCategory,
            subCategory: subCategory as IncomeSubCategory,
            customSubCategory: customSubCategory,
            grossAmount: grossAmount,
            amountPaid: grossAmount, // Fully paid on creation
            balance: 0, // No balance remaining
            status: IncomeRecordStatus.PAID,
            taxablePercentage: incomeData.taxablePercentage,
            description: incomeData.description,
            date: incomeData.date ? new Date(incomeData.date) : new Date(),
          },
        });

        // Create payment record
        const payment = await tx.payment.create({
          data: {
            userId,
            incomeId: income.id,
            payableType: 'OTHER_INCOME',
            amount: grossAmount,
            paymentDate: incomeData.date
              ? new Date(incomeData.date)
              : new Date(),
            paymentMethod: (incomeData.paymentMethod ||
              'BANK_TRANSFER') as PaymentMethod,
            category: 'INCOME',
            reference: incomeData.reference || null,
            notes:
              incomeData.description || `Payment for ${incomeData.subCategory}`,
          },
        });

        return { income, payment };
      },
      {
        maxWait: 15000,
        timeout: 15000,
      }
    );

    return NextResponse.json(
      {
        message: 'Income recorded successfully',
        success: true,
        payment: result.payment,
        income: result.income,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Record income error:', error);

    if (error instanceof NextResponse) return error;

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ message: error.message }, { status: 401 });
    }

    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}

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

    const revenueData = await calculateRevenue(userId, startDate, endDate);

    // Transform sale data for detailed list
    const saleData = revenueData.rawData.sales.map(sale => {
      const payment = sale.payments[0];

      return {
        id: sale.id,
        date: sale.saleDate,
        amount: sale.totalAmount,
        amountPaid: sale.amountPaid,
        balance: sale.balance,
        status: sale.status,
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
        payments: sale.payments.map(p => ({
          id: p.id,
          amount: p.amount,
          paymentDate: p.paymentDate.toISOString(),
          paymentMethod: p.paymentMethod,
          reference: p.reference,
          notes: p.notes,
        })),
      };
    });

    // Transform quotation data
    const quotationData = revenueData.rawData.quotations.map(quotation => {
      const payment = quotation.payments[0];

      return {
        id: quotation.id,
        date: quotation.issueDate,
        amount: quotation.totalAmount,
        amountPaid: quotation.amountPaid,
        balance: quotation.balance,
        status: quotation.status,
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
        payments: quotation.payments.map(p => ({
          id: p.id,
          amount: p.amount,
          paymentDate: p.paymentDate.toISOString(),
          paymentMethod: p.paymentMethod,
          reference: p.reference,
          notes: p.notes,
        })),
      };
    });

    // Transform other income data
    const otherIncomeData = revenueData.rawData.otherIncomes.map(income => {
      const payment = income.payments[0];

      return {
        id: income.id,
        date: income.date,
        amount: income.grossAmount,
        amountPaid: income.amountPaid,
        balance: income.balance,
        status: income.status,
        paymentMethod: payment?.paymentMethod || 'OTHER',
        reference: payment?.reference || null,
        notes: payment?.notes || null,
        sourceType: 'OTHER_INCOME' as const,
        sourceId: income.id,
        sourceNumber: null,
        sourceTitle: null,
        sourceDescription: income.description,
        sourceTotalAmount: income.grossAmount,
        sourceAmountPaid: income.amountPaid,
        sourceBalance: income.balance,
        sourceStatus: income.status,
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
        payments: income.payments.map(p => ({
          id: p.id,
          amount: p.amount,
          paymentDate: p.paymentDate.toISOString(),
          paymentMethod: p.paymentMethod,
          reference: p.reference,
          notes: p.notes,
        })),
      };
    });

    // Combine all data
    const data = [...saleData, ...quotationData, ...otherIncomeData].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    // Calculate payment status breakdown
    const byStatus: Record<string, number> = {
      UNPAID: 0,
      PARTIALLY_PAID: 0,
      PAID: 0,
      REFUNDED: 0,
      PARTIALLY_REFUNDED: 0,
    };

    let unpaidAmount = 0;
    let partiallyPaidAmount = 0;
    let paidAmount = 0;

    data.forEach(item => {
      byStatus[item.status] = toTwoDecimals(
        (byStatus[item.status] || 0) + item.amount
      );

      if (item.status === 'UNPAID') {
        unpaidAmount += item.amount;
      } else if (item.status === 'PARTIALLY_PAID') {
        partiallyPaidAmount += item.amount;
      } else if (item.status === 'PAID') {
        paidAmount += item.amount;
      }
    });

    // Calculate by source breakdown
    const bySource = {
      SALE: revenueData.bySource.sales.netRevenue,
      QUOTATION: revenueData.bySource.quotations.netRevenue,
      OTHER_INCOME: revenueData.bySource.otherIncome.revenue,
    };

    const sourceRefunds = {
      SALE: revenueData.bySource.sales.refunds,
      QUOTATION: revenueData.bySource.quotations.refunds,
      OTHER_INCOME: 0,
    };

    // By payment method breakdown
    const byPaymentMethod = {} as Record<string, number>;

    [...revenueData.rawData.sales, ...revenueData.rawData.quotations].forEach(
      item => {
        item.payments.forEach(payment => {
          byPaymentMethod[payment.paymentMethod] = toTwoDecimals(
            (byPaymentMethod[payment.paymentMethod] || 0) + payment.amount
          );
        });
      }
    );

    revenueData.rawData.otherIncomes.forEach(income => {
      income.payments.forEach(payment => {
        byPaymentMethod[payment.paymentMethod] = toTwoDecimals(
          (byPaymentMethod[payment.paymentMethod] || 0) + payment.amount
        );
      });
    });

    // Calculate monthly data for charts
    const allPaymentsForMonthly = [
      ...revenueData.rawData.sales.flatMap(s => s.payments),
      ...revenueData.rawData.quotations.flatMap(q => q.payments),
      ...revenueData.rawData.otherIncomes.flatMap(i => i.payments),
    ];

    const monthlyData = calculateMonthlyData(
      allPaymentsForMonthly,
      startDate,
      endDate
    ).map(month => {
      // Calculate received vs outstanding for each month
      const monthIncome = data.filter(income => {
        const incomeMonth = new Date(income.date).toISOString().slice(0, 7);
        return incomeMonth === month.month;
      });

      const received = monthIncome
        .filter(i => i.status === 'PAID')
        .reduce((sum, i) => sum + i.amountPaid, 0);
      const outstanding = monthIncome
        .filter(i => i.status === 'UNPAID' || i.status === 'PARTIALLY_PAID')
        .reduce((sum, i) => sum + i.balance, 0);

      return {
        ...month,
        received: toTwoDecimals(received),
        outstanding: toTwoDecimals(outstanding),
      };
    });

    // Calculate source breakdown for chart
    const sourceBreakdown = Object.entries(bySource).map(
      ([name, netValue]) => ({
        name: formatSourceName(name),
        value: netValue,
        percentage:
          revenueData.summary.netRevenueAccrual > 0
            ? toTwoDecimals(
                (netValue / revenueData.summary.netRevenueAccrual) * 100
              )
            : 0,
        refundAmount: sourceRefunds[name as keyof typeof sourceRefunds] || 0,
      })
    );

    // Status breakdown for chart
    const statusBreakdown = Object.entries(byStatus).map(([status, value]) => ({
      status: status as IncomeRecordStatus,
      value,
      percentage:
        revenueData.summary.totalRevenueAccrual > 0
          ? toTwoDecimals(
              (value / revenueData.summary.totalRevenueAccrual) * 100
            )
          : 0,
    }));

    // Find top source
    const topSource =
      Object.keys(bySource).length > 0
        ? Object.keys(bySource).reduce((a, b) =>
            bySource[a as keyof typeof bySource] >
            bySource[b as keyof typeof bySource]
              ? a
              : b
          )
        : 'OTHER_INCOME';

    const summary = {
      // Accrual basis
      grossRevenue: revenueData.summary.totalRevenueAccrual,
      totalRefunds: revenueData.summary.totalRefunds,
      refundsBySource: {
        SALE: revenueData.bySource.sales.refunds,
        QUOTATION: revenueData.bySource.quotations.refunds,
        OTHER_INCOME: 0,
      },
      netIncome: revenueData.summary.netRevenueAccrual,

      // Cash basis
      totalReceived: revenueData.summary.totalCashCollected,
      outstandingBalance: revenueData.summary.totalOutstanding,

      // Payment status breakdown
      unpaidAmount: toTwoDecimals(unpaidAmount),
      partiallyPaidAmount: toTwoDecimals(partiallyPaidAmount),
      paidAmount: toTwoDecimals(paidAmount),

      averagePerMonth: toTwoDecimals(
        revenueData.summary.netRevenueAccrual /
          getMonthCount(startDate, endDate)
      ),
      topSource,
      bySource,
      byPaymentMethod,
      byStatus,

      breakdown: {
        sales: {
          ...revenueData.bySource.sales,
          outstanding: toTwoDecimals(
            revenueData.bySource.sales.revenue -
              revenueData.bySource.sales.cashCollected
          ),
        },
        quotations: {
          ...revenueData.bySource.quotations,
          outstanding: toTwoDecimals(
            revenueData.bySource.quotations.revenue -
              revenueData.bySource.quotations.cashCollected
          ),
        },
        otherIncome: {
          ...revenueData.bySource.otherIncome,
          outstanding: toTwoDecimals(
            revenueData.bySource.otherIncome.revenue -
              revenueData.bySource.otherIncome.cashCollected
          ),
        },
      },
    };

    const chartData = {
      monthly: monthlyData,
      bySource: sourceBreakdown,
      byStatus: statusBreakdown,
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
          saleRecords: revenueData.rawData.sales.length,
          quotationRecords: revenueData.rawData.quotations.length,
          otherIncomeRecords: revenueData.rawData.otherIncomes.length,
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
