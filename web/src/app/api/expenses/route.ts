// app/api/expenses/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/utils/server';
import { toTwoDecimals } from '@/lib/fn';
import { validateRequest } from '@/lib/utils/validation';
import { PaymentMethod } from '@/types/index';
import { addExpenseSchema } from '@/lib/validations/expenses';
import { ExpenseCategory, ExpenseStatus } from '@/types/expenses';
import { validateWorkTypeForCategory } from '@/lib/utils/workTypeValidation';
import { reportQuerySchema } from '@/lib/validations/general';
import {
  calculateMonthlyData,
  formatCategoryName,
  getDateRange,
  getMonthCount,
  isDeductibleCategory,
} from '@/lib/utils/reports';
import { calculateExpenses } from '@/lib/handlers/financial-reports';
import z from 'zod';

export async function POST(request: NextRequest) {
  try {
    const { userId, workTypes } = await getAuthUser(request);

    const expensesData = await validateRequest(request, addExpenseSchema);

    validateWorkTypeForCategory(
      workTypes,
      expensesData.category as ExpenseCategory,
      false
    );

    const result = await prisma.$transaction(
      async tx => {
        const expenseAmount = toTwoDecimals(expensesData.amount);

        // Create expense with payment tracking
        const expense = await tx.expense.create({
          data: {
            userId,
            category: expensesData.category as ExpenseCategory,
            subCategory: expensesData.subCategory,
            amount: expenseAmount,
            amountPaid: expenseAmount, // Fully paid on creation
            balance: 0, // No balance remaining
            status: ExpenseStatus.PAID,
            description: expensesData.description || '',
            date: expensesData.date ? new Date(expensesData.date) : new Date(),
            isDeductible: expensesData.isDeductible,
            deductionPercentage: expensesData.deductionPercentage,
            vendorName: expensesData.vendorName || 'N/A',
            receipt: expensesData.receipt || ' ',
            reference: expensesData.reference || null,
          },
        });

        // Create payment record
        const payment = await tx.payment.create({
          data: {
            userId,
            expensesId: expense.id,
            payableType: 'OTHER_EXPENSES',
            amount: expenseAmount,
            paymentDate: expensesData.date
              ? new Date(expensesData.date)
              : new Date(),
            paymentMethod: (expensesData.paymentMethod ||
              'BANK_TRANSFER') as PaymentMethod,
            category: 'EXPENSE',
            reference: expensesData.reference || null,
            notes:
              expensesData.description ||
              `Payment for ${expensesData.subCategory}`,
          },
        });

        return { expense, payment };
      },
      {
        maxWait: 15000,
        timeout: 15000,
      }
    );

    return NextResponse.json(
      {
        message: 'Expenses recorded successfully',
        success: true,
        payment: result.payment,
        expense: result.expense,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Record expense error:', error);

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

    const expenseData = await calculateExpenses(userId, startDate, endDate);

    // Transform purchase data
    const purchaseData = expenseData.rawData.purchases.map(purchase => {
      const netTotal = purchase.totalAmount - (purchase.refundAmount || 0);
      const balance = Math.max(0, netTotal - purchase.amountPaid);
      const payment = purchase.payments[0];

      return {
        id: purchase.id,
        date: purchase.purchaseDate,
        amount: purchase.totalAmount,
        amountPaid: purchase.amountPaid,
        balance: balance,
        status: purchase.status,
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
        category: purchase.purchaseType || 'INVENTORY_RESTOCK',
        subCategory: null,
        isDeductible: true,
        deductionPercentage: 100,
        includesVAT: purchase.includeVAT,
        vatAmount: purchase.vatAmount,
        hasPayment: purchase.amountPaid > 0,
        payments: purchase.payments.map(p => ({
          id: p.id,
          amount: p.amount,
          paymentDate: p.paymentDate.toISOString(),
          paymentMethod: p.paymentMethod,
          reference: p.reference,
          notes: p.notes,
        })),
      };
    });

    // Transform expense data
    const expenseDataTransformed = expenseData.rawData.expenses.map(expense => {
      const payment = expense.payments[0];

      return {
        id: expense.id,
        date: expense.date,
        amount: expense.amount,
        amountPaid: expense.amountPaid,
        balance: expense.balance,
        status: expense.status,
        paymentMethod: payment?.paymentMethod || 'OTHER',
        reference: payment?.reference || null,
        notes: payment?.notes || null,
        sourceType: 'EXPENSE' as const,
        sourceId: expense.id,
        sourceNumber: null,
        sourceTitle: null,
        sourceDescription: expense.description,
        sourceTotalAmount: expense.amount,
        sourceAmountPaid: expense.amountPaid,
        sourceBalance: expense.balance,
        sourceStatus: expense.status,
        refundAmount: null,
        refundDate: null,
        refundReason: null,
        receipt: expense.receipt,
        category: expense.category,
        subCategory: expense.subCategory,
        vendorName: expense.vendorName,
        isDeductible: expense.isDeductible,
        deductionPercentage: expense.deductionPercentage,
        isReturn: expense.isReturn,
        returnDate: expense.returnDate,
        returnReason: expense.returnReason,
        includesVAT: false,
        vatAmount: null,
        payments: expense.payments.map(p => ({
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
    const data = [...purchaseData, ...expenseDataTransformed].sort(
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

    // Calculate by category breakdown
    const byCategory = {} as Record<string, number>;
    const categoryRefunds = {} as Record<string, number>;

    Object.entries(expenseData.byType.purchases.breakdown).forEach(
      ([type, amount]) => {
        byCategory[type] = amount;
        const typeRefunds =
          (amount /
            (expenseData.byType.purchases.net +
              expenseData.byType.purchases.refunds)) *
          expenseData.byType.purchases.refunds;
        categoryRefunds[type] = toTwoDecimals(typeRefunds);
      }
    );

    Object.entries(expenseData.byType.expenses.breakdown).forEach(
      ([category, amount]) => {
        byCategory[category] = amount;
        categoryRefunds[category] = 0;
      }
    );

    // By payment method breakdown
    const byPaymentMethod = {} as Record<string, number>;

    expenseData.rawData.purchases.forEach(purchase => {
      purchase.payments.forEach(payment => {
        byPaymentMethod[payment.paymentMethod] = toTwoDecimals(
          (byPaymentMethod[payment.paymentMethod] || 0) + payment.amount
        );
      });
    });

    expenseData.rawData.expenses.forEach(expense => {
      expense.payments.forEach(payment => {
        byPaymentMethod[payment.paymentMethod] = toTwoDecimals(
          (byPaymentMethod[payment.paymentMethod] || 0) + payment.amount
        );
      });
    });

    // Calculate monthly data for charts
    const allPaymentsForMonthly = [
      ...expenseData.rawData.purchases.flatMap(p => p.payments),
      ...expenseData.rawData.expenses.flatMap(e => e.payments),
    ];

    const monthlyData = calculateMonthlyData(
      allPaymentsForMonthly,
      startDate,
      endDate
    ).map(month => {
      // Calculate unpaid vs paid for each month
      const monthExpenses = data.filter(expense => {
        const expenseMonth = new Date(expense.date).toISOString().slice(0, 7);
        return expenseMonth === month.month;
      });

      const paid = monthExpenses
        .filter(e => e.status === 'PAID')
        .reduce((sum, e) => sum + e.amountPaid, 0);
      const unpaid = monthExpenses
        .filter(e => e.status === 'UNPAID')
        .reduce((sum, e) => sum + e.balance, 0);

      return {
        ...month,
        paid: toTwoDecimals(paid),
        unpaid: toTwoDecimals(unpaid),
      };
    });

    // Calculate category breakdown for chart
    const categoryBreakdown = Object.entries(byCategory).map(
      ([name, netValue]) => ({
        name: formatCategoryName(name),
        value: netValue,
        percentage:
          expenseData.summary.netExpensesAccrual > 0
            ? toTwoDecimals(
                (netValue / expenseData.summary.netExpensesAccrual) * 100
              )
            : 0,
        deductible: isDeductibleCategory(name),
        refundAmount: categoryRefunds[name] || 0,
      })
    );

    // Status breakdown for chart
    const statusBreakdown = Object.entries(byStatus).map(([status, value]) => ({
      status: status as ExpenseStatus,
      value,
      percentage:
        expenseData.summary.totalExpensesAccrual > 0
          ? toTwoDecimals(
              (value / expenseData.summary.totalExpensesAccrual) * 100
            )
          : 0,
    }));

    // Find top category
    const topCategory =
      Object.keys(byCategory).length > 0
        ? Object.keys(byCategory).reduce((a, b) =>
            byCategory[a] > byCategory[b] ? a : b
          )
        : 'OTHER';

    const summary = {
      // Accrual basis
      grossExpenses: expenseData.summary.totalExpensesAccrual,
      totalPurchaseRefunds: expenseData.summary.totalRefunds,
      netExpenses: expenseData.summary.netExpensesAccrual,

      // Cash basis
      totalPaid: expenseData.summary.totalCashPaid,
      balance: expenseData.summary.totalOutstanding,

      // Payment status breakdown
      unpaidAmount: toTwoDecimals(unpaidAmount),
      partiallyPaidAmount: toTwoDecimals(partiallyPaidAmount),
      paidAmount: toTwoDecimals(paidAmount),

      averagePerMonth: toTwoDecimals(
        expenseData.summary.netExpensesAccrual /
          getMonthCount(startDate, endDate)
      ),
      topCategory,

      // Tax deductibility
      totalDeductible: expenseData.summary.deductibleExpenses,
      totalNonDeductible: expenseData.summary.nonDeductibleExpenses,
      deductiblePercentage:
        expenseData.summary.totalCashPaid > 0
          ? toTwoDecimals(
              (expenseData.summary.deductibleExpenses /
                expenseData.summary.totalCashPaid) *
                100
            )
          : 0,

      byCategory,
      byPaymentMethod,
      byStatus,

      breakdown: expenseData.byType,
    };

    const chartData = {
      monthly: monthlyData,
      byCategory: categoryBreakdown,
      byStatus: statusBreakdown,
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
          purchaseRecords: expenseData.rawData.purchases.length,
          expenseRecords: expenseData.rawData.expenses.length,
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
