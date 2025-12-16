import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/utils/server';
import { toTwoDecimals } from '@/lib/fn';
import {
  getDateRange,
  calculateMonthlyData,
  getMonthCount,
  formatCategoryName,
  isDeductibleCategory,
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

    // Fetch all purchases (paid and unpaid)
    const purchases = await prisma.purchase.findMany({
      where: {
        userId,
        purchaseDate: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        payments: true,
        customer: true,
      },
      orderBy: {
        purchaseDate: 'desc',
      },
    });

    // Fetch all expense payments
    const expensePayments = await prisma.payment.findMany({
      where: {
        userId,
        category: 'EXPENSE',
        payableType: 'OTHER_EXPENSES',
        paymentDate: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        expenses: {
          select: {
            id: true,
            category: true,
            subCategory: true,
            description: true,
            amount: true,
            vendorName: true,
            isDeductible: true,
            deductionPercentage: true,
            isReturn: true,
            returnDate: true,
            returnReason: true,
            receipt: true,
            // note: true,
          },
        },
      },
      orderBy: {
        paymentDate: 'desc',
      },
    });

    // Transform purchase data
    const purchaseData = purchases.map(purchase => {
      // Calculate net values
      const netTotal = purchase.totalAmount - (purchase.refundAmount || 0);
      const balance = Math.max(0, netTotal - purchase.amountPaid);

      // Get payment details (if any)
      const payment = purchase.payments[0]; // Assuming at least one payment

      return {
        id: purchase.id,
        date: purchase.purchaseDate,
        amount: purchase.amountPaid,
        paymentMethod: payment?.paymentMethod || 'OTHER',
        reference: payment?.reference || null,
        notes: payment?.notes || null,
        sourceType: 'PURCHASE' as const,
        sourceId: purchase.id,
        sourceNumber: purchase.purchaseNumber,
        sourceTitle: purchase.title,
        sourceDescription: purchase.description,
        sourceTotalAmount: purchase.totalAmount,
        sourceAmountPaid: purchase.amountPaid,
        sourceBalance: balance,
        sourceStatus: purchase.status,
        refundAmount: purchase.refundAmount,
        refundDate: purchase.refundDate,
        refundReason: purchase.refundReason,
        vendorName: purchase.vendorName,
        vendorEmail: purchase.vendorEmail,
        vendorPhone: purchase.vendorPhone,
        category: 'COST_OF_GOODS' as const,
        subCategory: null,
        isDeductible: true,
        deductionPercentage: 100,
        includesVAT: purchase.includeVAT,
        vatAmount: purchase.vatAmount,
        hasPayment: purchase.amountPaid > 0,
      };
    });

    // Transform expense data
    const expenseData = expensePayments.map(payment => {
      if (payment.payableType === 'OTHER_EXPENSES' && payment.expenses) {
        return {
          id: payment.id,
          date: payment.paymentDate,
          amount: payment.amount,
          paymentMethod: payment.paymentMethod,
          reference: payment.reference,
          notes: payment.notes,
          sourceType: 'OTHER_EXPENSES' as const,
          sourceId: payment.expenses.id,
          sourceNumber: null,
          sourceTitle: null,
          sourceDescription: payment.expenses.description,
          sourceTotalAmount: payment.expenses.amount,
          sourceAmountPaid: null,
          sourceBalance: null,
          sourceStatus: null,
          refundAmount: null,
          refundDate: null,
          refundReason: null,
          receipt: payment.expenses.receipt,
          // note: payment.expenses.note,
          category: payment.expenses.category,
          subCategory: payment.expenses.subCategory,
          vendorName: payment.expenses.vendorName,
          isDeductible: payment.expenses.isDeductible,
          deductionPercentage: payment.expenses.deductionPercentage,
          isReturn: payment.expenses.isReturn,
          returnDate: payment.expenses.returnDate,
          returnReason: payment.expenses.returnReason,
          includesVAT: false,
          vatAmount: null,
        };
      }

      // Fallback
      return {
        id: payment.id,
        date: payment.paymentDate,
        amount: payment.amount,
        paymentMethod: payment.paymentMethod,
        reference: payment.reference,
        notes: payment.notes,
        sourceType: 'UNKNOWN' as const,
        sourceId: null,
        sourceNumber: null,
        sourceTitle: null,
        sourceDescription: null,
        sourceTotalAmount: null,
        sourceAmountPaid: null,
        sourceBalance: null,
        sourceStatus: null,
        refundAmount: null,
        refundDate: null,
        refundReason: null,
        category: 'OTHER' as const,
        subCategory: null,
        vendorName: null,
        isDeductible: false,
        deductionPercentage: 0,
        includesVAT: false,
        vatAmount: null,
      };
    });

    // Combine all data
    const data = [...purchaseData, ...expenseData].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    // Calculate totals
    let grossExpenses = 0;
    let totalPurchaseRefunds = 0;
    let totalPaid = 0;
    let balance = 0;

    // Process purchases
    purchases.forEach(purchase => {
      grossExpenses += purchase.totalAmount;
      totalPurchaseRefunds += purchase.refundAmount || 0;
      totalPaid += purchase.amountPaid || 0;

      // Calculate balance: (totalAmount - refundAmount) - amountPaid
      const netAmount = purchase.totalAmount - (purchase.refundAmount || 0);
      balance += Math.max(0, netAmount - (purchase.amountPaid || 0));
    });

    // Process expense payments
    expensePayments.forEach(payment => {
      if (
        payment.payableType === 'OTHER_EXPENSES' &&
        payment.expenses &&
        !payment.expenses.isReturn
      ) {
        grossExpenses += payment.expenses.amount;
        totalPaid += payment.amount;
      }
    });

    grossExpenses = toTwoDecimals(grossExpenses);
    totalPurchaseRefunds = toTwoDecimals(totalPurchaseRefunds);

    // Net Expenses = Gross Expenses - Purchase Refunds
    const netExpenses = toTwoDecimals(grossExpenses - totalPurchaseRefunds);

    totalPaid = toTwoDecimals(totalPaid);
    balance = toTwoDecimals(balance);

    // Calculate deductible vs non-deductible
    let totalDeductible = 0;
    let totalNonDeductible = 0;

    // Purchases are fully deductible
    purchases.forEach(purchase => {
      totalDeductible += purchase.amountPaid || 0;
    });

    // Other expenses
    expensePayments.forEach(payment => {
      if (
        payment.payableType === 'OTHER_EXPENSES' &&
        payment.expenses &&
        !payment.expenses.isReturn
      ) {
        const isDeductible = payment.expenses.isDeductible;
        const deductionPercentage = payment.expenses.deductionPercentage || 0;

        if (isDeductible) {
          const deductibleAmount = (payment.amount * deductionPercentage) / 100;
          totalDeductible += deductibleAmount;
          totalNonDeductible += payment.amount - deductibleAmount;
        } else {
          totalNonDeductible += payment.amount;
        }
      }
    });

    totalDeductible = toTwoDecimals(totalDeductible);
    totalNonDeductible = toTwoDecimals(totalNonDeductible);

    // Calculate by category breakdown - using NET EXPENSES (gross - refunds)
    const byCategory = {} as Record<string, number>;
    const categoryRefunds = {} as Record<string, number>;

    // Process purchases by category
    purchases.forEach(purchase => {
      const category = 'COST_OF_GOODS';
      const grossAmount = purchase.totalAmount;
      const refundAmount = purchase.refundAmount || 0;
      const netAmount = grossAmount - refundAmount;

      byCategory[category] = toTwoDecimals(
        (byCategory[category] || 0) + netAmount
      );
      categoryRefunds[category] = toTwoDecimals(
        (categoryRefunds[category] || 0) + refundAmount
      );
    });

    // Process other expenses by category
    expensePayments.forEach(payment => {
      if (
        payment.payableType === 'OTHER_EXPENSES' &&
        payment.expenses &&
        !payment.expenses.isReturn
      ) {
        const category = payment.expenses.category || 'OTHER';
        // Other expenses don't have refunds in this context (isReturn is handled separately)
        byCategory[category] = toTwoDecimals(
          (byCategory[category] || 0) + payment.amount
        );
      }
    });

    // By payment method breakdown
    const byPaymentMethod = {} as Record<string, number>;

    // Purchase payments
    purchases.forEach(purchase => {
      purchase.payments.forEach(payment => {
        byPaymentMethod[payment.paymentMethod] = toTwoDecimals(
          (byPaymentMethod[payment.paymentMethod] || 0) + payment.amount
        );
      });
    });

    // Expense payments
    expensePayments.forEach(payment => {
      byPaymentMethod[payment.paymentMethod] = toTwoDecimals(
        (byPaymentMethod[payment.paymentMethod] || 0) + payment.amount
      );
    });

    // Calculate monthly data for charts
    // Combine all payments for monthly calculation
    const allPaymentsForMonthly = [
      ...purchases.flatMap(p => p.payments),
      ...expensePayments,
    ];

    const monthlyData = calculateMonthlyData(
      allPaymentsForMonthly,
      startDate,
      endDate
    );

    // Calculate category breakdown for chart (using NET expenses)
    const categoryBreakdown = Object.entries(byCategory).map(
      ([name, netValue]) => ({
        name: formatCategoryName(name),
        value: netValue,
        percentage:
          netExpenses > 0 ? toTwoDecimals((netValue / netExpenses) * 100) : 0,
        deductible: isDeductibleCategory(name),
        refundAmount: categoryRefunds[name] || 0,
      })
    );

    // Find top category based on NET expenses
    const topCategory =
      Object.keys(byCategory).length > 0
        ? Object.keys(byCategory).reduce((a, b) =>
            byCategory[a] > byCategory[b] ? a : b
          )
        : 'OTHER';

    const summary = {
      grossExpenses,
      totalPurchaseRefunds,
      netExpenses,
      totalPaid,
      balance,
      averagePerMonth: toTwoDecimals(
        netExpenses / getMonthCount(startDate, endDate)
      ),
      topCategory, // Now based on NET expenses
      totalDeductible,
      totalNonDeductible,
      deductiblePercentage:
        totalPaid > 0 ? toTwoDecimals((totalDeductible / totalPaid) * 100) : 0,
      byCategory, // This now stores NET expenses by category
      byPaymentMethod,
    };

    const chartData = {
      monthly: monthlyData,
      byCategory: categoryBreakdown,
    };

    return NextResponse.json(
      {
        success: true,
        meta: {
          type: 'expense',
          range: queryParams.range,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          totalRecords: data.length,
          purchaseRecords: purchases.length,
          expenseRecords: expensePayments.length,
          currency: 'NGN',
        },
        summary,
        chartData,
        data,
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
